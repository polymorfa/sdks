using System.Text.Json;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record FunctionDefinition(string Id, string ProjectId, string Name, bool Enabled, long Revision, string? ActiveDeploymentId, string CreatedAt, string UpdatedAt);
public sealed record FunctionPage<T>(IReadOnlyList<T> Items, string? NextCursor);
public sealed record ListFunctionsParameters(int? Limit = null, string? Before = null);
public sealed record CreateFunctionInput(string Name, string? FunctionId = null);
public sealed record UpdateFunctionInput(long ExpectedRevision, string? Name = null, bool? Enabled = null);
public sealed record CreateFunctionDeploymentInput(string DeploymentId, string Source, string Language, string Region, string CompatibilityDate, IReadOnlyList<string>? SecretVersionIds = null, IReadOnlyList<string>? EgressOrigins = null);
public record FunctionDeploymentSummary(string Id, string FunctionId, string Language, string Region, string CompatibilityDate, string Sha256, IReadOnlyList<string> SecretVersionIds, IReadOnlyList<string> EgressOrigins, string CreatedAt);
public sealed record FunctionDeployment(string Id, string FunctionId, string Source, string Language, string Region, string CompatibilityDate, string Sha256, IReadOnlyList<string> SecretVersionIds, IReadOnlyList<string> EgressOrigins, string CreatedAt);
public sealed record PromoteFunctionDeploymentInput(string DeploymentId, long ExpectedRevision);
public sealed record FunctionSecretVersion(string Id, string Name, string CreatedAt, string? RevokedAt);
public sealed record CreateFunctionSecretInput(string Name, string Value) { public override string ToString() => $"CreateFunctionSecretInput(name={Name}, value=redacted)"; }
public sealed record FunctionRequest(string Method, string Url, IReadOnlyDictionary<string, string> Headers, string BodyBase64);
public sealed record FunctionResponse(int Status, IReadOnlyDictionary<string, string> Headers, string BodyBase64);
public sealed record FunctionInvocation(string Id, string FunctionId, string DeploymentId, string Outcome, string Trigger, string? ErrorCode, long? DurationMs, long? ResponseBytes, int Attempt, string CreatedAt, string? CompletedAt);
public sealed record CreateFunctionInvocationInput(FunctionRequest Request, string? DeploymentId = null, string? Trigger = null);
public sealed record FunctionInvocationResult(FunctionInvocation Receipt, bool Replayed, bool ResponseRetained, bool Retryable, FunctionResponse? Response = null);
public sealed record FunctionMutationResult(bool Ok);
internal sealed class FunctionTransport(HttpTransport http, string projectId)
{
    internal static string Id(string id) => Regex.IsMatch(id, "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOptions.CultureInvariant) ? id : throw Invalid("A canonical Functions UUID is required.");
    internal static void Revision(long revision) { if (revision < 1 || revision > 9007199254740991L) throw Invalid("A positive Function revision is required."); }
    internal static PolymorfaValidationException Invalid(string message) => new(message, "invalid_function_input");
    internal async Task<ApiResponse<T>> Request<T>(HttpMethod method, string suffix, object? input, RequestOptions? options)
    {
        var fields = input is null ? new Dictionary<string, JsonElement>() : JsonSerializer.SerializeToElement(input, input.GetType(), HttpTransport.Json).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        fields.Add("projectId", JsonSerializer.SerializeToElement(Id(projectId)));
        options ??= new(); if (method != HttpMethod.Get) options = options with { MaxNetworkRetries = 0 };
        var query = method == HttpMethod.Get || method == HttpMethod.Delete;
        var response = await http.RequestAsync<DataEnvelope<T>>(method, "/platform/functions" + suffix, query ? null : fields, options, query ? Resource.Query(fields) : null).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
}
public sealed class Functions
{
    private readonly FunctionTransport api;
    public FunctionDeployments Deployments { get; }
    public FunctionSecrets Secrets { get; }
    public FunctionInvocations Invocations { get; }
    internal Functions(HttpTransport http, string projectId) { api = new(http, projectId); Deployments = new(api); Secrets = new(api); Invocations = new(api); }
    public Task<ApiResponse<FunctionPage<FunctionDefinition>>> ListAsync(ListFunctionsParameters? parameters = null, RequestOptions? options = null) => api.Request<FunctionPage<FunctionDefinition>>(HttpMethod.Get, "", parameters, options);
    public Task<ApiResponse<FunctionDefinition>> CreateAsync(CreateFunctionInput input, RequestOptions? options = null) { if (input.FunctionId is not null) FunctionTransport.Id(input.FunctionId); return api.Request<FunctionDefinition>(HttpMethod.Post, "", input, options); }
    public Task<ApiResponse<FunctionDefinition>> RetrieveAsync(string id, RequestOptions? options = null) => api.Request<FunctionDefinition>(HttpMethod.Get, "/" + FunctionTransport.Id(id), null, options);
    public Task<ApiResponse<FunctionDefinition>> UpdateAsync(string id, UpdateFunctionInput input, RequestOptions? options = null) { FunctionTransport.Revision(input.ExpectedRevision); return api.Request<FunctionDefinition>(HttpMethod.Patch, "/" + FunctionTransport.Id(id), input, options); }
    public Task<ApiResponse<FunctionMutationResult>> DeleteAsync(string id, long expectedRevision, RequestOptions? options = null) { FunctionTransport.Revision(expectedRevision); return api.Request<FunctionMutationResult>(HttpMethod.Delete, "/" + FunctionTransport.Id(id), new { expectedRevision }, options); }
}
public sealed class FunctionDeployments
{
    private readonly FunctionTransport api;
    internal FunctionDeployments(FunctionTransport api) => this.api = api;
    public Task<ApiResponse<FunctionPage<FunctionDeploymentSummary>>> ListAsync(string functionId, ListFunctionsParameters? parameters = null, RequestOptions? options = null) => api.Request<FunctionPage<FunctionDeploymentSummary>>(HttpMethod.Get, "/" + FunctionTransport.Id(functionId) + "/deployments", parameters, options);
    public Task<ApiResponse<FunctionDeployment>> CreateAsync(string functionId, CreateFunctionDeploymentInput input, RequestOptions? options = null) { FunctionTransport.Id(input.DeploymentId); return api.Request<FunctionDeployment>(HttpMethod.Post, "/" + FunctionTransport.Id(functionId) + "/deployments", input, options); }
    public Task<ApiResponse<FunctionDeployment>> RetrieveAsync(string functionId, string deploymentId, RequestOptions? options = null) => api.Request<FunctionDeployment>(HttpMethod.Get, "/" + FunctionTransport.Id(functionId) + "/deployments/" + FunctionTransport.Id(deploymentId), null, options);
    public Task<ApiResponse<FunctionDefinition>> PromoteAsync(string functionId, PromoteFunctionDeploymentInput input, RequestOptions? options = null) { FunctionTransport.Id(input.DeploymentId); FunctionTransport.Revision(input.ExpectedRevision); return api.Request<FunctionDefinition>(HttpMethod.Put, "/" + FunctionTransport.Id(functionId) + "/promotion", input, options); }
}
public sealed class FunctionSecrets
{
    private readonly FunctionTransport api;
    internal FunctionSecrets(FunctionTransport api) => this.api = api;
    public Task<ApiResponse<FunctionPage<FunctionSecretVersion>>> ListAsync(string functionId, ListFunctionsParameters? parameters = null, RequestOptions? options = null) => api.Request<FunctionPage<FunctionSecretVersion>>(HttpMethod.Get, "/" + FunctionTransport.Id(functionId) + "/secrets", parameters, options);
    public Task<ApiResponse<FunctionSecretVersion>> CreateAsync(string functionId, CreateFunctionSecretInput input, RequestOptions? options = null) => api.Request<FunctionSecretVersion>(HttpMethod.Post, "/" + FunctionTransport.Id(functionId) + "/secrets", input, options);
    public Task<ApiResponse<FunctionMutationResult>> RevokeAsync(string functionId, string versionId, RequestOptions? options = null) => api.Request<FunctionMutationResult>(HttpMethod.Delete, "/" + FunctionTransport.Id(functionId) + "/secrets/" + FunctionTransport.Id(versionId), null, options);
}
public sealed class FunctionInvocations
{
    private readonly FunctionTransport api;
    internal FunctionInvocations(FunctionTransport api) => this.api = api;
    public Task<ApiResponse<FunctionPage<FunctionInvocation>>> ListAsync(string functionId, ListFunctionsParameters? parameters = null, RequestOptions? options = null) => api.Request<FunctionPage<FunctionInvocation>>(HttpMethod.Get, "/" + FunctionTransport.Id(functionId) + "/invocations", parameters, options);
    public Task<ApiResponse<FunctionInvocation>> RetrieveAsync(string functionId, string invocationId, RequestOptions? options = null) => api.Request<FunctionInvocation>(HttpMethod.Get, "/" + FunctionTransport.Id(functionId) + "/invocations/" + FunctionTransport.Id(invocationId), null, options);
    public Task<ApiResponse<FunctionInvocationResult>> CreateAsync(string functionId, CreateFunctionInvocationInput input, RequestOptions options)
    {
        if (options.IdempotencyKey is null || !Regex.IsMatch(options.IdempotencyKey, "^[\\x21-\\x7e]{1,128}$", RegexOptions.CultureInvariant)) throw FunctionTransport.Invalid("A valid invocation idempotency key is required.");
        if (input.DeploymentId is not null) FunctionTransport.Id(input.DeploymentId);
        return api.Request<FunctionInvocationResult>(HttpMethod.Post, "/" + FunctionTransport.Id(functionId) + "/invocations", input, options);
    }
}
