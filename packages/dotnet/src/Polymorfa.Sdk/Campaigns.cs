using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record CampaignBlueprint(int Version, string Source) { [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public sealed record CampaignVariant(string Key, string Label, int Weight, CampaignBlueprint Blueprint);
public sealed record CampaignMessageVariation(string Key, int Weight, CampaignBlueprint Blueprint);
/// <summary>A receipt-timed beta follow-up. The API owns enrollment, defaults, bounds and send eligibility.</summary>
public sealed record CampaignFollowUp(CampaignFollowUpMessage Message, int? DelaySeconds = null, int? ExpirySeconds = null);
[JsonConverter(typeof(CampaignFollowUpMessageConverter))] public abstract record CampaignFollowUpMessage;
public sealed record CampaignFollowUpText(string Text) : CampaignFollowUpMessage;
public sealed record CampaignFollowUpTemplate(string TemplateId) : CampaignFollowUpMessage;
[JsonConverter(typeof(CampaignFollowUpStatusConverter))]
public enum CampaignFollowUpStatus { WaitingReceipt, Scheduled, Sending, Sent, Cancelled, Expired, Failed, OutcomeUnknown }
[JsonConverter(typeof(CampaignFollowUpAnchorKindConverter))]
public enum CampaignFollowUpAnchorKind { Delivered, Read }
/// <summary>Receipt and outcome times are Unix milliseconds; absent receipts are null.</summary>
public sealed record CampaignFollowUpSummary(string Id, string NumberId, CampaignFollowUpStatus Status, CampaignFollowUpAnchorKind? AnchorKind, long? FirstDeliveredAt, long? FirstReadAt, long? DueAt, long ExpiresAt, long? SentAt, long? DeliveredAt, long? ReadAt, long? RepliedAt, string? Reason, string? CommandId);
public sealed record CampaignFollowUpReport(long Total, long Waiting, long Scheduled, long Sending, long Sent, long Delivered, long Read, long Replied, long Cancelled, long Expired, long Failed, long Unknown, long? NextDueAt);

public sealed record CampaignVariantStrategy(string WinnerCriterion, int HoldoutPercent, bool AutoPromote, int TestWindowMinutes, int? TestSlicePercent = null);
[JsonConverter(typeof(CampaignOutcomeConverter))] public abstract record CampaignExperimentOutcome;
public sealed record CampaignPromoted(string WinnerKey) : CampaignExperimentOutcome;
public sealed record CampaignInconclusive(string Reason) : CampaignExperimentOutcome;
public sealed record CampaignExperimentVariantResult(string Key, string Label, int Weight, long Assigned, long Sent, long Delivered, long Read, long Replied, decimal OutcomeRate);
public sealed record CampaignExperimentResults(string Criterion, CampaignExperimentOutcome? Outcome, long HoldoutCount, long ReserveCount, IReadOnlyList<CampaignExperimentVariantResult> Variants);
public sealed record CampaignSendWindowRange(string Start, string End);
public sealed record CampaignSendWindowRequest(IReadOnlyList<string> Days, IReadOnlyList<CampaignSendWindowRange> Hours, string? TimeZone = null, bool? RecipientTimeZone = null, string? TimeZoneVariable = null);
public sealed record CampaignSendWindow(string TimeZone, IReadOnlyList<string> Days, IReadOnlyList<CampaignSendWindowRange> Hours, bool RecipientTimeZone, string TimeZoneVariable);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CampaignVariableBinding([property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> Source = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> Fallback = default);
public sealed class CampaignVariableMapping : Dictionary<string, CampaignVariableBinding>
{
    public CampaignVariableMapping() : base(StringComparer.Ordinal) { }
    public CampaignVariableMapping(IDictionary<string, CampaignVariableBinding> values) : base(values, StringComparer.Ordinal) { }
}
public sealed record CampaignTrackedLink(string Key, string Url);
public sealed record PlatformCampaignMessage
{
    public int? Version { get; init; }
    public string? Source { get; init; }
    public PlatformCampaignMedia? Media { get; init; }
    public IReadOnlyList<PlatformCampaignButton>? Buttons { get; init; }
    public string? Footer { get; init; }
    public int? DelayAfterSec { get; init; }
    [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record PlatformCampaignMedia(string Kind, string Url, string? Filename = null, string? Caption = null)
{
    [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record PlatformCampaignButton(string Kind, string Label, string? Url = null, string? Phone = null)
{
    [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; }
}
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
    public CampaignFollowUp? FollowUp { get; init; }
    public IReadOnlyList<CampaignTrackedLink> TrackedLinks { get; init; } = null!;
    public CampaignVariableMapping? VariableMapping { get; init; }
}
public sealed record CampaignOperation : Campaign { public string OperationId { get; init; } = ""; }
public sealed record CampaignStopOperation : Campaign { public string? OperationId { get; init; } }
public sealed record PlatformCampaign : Campaign { [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public record CampaignAnalytics(string CampaignId, long RecipientCount, long SentCount, long DeliveredCount, long ReadCount, long FailedCount, long SkippedCount, long RespondedCount, decimal ResponseRate, decimal? AverageResponseTimeMs, decimal? MinResponseTimeMs, decimal? MaxResponseTimeMs, CampaignExperimentResults? Experiment, CampaignFollowUpReport FollowUps);
public sealed record PlatformCampaignAnalytics(string CampaignId, long RecipientCount, long SentCount, long DeliveredCount, long ReadCount, long FailedCount, long SkippedCount, long RespondedCount, decimal ResponseRate, decimal? AverageResponseTimeMs, decimal? MinResponseTimeMs, decimal? MaxResponseTimeMs, CampaignExperimentResults? Experiment, CampaignFollowUpReport FollowUps) : CampaignAnalytics(CampaignId, RecipientCount, SentCount, DeliveredCount, ReadCount, FailedCount, SkippedCount, RespondedCount, ResponseRate, AverageResponseTimeMs, MinResponseTimeMs, MaxResponseTimeMs, Experiment, FollowUps);
public record CreateCampaignRequest(string Name, string? TemplateId = null, string? RecipientListId = null, IReadOnlyDictionary<string, JsonElement>? SenderConfig = null, long? ScheduledAt = null, CampaignSendWindowRequest? SendWindow = null, IReadOnlyList<CampaignRecipientInput>? Recipients = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignMessageVariation>> MessageVariations = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignVariant>> Variants = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignVariantStrategy> VariantStrategy = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignFollowUp> FollowUp = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignVariableMapping> VariableMapping = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignTrackedLink>> TrackedLinks = default);
public sealed record CreatePlatformCampaignRequest(string ProjectId, string Name, string? TemplateId = null, string? RecipientListId = null, IReadOnlyDictionary<string, JsonElement>? SenderConfig = null, long? ScheduledAt = null, CampaignSendWindowRequest? SendWindow = null, IReadOnlyList<CampaignRecipientInput>? Recipients = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignMessageVariation>> MessageVariations = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignVariant>> Variants = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignVariantStrategy> VariantStrategy = default, long? RecipientCount = null, JsonElement? ComposerBlueprint = null, IReadOnlyList<PlatformCampaignMessage>? MessagesArray = null, JsonElement? AudienceRef = null, JsonElement? ComplianceConfig = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignFollowUp> FollowUp = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<CampaignVariableMapping> VariableMapping = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<IReadOnlyList<CampaignTrackedLink>> TrackedLinks = default);
public record UpdateCampaignRequest
{
    public string? Name { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> TemplateId { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignVariableMapping> VariableMapping { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<CampaignTrackedLink>> TrackedLinks { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> RecipientListId { get; init; }
    public IReadOnlyDictionary<string, JsonElement>? SenderConfig { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<long?> ScheduledAt { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignSendWindowRequest> SendWindow { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<CampaignMessageVariation>> MessageVariations { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<CampaignVariant>> Variants { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignVariantStrategy> VariantStrategy { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<CampaignFollowUp> FollowUp { get; init; }
}
public sealed record UpdatePlatformCampaignRequest : UpdateCampaignRequest { public IReadOnlyList<PlatformCampaignMessage>? MessagesArray { get; init; } [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; } }
public sealed record LaunchCampaignRequest(double? ScheduledAt = null, bool? SkipMissingVariables = null);
public sealed record LaunchPlatformCampaignRequest(string ProjectId, double? ScheduledAt = null, bool? SkipMissingVariables = null);
public sealed record PlatformCampaignLaunchResult(string Id, string Status, string OperationId)
{
    [JsonExtensionData] public IDictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record RescheduleCampaignRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ScheduledAt);
public sealed record ReschedulePlatformCampaignRequest(string ProjectId, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ScheduledAt);
public sealed record RequeueCampaignRequest(bool? IncludeSkippedError = null);
public sealed record CampaignRequeueResult(long Requeued);
public sealed record ListCampaignRecipientsParameters(string? Status = null, string? Cursor = null, int? Limit = null, CampaignRecipientFailureReason? Reason = null);
public sealed record CampaignRecipient(string Id, string Phone, IReadOnlyDictionary<string, JsonElement> Variables, string? VariantKey, string Status, long Attempts, string? LastError, string? ExternalMessageId, long QueuedAt, long? SentAt, long? DeliveredAt, long? ReadAt, long? FailedAt, long? RespondedAt, CampaignRecipientFailureReason? FailureReason, long MessagesSent, double? NextMessageAt, string? SequenceError, CampaignFollowUpSummary? FollowUp);
public sealed record CampaignRecipientPage(string? NextCursor, bool HasMore);
public sealed record CampaignRecipientsResponse(bool Success, IReadOnlyList<CampaignRecipient> Data, CampaignRecipientPage Page);
public sealed record AddCampaignRecipientsRequest(IReadOnlyList<CampaignRecipientInput> Recipients);
public sealed record AddPlatformCampaignRecipientsRequest(string ProjectId, IReadOnlyList<CampaignRecipientInput> Recipients);
public sealed record AddCampaignRecipientsResult(string CampaignId, long Added, long RecipientCount, long DuplicateCount, long InvalidCount, IReadOnlyList<InvalidRecipientRow> InvalidRows);
public sealed record ListCampaignsParameters(string ProjectId, string? ProjectSlug = null);
public sealed record PlatformCampaignParameters(string ProjectId);
public sealed record ListPlatformCampaignRecipientsParameters(string ProjectId, string? Status = null, string? Cursor = null, int? Limit = null, CampaignRecipientFailureReason? Reason = null);
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
    internal static RequestOptions Idempotent(RequestOptions? options) => (options ?? new()).WithIdempotency();
    internal static RequestOptions Append(RequestOptions? options) => options is { MaxNetworkRetries: not null, IdempotencyKey: not null } ? options : (options ?? new()) with { MaxNetworkRetries = 0 };
}
public sealed partial class MessagingCampaigns : Resource
{
    internal MessagingCampaigns(HttpTransport http) : base(http) { }
    private static string Path(string slug) => "/messaging/projects/" + E(slug) + "/campaigns";
    private static string Path(string slug, string id) => Path(slug) + "/" + E(id);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Campaign>>>> ListAsync(string slug, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<IReadOnlyList<Campaign>>>(Http, HttpMethod.Get, Path(slug), options: options);
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> CreateAsync(string slug, CreateCampaignRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<Campaign>>(Http, HttpMethod.Post, Path(slug), CampaignExistingValidation.Body(input), CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> RetrieveAsync(string slug, string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<Campaign>>(Http, HttpMethod.Get, Path(slug, id), options: options);
    public Task<ApiResponse<SuccessEnvelope<Campaign>>> UpdateAsync(string slug, string id, UpdateCampaignRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<Campaign>>(Http, HttpMethod.Patch, Path(slug, id), CampaignExistingValidation.Body(input, patch: true), CampaignOptions.Append(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignAnalytics>>> AnalyticsAsync(string slug, string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignAnalytics>>(Http, HttpMethod.Get, Path(slug, id) + "/analytics", options: options);
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> LaunchAsync(string slug, string id, LaunchCampaignRequest? input = null, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignOperation>>(Http, HttpMethod.Post, Path(slug, id) + "/launch", CampaignExistingValidation.Launch(input ?? new(), false), CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> RescheduleAsync(string slug, string id, RescheduleCampaignRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignOperation>>(Http, HttpMethod.Post, Path(slug, id) + "/reschedule", ExistingContractCodec.Capture(input), CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> PauseAsync(string slug, string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignOperation>>(Http, HttpMethod.Post, Path(slug, id) + "/pause", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignOperation>>> ResumeAsync(string slug, string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignOperation>>(Http, HttpMethod.Post, Path(slug, id) + "/resume", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignStopOperation>>> StopAsync(string slug, string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignStopOperation>>(Http, HttpMethod.Post, Path(slug, id) + "/stop", null, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<CampaignRecipientsResponse>> ListRecipientsAsync(string slug, string id, ListCampaignRecipientsParameters? parameters = null, RequestOptions? options = null) => ExistingContractCodec.Request<CampaignRecipientsResponse>(Http, HttpMethod.Get, Path(slug, id) + "/recipients", options: options, query: CampaignExistingValidation.Recipients(parameters ?? new(), false));
    public Task<ApiResponse<SuccessEnvelope<AddCampaignRecipientsResult>>> AddRecipientsAsync(string slug, string id, AddCampaignRecipientsRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<AddCampaignRecipientsResult>>(Http, HttpMethod.Post, Path(slug, id) + "/recipients", ExistingContractCodec.Capture(input), CampaignOptions.Append(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignRequeueResult>>> RequeueAsync(string slug, string id, RequeueCampaignRequest? input = null, RequestOptions? options = null) => Post<SuccessEnvelope<CampaignRequeueResult>>(Path(slug, id) + "/requeue", input ?? new(), options);
}
public sealed partial class PlatformCampaigns : Resource
{
    internal PlatformCampaigns(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/platform/campaigns/" + E(id);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformCampaign>>>> ListAsync(ListCampaignsParameters parameters, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<IReadOnlyList<PlatformCampaign>>>(Http, HttpMethod.Get, "/platform/campaigns", options: options, query: Query(parameters));
    public Task<ApiResponse<DataEnvelope<PlatformCampaign>>> CreateAsync(CreatePlatformCampaignRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<PlatformCampaign>>(Http, HttpMethod.Post, "/platform/campaigns", CampaignExistingValidation.Body(input, true), (options ?? new()) with { IdempotencyKey = null, MaxNetworkRetries = 0 });
    public Task<ApiResponse<DataEnvelope<PlatformCampaign?>>> RetrieveAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<PlatformCampaign?>>(Http, HttpMethod.Get, Path(id), options: options, query: Query(parameters), nullableData: true);
    public Task<ApiResponse<DataEnvelope<PlatformCampaign>>> UpdateAsync(string id, UpdatePlatformCampaignRequest? input, PlatformCampaignParameters parameters, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<PlatformCampaign>>(Http, HttpMethod.Patch, Path(id), input is null ? null : CampaignExistingValidation.Body(input, true, true), options, Query(parameters));
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> DeleteAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Http.RequestAsync<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(HttpMethod.Delete, Path(id), null, options, Query(parameters));
    private Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> Action(string id, string action, IReadOnlyDictionary<string, JsonElement>? input, RequestOptions? options, bool idempotent) => Post<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/" + action, input, idempotent ? CampaignOptions.Idempotent(options) : options);
    public Task<ApiResponse<DataEnvelope<PlatformCampaignLaunchResult>>> LaunchAsync(string id, LaunchPlatformCampaignRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<PlatformCampaignLaunchResult>>(Http, HttpMethod.Post, Path(id) + "/launch", CampaignExistingValidation.Launch(input, true), CampaignOptions.Idempotent(options));
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> PauseAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "pause", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> ResumeAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "resume", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> StopAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "stop", input, options, true);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> ArchiveAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "archive", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> DuplicateAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "duplicate", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> RequeueAsync(string id, IReadOnlyDictionary<string, JsonElement>? input = null, RequestOptions? options = null) => Action(id, "requeue", input, options, false);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> RescheduleAsync(string id, ReschedulePlatformCampaignRequest input, RequestOptions? options = null) => Post<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/reschedule", input, CampaignOptions.Idempotent(options));
    public Task<ApiResponse<DataEnvelope<PlatformCampaignAnalytics>>> AnalyticsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<PlatformCampaignAnalytics>>(Http, HttpMethod.Get, Path(id) + "/analytics", options: options, query: Query(parameters));
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> EventsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id) + "/events", options, parameters);
    public Task<ApiResponse<CursorEnvelope<CampaignRecipient>>> RecipientsAsync(string id, ListPlatformCampaignRecipientsParameters parameters, RequestOptions? options = null) => ExistingContractCodec.Request<CursorEnvelope<CampaignRecipient>>(Http, HttpMethod.Get, Path(id) + "/recipients", options: options, query: CampaignExistingValidation.Recipients(parameters, true), platformRecipients: true);
    public Task<ApiResponse<DataEnvelope<AddCampaignRecipientsResult>>> AddRecipientsAsync(string id, AddPlatformCampaignRecipientsRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<AddCampaignRecipientsResult>>(Http, HttpMethod.Post, Path(id) + "/recipients", ExistingContractCodec.Capture(input), CampaignOptions.Append(options));
    public Task<ApiResponse<DataEnvelope<CampaignConversion>>> RecordConversionAsync(string id, RecordCampaignConversionRequest input, RequestOptions? options = null) => Post<DataEnvelope<CampaignConversion>>(Path(id) + "/conversions", input, options);
    public Task<ApiResponse<DataEnvelope<CampaignConversionReport>>> ConversionsAsync(string id, PlatformCampaignParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<CampaignConversionReport>>(Path(id) + "/conversions", options, parameters);
}
internal sealed class CampaignOutcomeConverter : JsonConverter<CampaignExperimentOutcome>
{
    public override CampaignExperimentOutcome Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) { using var doc = JsonDocument.ParseValue(ref reader); var json = doc.RootElement; return json.GetProperty("state").GetString() switch { "promoted" => new CampaignPromoted(json.GetProperty("winnerKey").GetString()!), "inconclusive" => new CampaignInconclusive(json.GetProperty("reason").GetString()!), _ => throw new JsonException("Invalid experiment outcome.") }; }
    public override void Write(Utf8JsonWriter writer, CampaignExperimentOutcome value, JsonSerializerOptions options) { writer.WriteStartObject(); if (value is CampaignPromoted p) { writer.WriteString("state", "promoted"); writer.WriteString("winnerKey", p.WinnerKey); } else if (value is CampaignInconclusive i) { writer.WriteString("state", "inconclusive"); writer.WriteString("reason", i.Reason); } else throw new JsonException("Invalid experiment outcome."); writer.WriteEndObject(); }
}

internal sealed class CampaignFollowUpStatusConverter() : JsonStringEnumConverter<CampaignFollowUpStatus>(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);
internal sealed class CampaignFollowUpAnchorKindConverter() : JsonStringEnumConverter<CampaignFollowUpAnchorKind>(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);
internal sealed class CampaignFollowUpMessageConverter : JsonConverter<CampaignFollowUpMessage>
{
    public override CampaignFollowUpMessage Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        var value = document.RootElement;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String) throw new JsonException("Follow-up message type is required.");
        return type.GetString() switch
        {
            "text" => new CampaignFollowUpText(RequiredString(value, "text")),
            "template" => new CampaignFollowUpTemplate(RequiredString(value, "templateId")),
            _ => throw new JsonException("Invalid follow-up message type.")
        };
    }
    private static string RequiredString(JsonElement value, string field) => value.TryGetProperty(field, out var result) && result.ValueKind == JsonValueKind.String ? result.GetString()! : throw new JsonException($"Follow-up {field} is required.");
    public override void Write(Utf8JsonWriter writer, CampaignFollowUpMessage value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case CampaignFollowUpText text: writer.WriteString("type", "text"); writer.WriteString("text", text.Text); break;
            case CampaignFollowUpTemplate template: writer.WriteString("type", "template"); writer.WriteString("templateId", template.TemplateId); break;
            default: throw new JsonException("Invalid follow-up message type.");
        }
        writer.WriteEndObject();
    }
}
