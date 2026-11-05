using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

[AttributeUsage(AttributeTargets.Property)] internal sealed class CampaignOptionalAttribute : Attribute;
[AttributeUsage(AttributeTargets.Property)]
internal sealed class CampaignLiteralAttribute(params string[] values) : Attribute
{
    internal string[] Values
    {
        get;
    } = values;
}

public abstract class CampaignStringEnumConverter<T>(params (T Value, string Wire)[] entries) : JsonConverter<T> where T : struct, Enum
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String) throw new JsonException("Unsupported enum value.");
        var text = reader.GetString();
        foreach (var entry in entries) if (entry.Wire == text) return entry.Value;
        throw new JsonException("Unsupported enum value.");
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        var found = entries.Where(e => EqualityComparer<T>.Default.Equals(e.Value, value)).ToArray();
        if (found.Length != 1) throw new JsonException("Unsupported enum value.");
        writer.WriteStringValue(found[0].Wire);
    }
}
[JsonConverter(typeof(SignalCustodyModeConverter))] public enum SignalCustodyMode { Standard, ZeroKnowledge }
public sealed class SignalCustodyModeConverter() : CampaignStringEnumConverter<SignalCustodyMode>((SignalCustodyMode.Standard, "standard"), (SignalCustodyMode.ZeroKnowledge, "zero_knowledge"));
[JsonConverter(typeof(AudienceProfileSourceConverter))] public enum AudienceProfileSource { Api, Csv, Form }
public sealed class AudienceProfileSourceConverter() : CampaignStringEnumConverter<AudienceProfileSource>((AudienceProfileSource.Api, "api"), (AudienceProfileSource.Csv, "csv"), (AudienceProfileSource.Form, "form"));
[JsonConverter(typeof(StopConfirmationLocaleConverter))] public enum StopConfirmationLocale { En, PtBr, Es }
public sealed class StopConfirmationLocaleConverter() : CampaignStringEnumConverter<StopConfirmationLocale>((StopConfirmationLocale.En, "en"), (StopConfirmationLocale.PtBr, "pt-BR"), (StopConfirmationLocale.Es, "es"));
[JsonConverter(typeof(CampaignRetargetOutcomeConverter))] public enum CampaignRetargetOutcome { Delivered, NotDelivered, Read, NotRead, Replied, NotReplied, Failed }
public sealed class CampaignRetargetOutcomeConverter() : CampaignStringEnumConverter<CampaignRetargetOutcome>((CampaignRetargetOutcome.Delivered, "delivered"), (CampaignRetargetOutcome.NotDelivered, "not_delivered"), (CampaignRetargetOutcome.Read, "read"), (CampaignRetargetOutcome.NotRead, "not_read"), (CampaignRetargetOutcome.Replied, "replied"), (CampaignRetargetOutcome.NotReplied, "not_replied"), (CampaignRetargetOutcome.Failed, "failed"));
[JsonConverter(typeof(CampaignRecipientFailureReasonConverter))] public enum CampaignRecipientFailureReason { OptedOut, ColdHeld, CampaignCancelled, InvalidRecipient, SessionNotConnected, AckTimeout, BlockedBySafety, SendFailed, MissingVariable, FrequencyCap, Other }
public sealed class CampaignRecipientFailureReasonConverter() : CampaignStringEnumConverter<CampaignRecipientFailureReason>((CampaignRecipientFailureReason.OptedOut, "opted_out"), (CampaignRecipientFailureReason.ColdHeld, "cold_held"), (CampaignRecipientFailureReason.CampaignCancelled, "campaign_cancelled"), (CampaignRecipientFailureReason.InvalidRecipient, "invalid_recipient"), (CampaignRecipientFailureReason.SessionNotConnected, "session_not_connected"), (CampaignRecipientFailureReason.AckTimeout, "ack_timeout"), (CampaignRecipientFailureReason.BlockedBySafety, "blocked_by_safety"), (CampaignRecipientFailureReason.SendFailed, "send_failed"), (CampaignRecipientFailureReason.MissingVariable, "missing_variable"), (CampaignRecipientFailureReason.FrequencyCap, "frequency_cap"), (CampaignRecipientFailureReason.Other, "other"));
[JsonConverter(typeof(CampaignExportStatusConverter))] public enum CampaignExportStatus { Queued, Sending, Sent, Delivered, Read, Failed, Skipped }
public sealed class CampaignExportStatusConverter() : CampaignStringEnumConverter<CampaignExportStatus>((CampaignExportStatus.Queued, "queued"), (CampaignExportStatus.Sending, "sending"), (CampaignExportStatus.Sent, "sent"), (CampaignExportStatus.Delivered, "delivered"), (CampaignExportStatus.Read, "read"), (CampaignExportStatus.Failed, "failed"), (CampaignExportStatus.Skipped, "skipped"));

[JsonConverter(typeof(CampaignVariableValueConverter))]
public readonly struct CampaignVariableValue
{
    internal JsonElement Value
    {
        get;
    }
    public JsonValueKind Kind => Value.ValueKind;
    public string? StringValue => Kind == JsonValueKind.String ? Value.GetString() : null;
    public double? NumberValue => Kind == JsonValueKind.Number ? Value.GetDouble() : null;
    public bool? BooleanValue => Kind is JsonValueKind.True or JsonValueKind.False ? Value.GetBoolean() : null;
    private CampaignVariableValue(JsonElement value) => Value = value;
    public static implicit operator CampaignVariableValue(string value) => value is null ? throw new PolymorfaConfigurationException("A variable string cannot be null.") : new(JsonSerializer.SerializeToElement(CampaignContractValidation.ScalarText(value)));
    public static implicit operator CampaignVariableValue(double value) => double.IsFinite(value) ? new(JsonSerializer.SerializeToElement(value)) : throw new PolymorfaConfigurationException("Variables must be finite.");
    public static implicit operator CampaignVariableValue(bool value) => new(JsonSerializer.SerializeToElement(value));
    internal static CampaignVariableValue From(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String)
        {
            _ = value.GetString();
            return new(value.Clone());
        }
        if (value.ValueKind is JsonValueKind.True or JsonValueKind.False || value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number)) return new(value.Clone());
        throw new JsonException("Invalid variable scalar.");
    }

}
public sealed class CampaignVariableValueConverter : JsonConverter<CampaignVariableValue>
{
    public override CampaignVariableValue Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return CampaignVariableValue.From(doc.RootElement);
    }
    public override void Write(Utf8JsonWriter writer, CampaignVariableValue value, JsonSerializerOptions options)
    {
        if (value.Value.ValueKind == JsonValueKind.Undefined) throw new JsonException("Uninitialized variable.");
        value.Value.WriteTo(writer);
    }
}
[JsonConverter(typeof(AudienceProfileAttributeValueConverter))]
public readonly struct AudienceProfileAttributeValue
{
    internal JsonElement Value
    {
        get;
    }
    public JsonValueKind Kind => Value.ValueKind;
    public string? StringValue => Kind == JsonValueKind.String ? Value.GetString() : null;
    public double? NumberValue => Kind == JsonValueKind.Number ? Value.GetDouble() : null;
    public bool? BooleanValue => Kind is JsonValueKind.True or JsonValueKind.False ? Value.GetBoolean() : null;
    private AudienceProfileAttributeValue(JsonElement value) => Value = value;
    public static AudienceProfileAttributeValue Null => new(JsonSerializer.SerializeToElement<object?>(null));
    public static implicit operator AudienceProfileAttributeValue(string value) => value is null ? throw new PolymorfaConfigurationException("Use explicit Null for attributes.") : new(JsonSerializer.SerializeToElement(CampaignContractValidation.ScalarText(value)));
    public static implicit operator AudienceProfileAttributeValue(double value) => double.IsFinite(value) ? new(JsonSerializer.SerializeToElement(value)) : throw new PolymorfaConfigurationException("Attributes must be finite.");
    public static implicit operator AudienceProfileAttributeValue(bool value) => new(JsonSerializer.SerializeToElement(value));
    internal static AudienceProfileAttributeValue From(JsonElement value) => value.ValueKind == JsonValueKind.Null ? Null : new(CampaignVariableValue.From(value).Value);
}
public sealed class AudienceProfileAttributeValueConverter : JsonConverter<AudienceProfileAttributeValue>
{
    public override AudienceProfileAttributeValue Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return AudienceProfileAttributeValue.From(doc.RootElement);
    }
    public override void Write(Utf8JsonWriter writer, AudienceProfileAttributeValue value, JsonSerializerOptions options)
    {
        if (value.Value.ValueKind == JsonValueKind.Undefined) throw new JsonException("Uninitialized attribute.");
        value.Value.WriteTo(writer);
    }
}

public sealed record AudienceProfileProvenance([property: JsonRequired] AudienceProfileSource Source, [property: JsonRequired] string Reference);
public sealed record AudienceProfileConsentInput([property: JsonRequired, CampaignLiteral("campaigns")] string Purpose, [property: JsonRequired] bool Allowed, [property: JsonRequired] AudienceProfileSource Source, [property: JsonRequired] string Reference, [property: JsonRequired] long AssertedAt);
public sealed record AudienceProfile([property: JsonRequired] string Id, [property: JsonRequired] string Phone, [property: JsonRequired] long Revision, [property: JsonRequired] IReadOnlyList<string> Tags, [property: JsonRequired] IReadOnlyDictionary<string, AudienceProfileAttributeValue> Attributes, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] AudienceProfileProvenance? Provenance, [property: JsonRequired] long CreatedAt, [property: JsonRequired] long UpdatedAt);
public sealed record PutAudienceProfileRequest(IReadOnlyList<string> Tags, IReadOnlyDictionary<string, AudienceProfileAttributeValue> Attributes, long? ExpectedRevision = null, AudienceProfileProvenance? Provenance = null, AudienceProfileConsentInput? Consent = null);
public sealed record AudienceConsentAssertion([property: JsonRequired] string Id, [property: JsonRequired] long ProfileRevision, [property: JsonRequired] long CreatedAt, [property: JsonRequired, CampaignLiteral("campaigns")] string Purpose, [property: JsonRequired] bool Allowed, [property: JsonRequired] AudienceProfileSource Source, [property: JsonRequired] string Reference, [property: JsonRequired] long AssertedAt);
public sealed record AudienceProfilePageInfo([property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? NextCursor, [property: JsonRequired] bool HasMore);
public sealed record AudienceProfilePage<T>([property: JsonRequired] IReadOnlyList<T> Data, [property: JsonRequired] AudienceProfilePageInfo Page);
public sealed record ListAudienceProfilesParameters(string? Cursor = null, int? Limit = null);
public sealed record DeleteAudienceProfileResult([property: JsonRequired] bool Deleted, [property: JsonRequired] string Phone, [property: JsonRequired] long Revision);
public sealed record AudienceProfileImportMapping(string Phone, string Tags, string Attributes, string? ExpectedRevision = null, string? ProvenanceReference = null, string? ConsentAllowed = null, string? ConsentAssertedAt = null, string? ConsentReference = null);
public sealed record CreateAudienceProfileImportRequest(string ReplayKey, string CsvBase64, AudienceProfileImportMapping? Mapping = null);
public sealed record AudienceProfileInvalidSample([property: JsonRequired] long Row, [property: JsonRequired] string Reason);
public sealed record AudienceProfileConflictSample([property: JsonRequired] long Row, [property: JsonRequired, CampaignLiteral("quota", "revision_conflict")] string Reason);
public sealed record AudienceProfileImportJob([property: JsonRequired] string Id, [property: JsonRequired, CampaignLiteral("queued", "completed", "cancelled")] string State, [property: JsonRequired] long TotalValid, [property: JsonRequired] long InvalidCount, [property: JsonRequired] IReadOnlyList<AudienceProfileInvalidSample> InvalidSamples, [property: JsonRequired] IReadOnlyList<AudienceProfileConflictSample> ConflictSamples, [property: JsonRequired] long ProcessedValid, [property: JsonRequired] long CreatedCount, [property: JsonRequired] long UpdatedCount, [property: JsonRequired] long ConflictCount, [property: JsonRequired] long CreatedAt, [property: JsonRequired] long UpdatedAt, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? CompletedAt);

[JsonConverter(typeof(CampaignReplyFlowSendConverter))]
public abstract record CampaignReplyFlowSend
{
    private protected CampaignReplyFlowSend() { }
    public abstract string Kind
    {
        get;
    }
}
public sealed record CampaignReplyText([property: JsonRequired] string Text) : CampaignReplyFlowSend
{
    [CampaignLiteral("text")] public override string Kind => "text";
}
public sealed record CampaignReplyButton([property: JsonRequired] string Id, [property: JsonRequired] string Text);
public sealed record CampaignReplyButtons([property: JsonRequired] string Body, [property: JsonRequired] IReadOnlyList<CampaignReplyButton> Buttons, [property: CampaignOptional] string? Footer = null) : CampaignReplyFlowSend
{
    [CampaignLiteral("buttons")] public override string Kind => "buttons";
}
public sealed record CampaignReplyRow([property: JsonRequired] string Id, [property: JsonRequired] string Title, [property: CampaignOptional] string? Description = null);
public sealed record CampaignReplyList([property: JsonRequired] string Body, [property: JsonRequired] string ButtonText, [property: JsonRequired] IReadOnlyList<CampaignReplyRow> Rows, [property: CampaignOptional] string? Footer = null) : CampaignReplyFlowSend
{
    [CampaignLiteral("list")] public override string Kind => "list";
}
public sealed record CampaignReplyForm([property: JsonRequired] string FlowId, [property: JsonRequired] string Body, [property: JsonRequired] string ButtonText, [property: JsonRequired] string Screen, [property: CampaignOptional] string? Footer = null) : CampaignReplyFlowSend
{
    [CampaignLiteral("flow_form")] public override string Kind => "flow_form";
}
[JsonConverter(typeof(CampaignReplyFlowMatchConverter))]
public abstract record CampaignReplyFlowMatch
{
    private protected CampaignReplyFlowMatch() { }
    public abstract string Kind
    {
        get;
    }
}
[JsonConverter(typeof(CampaignReplyChoiceKindConverter))] public enum CampaignReplyChoiceKind { Button, List }
public sealed class CampaignReplyChoiceKindConverter() : CampaignStringEnumConverter<CampaignReplyChoiceKind>((CampaignReplyChoiceKind.Button, "button"), (CampaignReplyChoiceKind.List, "list"));
public sealed record CampaignReplyChoice([property: JsonRequired] CampaignReplyChoiceKind ReplyKind, [property: JsonRequired] string Id) : CampaignReplyFlowMatch
{
    [CampaignLiteral("choice")] public override string Kind => "choice";
}
public sealed record CampaignReplyKeyword([property: JsonRequired] string Value) : CampaignReplyFlowMatch
{
    [CampaignLiteral("keyword")] public override string Kind => "keyword";
}
public sealed record CampaignReplySubmission : CampaignReplyFlowMatch
{
    [CampaignLiteral("flow_submission")] public override string Kind => "flow_submission";
}
public sealed record CampaignReplyFlowEdge([property: JsonRequired] CampaignReplyFlowMatch Match, [property: JsonRequired] string To);
public sealed record CampaignReplyFlowNode([property: JsonRequired] string Id, [property: JsonRequired] IReadOnlyList<CampaignReplyFlowEdge> Edges, [property: CampaignOptional] CampaignReplyFlowSend? Send = null);
public sealed record CampaignReplyFlowDefinition([property: JsonRequired] string EntryNodeId, [property: JsonRequired] IReadOnlyList<CampaignReplyFlowNode> Nodes);
public sealed record CreateCampaignReplyFlowRequest(string Name, CampaignReplyFlowDefinition Definition, string? FlowKey = null, long? Revision = null);
public sealed record CreatePlatformCampaignReplyFlowRequest(string ProjectId, string Name, CampaignReplyFlowDefinition Definition, string? FlowKey = null, long? Revision = null);
public sealed record CampaignReplyFlow([property: JsonRequired] string Id, [property: JsonRequired] string FlowKey, [property: JsonRequired] long Revision, [property: JsonRequired] string Name, [property: JsonRequired] CampaignReplyFlowDefinition Definition, [property: JsonRequired] long CreatedAt);
public sealed record CampaignProjectParameters(string ProjectId);
public sealed record CampaignTestSendRequest(string SessionId, string To, string? SampleRecipientId = null, IReadOnlyDictionary<string, CampaignVariableValue>? Variables = null);
public sealed record PlatformCampaignTestSendRequest(string ProjectId, string SessionId, string To, string? SampleRecipientId = null, IReadOnlyDictionary<string, CampaignVariableValue>? Variables = null);
public sealed record CampaignTestSender([property: JsonRequired] string SessionId, [property: JsonRequired] string Phone);
public sealed record CampaignTestSend([property: JsonRequired] string Id, [property: JsonRequired] string CampaignId, [property: JsonRequired, CampaignLiteral("sent")] string Status, [property: JsonRequired] CampaignTestSender From, [property: JsonRequired] string To, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? MessageId, [property: JsonRequired] IReadOnlyDictionary<string, string> Variables, [property: JsonRequired] long CreatedAt);
public sealed record SetCampaignReplyFlowRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? ReplyFlowId);
public sealed record SetPlatformCampaignReplyFlowRequest(string ProjectId, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? ReplyFlowId);
public sealed record CampaignReplyFlowAssignment([property: JsonRequired] string CampaignId, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? ReplyFlowId);
public sealed record CampaignTrackedLinkReport([property: JsonRequired] string Key, [property: JsonRequired] string Url, [property: JsonRequired] long UniqueOpens, [property: JsonRequired] long TotalOpens);
public sealed record CampaignRecipientExportParameters(CampaignExportStatus? Status = null, CampaignRecipientFailureReason? Reason = null, string? Cursor = null, int? Limit = null);
public sealed record PlatformCampaignRecipientExportParameters(string ProjectId, CampaignExportStatus? Status = null, CampaignRecipientFailureReason? Reason = null, string? Cursor = null, int? Limit = null);
public sealed record CampaignRecipientExportPage(string Csv, string? NextCursor, string? Filename);
public sealed record CampaignApprovalRequester([property: JsonRequired] string Type, [property: JsonRequired] string Id);
public sealed record CampaignLaunchApproval([property: JsonRequired] string Id, [property: JsonRequired] string CampaignId, [property: JsonRequired, CampaignLiteral("launch", "resume", "reschedule")] string Action, [property: JsonRequired, CampaignLiteral("pending", "approved", "rejected", "superseded", "expired")] string Status, [property: JsonRequired] IReadOnlyList<string> Reasons, [property: JsonRequired] long RecipientCount, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ScheduledAt, [property: JsonRequired] CampaignApprovalRequester RequestedBy, [property: JsonRequired] long RequestedAt, [property: JsonRequired] long ExpiresAt, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? DecidedBy, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? DecidedAt, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? OperationId);
public sealed record CampaignLaunchApprovalSettings([property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? RecipientThreshold);
public sealed record CampaignSettings([property: JsonRequired] CampaignLaunchApprovalSettings LaunchApproval);
public sealed record CreateAudienceFromCampaignRequest(string Name, string CampaignId, CampaignRetargetOutcome Outcome, string? ProjectId = null);
public sealed record AudienceFromCampaignResult([property: JsonRequired] string Id, [property: JsonRequired] string Name, [property: JsonRequired, CampaignLiteral("campaign")] string Source, [property: JsonRequired] long RecipientCount, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? FileId, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] IReadOnlyList<string>? Columns, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] IReadOnlyDictionary<string, string>? SampleRow, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] IReadOnlyDictionary<string, JsonElement>? Mapping, [property: JsonRequired] long CreatedAt, [property: JsonRequired] long UpdatedAt, [property: JsonRequired] string SourceCampaignId, [property: JsonRequired] CampaignRetargetOutcome Outcome, [property: JsonRequired] long MatchedCount, [property: JsonRequired] long OptedOutCount);
public sealed record UpdateStopConfirmationSettingsInput(string TeamId, long Revision, bool Enabled, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] StopConfirmationLocale? Locale);
public sealed record StopConfirmationSettings([property: JsonRequired] string TeamId, [property: JsonRequired] bool Enabled, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] StopConfirmationLocale? Locale, [property: JsonRequired] long Revision, [property: JsonRequired] int TextRevision, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Acknowledgement, [property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? UpdatedAt);
public sealed record StopConfirmationCounts([property: JsonRequired] long Queued, [property: JsonRequired] long Admitted, [property: JsonRequired] long Completed, [property: JsonRequired] long Failed, [property: JsonRequired] long Unknown);
public sealed record StopConfirmationSummary([property: JsonRequired] bool Enabled, [property: JsonRequired] StopConfirmationCounts Counts);
public sealed record SignalCustodyDefault([property: JsonRequired, JsonIgnore(Condition = JsonIgnoreCondition.Never)] SignalCustodyMode? SignalModeDefault, [property: JsonRequired] SignalCustodyMode EffectiveSignalMode, [property: JsonRequired] long Revision);
public sealed record ProjectSignalCustodyUpdate(long ExpectedRevision, SignalCustodyMode SignalModeDefault);
public sealed record CustomerSignalCustodyUpdate(long ExpectedRevision, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] SignalCustodyMode? SignalModeDefault);
