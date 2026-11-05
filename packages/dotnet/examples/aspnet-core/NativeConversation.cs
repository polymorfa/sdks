using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal sealed record ExampleMessage(string Id, string? ClientId, string Text, long CreatedAt, string Direction, string Status, string Receipt);
internal sealed class NativeConversation(string session, string peer, bool localTest)
{
    private readonly object state = new();
    private readonly SemaphoreSlim sendGate = new(1, 1);
    private readonly List<ExampleMessage> messages = [];
    private readonly Dictionary<string, (string Text, ExampleMessage? Message)> attempts = [];
    private readonly Queue<string> eventIds = new();
    private string peerId = "", lastEvent = "";
    private int received;
    public object Snapshot() { lock (state) return new { messages = messages.ToArray(), peer, session, receivedEvents = received, lastEvent, localTest }; }
    public async Task<IResult> SendAsync(MessagingClient client, byte[] body, string key, CancellationToken cancellation)
    {
        string text;
        try
        {
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 1 || !root.TryGetProperty("text", out var value) || value.ValueKind != JsonValueKind.String) return Results.BadRequest();
            text = value.GetString()!;
        }
        catch (JsonException) { return Results.BadRequest(); }
        if (string.IsNullOrWhiteSpace(text) || Encoding.UTF8.GetByteCount(text) > 4096 || !Guid.TryParseExact(key, "D", out _)) return Results.BadRequest();
        if (!await sendGate.WaitAsync(0, cancellation)) return Results.StatusCode(429);
        try
        {
            if (attempts.TryGetValue(key, out var prior))
            {
                if (prior.Text != text) return Results.Conflict();
                if (prior.Message is not null) return Results.Json(prior.Message);
            }
            else
            {
                if (attempts.Count >= 128) return Results.StatusCode(429);
                attempts[key] = (text, null);
            }
            try
            {
                var response = await client.Messages.SendAsync(session, new(new(PhoneNumber: peer), new TextContent(text)), new() { IdempotencyKey = key, Timeout = TimeSpan.FromSeconds(60), CancellationToken = cancellation });
                var receipt = response.Data.Data;
                if (!response.Data.Success || string.IsNullOrEmpty(receipt.Id) || !DateTimeOffset.TryParse(receipt.Timestamp, out var at)) return Results.StatusCode(502);
                var message = new ExampleMessage(receipt.Id, key, text, at.ToUnixTimeSeconds() * 1000, "outbound", "sent", receipt.Status);
                lock (state) { if (!string.IsNullOrEmpty(receipt.Conversation.Id)) peerId = receipt.Conversation.Id; Upsert(message); }
                attempts[key] = (text, message);
                return Results.Json(message);
            }
            catch (Exception error) when (error is PolymorfaException or OperationCanceledException) { return Results.Json(new { error = "send_outcome_unknown_retry_same_key" }, statusCode: 502); }
        }
        finally { sendGate.Release(); }
    }
    private void Upsert(ExampleMessage message)
    {
        var index = messages.FindIndex(m => m.Id == message.Id);
        if (index >= 0) messages[index] = message; else messages.Add(message);
        if (messages.Count > 100) messages.RemoveAt(0);
    }
    private bool Assigned(EventConversation conversation) => peerId.Length > 0 ? conversation.Id == peerId : conversation.PhoneNumber?.TrimStart('+') == peer.TrimStart('+');
    private static int Rank(string value) => value switch { "read" or "played" => 3, "delivered" or "delivery" => 2, "sent" or "server" => 1, _ => 0 };
    public void Receive(WebhookEvent webhook)
    {
        var envelope = webhook.Envelope;
        if (envelope.Session != session) return;
        lock (state)
        {
            if (eventIds.Contains(envelope.Id)) return;
            switch (webhook)
            {
                case TypedWebhookEvent<LinkedDeviceMessagePayload> { Payload: var p } when envelope.Event == "message.received":
                    if (p.FromMe || p.IsGroup || p.Conversation is null || !Assigned(p.Conversation) || string.IsNullOrEmpty(p.Id) || string.IsNullOrEmpty(p.Text) || Encoding.UTF8.GetByteCount(p.Text) > 4096) return;
                    Upsert(new(p.Id, null, p.Text, checked(p.Timestamp * 1000), "inbound", "sent", "received"));
                    break;
                case TypedWebhookEvent<MessageAckPayload> { Payload: var p }:
                    if (p.Conversation is null || !Assigned(p.Conversation)) return;
                    for (var i = 0; i < messages.Count; i++)
                        if (messages[i].Direction == "outbound" && p.Messages.Any(m => m.Id == messages[i].Id) && Rank(p.Type) > Rank(messages[i].Receipt)) messages[i] = messages[i] with { Receipt = p.Type };
                    break;
                default: return;
            }
            received++; lastEvent = envelope.Event; eventIds.Enqueue(envelope.Id); if (eventIds.Count > 1024) eventIds.Dequeue();
        }
    }
}
