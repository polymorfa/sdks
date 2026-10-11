using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record HistorySyncPolicy(string Mode, bool RequestFull);
public sealed record HistorySyncOverride(string? Mode = null, bool? RequestFull = null);
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
    [property: JsonPropertyName("observation.quickReplyMode")] string QuickReplyMode);
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
        var response = await Get<DataEnvelope<SessionConfigurationView>>("/platform/session-configuration", options, projectId is null ? null : new { projectId });
        return new(response.Data.Data, response.Metadata);
    }
    public async Task<ApiResponse<SessionConfigurationView>> UpdateAsync(UpdateConfigurationRequest body, RequestOptions? options = null)
    {
        var response = await Put<DataEnvelope<SessionConfigurationView>>("/platform/session-configuration", new { body.Configuration, body.Revision, projectId }, options);
        return new(response.Data.Data, response.Metadata);
    }
}
public sealed record UpdateConfigurationRequest(SessionConfigurationPatch Configuration, long Revision);
