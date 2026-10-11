using System.Text.Json;

namespace Polymorfa.Sdk;

public class PolymorfaException : Exception
{
    public string? Code { get; }
    public int? Status { get; }
    public string? RequestId { get; }
    public string? RequestLogUrl { get; }
    public string? DocUrl { get; internal set; }
    public string? RateLimitReason { get; }
    public JsonElement? Details { get; }
    public ResponseMetadata? Metadata { get; }
    public PolymorfaException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? error = null) : base(message)
    {
        Code = code; Metadata = metadata; Status = metadata?.Status;
        RequestId = String(error, "request_id") ?? metadata?.RequestId;
        RequestLogUrl = String(error, "request_log_url"); DocUrl = String(error, "docs");
        RateLimitReason = metadata?.Headers.GetValueOrDefault("polymorfa-ratelimit-reason");
        Details = error is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty("details", out var detail) ? detail.Clone() : null;
    }
    private static string? String(JsonElement? value, string name) => value is { ValueKind: JsonValueKind.Object } element && element.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;
    internal static PolymorfaException FromResponse(JsonElement body, ResponseMetadata metadata)
    {
        var error = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("error", out var nested) && nested.ValueKind == JsonValueKind.Object ? nested : body;
        var message = String(error, "message") ?? $"Polymorfa returned HTTP {metadata.Status}.";
        var code = String(error, "code");
        var exception = metadata.Status switch
        {
            400 or 422 => new PolymorfaValidationException(message, code, metadata, error),
            401 => new PolymorfaAuthenticationException(message, code, metadata, error),
            402 => new PolymorfaPaymentRequiredException(message, code, metadata, error),
            403 => new PolymorfaAuthorizationException(message, code, metadata, error),
            404 => new PolymorfaNotFoundException(message, code, metadata, error),
            409 => new PolymorfaConflictException(message, code, metadata, error),
            429 => new PolymorfaRateLimitException(message, code, metadata, error),
            >= 500 => new PolymorfaServerException(message, code, metadata, error),
            _ => new PolymorfaException(message, code, metadata, error)
        };
        exception.DocUrl = String(body, "docs") ?? exception.DocUrl;
        return exception;
    }
}
public sealed class PolymorfaConfigurationException(string message) : PolymorfaException(message, "invalid_configuration");
public sealed class PolymorfaAuthenticationException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaAuthorizationException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaPaymentRequiredException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaValidationException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaNotFoundException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaConflictException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaRateLimitException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaServerException(string message, string? code = null, ResponseMetadata? metadata = null, JsonElement? details = null) : PolymorfaException(message, code, metadata, details);
public sealed class PolymorfaConnectionException(string message) : PolymorfaException(message, "connection_error");
public sealed class PolymorfaTimeoutException(string message) : PolymorfaException(message, "request_timeout");
public sealed class PolymorfaCancelledException() : PolymorfaException("Request cancelled by caller.", "request_cancelled");
public sealed class WebhookSignatureException() : PolymorfaException("Webhook signature verification failed.", "invalid_webhook_signature");
