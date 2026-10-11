using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record FlowValidationPointer(string? Path = null, int? LineStart = null, int? LineEnd = null, int? ColumnStart = null, int? ColumnEnd = null);
public sealed record FlowValidationIssue(string? Error = null, string? ErrorType = null, string? Message = null, IReadOnlyList<FlowValidationPointer>? Pointers = null, int? LineStart = null, int? LineEnd = null, int? ColumnStart = null, int? ColumnEnd = null);
public sealed record FlowNumberLink(string Session, string WabaId, string MetaFlowId, string Status, IReadOnlyList<string> Categories, IReadOnlyList<FlowValidationIssue> ValidationErrors, string UploadState, long LastSyncedAt, string? SessionId = null, string? PreviewUrl = null, long? PreviewExpiresAt = null, string? DefinitionDigest = null, bool? Simulated = null);
public record FlowSummary(string Id, string Name, string Status, string Version, int ScreenCount, IReadOnlyList<FlowNumberLink> MetaLinks, long CreatedAt, long UpdatedAt);
public sealed record FlowDraft(string Id, string Name, string Status, string Version, int ScreenCount, IReadOnlyList<FlowNumberLink> MetaLinks, long CreatedAt, long UpdatedAt, IReadOnlyDictionary<string, JsonElement> Definition) : FlowSummary(Id, Name, Status, Version, ScreenCount, MetaLinks, CreatedAt, UpdatedAt);
public sealed record CreateFlowRequest(string Name, IReadOnlyDictionary<string, JsonElement> Definition, string? DraftId = null);
public sealed record UpdateFlowRequest(long ExpectedUpdatedAt, string? Name = null, string? Status = null, IReadOnlyDictionary<string, JsonElement>? Definition = null);
public sealed record FlowProviderRequest(string SessionId, IReadOnlyList<string>? Categories = null, string? RequestId = null);
public sealed record FlowProviderOperation(string Id, string? RequestId, string FlowId, string FlowName, string SessionId, string Session, string Action, string State, string? Resolution, string? WabaId, string? MetaFlowId, string? DefinitionDigest, string? ProviderStatus, string? ErrorCode, int? ProviderCode, int? ProviderSubcode, long CreatedAt, long UpdatedAt, long? CompletedAt);
public sealed record FlowProviderResult(FlowProviderOperation? Operation, FlowDraft Flow);
public sealed record FlowEndpoint(string Id, string OrgId, string ProjectId, string FlowId, string SessionId, string Mode, string? Url, string? FunctionId, string? DeploymentId, bool Enabled, long Revision, string EndpointUri, long CreatedAt, long UpdatedAt);
public sealed record ManagedFlowEncryptionKey(string Id, string State, string Fingerprint, string PublicKey, string? ErrorCode, long CreatedAt, long? ActivatedAt, long? RetireAfter);
public record FlowEncryptionCustody(string Custody, string? ActiveKeyId, IReadOnlyList<ManagedFlowEncryptionKey> Keys);
public sealed record FlowEncryptionKeyRotation(string Custody, string? ActiveKeyId, IReadOnlyList<ManagedFlowEncryptionKey> Keys, ManagedFlowEncryptionKey Key) : FlowEncryptionCustody(Custody, ActiveKeyId, Keys);
public sealed record FlowEndpointState(FlowEndpoint? Endpoint, FlowEncryptionCustody Encryption);
public sealed record FlowEndpointSetResult(FlowEndpoint Endpoint, FlowEncryptionCustody Encryption, string? SigningSecret = null)
{
    public override string ToString() => $"FlowEndpointSetResult {{ EndpointId = {Endpoint.Id}, SigningSecret = [REDACTED] }}";
}
public abstract record SetFlowEndpointRequest(string SessionId, bool? Enabled = null, long? ExpectedRevision = null) { public abstract string Mode { get; } }
public sealed record ForwardFlowEndpointRequest(string SessionId, string Url, bool? RotateSigningSecret = null, bool? Enabled = null, long? ExpectedRevision = null) : SetFlowEndpointRequest(SessionId, Enabled, ExpectedRevision) { public override string Mode => "forward"; }
public sealed record DirectFlowEndpointRequest(string SessionId, string Url, bool? Enabled = null, long? ExpectedRevision = null) : SetFlowEndpointRequest(SessionId, Enabled, ExpectedRevision) { public override string Mode => "direct"; }
public sealed record FunctionFlowEndpointRequest(string SessionId, string FunctionId, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> DeploymentId = default, bool? Enabled = null, long? ExpectedRevision = null) : SetFlowEndpointRequest(SessionId, Enabled, ExpectedRevision) { public override string Mode => "function"; }
public sealed record FlowNumberRequest(string SessionId);
public sealed record ListFlowEndpointReceiptsParameters(string? SessionId = null, int? Limit = null);
public sealed record FlowEndpointReceipt(string Id, string FlowId, string EndpointId, string SessionId, string Mode, string? Action, string Outcome, int? HttpStatus, string? ErrorCode, string? KeyId, string? FunctionInvocationId, double? DurationMs, long CreatedAt, long? CompletedAt);
public sealed record FlowOk(bool Ok);
public sealed class Flows : Resource
{
    private readonly string projectId;
    internal Flows(HttpTransport http, string projectId) : base(http) => this.projectId = projectId;
    private static string Path(string flowId) => string.IsNullOrWhiteSpace(flowId) ? throw new PolymorfaConfigurationException("A non-empty flowId is required.") : "/platform/flows/" + E(flowId);
    private async Task<ApiResponse<T>> Request<T>(HttpMethod method, string path, object? body, RequestOptions? options)
    {
        IReadOnlyList<KeyValuePair<string, string>>? query = null;
        if (method == HttpMethod.Get || method == HttpMethod.Delete) { query = Query(body).Append(new("projectId", projectId)).ToArray(); body = null; }
        else
        {
            var payload = body is null ? new Dictionary<string, JsonElement>() : JsonSerializer.SerializeToElement(body, body.GetType(), HttpTransport.Json).EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
            payload["projectId"] = JsonSerializer.SerializeToElement(projectId); body = payload;
        }
        var response = await Http.RequestAsync<DataEnvelope<T>>(method, path, body, method == HttpMethod.Get ? options : (options ?? new()) with { MaxNetworkRetries = 0 }, query).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public Task<ApiResponse<IReadOnlyList<FlowSummary>>> ListAsync(RequestOptions? options = null) => Request<IReadOnlyList<FlowSummary>>(HttpMethod.Get, "/platform/flows", null, options);
    public Task<ApiResponse<FlowDraft>> CreateAsync(CreateFlowRequest body, RequestOptions? options = null) => Request<FlowDraft>(HttpMethod.Post, "/platform/flows", body, options);
    public Task<ApiResponse<FlowDraft?>> RetrieveAsync(string flowId, RequestOptions? options = null)
    {
        if (!Guid.TryParseExact(flowId, "D", out _)) throw new PolymorfaValidationException("flowId must be a valid UUID.", "invalid_parameter");
        return Request<FlowDraft?>(HttpMethod.Get, Path(flowId), null, options);
    }
    public Task<ApiResponse<FlowDraft>> UpdateAsync(string flowId, UpdateFlowRequest body, RequestOptions? options = null) => Request<FlowDraft>(HttpMethod.Patch, Path(flowId), body, options);
    public Task<ApiResponse<FlowOk>> DeleteAsync(string flowId, RequestOptions? options = null) => Request<FlowOk>(HttpMethod.Delete, Path(flowId), null, options);
    public Task<ApiResponse<FlowProviderResult>> UploadAsync(string flowId, FlowProviderRequest body, RequestOptions? options = null) => Request<FlowProviderResult>(HttpMethod.Post, Path(flowId) + "/upload", body, options);
    public Task<ApiResponse<FlowProviderResult>> PublishAsync(string flowId, FlowProviderRequest body, RequestOptions? options = null) => Request<FlowProviderResult>(HttpMethod.Post, Path(flowId) + "/publish", body, options);
    public Task<ApiResponse<FlowProviderResult>> DeprecateAsync(string flowId, FlowProviderRequest body, RequestOptions? options = null) => Request<FlowProviderResult>(HttpMethod.Post, Path(flowId) + "/deprecate", body, options);
    public Task<ApiResponse<FlowProviderResult>> DiscardAsync(string flowId, FlowProviderRequest body, RequestOptions? options = null) => Request<FlowProviderResult>(HttpMethod.Post, Path(flowId) + "/discard", body, options);
    public Task<ApiResponse<FlowProviderResult>> SyncAsync(string flowId, FlowProviderRequest body, RequestOptions? options = null) => Request<FlowProviderResult>(HttpMethod.Post, Path(flowId) + "/sync", body, options);
    public Task<ApiResponse<IReadOnlyList<FlowProviderOperation>>> ReceiptsAsync(string flowId, RequestOptions? options = null) => Request<IReadOnlyList<FlowProviderOperation>>(HttpMethod.Get, Path(flowId) + "/receipts", null, options);
    public Task<ApiResponse<FlowEndpointState>> EndpointAsync(string flowId, FlowNumberRequest parameters, RequestOptions? options = null) { ValidateNumber(parameters.SessionId); return Request<FlowEndpointState>(HttpMethod.Get, Path(flowId) + "/endpoint", parameters, options); }
    public Task<ApiResponse<FlowEndpointSetResult>> SetEndpointAsync(string flowId, SetFlowEndpointRequest body, RequestOptions? options = null)
    {
        ValidateNumber(body.SessionId);
        if (body.ExpectedRevision is < 1) throw new PolymorfaValidationException("expectedRevision must be positive.", "invalid_parameter");
        switch (body)
        {
            case ForwardFlowEndpointRequest forward: ValidateEndpointUrl(forward.Url); break;
            case DirectFlowEndpointRequest direct: ValidateEndpointUrl(direct.Url); break;
            case FunctionFlowEndpointRequest function when !string.IsNullOrWhiteSpace(function.FunctionId): break;
            default: throw new PolymorfaValidationException("Invalid Flow endpoint mode or functionId.", "invalid_parameter");
        }
        return Request<FlowEndpointSetResult>(HttpMethod.Put, Path(flowId) + "/endpoint", body, options);
    }
    public Task<ApiResponse<FlowOk>> DeleteEndpointAsync(string flowId, FlowNumberRequest parameters, RequestOptions? options = null) { ValidateNumber(parameters.SessionId); return Request<FlowOk>(HttpMethod.Delete, Path(flowId) + "/endpoint", parameters, options); }
    public Task<ApiResponse<IReadOnlyList<FlowEndpointReceipt>>> EndpointReceiptsAsync(string flowId, ListFlowEndpointReceiptsParameters? parameters = null, RequestOptions? options = null)
    {
        if (parameters?.Limit is < 1 or > 100) throw new PolymorfaValidationException("limit must be from 1 to 100.", "invalid_parameter");
        return Request<IReadOnlyList<FlowEndpointReceipt>>(HttpMethod.Get, Path(flowId) + "/endpoint/receipts", parameters, options);
    }
    public Task<ApiResponse<FlowEncryptionCustody>> EncryptionKeyAsync(FlowNumberRequest parameters, RequestOptions? options = null) { ValidateNumber(parameters.SessionId); return Request<FlowEncryptionCustody>(HttpMethod.Get, "/platform/flow-encryption-keys", parameters, options); }
    public Task<ApiResponse<FlowEncryptionKeyRotation>> RotateEncryptionKeyAsync(FlowNumberRequest parameters, RequestOptions? options = null) { ValidateNumber(parameters.SessionId); return Request<FlowEncryptionKeyRotation>(HttpMethod.Post, "/platform/flow-encryption-keys/rotate", parameters, options); }
    private static void ValidateNumber(string sessionId) { if (string.IsNullOrWhiteSpace(sessionId)) throw new PolymorfaValidationException("sessionId is required.", "invalid_parameter"); }
    private static void ValidateEndpointUrl(string value)
    {
        if (value.Length > 2048 || !Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" || url.UserInfo.Length > 0 || url.Fragment.Length > 0) throw new PolymorfaValidationException("Flow endpoint must be an HTTPS URL without user information or fragment.", "invalid_parameter");
    }
}
