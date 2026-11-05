using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

[JsonConverter(typeof(HistorySyncDeliveryConverter))]
public enum HistorySyncDelivery { Archive, Descriptor }
[JsonConverter(typeof(HistorySyncDeliveryOverrideConverter))]
public enum HistorySyncDeliveryOverride { Descriptor }
[JsonConverter(typeof(ConfigurationSourceConverter))]
public enum ConfigurationSource { Platform, Team, Project, Session }
public sealed record HistorySyncPolicy(string Mode, bool RequestFull, HistorySyncDelivery? Delivery = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record HistorySyncOverride(string? Mode = null, bool? RequestFull = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<HistorySyncDeliveryOverride?> Delivery = default);
public sealed record HmsConfiguration(bool Enabled, string? Region = null, string? Policy = null, int? RetentionDays = null, string? PolicyVersion = null, bool? LegalHold = null);
public sealed record ObservationConfiguration(string PresenceMode, string TypingMode, string LabelMode, string QuickReplyMode);
public sealed record ObservationOverride(string? PresenceMode = null, string? TypingMode = null, string? LabelMode = null, string? QuickReplyMode = null);
public sealed record SessionConfigurationOverrides(ObservationOverride? Observation = null, HistorySyncOverride? HistorySync = null, HmsConfiguration? Hms = null);
public sealed record SessionConfigurationPatch(SessionConfigurationOverrides? Set = null, IReadOnlyList<string>? Reset = null);
public sealed record EffectiveSessionConfiguration(ObservationConfiguration Observation, HistorySyncPolicy HistorySync, HmsConfiguration Hms);
public sealed record ConfigurationSources(
    [property: JsonPropertyName("historySync.mode")] string HistorySyncMode,
    [property: JsonPropertyName("historySync.requestFull")] string HistorySyncRequestFull,
    string Hms,
    [property: JsonPropertyName("observation.presenceMode")] string PresenceMode,
    [property: JsonPropertyName("observation.typingMode")] string TypingMode,
    [property: JsonPropertyName("observation.labelMode")] string LabelMode,
    [property: JsonPropertyName("observation.quickReplyMode")] string QuickReplyMode,
    [property: JsonPropertyName("historySync.delivery")] ConfigurationSource? HistorySyncDelivery = null);
public sealed record ConfigurationRevisions(long Team, long Project, long Session);
public sealed record ConfigurationApplication(long DesiredGeneration, long AppliedGeneration, string Status);
public sealed record SessionConfigurationView(EffectiveSessionConfiguration Effective, SessionConfigurationOverrides Overrides, ConfigurationSources Sources, HistorySyncPolicy RequestedHistory, ConfigurationRevisions Revisions, string? HistoryConsent = null, ConfigurationApplication? Application = null);
public sealed record UpdateSessionRequest(SessionConfigurationPatch Configuration, long Revision);

public sealed class ConfigurationResource : Resource
{
    private readonly string? projectId;
    internal ConfigurationResource(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    public async Task<ApiResponse<SessionConfigurationView>> RetrieveAsync(RequestOptions? options = null)
    {
        var response = await ExistingContractCodec.Request<DataEnvelope<SessionConfigurationView>>(Http, HttpMethod.Get, "/platform/session-configuration", options: options, query: Query(projectId is null ? null : new { projectId }));
        return new(response.Data.Data, response.Metadata);
    }
    public async Task<ApiResponse<SessionConfigurationView>> UpdateAsync(UpdateConfigurationRequest body, RequestOptions? options = null)
    {
        var captured = ConfigurationContract.Capture(new { body.Configuration, body.Revision, projectId }, body.Configuration, out var intent);
        var response = await ExistingContractCodec.Request<DataEnvelope<SessionConfigurationView>>(Http, HttpMethod.Put, "/platform/session-configuration", captured, ExistingContractCodec.Options(options, intent));
        return new(response.Data.Data, response.Metadata);
    }
}
public sealed record UpdateConfigurationRequest(SessionConfigurationPatch Configuration, long Revision);

internal sealed class HistorySyncDeliveryConverter() : JsonStringEnumConverter<HistorySyncDelivery>(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);
internal sealed class HistorySyncDeliveryOverrideConverter() : JsonStringEnumConverter<HistorySyncDeliveryOverride>(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);
internal sealed class ConfigurationSourceConverter() : JsonStringEnumConverter<ConfigurationSource>(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);
