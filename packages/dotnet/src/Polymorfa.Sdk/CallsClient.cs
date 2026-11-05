using System.Text.Json;
using System.Threading.Channels;

namespace Polymorfa.Sdk;

public sealed record CallsClientOptions
{
    public required string Session { get; init; }
    public string Participant { get; init; } = "default";
    public ClientOptions Http { get; init; } = new();
    public CallsSocketOptions? Socket { get; init; }
    public int ReconnectAttempts { get; init; } = 3;
    public TimeSpan MinBackoff { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan MaxBackoff { get; init; } = TimeSpan.FromSeconds(30);
    public bool Diagnostics { get; init; } = true;
}
public abstract record CallsClientEvent;
public sealed record CallsReady : CallsClientEvent;
public sealed record CallsDisconnected : CallsClientEvent;
public sealed record CallsFailure(Exception Error) : CallsClientEvent;
public sealed record CallKnown(Call Call) : CallsClientEvent;
public sealed record CallIncoming(Call Call) : CallsClientEvent;
public sealed record CallEnded(Call Call, string Reason) : CallsClientEvent;
public sealed record CallChanged(Call Call) : CallsClientEvent;
public sealed record CallLifecycleCandidate(CallCandidate Candidate) : CallsClientEvent;
public sealed record CallCapabilities(bool Video = true, bool Invite = true);
public sealed class CallsClient : IAsyncDisposable
{
    internal CallsTokenSource Tokens { get; }
    internal CallsClientOptions Options { get; }
    internal CallsSocketOptions SocketOptions => (Options.Socket ?? new() { BaseUrl = Options.Http.BaseUrl }) with { Session = Options.Session, Participant = Options.Participant, Proxy = Options.Socket?.Proxy ?? Options.Http.Proxy };
    private readonly object gate = new();
    private readonly Dictionary<string, Call> calls = [];
    private readonly Dictionary<string, List<CallLifecycleEvent>> early = [];
    private readonly Queue<string> ended = new();
    private readonly Channel<CallsClientEvent> events = System.Threading.Channels.Channel.CreateBounded<CallsClientEvent>(new BoundedChannelOptions(2048) { FullMode = BoundedChannelFullMode.Wait });
    private readonly CancellationTokenSource lifetime = new();
    private CallsSocket? lifecycle;
    private Task? runner;
    private readonly TaskCompletionSource firstReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int generation;
    private int disposed;
    public string? SelfParticipant { get; private set; }
    public bool Connected => lifecycle?.Connected == true;
    public IReadOnlyList<Call> ActiveCalls { get { lock (gate) return calls.Values.Where(c => !c.Ended).ToArray(); } }
    public CallsClient(string token, CallsClientOptions options) : this(new CallsTokenSource(token), options) { }
    public CallsClient(CallsTokenSource tokens, CallsClientOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Session) || options.Session.Length > 128 || !CallsProtocol.Participant(options.Participant) || options.ReconnectAttempts < 0 || options.MinBackoff <= TimeSpan.Zero || options.MaxBackoff < options.MinBackoff) throw new PolymorfaConfigurationException("Invalid Calls client configuration.");
        Tokens = tokens; Options = options; HttpTransport.ValidateUrl(options.Http.BaseUrl);
    }
    public IAsyncEnumerable<CallsClientEvent> EventsAsync(CancellationToken cancellationToken = default) => events.Reader.ReadAllAsync(cancellationToken);
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        lock (gate) { ObjectDisposedException.ThrowIf(disposed != 0, this); runner ??= RunLifecycleAsync(); }
        await firstReady.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
    }
    private async Task RunLifecycleAsync()
    {
        await Task.Yield(); var attempt = 0; var refresh = false;
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                try
                {
                    await using var connection = await CallsSocket.OpenLifecycleAsync(Tokens, SocketOptions with { Heartbeat = Options.Socket?.Heartbeat ?? TimeSpan.FromSeconds(15) }, refresh, lifetime.Token).ConfigureAwait(false); lifecycle = connection; SelfParticipant = connection.Ready.Participant; attempt = 0; refresh = false; firstReady.TrySetResult(); await PublishAsync(new CallsReady()).ConfigureAwait(false);
                    await foreach (var frame in connection.FramesAsync(lifetime.Token).ConfigureAwait(false))
                    {
                        if (frame is CallLifecycleEvent e) Receive(e);
                        else if (frame is CallCandidate candidate) await PublishAsync(new CallLifecycleCandidate(candidate)).ConfigureAwait(false);
                        else if (frame is CallSocketError error) await PublishAsync(new CallsFailure(new CallsSocketException(error.Message ?? "Calls lifecycle error.", error.Code))).ConfigureAwait(false);
                    }
                }
                catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { break; }
                catch (Exception error)
                {
                    refresh = error is CallsSocketException { CloseCode: 4401 }; if (refresh) Tokens.Invalidate(); await PublishAsync(new CallsFailure(error)).ConfigureAwait(false);
                    if (error is CallsSocketException { CloseCode: 4400 or 1008 }) { firstReady.TrySetException(error); break; }
                }
                lifecycle = null; await PublishAsync(new CallsDisconnected()).ConfigureAwait(false);
                var delay = TimeSpan.FromMilliseconds(Math.Min(Options.MaxBackoff.TotalMilliseconds, Options.MinBackoff.TotalMilliseconds * Math.Pow(2, Math.Min(attempt++, 20)))); await Task.Delay(delay, lifetime.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        finally { lifecycle = null; firstReady.TrySetCanceled(); }
    }
    private void Receive(CallLifecycleEvent e)
    {
        lock (gate)
        {
            if (calls.TryGetValue(e.CallId, out var call)) { call.Apply(e); return; }
            if (e.Event == "call.received")
            {
                if (Field(e.Payload, "direction") == "outgoing") return;
                var peer = Field(e.Payload, "from"); if (peer is null && e.Payload.ValueKind == JsonValueKind.Object && e.Payload.TryGetProperty("from", out var from) && from.ValueKind == JsonValueKind.Object) peer = Field(from, "phoneNumber") ?? Field(from, "id");
                call = Track(new(this, e.CallId, "inbound", peer ?? "", Flag(e.Payload, "hasVideo") || Flag(e.Payload, "has_video"), false)); call.Capabilities = Capabilities(e.Payload, call.Capabilities); if (!call.Ended) Publish(new CallIncoming(call)); return;
            }
            if (e.Event is not ("call.accepted" or "call.ended" or "call.missed" or "call.rejected" or "call.participant_joined" or "call.participant_state" or "call.participant_left")) return;
            if (!early.TryGetValue(e.CallId, out var queue)) { if (early.Count >= 64) early.Remove(early.Keys.First()); early[e.CallId] = queue = []; }
            if (queue.Any(x => Terminal(x.Event))) return;
            if (Terminal(e.Event)) { queue.Clear(); queue.Add(e); return; }
            if (e.Event == "call.accepted" && queue.Any(x => x.Event == e.Event)) return;
            if (queue.Count >= 8) { var index = queue.FindIndex(x => x.Event != "call.accepted"); if (index < 0) return; queue.RemoveAt(index); }
            queue.Add(e);
        }
    }
    private static bool Terminal(string name) => name is "call.ended" or "call.missed" or "call.rejected";
    private Call Track(Call call) { calls[call.Id] = call; Publish(new CallKnown(call)); if (early.Remove(call.Id, out var queued)) foreach (var e in queued) call.Apply(e); return call; }
    public Task<Call> PlaceAsync(string to, bool video = false, bool exclusive = false, RequestOptions? options = null) => PlaceAsync(new(To: to, Video: video, Exclusive: exclusive), options);
    public Task<Call> PlaceGroupAsync(string groupId, bool video = false, RequestOptions? options = null) => PlaceAsync(new(GroupId: groupId, Video: video), options);
    public async Task<Call> PlaceAsync(PlaceCallRequest input, RequestOptions? options = null)
    {
        var peer = input.To ?? input.GroupId ?? input.Participants?.FirstOrDefault() ?? "";
        var started = Volatile.Read(ref generation); var response = await RequestAsync(async (client, participant, request) => (await client.Calls.PlaceAsync(input with { Session = participant is null ? null : Options.Session, Participant = participant }, request.WithIdempotency()).ConfigureAwait(false)).Data.Data, options).ConfigureAwait(false);
        Call call; lock (gate) { call = calls.GetValueOrDefault(response.CallId) ?? Track(new(this, response.CallId, "outbound", peer, input.Video == true, input.Exclusive == true)); }
        if (started != Volatile.Read(ref generation) || lifetime.IsCancellationRequested) { await call.EndAsync().ConfigureAwait(false); throw new CallsSocketException("Calls client disconnected during placement.", "client_disconnected"); }
        return call;
    }
    internal async Task<T> RequestAsync<T>(Func<MessagingClient, string?, RequestOptions, Task<T>> operation, RequestOptions? options = null)
    {
        options ??= new(); var token = await Tokens.GetAsync(cancellationToken: options.CancellationToken).ConfigureAwait(false); var credential = token.Value.StartsWith("pmfa_ct_", StringComparison.Ordinal) ? Credential.ClientToken(token.Value) : token.Value.StartsWith("pmfa_pt_", StringComparison.Ordinal) ? Credential.ProjectToken(token.Value) : Credential.OrganizationApiKey(token.Value);
        using var client = new MessagingClient(credential, Options.Http); return await operation(client, credential.Kind == CredentialKind.ClientToken ? null : Options.Participant, options).ConfigureAwait(false);
    }
    internal async Task PublishAsync(CallsClientEvent value) { try { await events.Writer.WriteAsync(value, lifetime.Token).ConfigureAwait(false); } catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { } }
    internal void Publish(CallsClientEvent value) { if (!events.Writer.TryWrite(value)) { events.Writer.TryComplete(new CallsSocketException("Calls event consumer fell behind the bounded queue.", "event_backpressure")); lifetime.Cancel(); } }
    internal void Completed(Call call, string reason) { lock (gate) { ended.Enqueue(call.Id); while (ended.Count > 200) { var id = ended.Dequeue(); if (calls.TryGetValue(id, out var old) && old.Ended) calls.Remove(id); } } Publish(new CallEnded(call, reason)); }
    internal static string? Field(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.String ? x.GetString() : null;
    internal static bool Flag(JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.True;
    internal static CallCapabilities Capabilities(JsonElement payload, CallCapabilities fallback) { if (payload.ValueKind != JsonValueKind.Object || !payload.TryGetProperty("capabilities", out var c) || c.ValueKind != JsonValueKind.Object) return fallback; bool Value(string key, bool old) => c.TryGetProperty(key, out var x) && x.ValueKind is JsonValueKind.True or JsonValueKind.False ? x.GetBoolean() : old; return new(Value("video", fallback.Video), Value("invite", fallback.Invite)); }
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return; Interlocked.Increment(ref generation); lifetime.Cancel(); if (lifecycle is { } socket) await socket.DisposeAsync().ConfigureAwait(false); if (runner is not null) await runner.ConfigureAwait(false); foreach (var call in ActiveCalls) await call.DisconnectAsync().ConfigureAwait(false); events.Writer.TryComplete(); lifetime.Dispose();
    }
}
