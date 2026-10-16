using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record CallRetention(string Policy, int RetentionDays, IReadOnlyList<string> AppliesTo, long Revision, string? UpdatedAt);
public sealed record UpdateCallRetentionRequest(string Policy, int? RetentionDays = null, long? ExpectedRevision = null);
public sealed class CallRetentionResource : Resource
{
    internal CallRetentionResource(HttpTransport http) : base(http) { }
    public async Task<ApiResponse<CallRetention>> RetrieveAsync(RequestOptions? options = null) { var r = await Get<DataEnvelope<CallRetention>>("/platform/call-retention", options); return new(r.Data.Data, r.Metadata); }
    public async Task<ApiResponse<CallRetention>> UpdateAsync(UpdateCallRetentionRequest body, RequestOptions? options = null) { var r = await Put<DataEnvelope<CallRetention>>("/platform/call-retention", body, options); return new(r.Data.Data, r.Metadata); }
}
public sealed class TeamCallRetentionClient : IDisposable
{
    private readonly HttpTransport http;
    public CallRetentionResource CallRetention { get; }
    public TeamCallRetentionClient(Credential credential, ClientOptions? options = null) { credential.RequireServer(); http = new(credential, options ?? new()); CallRetention = new(http); }
    public void Dispose() => http.Dispose();
}
public sealed record CallPolicy(IReadOnlyList<string> BlockedCountryCodes, long OptOutCount, long Revision, string? UpdatedAt);
public sealed record UpdateCallPolicyRequest(IReadOnlyList<string> BlockedCountryCodes, long? ExpectedRevision = null);
public sealed record CallOptOut(string Id, string? PhoneNumber, string? Bsuid, string? Note, string Source, string CreatedAt);
public sealed record ListCallOptOutsParameters(int? Limit = null, string? Cursor = null, string? PhoneNumber = null, string? Bsuid = null);
public sealed record CreateCallOptOutRequest(string? PhoneNumber = null, string? Bsuid = null, string? Note = null);
public sealed record CallOptOutImportEntry(string? PhoneNumber = null, string? Bsuid = null, string? Note = null);
public sealed record ImportCallOptOutsRequest(IReadOnlyList<CallOptOutImportEntry> Entries);
public sealed record CallOptOutRejection(int Index, string Reason);
public sealed record CallOptOutImportResult(int Added, int Existing, IReadOnlyList<CallOptOutRejection> Rejected);
public sealed record CallOptOutDeleted(string Id, bool Deleted);
public sealed class CallPolicyResource : Resource
{
    internal CallPolicyResource(HttpTransport http) : base(http) { }
    public async Task<ApiResponse<CallPolicy>> RetrieveAsync(RequestOptions? options = null) { var r = await Get<DataEnvelope<CallPolicy>>("/platform/call-policy", options); return new(r.Data.Data, r.Metadata); }
    public async Task<ApiResponse<CallPolicy>> UpdateAsync(UpdateCallPolicyRequest body, RequestOptions? options = null)
    {
        if (body.BlockedCountryCodes.Count > 300 || body.BlockedCountryCodes.Any(code => !Regex.IsMatch(code, "^[1-9][0-9]{0,3}$")) || body.ExpectedRevision is < 0 or > 9_007_199_254_740_991) throw new PolymorfaValidationException("Invalid blocked country codes or revision.", "invalid_parameter");
        var r = await Put<DataEnvelope<CallPolicy>>("/platform/call-policy", body, options); return new(r.Data.Data, r.Metadata);
    }
}
public sealed class CallOptOuts : Resource
{
    internal CallOptOuts(HttpTransport http) : base(http) { }
    public Task<CursorPage<CallOptOut>> ListAsync(ListCallOptOutsParameters? parameters = null, RequestOptions? options = null)
    {
        if (parameters?.PhoneNumber is not null && parameters.Bsuid is not null) throw new PolymorfaValidationException("Use phoneNumber or bsuid as the filter.", "invalid_parameter");
        return CursorPage<CallOptOut>.LoadAsync(Http, "/platform/call-opt-outs", Query(parameters), options ?? new());
    }
    public async Task<ApiResponse<CallOptOut>> CreateAsync(CreateCallOptOutRequest body, RequestOptions? options = null)
    {
        if (string.IsNullOrEmpty(body.PhoneNumber) == string.IsNullOrEmpty(body.Bsuid)) throw new PolymorfaValidationException("Supply exactly one phoneNumber or bsuid.", "invalid_parameter");
        var r = await Post<DataEnvelope<CallOptOut>>("/platform/call-opt-outs", body, options); return new(r.Data.Data, r.Metadata);
    }
    public async Task<ApiResponse<CallOptOutImportResult>> ImportAsync(ImportCallOptOutsRequest body, RequestOptions? options = null)
    {
        if (body.Entries.Count is < 1 or > 5000) throw new PolymorfaValidationException("Import between 1 and 5000 entries.", "invalid_parameter");
        var r = await Post<DataEnvelope<CallOptOutImportResult>>("/platform/call-opt-outs/import", body, options); return new(r.Data.Data, r.Metadata);
    }
    public async Task<ApiResponse<CallOptOutDeleted>> DeleteAsync(string id, RequestOptions? options = null)
    {
        if (string.IsNullOrWhiteSpace(id)) throw new PolymorfaConfigurationException("An opt-out ID is required.");
        var r = await Delete<DataEnvelope<CallOptOutDeleted>>("/platform/call-opt-outs/" + E(id), options); return new(r.Data.Data, r.Metadata);
    }
}
