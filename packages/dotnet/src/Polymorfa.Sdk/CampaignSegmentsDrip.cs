using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

/// <summary>Rolling per-contact limits; null means no additional limit for that window. <c>MaxPer24Hours</c> is 1..50 and cannot exceed <c>MaxPer7Days</c> (1..200).</summary>
public sealed record CampaignFrequencyCap([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer24Hours, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer7Days);
/// <summary>The team cap. <c>Revision</c> is 0 and <c>UpdatedAt</c> is null until first saved.</summary>
public sealed record CampaignFrequencyCapSettings(string TeamId, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer24Hours, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer7Days, long Revision, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? UpdatedAt);
/// <summary>Complete replacement with the revision from the last read; null limits remove them.</summary>
public sealed record UpdateCampaignFrequencyCapRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer24Hours, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MaxPer7Days, long Revision);
public sealed record CampaignFrequencyCapAnalytics(long SkippedRecipientCount);

[JsonConverter(typeof(CampaignDripEnrollmentConverter))] public enum CampaignDripEnrollment { Audience, Continuous }
public sealed class CampaignDripEnrollmentConverter() : CampaignStringEnumConverter<CampaignDripEnrollment>((CampaignDripEnrollment.Audience, "audience"), (CampaignDripEnrollment.Continuous, "continuous"));
[JsonConverter(typeof(CampaignDelayUnitConverter))] public enum CampaignDelayUnit { Minutes, Hours, Days }
public sealed class CampaignDelayUnitConverter() : CampaignStringEnumConverter<CampaignDelayUnit>((CampaignDelayUnit.Minutes, "minutes"), (CampaignDelayUnit.Hours, "hours"), (CampaignDelayUnit.Days, "days"));
/// <summary>Stored drip settings. A GET of a tracked link counts as a click, including link previews and scanners.</summary>
public sealed record CampaignDrip(CampaignDripEnrollment Enrollment, bool ExitOnReply, bool ExitOnLinkClick);
/// <summary>Create settings; the API applies audience, true and false to omitted fields.</summary>
public sealed record CampaignDripInput(CampaignDripEnrollment? Enrollment = null, bool? ExitOnReply = null, bool? ExitOnLinkClick = null);
/// <summary>Partial settings. Omitted fields keep their stored values; no defaults are applied.</summary>
public sealed record CampaignDripPatch(CampaignDripEnrollment? Enrollment = null, bool? ExitOnReply = null, bool? ExitOnLinkClick = null);
public sealed record CampaignDripStepStats(int Step, long Entered, long Waiting, long Sent, long Delivered, long Read, long Replied, long Exited, long Failed);
public sealed record CampaignDripStats(CampaignDripEnrollment Enrollment, long Enrolled, long EnrolledByApi, long Active, long Completed, long Exited, IReadOnlyList<CampaignDripStepStats> Steps);
/// <summary>Values that appear in <see cref="CampaignRecipient.SequenceError"/>; arbitrary send failure codes also occur there.</summary>
public static class CampaignDripExitReasons { public const string Replied = "replied"; public const string LinkClicked = "link_clicked"; public const string OptedOut = "opted_out"; }
public sealed record CampaignSegmentSnapshot(long Revision, long EvaluatedAt, long MatchedCount);
/// <summary>Replaces the campaign weekdays and hours for a later drip step; at most four ranges.</summary>
public sealed record CampaignStepWindow(IReadOnlyList<string> Days, IReadOnlyList<CampaignSendWindowRange> Hours);
/// <summary>A phone already in the drip returns <c>Created = false</c> and never restarts.</summary>
public sealed record EnrollCampaignContactRequest(string Phone, IReadOnlyDictionary<string, JsonElement>? Variables = null);
/// <summary>Team keys select the owning project explicitly.</summary>
public sealed record EnrollPlatformCampaignContactRequest(string ProjectId, string Phone, IReadOnlyDictionary<string, JsonElement>? Variables = null);
/// <summary><c>EnrolledAt</c> is Unix milliseconds.</summary>
public sealed record CampaignEnrollment(string CampaignId, string RecipientId, string Phone, bool Created, string Status, double EnrolledAt);

public sealed partial class PlatformCampaigns
{
    /// <summary>Team cap. Team key with campaigns:read.</summary>
    public Task<ApiResponse<DataEnvelope<CampaignFrequencyCapSettings>>> GetFrequencyCapAsync(RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<CampaignFrequencyCapSettings>>(Http, HttpMethod.Get, "/platform/campaign-settings/frequency-cap", options: options);
    /// <summary>Replaces both limits with the last read revision. A stale revision throws <see cref="PolymorfaConflictException"/>; read again and reconcile. Limits require beta access. Sent once: reconcile a lost response with a fresh read.</summary>
    public Task<ApiResponse<DataEnvelope<CampaignFrequencyCapSettings>>> UpdateFrequencyCapAsync(UpdateCampaignFrequencyCapRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<CampaignFrequencyCapSettings>>(Http, HttpMethod.Put, "/platform/campaign-settings/frequency-cap", ExistingContractCodec.Capture(input), SegmentOptions.Once(options));
    /// <summary>Adds a contact to a running or paused continuous drip. Sent once: per-phone server idempotency does not make an ambiguous retry safe.</summary>
    public Task<ApiResponse<DataEnvelope<CampaignEnrollment>>> EnrollAsync(string id, EnrollPlatformCampaignContactRequest input, RequestOptions? options = null)
    {
        CampaignContractValidation.Uuid(input.ProjectId, "projectId");
        return ExistingContractCodec.Request<DataEnvelope<CampaignEnrollment>>(Http, HttpMethod.Post, "/platform/campaigns/" + E(id) + "/enrollments", ExistingContractCodec.Capture(input), SegmentOptions.Once(options));
    }
}
public sealed partial class MessagingCampaigns
{
    /// <summary>Adds a contact to a running or paused continuous drip; sent once.</summary>
    public Task<ApiResponse<SuccessEnvelope<CampaignEnrollment>>> EnrollAsync(string slug, string id, EnrollCampaignContactRequest input, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<CampaignEnrollment>>(Http, HttpMethod.Post, "/messaging/projects/" + E(slug) + "/campaigns/" + E(id) + "/enrollments", ExistingContractCodec.Capture(input), SegmentOptions.Once(options));
}
internal static class SegmentOptions
{
    internal static RequestOptions Once(RequestOptions? options) => (options ?? new()) with { MaxNetworkRetries = 0 };
}

[JsonConverter(typeof(AudienceSegmentMatchConverter))] public enum AudienceSegmentMatch { All, Any }
public sealed class AudienceSegmentMatchConverter() : CampaignStringEnumConverter<AudienceSegmentMatch>((AudienceSegmentMatch.All, "all"), (AudienceSegmentMatch.Any, "any"));
[JsonConverter(typeof(AudienceSegmentTextOperatorConverter))] public enum AudienceSegmentTextOperator { Contains, Before, After }
public sealed class AudienceSegmentTextOperatorConverter() : CampaignStringEnumConverter<AudienceSegmentTextOperator>((AudienceSegmentTextOperator.Contains, "contains"), (AudienceSegmentTextOperator.Before, "before"), (AudienceSegmentTextOperator.After, "after"));
[JsonConverter(typeof(AudienceSegmentCompareOperatorConverter))] public enum AudienceSegmentCompareOperator { GreaterThan, LessThan }
public sealed class AudienceSegmentCompareOperatorConverter() : CampaignStringEnumConverter<AudienceSegmentCompareOperator>((AudienceSegmentCompareOperator.GreaterThan, "greater_than"), (AudienceSegmentCompareOperator.LessThan, "less_than"));
/// <summary>A string, number or boolean condition value, kept as its exact JSON spelling.</summary>
public sealed record AudienceSegmentValue
{
    public JsonElement Json { get; }
    private AudienceSegmentValue(JsonElement json) => Json = json;
    public static AudienceSegmentValue Of(string value) => new(JsonSerializer.SerializeToElement(value));
    public static AudienceSegmentValue Of(long value) => new(JsonSerializer.SerializeToElement(value));
    public static AudienceSegmentValue Of(decimal value) => new(JsonSerializer.SerializeToElement(value));
    public static AudienceSegmentValue Of(double value) => double.IsFinite(value) ? new(JsonSerializer.SerializeToElement(value)) : throw new PolymorfaConfigurationException("Audience segment numbers must be finite.");
    public static AudienceSegmentValue Of(bool value) => new(JsonSerializer.SerializeToElement(value));
    internal static AudienceSegmentValue? From(JsonElement json) => json.ValueKind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False ? new(json.Clone()) : null;
    public bool Equals(AudienceSegmentValue? other) => other is not null && Json.GetRawText() == other.Json.GetRawText();
    public override int GetHashCode() => Json.GetRawText().GetHashCode(StringComparison.Ordinal);
}
/// <summary>One rule condition. Missing, null or wrong-type attributes do not match. Unmodeled server conditions decode as <see cref="AudienceSegmentUnknownCondition"/>, which requests reject before sending.</summary>
[JsonConverter(typeof(AudienceSegmentConditionConverter))] public abstract record AudienceSegmentCondition;
public sealed record AudienceSegmentTagContains(string Value) : AudienceSegmentCondition;
public sealed record AudienceSegmentTagIn(IReadOnlyList<string> Values) : AudienceSegmentCondition;
public sealed record AudienceSegmentTagExists() : AudienceSegmentCondition;
public sealed record AudienceSegmentAttributeEquals(string Name, AudienceSegmentValue Value) : AudienceSegmentCondition;
public sealed record AudienceSegmentAttributeText(string Name, AudienceSegmentTextOperator Operator, string Value) : AudienceSegmentCondition;
/// <summary>Up to 50 strings or numbers; booleans are rejected before sending.</summary>
public sealed record AudienceSegmentAttributeIn(string Name, IReadOnlyList<AudienceSegmentValue> Values) : AudienceSegmentCondition;
public sealed record AudienceSegmentAttributeCompare(string Name, AudienceSegmentCompareOperator Operator, decimal Value) : AudienceSegmentCondition;
public sealed record AudienceSegmentAttributeExists(string Name) : AudienceSegmentCondition;
public sealed record AudienceSegmentConsentEquals(bool Value) : AudienceSegmentCondition;
/// <summary><c>Outcome</c> is delivered, not_delivered, read, not_read, replied, not_replied or failed.</summary>
public sealed record AudienceSegmentCampaignOutcome(string CampaignId, string Outcome) : AudienceSegmentCondition;
public sealed record AudienceSegmentUnknownCondition(JsonElement Raw) : AudienceSegmentCondition;
internal sealed class AudienceSegmentConditionConverter : JsonConverter<AudienceSegmentCondition>
{
    public override AudienceSegmentCondition Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        var v = document.RootElement.Clone();
        if (v.ValueKind != JsonValueKind.Object) throw new JsonException("Audience segment condition must be an object.");
        var names = v.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
        bool Keys(params string[] expected) => names.SequenceEqual(expected.Order(StringComparer.Ordinal));
        string? Str(string name) => v.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
        var field = Str("field"); var op = Str("operator"); var name = Str("name");
        AudienceSegmentCondition? result = (field, op) switch
        {
            ("tag", "contains") when Keys("field", "operator", "value") && Str("value") is { } s => new AudienceSegmentTagContains(s),
            ("tag", "in") when Keys("field", "operator", "values") && v.GetProperty("values") is { ValueKind: JsonValueKind.Array } a && a.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String) => new AudienceSegmentTagIn(a.EnumerateArray().Select(x => x.GetString()!).ToArray()),
            ("tag", "exists") when Keys("field", "operator") => new AudienceSegmentTagExists(),
            ("attribute", "equals") when name is not null && Keys("field", "name", "operator", "value") && AudienceSegmentValue.From(v.GetProperty("value")) is { } value => new AudienceSegmentAttributeEquals(name, value),
            ("attribute", "contains" or "before" or "after") when name is not null && Keys("field", "name", "operator", "value") && Str("value") is { } s => new AudienceSegmentAttributeText(name, op switch { "contains" => AudienceSegmentTextOperator.Contains, "before" => AudienceSegmentTextOperator.Before, _ => AudienceSegmentTextOperator.After }, s),
            ("attribute", "in") when name is not null && Keys("field", "name", "operator", "values") && v.GetProperty("values") is { ValueKind: JsonValueKind.Array } a && a.EnumerateArray().All(x => x.ValueKind is JsonValueKind.String or JsonValueKind.Number) => new AudienceSegmentAttributeIn(name, a.EnumerateArray().Select(x => AudienceSegmentValue.From(x)!).ToArray()),
            ("attribute", "greater_than" or "less_than") when name is not null && Keys("field", "name", "operator", "value") && v.GetProperty("value") is { ValueKind: JsonValueKind.Number } n && n.TryGetDecimal(out var number) => new AudienceSegmentAttributeCompare(name, op == "greater_than" ? AudienceSegmentCompareOperator.GreaterThan : AudienceSegmentCompareOperator.LessThan, number),
            ("attribute", "exists") when name is not null && Keys("field", "name", "operator") => new AudienceSegmentAttributeExists(name),
            ("consent", "equals") when Keys("field", "operator", "value") && v.GetProperty("value").ValueKind is JsonValueKind.True or JsonValueKind.False => new AudienceSegmentConsentEquals(v.GetProperty("value").GetBoolean()),
            ("campaign", null) when Keys("campaignId", "field", "outcome") && Str("campaignId") is { } id && Str("outcome") is { } outcome => new AudienceSegmentCampaignOutcome(id, outcome),
            _ => null,
        };
        return result ?? new AudienceSegmentUnknownCondition(v);
    }
    public override void Write(Utf8JsonWriter writer, AudienceSegmentCondition value, JsonSerializerOptions options)
    {
        if (value is AudienceSegmentUnknownCondition unknown) { unknown.Raw.WriteTo(writer); return; }
        writer.WriteStartObject();
        switch (value)
        {
            case AudienceSegmentTagContains c: writer.WriteString("field", "tag"); writer.WriteString("operator", "contains"); writer.WriteString("value", c.Value); break;
            case AudienceSegmentTagIn c: writer.WriteString("field", "tag"); writer.WriteString("operator", "in"); writer.WritePropertyName("values"); JsonSerializer.Serialize(writer, c.Values, options); break;
            case AudienceSegmentTagExists: writer.WriteString("field", "tag"); writer.WriteString("operator", "exists"); break;
            case AudienceSegmentAttributeEquals c: writer.WriteString("field", "attribute"); writer.WriteString("name", c.Name); writer.WriteString("operator", "equals"); writer.WritePropertyName("value"); c.Value.Json.WriteTo(writer); break;
            case AudienceSegmentAttributeText c: writer.WriteString("field", "attribute"); writer.WriteString("name", c.Name); writer.WritePropertyName("operator"); JsonSerializer.Serialize(writer, c.Operator, options); writer.WriteString("value", c.Value); break;
            case AudienceSegmentAttributeIn c: writer.WriteString("field", "attribute"); writer.WriteString("name", c.Name); writer.WriteString("operator", "in"); writer.WriteStartArray("values"); foreach (var item in c.Values) item.Json.WriteTo(writer); writer.WriteEndArray(); break;
            case AudienceSegmentAttributeCompare c: writer.WriteString("field", "attribute"); writer.WriteString("name", c.Name); writer.WritePropertyName("operator"); JsonSerializer.Serialize(writer, c.Operator, options); writer.WriteNumber("value", c.Value); break;
            case AudienceSegmentAttributeExists c: writer.WriteString("field", "attribute"); writer.WriteString("name", c.Name); writer.WriteString("operator", "exists"); break;
            case AudienceSegmentConsentEquals c: writer.WriteString("field", "consent"); writer.WriteString("operator", "equals"); writer.WriteBoolean("value", c.Value); break;
            case AudienceSegmentCampaignOutcome c: writer.WriteString("field", "campaign"); writer.WriteString("campaignId", c.CampaignId); writer.WriteString("outcome", c.Outcome); break;
            default: throw new JsonException("Unsupported audience segment condition.");
        }
        writer.WriteEndObject();
    }
}
/// <summary>Up to 20 conditions. <c>Negate</c> inverts the group's result.</summary>
public sealed record AudienceSegmentGroup(AudienceSegmentMatch Match, IReadOnlyList<AudienceSegmentCondition> Conditions, bool? Negate = null);
/// <summary>At most 10 groups, 20 conditions per group, 40 conditions, 5 campaign conditions, 50 values per <c>in</c> and 16 KiB. The API enforces these limits.</summary>
public sealed record AudienceSegmentRules(AudienceSegmentMatch Match, IReadOnlyList<AudienceSegmentGroup> Groups);
public sealed record AudienceSegment(string Id, string Name, long Revision, AudienceSegmentRules Rules, long CreatedAt, long UpdatedAt);
/// <summary><c>Phone</c> is masked, for example <c>+49*******12</c>.</summary>
public sealed record AudienceSegmentSample(string Phone, IReadOnlyList<string> Tags);
public record AudienceSegmentPreview(long MatchedCount, long OptedOutCount, long ConsentWithheldCount, long EligibleCount, IReadOnlyList<AudienceSegmentSample> Sample, long EvaluatedAt);
public sealed record SavedAudienceSegmentPreview(long MatchedCount, long OptedOutCount, long ConsentWithheldCount, long EligibleCount, IReadOnlyList<AudienceSegmentSample> Sample, long EvaluatedAt, long Revision) : AudienceSegmentPreview(MatchedCount, OptedOutCount, ConsentWithheldCount, EligibleCount, Sample, EvaluatedAt);
public sealed record CreateAudienceSegmentRequest(string Name, AudienceSegmentRules Rules);
/// <summary>Requires the last observed revision.</summary>
public sealed record UpdateAudienceSegmentRequest(long ExpectedRevision)
{
    public string? Name { get; init; }
    public AudienceSegmentRules? Rules { get; init; }
}
public sealed record ListAudienceSegmentsParameters(int? Limit = null, string? Cursor = null);
public sealed record AudienceSegmentDeletion(bool Deleted, string Id);

/// <summary>Organization-owned saved audience segments (contracts/campaign-segments-drip.json). Team keys only: campaigns:read for reads, campaigns:manage for writes and unsaved previews. Revision conflicts and bounded evaluation timeouts return 409 state_conflict; re-read, reconcile or simplify the rules. Writes and previews are sent once.</summary>
public sealed class AudienceSegments : Resource
{
    internal AudienceSegments(HttpTransport http) : base(http) { }
    private static string Path(string id) => string.IsNullOrWhiteSpace(id) ? throw new PolymorfaConfigurationException("A segment ID is required.") : "/platform/audience-segments/" + E(id);
    private static void Validate(AudienceSegmentRules rules)
    {
        foreach (var condition in rules.Groups.SelectMany(g => g.Conditions))
            if (condition is null or AudienceSegmentUnknownCondition || condition is AudienceSegmentAttributeIn { Values: var values } && values.Any(v => v.Json.ValueKind is not (JsonValueKind.String or JsonValueKind.Number)))
                throw new PolymorfaConfigurationException("Audience segment requests need supported condition shapes and value types.");
    }
    public Task<ApiResponse<CursorEnvelope<AudienceSegment>>> ListAsync(ListAudienceSegmentsParameters? parameters = null, RequestOptions? options = null) => ExistingContractCodec.Request<CursorEnvelope<AudienceSegment>>(Http, HttpMethod.Get, "/platform/audience-segments", options: options, query: Query(parameters));
    public Task<ApiResponse<DataEnvelope<AudienceSegment>>> RetrieveAsync(string id, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<AudienceSegment>>(Http, HttpMethod.Get, Path(id), options: options);
    public Task<ApiResponse<DataEnvelope<AudienceSegment>>> CreateAsync(CreateAudienceSegmentRequest input, RequestOptions? options = null)
    {
        Validate(input.Rules);
        return ExistingContractCodec.Request<DataEnvelope<AudienceSegment>>(Http, HttpMethod.Post, "/platform/audience-segments", ExistingContractCodec.Capture(input), SegmentOptions.Once(options));
    }
    public Task<ApiResponse<DataEnvelope<AudienceSegment>>> UpdateAsync(string id, UpdateAudienceSegmentRequest input, RequestOptions? options = null)
    {
        var path = Path(id);
        if (input.Rules is { } rules) Validate(rules);
        return ExistingContractCodec.Request<DataEnvelope<AudienceSegment>>(Http, HttpMethod.Patch, path, ExistingContractCodec.Capture(input), SegmentOptions.Once(options));
    }
    /// <summary>Refused while an unlaunched draft uses the segment. Launched campaigns keep their snapshot and recipients; their segment ID becomes null.</summary>
    public Task<ApiResponse<DataEnvelope<AudienceSegmentDeletion>>> DeleteAsync(string id, long expectedRevision, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<AudienceSegmentDeletion>>(Http, HttpMethod.Delete, Path(id), options: SegmentOptions.Once(options), query: [new("expectedRevision", expectedRevision.ToString(System.Globalization.CultureInfo.InvariantCulture))]);
    /// <summary>Evaluates the saved segment once; an evaluation timeout is a 409.</summary>
    public Task<ApiResponse<DataEnvelope<SavedAudienceSegmentPreview>>> PreviewAsync(string id, RequestOptions? options = null) => ExistingContractCodec.Request<DataEnvelope<SavedAudienceSegmentPreview>>(Http, HttpMethod.Get, Path(id) + "/preview", options: SegmentOptions.Once(options));
    public Task<ApiResponse<DataEnvelope<AudienceSegmentPreview>>> PreviewRulesAsync(AudienceSegmentRules rules, RequestOptions? options = null)
    {
        Validate(rules);
        return ExistingContractCodec.Request<DataEnvelope<AudienceSegmentPreview>>(Http, HttpMethod.Post, "/platform/audience-segments/preview", ExistingContractCodec.Capture(new { rules }), SegmentOptions.Once(options));
    }
}
