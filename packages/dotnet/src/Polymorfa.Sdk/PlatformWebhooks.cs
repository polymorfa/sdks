namespace Polymorfa.Sdk;

public sealed record WebhookRetryPolicy(int MaximumAttempts, string Backoff, int InitialDelaySeconds);
public sealed record WebhookHeaderInput(string Name, string Value)
{
    public override string ToString() => $"WebhookHeaderInput {{ Name = {Name}, Value = [REDACTED] }}";
}
public sealed record WebhookHeaderMetadata(string Name);
public sealed record WebhookSigningSecretMetadata(int Version, string CreatedAt, string? PreviousValidUntil);
public sealed record PlatformWebhook(string Id, string OrganizationId, string Owner, string? ProjectId, string Url, IReadOnlyList<string> EventTypes, bool Enabled, string Format, WebhookRetryPolicy RetryPolicy, IReadOnlyList<WebhookHeaderMetadata> Headers, WebhookSigningSecretMetadata Secret, string CreatedAt, string UpdatedAt);
public sealed record CreatePlatformWebhookInput(string Url, IReadOnlyList<string> EventTypes, bool? Enabled = null, string? Format = null, WebhookRetryPolicy? RetryPolicy = null, IReadOnlyList<WebhookHeaderInput>? Headers = null);
public sealed record UpdatePlatformWebhookInput(string? Url = null, IReadOnlyList<string>? EventTypes = null, bool? Enabled = null, string? Format = null, WebhookRetryPolicy? RetryPolicy = null, IReadOnlyList<WebhookHeaderInput>? Headers = null);
public sealed record ListPlatformWebhooksParameters(string? EventType = null, bool? Enabled = null, int? Limit = null, string? Cursor = null);
public sealed record RotateWebhookSecretInput(int? OverlapSeconds = null);
public record TestPlatformWebhookInput(string? EventType = null);
public sealed record TestProjectWebhookPayloadInput(EncodedEventPayload Body, string SessionId, string? EventType = null) : TestPlatformWebhookInput(EventType);
public sealed record WebhookCreationReceipt(PlatformWebhook Webhook, string? OperationId, IdempotencyReceipt Idempotency, string? Secret, bool SecretAvailable)
{
    public override string ToString() => $"WebhookCreationReceipt {{ WebhookId = {Webhook.Id}, SecretAvailable = {SecretAvailable}, Secret = [REDACTED] }}";
}
public sealed record WebhookMutationReceipt(PlatformWebhook Webhook, string? OperationId, IdempotencyReceipt Idempotency);
public sealed record WebhookDeletionReceipt(string WebhookId, bool Deleted, string? OperationId, IdempotencyReceipt Idempotency);
public sealed record WebhookSecretRotationReceipt(string WebhookId, string? OperationId, string? Secret, bool SecretAvailable, WebhookSigningSecretMetadata SecretMetadata, IdempotencyReceipt Idempotency)
{
    public override string ToString() => $"WebhookSecretRotationReceipt {{ WebhookId = {WebhookId}, SecretAvailable = {SecretAvailable}, Secret = [REDACTED] }}";
}
public sealed record WebhookDeliveryCapabilities(bool Retryable);
public sealed record WebhookDeliveryOutcome(int? StatusCode, string? ErrorCode);
public sealed record WebhookDelivery(string Id, string OrganizationId, string? ProjectId, string EventId, string WebhookId, string Status, int AttemptCount, WebhookDeliveryCapabilities Capabilities, string PayloadAvailability, string? ReplayableUntil, string MetadataExpiresAt, string? NextAttemptAt, string? LastAttemptAt, string? CompletedAt, string CreatedAt, string UpdatedAt, WebhookDeliveryOutcome? LastOutcome);
public sealed record ListWebhookDeliveriesParameters(string? WebhookId = null, string? EventId = null, string? Status = null, string? Since = null, string? Until = null, int? Limit = null, string? Cursor = null);
public sealed record ListDeliveryAttemptsParameters(int? Limit = null, string? Cursor = null);
public sealed record WebhookDeliveryAttemptResponse(string ContentType, string Excerpt, bool Truncated);
public sealed record WebhookDeliveryAttempt(string Id, string OrganizationId, string? ProjectId, string DeliveryId, int Number, string Status, string? StartedAt, string? CompletedAt, string? NextRetryAt, double? DurationMs, int? StatusCode, string? ErrorCode, WebhookDeliveryAttemptResponse? Response, string MetadataExpiresAt);
public sealed record WebhookDeliveryRetryReceipt(string DeliveryId, string AttemptId, string OperationId, IdempotencyReceipt Idempotency);
public sealed class PlatformWebhooks : Resource
{
    private readonly string prefix;
    private readonly bool project;
    internal PlatformWebhooks(HttpTransport http, string? projectId) : base(http) { project = projectId is not null; prefix = project ? "/platform/projects/" + E(projectId!) : "/platform"; }
    private string Path(string? id = null) => prefix + "/webhooks" + (id is null ? "" : "/" + E(id));
    private async Task<ApiResponse<T>> Unwrap<T>(HttpMethod method, string path, object? body, RequestOptions? options)
    {
        var response = await Http.RequestAsync<DataEnvelope<T>>(method, path, body, options).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public Task<CursorPage<PlatformWebhook>> ListAsync(ListPlatformWebhooksParameters? parameters = null, RequestOptions? options = null) => CursorPage<PlatformWebhook>.LoadAsync(Http, Path(), Query(parameters), options ?? new());
    public Task<ApiResponse<WebhookCreationReceipt>> CreateAsync(CreatePlatformWebhookInput body, RequestOptions? options = null) => Unwrap<WebhookCreationReceipt>(HttpMethod.Post, Path(), body, options);
    public Task<ApiResponse<PlatformWebhook>> RetrieveAsync(string webhookId, RequestOptions? options = null) => Unwrap<PlatformWebhook>(HttpMethod.Get, Path(webhookId), null, options);
    public Task<ApiResponse<WebhookMutationReceipt>> UpdateAsync(string webhookId, UpdatePlatformWebhookInput body, RequestOptions? options = null) => Unwrap<WebhookMutationReceipt>(HttpMethod.Patch, Path(webhookId), body, options);
    public Task<ApiResponse<WebhookDeletionReceipt>> DeleteAsync(string webhookId, RequestOptions? options = null) => Unwrap<WebhookDeletionReceipt>(HttpMethod.Delete, Path(webhookId), null, options);
    public Task<ApiResponse<EventReplayReceipt>> TestAsync(string webhookId, TestPlatformWebhookInput? body = null, RequestOptions? options = null)
    {
        if (!project && body is TestProjectWebhookPayloadInput) throw new PolymorfaValidationException("Organization webhook tests do not accept body or sessionId.", "invalid_parameter");
        return Unwrap<EventReplayReceipt>(HttpMethod.Post, Path(webhookId) + "/tests", body ?? new(), options);
    }
    public Task<ApiResponse<WebhookSecretRotationReceipt>> RotateSecretAsync(string webhookId, RotateWebhookSecretInput? body = null, RequestOptions? options = null) => Unwrap<WebhookSecretRotationReceipt>(HttpMethod.Post, Path(webhookId) + "/secret-rotations", body ?? new(), options);
}
public sealed class WebhookDeliveries : Resource
{
    private readonly string prefix;
    internal WebhookDeliveries(HttpTransport http, string? projectId) : base(http) => prefix = projectId is null ? "/platform" : "/platform/projects/" + E(projectId);
    private string Path(string? id = null) => prefix + "/webhook-deliveries" + (id is null ? "" : "/" + E(id));
    private async Task<ApiResponse<T>> Unwrap<T>(HttpMethod method, string path, object? body, RequestOptions? options)
    {
        var response = await Http.RequestAsync<DataEnvelope<T>>(method, path, body, options).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public Task<CursorPage<WebhookDelivery>> ListAsync(ListWebhookDeliveriesParameters? parameters = null, RequestOptions? options = null) => CursorPage<WebhookDelivery>.LoadAsync(Http, Path(), Query(parameters), options ?? new());
    public Task<ApiResponse<WebhookDelivery>> RetrieveAsync(string deliveryId, RequestOptions? options = null) => Unwrap<WebhookDelivery>(HttpMethod.Get, Path(deliveryId), null, options);
    public Task<CursorPage<WebhookDeliveryAttempt>> ListAttemptsAsync(string deliveryId, ListDeliveryAttemptsParameters? parameters = null, RequestOptions? options = null) => CursorPage<WebhookDeliveryAttempt>.LoadAsync(Http, Path(deliveryId) + "/attempts", Query(parameters), options ?? new());
    public Task<ApiResponse<WebhookDeliveryAttempt>> RetrieveAttemptAsync(string deliveryId, string attemptId, RequestOptions? options = null) => Unwrap<WebhookDeliveryAttempt>(HttpMethod.Get, Path(deliveryId) + "/attempts/" + E(attemptId), null, options);
    public Task<ApiResponse<WebhookDeliveryRetryReceipt>> RetryAsync(string deliveryId, RequestOptions? options = null) => Unwrap<WebhookDeliveryRetryReceipt>(HttpMethod.Post, Path(deliveryId) + "/retry", new { }, options);
}
