using System.Security.Cryptography;
using System.Collections.Frozen;
using System.Text;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record WebhookEnvelope(string Id, string Session, string Timestamp, string Event, JsonElement Payload, string? ExternalId = null);
public abstract record WebhookEvent(WebhookEnvelope Envelope);
public sealed record UnknownWebhookEvent(WebhookEnvelope Envelope) : WebhookEvent(Envelope);
public static partial class Webhooks
{
    public static bool VerifySignature(ReadOnlySpan<byte> rawBody, string signature, string secret)
    {
        if (secret.Length == 0) return false;
        return Verify(rawBody, signature.StartsWith("sha256=", StringComparison.Ordinal) ? signature[7..] : signature, Encoding.UTF8.GetBytes(secret));
    }
    private static bool Verify(ReadOnlySpan<byte> body, string signature, ReadOnlySpan<byte> secret)
    {
        if (signature.Length != 64) return false;
        byte[] expected;
        try { expected = Convert.FromHexString(signature); } catch (FormatException) { return false; }
        var actual = HMACSHA256.HashData(secret, body);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
    public static WebhookEvent ConstructEvent(ReadOnlySpan<byte> rawBody, string signature, string secret)
    {
        if (!VerifySignature(rawBody, signature, secret)) throw new WebhookSignatureException();
        return ParseVerifiedEvent(rawBody);
    }
    public static WebhookEvent ParseVerifiedEvent(ReadOnlySpan<byte> rawBody)
    {
        try
        {
            _ = new UTF8Encoding(false, true).GetString(rawBody);
            var envelope = JsonSerializer.Deserialize<WebhookEnvelope>(rawBody, HttpTransport.Json);
            if (envelope is null || string.IsNullOrEmpty(envelope.Id) || envelope.Session is null || string.IsNullOrEmpty(envelope.Timestamp) || string.IsNullOrEmpty(envelope.Event) || envelope.Payload.ValueKind == JsonValueKind.Undefined) throw new PolymorfaValidationException("Invalid event envelope.", "invalid_webhook_event");
            return ParsePayload(envelope);
        }
        catch (DecoderFallbackException) { throw new PolymorfaValidationException("Webhook body must contain valid UTF-8.", "invalid_webhook_body"); }
        catch (JsonException) { throw new PolymorfaValidationException("Webhook body must contain valid JSON.", "invalid_webhook_json"); }
    }
    /// <summary>Verifies a CLI local-forward timestamp signature. Applications still deduplicate event IDs.</summary>
    public static WebhookEvent ConstructLocalEvent(ReadOnlySpan<byte> rawBody, string signature, string secret, long? nowUnixSeconds = null, long toleranceSeconds = 300)
    {
        var parts = signature.Split(",v1=", StringSplitOptions.None);
        if (parts.Length != 2 || !parts[0].StartsWith("t=", StringComparison.Ordinal) || !long.TryParse(parts[0].AsSpan(2), out var timestamp) || timestamp < 0 || timestamp > 9_007_199_254_740_991 || toleranceSeconds < 0 || parts[1].Any(c => !char.IsAsciiDigit(c) && c is not (>= 'a' and <= 'f'))) throw new WebhookSignatureException();
        var now = nowUnixSeconds ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (Math.Abs((decimal)now - timestamp) > toleranceSeconds || secret.Length != 43 || secret.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) throw new WebhookSignatureException();
        byte[] key;
        try { key = Convert.FromBase64String(secret.Replace('-', '+').Replace('_', '/') + "="); }
        catch (FormatException) { throw new WebhookSignatureException(); }
        if (key.Length != 32) throw new WebhookSignatureException();
        var prefix = Encoding.UTF8.GetBytes($"{timestamp}.");
        var signed = new byte[prefix.Length + rawBody.Length]; prefix.CopyTo(signed, 0); rawBody.CopyTo(signed.AsSpan(prefix.Length));
        if (!Verify(signed, parts[1], key)) throw new WebhookSignatureException();
        return ParseVerifiedEvent(rawBody);
    }
    public static IReadOnlySet<string> KnownEventTypes { get; } = new[]
    {
        "bansafe.action","bansafe.claim","bansafe.health_threshold","bansafe.incident","blocklist.update","business.quick_reply.update",
        "call.accepted","call.connection_joined","call.connection_left","call.ended","call.missed","call.participant_joined","call.participant_left","call.participant_state","call.permission_changed","call.received","call.rejected","call.telemetry",
        "campaign.cap_reached","campaign.cold_blocked","campaign.completed","campaign.failed","campaign.launched","campaign.paused","campaign.recipient_failed","campaign.recipient_sent","campaign.recipient_skipped","campaign.rescheduled","campaign.resumed","campaign.stopped","campaign.throttled",
        "chat.archive","chat.clear","chat.delete","chat.mute","chat.read","command.result","contact.opted_in","contact.opted_out","contact.sync","contact.update",
        "customer.archived","customer.archiving","customer.created","customer.enabled","customer.number.attached","customer.number.disconnected","customer.number.transferred","customer.pairing_link.connected","customer.pairing_link.created","customer.pairing_link.expired","customer.pairing_link.failed","customer.pairing_link.opened","customer.pairing_link.revoked","customer.restored","customer.updated",
        "group.participant","group.update","history.sync","labels.update","message.ack","message.delete","message.echo","message.edited","message.failed","message.reaction","message.received","message.revoked","message.sent","message.update","message.vote","newsletter.update","order.payment_updated","presence.update","session.capabilities_updated","session.connected","session.logged_out","session.phone_offline","session.restriction_updated","session.status","template.status","usage.recorded","voice.asset_failed","voice.asset_ready"
    }.ToFrozenSet(StringComparer.Ordinal);
}
