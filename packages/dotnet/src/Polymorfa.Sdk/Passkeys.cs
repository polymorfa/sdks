using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

/// <summary>Supplied current-challenge guard and TTL seconds. UserVerification and TimeoutMs are deprecated, ignored server inputs.</summary>
public sealed record IssuePasskeyChallenge(string? ChallengeB64Url = null, long? TtlSeconds = null, string? UserVerification = null, long? TimeoutMs = null);
public sealed record PasskeyTicket(int Version, string Ticket, string Session, string RpId, string ChallengeB64Url, string UserVerification, string ExpiresAt, long? TimeoutMs = null);
public sealed record PasskeyAssertionResponse(string AuthenticatorDataB64, [property: JsonPropertyName("clientDataJSONB64")] string ClientDataJSONB64, string SignatureB64, string? UserHandleB64 = null);
public sealed record PasskeyAssertion(string Id, string RawIdB64Url, PasskeyAssertionResponse Response);
public sealed record SubmitPasskeyAssertion(string TicketId, PasskeyAssertion Assertion);
public sealed record PasskeyAssertionResult(bool Ok, string Ticket, string Session);
public sealed record ConfirmPasskey(string TicketId, string? Code = null);
public sealed record PasskeyConfirmation(string Status, string? TicketId = null, string? Code = null, [property: JsonPropertyName("skipHandoffUX")] bool? SkipHandoffUX = null, string? Error = null);
/// <summary>Direct server operations. No WebAuthn ceremony, polling or automatic confirmation.</summary>
public sealed class Passkeys
{
    private readonly HttpTransport http;
    internal Passkeys(HttpTransport http) => this.http = http;
    public static IReadOnlyList<string> Statuses { get; } = Array.AsReadOnly(new[] { "none", "challenge_pending", "assertion_sending", "assertion_submitted", "code_available", "confirmation_sending", "waiting_for_pairing", "completed", "failed" });
    private string Path(string session)
    {
        http.Credential.RequireServer();
        if (string.IsNullOrEmpty(session)) throw Invalid("Provide a Number ID.");
        return $"/messaging/{Uri.EscapeDataString(session)}/passkey";
    }
    private static PolymorfaValidationException Invalid(string message) => new(message, "invalid_parameter");
    private Task<ApiResponse<SuccessEnvelope<T>>> Write<T>(string path, object body, RequestOptions? options)
    {
        if (JsonSerializer.SerializeToUtf8Bytes(body, HttpTransport.Json).Length > 1048576) throw Invalid("Passkey request exceeds 1 MiB.");
        return http.RequestAsync<SuccessEnvelope<T>>(HttpMethod.Post, path, body, (options ?? new()) with { MaxNetworkRetries = 0 });
    }
    public Task<ApiResponse<SuccessEnvelope<PasskeyTicket>>> IssueChallengeAsync(string session, IssuePasskeyChallenge? body = null, RequestOptions? options = null)
    {
        var path = Path(session); body ??= new();
        if (body.ChallengeB64Url is { Length: 0 } || body.TimeoutMs is <= 0 || body.UserVerification is not null and not ("required" or "preferred" or "discouraged")) throw Invalid("Invalid challenge options.");
        return Write<PasskeyTicket>(path + "/challenge", body, options);
    }
    public Task<ApiResponse<SuccessEnvelope<PasskeyTicket>>> GetChallengeAsync(string session, string ticketId, RequestOptions? options = null)
    {
        var path = Path(session);
        if (string.IsNullOrEmpty(ticketId)) throw Invalid("Provide a ticket.");
        return http.RequestAsync<SuccessEnvelope<PasskeyTicket>>(HttpMethod.Get, path + "/challenge/" + Uri.EscapeDataString(ticketId), null, options);
    }
    public Task<ApiResponse<SuccessEnvelope<PasskeyAssertionResult>>> SubmitAssertionAsync(string session, SubmitPasskeyAssertion body, RequestOptions? options = null)
    {
        var path = Path(session); var a = body.Assertion; var r = a?.Response;
        if (string.IsNullOrEmpty(body.TicketId) || a is null || string.IsNullOrEmpty(a.Id) || a.Id.Length > 1364 || string.IsNullOrEmpty(a.RawIdB64Url) || a.RawIdB64Url.Length > 1364 || r is null || string.IsNullOrEmpty(r.AuthenticatorDataB64) || string.IsNullOrEmpty(r.ClientDataJSONB64) || string.IsNullOrEmpty(r.SignatureB64) || r.UserHandleB64?.Length > 86) throw Invalid("Provide the ticket and bounded assertion.");
        return Write<PasskeyAssertionResult>(path + "/assertion", body, options);
    }
    public Task<ApiResponse<SuccessEnvelope<PasskeyConfirmation>>> GetConfirmationAsync(string session, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<PasskeyConfirmation>>(HttpMethod.Get, Path(session) + "/confirmation", null, options);
    public Task<ApiResponse<SuccessEnvelope<PasskeyConfirmation>>> ConfirmAsync(string session, ConfirmPasskey body, RequestOptions? options = null)
    {
        var path = Path(session); var code = body.Code;
        if (string.IsNullOrEmpty(body.TicketId) || code is not null && (code.Length != 9 || code[4] != '-' || code.Where((_, i) => i != 4).Any(c => c is not (>= 'A' and <= 'Z') and not (>= '0' and <= '9')))) throw Invalid("Provide the ticket and optional confirmation code.");
        return Write<PasskeyConfirmation>(path + "/confirmation", body, options);
    }
}
