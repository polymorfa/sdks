using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record CampaignBlueprint(int Version, string Source) { [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public sealed record CampaignVariant(string Key, string Label, int Weight, CampaignBlueprint Blueprint);
public sealed record CampaignMessageVariation(string Key, int Weight, CampaignBlueprint Blueprint);
public sealed record CampaignVariantStrategy(string WinnerCriterion, int HoldoutPercent, bool AutoPromote, int TestWindowMinutes, int? TestSlicePercent = null);
[JsonConverter(typeof(CampaignOutcomeConverter))] public abstract record CampaignExperimentOutcome;
public sealed record CampaignPromoted(string WinnerKey) : CampaignExperimentOutcome;
public sealed record CampaignInconclusive(string Reason) : CampaignExperimentOutcome;
public sealed record CampaignExperimentVariantResult(string Key, string Label, int Weight, long Assigned, long Sent, long Delivered, long Read, long Replied, decimal OutcomeRate);
public sealed record CampaignExperimentResults(string Criterion, CampaignExperimentOutcome? Outcome, long HoldoutCount, long ReserveCount, IReadOnlyList<CampaignExperimentVariantResult> Variants);
public sealed record CampaignSendWindowRange(string Start, string End);
public sealed record CampaignSendWindowRequest(IReadOnlyList<string> Days, IReadOnlyList<CampaignSendWindowRange> Hours, string? TimeZone = null, bool? RecipientTimeZone = null, string? TimeZoneVariable = null);
public sealed record CampaignSendWindow(string TimeZone, IReadOnlyList<string> Days, IReadOnlyList<CampaignSendWindowRange> Hours, bool RecipientTimeZone, string TimeZoneVariable);
public record Campaign
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Status { get; init; } = "";
    public string? TemplateId { get; init; }
    public string? RecipientListId { get; init; }
    public long RecipientCount { get; init; }
    public long SentCount { get; init; }
    public long DeliveredCount { get; init; }
    public long ReadCount { get; init; }
    public long FailedCount { get; init; }
    public long SkippedCount { get; init; }
    public long? ScheduledAt { get; init; }
    public long? LaunchedAt { get; init; }
    public long? CompletedAt { get; init; }
    public long CreatedAt { get; init; }
    public long UpdatedAt { get; init; }
    public CampaignSendWindow? SendWindow { get; init; }
    public JsonElement? ComposerBlueprint { get; init; }
    public JsonElement? Messages { get; init; }
    public JsonElement? AudienceRef { get; init; }
    public JsonElement? SenderConfig { get; init; }
    public JsonElement? ComplianceConfig { get; init; }
    public IReadOnlyList<CampaignVariant>? Variants { get; init; }
    public CampaignVariantStrategy? VariantStrategy { get; init; }
    public CampaignExperimentOutcome? ExperimentOutcome { get; init; }
    public IReadOnlyList<CampaignMessageVariation>? MessageVariations { get; init; }
}
public sealed record CampaignOperation : Campaign { public string OperationId { get; init; } = ""; }
public sealed record CampaignStopOperation : Campaign { public string? OperationId { get; init; } }
public sealed record PlatformCampaign : Campaign { [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public record CampaignAnalytics(string CampaignId, long RecipientCount, long SentCount, long DeliveredCount, long ReadCount, long FailedCount, long SkippedCount, long RespondedCount, decimal ResponseRate, CampaignExperimentResults? Experiment = null);
public sealed record PlatformCampaignAnalytics(string CampaignId, long RecipientCount, long SentCount, long DeliveredCount, long ReadCount, long FailedCount, long SkippedCount, long RespondedCount, decimal ResponseRate, decimal? AverageResponseTimeMs, decimal? MinResponseTimeMs, decimal? MaxResponseTimeMs, CampaignExperimentResults? Experiment) : CampaignAnalytics(CampaignId, RecipientCount, SentCount, DeliveredCount, ReadCount, FailedCount, SkippedCount, RespondedCount, ResponseRate, Experiment);
public record CreateCampaignRequest(string Name, string? TemplateId = null, string? RecipientListId = null, IReadOnlyDictionary<string, JsonElement>? SenderConfig = null, long? ScheduledAt = null, CampaignSendWindowRequest? SendWindow = null, IReadOnlyList<CampaignRecipientInput>? Recipients = null, IReadOnlyList<CampaignMessageVariation>? MessageVariations = null, IReadOnlyList<CampaignVariant>? Variants = null, CampaignVariantStrategy? VariantStrategy = null);
public sealed record CreatePlatformCampaignRequest(string ProjectId, string Name, string? TemplateId = null, string? RecipientListId = null, IReadOnlyDictionary<string, JsonElement>? SenderConfig = null, long? ScheduledAt = null, CampaignSendWindowRequest? SendWindow = null, IReadOnlyList<CampaignRecipientInput>? Recipients = null, IReadOnlyList<CampaignMessageVariation>? MessageVariations = null, IReadOnlyList<CampaignVariant>? Variants = null, CampaignVariantStrategy? VariantStrategy = null, long? RecipientCount = null, JsonElement? ComposerBlueprint = null, JsonElement? MessagesArray = null, JsonElement? AudienceRef = null, JsonElement? ComplianceConfig = null) : CreateCampaignRequest(Name, TemplateId, RecipientListId, SenderConfig, ScheduledAt, SendWindow, Recipients, MessageVariations, Variants, VariantStrategy);
public record UpdateCampaignRequest
{
    public string? Name { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> RecipientListId { get; init; }
    public IReadOnlyDictionary<string, JsonElement>? SenderConfig { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<long?> ScheduledAt { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignSendWindowRequest> SendWindow { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<CampaignMessageVariation>> MessageVariations { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<CampaignVariant>> Variants { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignVariantStrategy> VariantStrategy { get; init; }
}
public sealed record UpdatePlatformCampaignRequest : UpdateCampaignRequest { [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public sealed record LaunchCampaignRequest(long? ScheduledAt = null);
public sealed record RescheduleCampaignRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ScheduledAt);
public sealed record ReschedulePlatformCampaignRequest(string ProjectId, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ScheduledAt);
public sealed record RequeueCampaignRequest(bool? IncludeSkippedError = null);
public sealed record CampaignRequeueResult(long Requeued);
public sealed record ListCampaignRecipientsParameters(string? Status = null, string? Cursor = null, int? Limit = null);
public sealed record CampaignRecipient(string Id, string Phone, IReadOnlyDictionary<string, JsonElement> Variables, string? VariantKey, string Status, long Attempts, string? LastError, string? ExternalMessageId, long QueuedAt, long? SentAt, long? DeliveredAt, long? ReadAt, long? FailedAt, long? RespondedAt);
public sealed record CampaignRecipientPage(string? NextCursor, bool HasMore);
public sealed record CampaignRecipientsResponse(bool Success, IReadOnlyList<CampaignRecipient> Data, CampaignRecipientPage Page);
public sealed record AddCampaignRecipientsRequest(IReadOnlyList<CampaignRecipientInput> Recipients);
public sealed record AddPlatformCampaignRecipientsRequest(string ProjectId, IReadOnlyList<CampaignRecipientInput> Recipients);
public sealed record AddCampaignRecipientsResult(string CampaignId, long Added, long RecipientCount, long DuplicateCount, long InvalidCount, IReadOnlyList<InvalidRecipientRow> InvalidRows);
public sealed record ListCampaignsParameters(string ProjectId, string? ProjectSlug = null);
public sealed record PlatformCampaignParameters(string ProjectId);
public sealed record ListPlatformCampaignRecipientsParameters(string ProjectId, string? Status = null, string? Cursor = null, int? Limit = null);
public sealed record CampaignConversionValue(long AmountMinor, string Currency);
public sealed record RecordCampaignConversionRequest(string ProjectId, string RecipientId, string EventId, string EventType, string OccurredAt, CampaignConversionValue? Value = null);
public sealed record CampaignConversionAttribution(string Outcome, string? TouchAt, int WindowDays);
public sealed record CampaignConversion(string Id, string CampaignId, string? RecipientId, string EventType, string OccurredAt, CampaignConversionValue? Value, string Evidence, CampaignConversionAttribution Attribution, string RecordedAt, bool Replayed);
public sealed record CampaignConversionCurrencyTotal(string Currency, string Evidence, long AttributedConversions, string AttributedAmountMinor, long UnattributedConversions, string UnattributedAmountMinor);
public sealed record CampaignConversionModel(string Touch, int WindowDays, string Correlation);
public sealed record CampaignConversionCounts(long Total, long Attributed, long OutsideWindow, long NotSent, long OptedOut);
public sealed record CampaignConversionReport(string CampaignId, CampaignConversionModel Model, long SentCount, CampaignConversionCounts Conversions, long ConvertedRecipients, decimal ConversionRate, IReadOnlyList<CampaignConversionCurrencyTotal> Values);
internal static class CampaignOptions
{
    internal static RequestOptions Idempotent(RequestOptions? options) => (options ?? new()) with { IdempotencyKey = options?.IdempotencyKey ?? Guid.NewGuid().ToString() };
    internal static RequestOptions Append(RequestOptions? options) => options is { MaxNetworkRetries: not null, IdempotencyKey: not null } ? options : (options ?? new()) with { MaxNetworkRetries = 0 };
}
public sealed class MessagingCampaigns : Resource
{
    internal MessagingCampaigns(HttpTransport http) : base(http) { }
    private static string Path(string slug) => "/messaging/projects/" + E(slug) + "/campaigns";
    private static string Path(string slug, string id) => Path(slug) + "/" + E(id);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Campaign>>>> ListAsync(string slug, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Campaign>>>(Path(slug), options);
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> CreateAsync(string slug, CreateCampaignRequest input, RequestOptions? options = null) => Post<SuccessEnvelope<Campaign>>(Path(slug), input, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> RetrieveAsync(string slug, string id, RequestOptions? options = null) => Get<SuccessEnvelope<Campaign>>(Path(slug, id), options);
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> UpdateAsync(string slug, string id, UpdateCampaignRequest input, RequestOptions? options = null) { if (JsonSerializer.SerializeToElement(input, HttpTransport.Json).EnumerateObject().Count() == 0) throw new PolymorfaValidationException("A campaign update requires at least one field.", "invalid_parameter"); return Patch<SuccessEnvelope<Campaign>>(Path(slug, id), input, CampaignOptions.Append(options)); }
    public Task<ApiResponse<SuccessEnvelope<CampaignAnalytics>>> AnalyticsAsync(string slug, string id, RequestOptions? options = null) => Get<SuccessEnvelope<CampaignAnalytics>>(Path(slug, id) + "/analytics", options);
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> LaunchAsync(string slug, string id, LaunchCampaignRequest? input = null, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignOperation>>(Path(slug, id) + "/launch", input ?? new(), CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> RescheduleAsync(string slug, string id, RescheduleCampaignRequest input, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignOperation>>(Path(slug, id) + "/reschedule", input, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> PauseAsync(string slug, string id, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignOperation>>(Path(slug, id) + "/pause", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> ResumeAsync(string slug, string id, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignOperation>>(Path(slug, id) + "/resume", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignStopOperation>>> StopAsync(string slug, string id, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignStopOperation>>(Path(slug, id) + "/stop", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<CampaignRecipientsResponse>> ListRecipientsAsync(string slug, string id, ListCampaignRecipientsParameters? parameters = null, RequestOptions? options = null) => Get<CampaignRecipientsResponse>(Path(slug, id) + "/recipients", options, parameters);
    public Task<ApiResponse<SuccessEnvelope<AddCampaignRecipientsResult>>> AddRecipientsAsync(string slug, string id, AddCampaignRecipientsRequest input, RequestOptions? options = null) => Post<SuccessEnvelope<AddCampaignRecipientsResult>>(Path(slug, id) + "/recipients", input, CampaignOptions.Append(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignRequeueResult>>> RequeueAsync(string slug, string id, RequeueCampaignRequest? input = null, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignRequeueResult>>(Path(slug, id) + "/requeue", input ?? new(), options);
}
public sealed class PlatformCampaigns : Resource
{
    internal PlatformCampaigns(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/platform/campaigns/" + E(id);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformCampaign>>>> ListAsync(ListCampaignsParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<PlatformCampaign>>>("/platform/campaigns", options, parameters);
    public Task<ApiResponse<DataEnvelope<PlatformCampaign>>> CreateAsync(CreatePlatformCampaignRequest input, RequestOptions? options = null) => Post<DataEnvelope<PlatformCampaign>>("/platform/campaigns", input, (options ?? new()) with { IdempotencyKey = null, MaxNetworkRetries = 0 });
    public Task<ApiResponse<DataEnvelope<PlatformCampaign?>>> RetrieveAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<PlatformCampaign?>>(Path(id), options, parameters);
    public Task<ApiResponse<DataEnvelope<PlatformCampaign>>> UpdateAsync(string id, UpdatePlatformCampaignRequest? input, PlatformCampaignParameters parameters, RequestOptions? options = null) => Http.RequestAsync<DataEnvelope<PlatformCampaign>>(HttpMethod.Patch, Path(id), input, options, Query(parameters));
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> DeleteAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Http.RequestAsync<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(HttpMethod.Delete, Path(id), null, options, Query(parameters));
    private Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> Action(string id, string action, IReadOnlyDictionary<string, JsonElement>? input, RequestOptions? options, bool idempotent) => Post<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/" + action, input, idempotent ? CampaignOptions.Idempotent(options) : options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> LaunchAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "launch", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> PauseAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "pause", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> ResumeAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "resume", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> StopAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "stop", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> ArchiveAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "archive", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> DuplicateAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "duplicate", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> RequeueAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "requeue", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> RescheduleAsync(string id, ReschedulePlatformCampaignRequest input, RequestOptions? options = null) => Post<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/reschedule", input, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<DataEnvelope<PlatformCampaignAnalytics>>> AnalyticsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<PlatformCampaignAnalytics>>(Path(id) + "/analytics", options, parameters);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> EventsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/events", options, parameters);
    public Task<ApiResponse<CursorEnvelope<CampaignRecipient>>> RecipientsAsync(string id, ListPlatformCampaignRecipientsParameters parameters, RequestOptions? options = null) => Get<CursorEnvelope<CampaignRecipient>>(Path(id) + "/recipients", options, parameters);
    public Task<ApiResponse<DataEnvelope<AddCampaignRecipientsResult>>> AddRecipientsAsync(string id, AddPlatformCampaignRecipientsRequest input, RequestOptions? options = null) => Post<DataEnvelope<AddCampaignRecipientsResult>>(Path(id) + "/recipients", input, CampaignOptions.Append(options));
    public Task<ApiResponse<DataEnvelope<CampaignConversion>>> RecordConversionAsync(string id, RecordCampaignConversionRequest input, RequestOptions? options = null) => Post<DataEnvelope<CampaignConversion>>(Path(id) + "/conversions", input, options);
    public Task<ApiResponse<DataEnvelope<CampaignConversionReport>>> ConversionsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<CampaignConversionReport>>(Path(id) + "/conversions", options, parameters);
}
internal sealed class CampaignOutcomeConverter : JsonConverter<CampaignExperimentOutcome>
{
    public override CampaignExperimentOutcome Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) { using var doc = JsonDocument.ParseValue(ref reader); var json = doc.RootElement; return json.GetProperty("state").GetString() switch { "promoted" => new CampaignPromoted(json.GetProperty("winnerKey").GetString()!), "inconclusive" => new CampaignInconclusive(json.GetProperty("reason").GetString()!), _ => throw new JsonException("Invalid experiment outcome.") }; }
    public override void Write(Utf8JsonWriter writer, CampaignExperimentOutcome value, JsonSerializerOptions options) { writer.WriteStartObject(); if (value is CampaignPromoted p) { writer.WriteString("state", "promoted"); writer.WriteString("winnerKey", p.WinnerKey); } else if (value is CampaignInconclusive i) { writer.WriteString("state", "inconclusive"); writer.WriteString("reason", i.Reason); } else throw new JsonException("Invalid experiment outcome."); writer.WriteEndObject(); }
}
