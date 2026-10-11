using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record UsageRecord(string Id, string Meter, decimal Quantity, string Unit, IReadOnlyDictionary<string, JsonElement> Dimensions, string KeySource, string SourceKind, string SourceId, string? ProjectId, string? Session, string OccurredAt, string RecordedAt, long Revision, string PricingState, UsageRateCard? RateCard, decimal? PricedCredits);
public sealed record UsageRecordPage(IReadOnlyList<UsageRecord> Records, string? NextCursor);
public sealed record UsageMeterTotal(string Meter, string Unit, string KeySource, decimal Quantity, long Records);
public sealed record UsageNumberTotal(string Session, string? ProjectId, IReadOnlyList<UsageMeterTotal> Meters);
public sealed record UsageSummary(string Period, string Start, string End, string? ProjectId, string? Session, bool BillingEnabled, IReadOnlyList<UsageMeterTotal> Meters, IReadOnlyList<UsageNumberTotal> Numbers, bool NumbersTruncated);
public sealed record UsageGateDecisions(long WouldBlock, long Blocked, long EvaluationError);
public sealed record UsageGate(string Key, string Kind, string Subject, string Mode, bool Active, decimal? Limit, decimal? Used, string? Unit, bool? OverLimit, UsageGateDecisions Decisions);
public sealed record UsageGateList(string? Session, IReadOnlyList<UsageGate> Gates);
public sealed record UsageSummaryParameters(string? ProjectId = null, string? Session = null, string? Period = null);
public sealed record UsageRecordParameters(string? ProjectId = null, string? Session = null, string? Period = null, string? CallId = null, string? Meter = null, int? Limit = null, string? Cursor = null);
public sealed record UsageGateParameters(string? ProjectId = null, string? Session = null);
public sealed class Usage : Resource
{
    private readonly string? projectId;
    internal Usage(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    public Task<ApiResponse<UsageSummary>> SummaryAsync(UsageSummaryParameters? parameters = null, RequestOptions? options = null) => Read<UsageSummary>("/platform/usage", parameters ?? new(), options);
    public Task<ApiResponse<UsageRecordPage>> ListRecordsAsync(UsageRecordParameters? parameters = null, RequestOptions? options = null) => Read<UsageRecordPage>("/platform/usage/records", parameters ?? new(), options);
    public Task<ApiResponse<UsageGateList>> ListGatesAsync(UsageGateParameters? parameters = null, RequestOptions? options = null) => Read<UsageGateList>("/platform/gates", parameters ?? new(), options);
    private async Task<ApiResponse<T>> Read<T>(string path, object parameters, RequestOptions? options)
    {
        var query = Query(parameters).Where(p => projectId is null || p.Key != "projectId").ToList();
        if (projectId is not null) query.Add(new("projectId", projectId));
        var response = await Http.RequestAsync<DataEnvelope<T>>(HttpMethod.Get, path, null, options, query).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public async IAsyncEnumerable<UsageRecord> IterateRecordsAsync(UsageRecordParameters? parameters = null, RequestOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        parameters ??= new(); options ??= new();
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, options.CancellationToken);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        string? cursor = null;
        do
        {
            var page = await ListRecordsAsync(parameters with { Cursor = cursor }, options with { CancellationToken = linked.Token }).ConfigureAwait(false);
            cursor = page.Data.NextCursor;
            if (cursor is not null && !seen.Add(cursor)) throw new PolymorfaServerException("The API repeated a usage record cursor.", "invalid_response", page.Metadata);
            foreach (var record in page.Data.Records) { linked.Token.ThrowIfCancellationRequested(); yield return record; }
        } while (cursor is not null);
    }
}
public sealed record OptOutSettings(bool Enabled, IReadOnlyList<string> OptOutKeywords, IReadOnlyList<string> OptInKeywords, long? UpdatedAt);
public sealed record UpdateOptOutSettingsRequest(bool Enabled, IReadOnlyList<string> OptOutKeywords, IReadOnlyList<string> OptInKeywords);
public sealed class OptOuts : Resource
{
    internal OptOuts(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<JsonElement>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<JsonElement>>("/platform/optouts", options);
    public Task<ApiResponse<DataEnvelope<JsonElement>>> CreateAsync(JsonElement? body = null, RequestOptions? options = null) => Post<DataEnvelope<JsonElement>>("/platform/optouts", body, options);
    public Task<ApiResponse<DataEnvelope<JsonElement>>> CreateBatchAsync(JsonElement? body = null, RequestOptions? options = null) => Post<DataEnvelope<JsonElement>>("/platform/optouts/batch", body, options);
    public Task<ApiResponse<DataEnvelope<JsonElement>>> DeleteAsync(string phone, RequestOptions? options = null) => Delete<DataEnvelope<JsonElement>>("/platform/optouts/" + E(phone), options);
    public Task<ApiResponse<DataEnvelope<OptOutSettings>>> GetSettingsAsync(RequestOptions? options = null) => Get<DataEnvelope<OptOutSettings>>("/platform/optouts/settings", options);
    public Task<ApiResponse<DataEnvelope<OptOutSettings>>> UpdateSettingsAsync(UpdateOptOutSettingsRequest body, RequestOptions? options = null) => Put<DataEnvelope<OptOutSettings>>("/platform/optouts/settings", body, options);
}
