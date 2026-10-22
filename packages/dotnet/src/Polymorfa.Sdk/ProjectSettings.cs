using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record UpdateProjectSafeModeRequest(string? Presence = null, string? Typing = null, string? Reads = null, string? Pacing = null, int? OnlineStart = null, int? OnlineEnd = null);
public sealed record ProjectSafeMode(string ProjectId, SafeModeSettings Ceiling, bool Entitled, string? EntitlementReason);
public sealed record WarmupCurvePoint(int Day, int Allowance);
public sealed record WarmupPlanSettings(bool Enabled, int WarmupDays, int DailyStart);
public sealed record ProjectWarmupPlan(string ProjectId, WarmupPlanSettings Plan, int Ceiling, IReadOnlyList<WarmupCurvePoint> Curve, bool Entitled, string? EntitlementReason);
public sealed record UpdateProjectWarmupPlanRequest(bool? Enabled = null, int? WarmupDays = null, int? DailyStart = null);
public sealed record ProjectInsuranceEvidence(string ProjectId, bool Enabled, bool BanInsuranceIncluded);
public sealed record UpdateProjectInsuranceEvidenceRequest(bool Enabled);
public sealed record ProjectHealthPolicyIntegrations(bool EmailConfigured, bool WebhookConfigured);
public sealed record ProjectHealthPolicy(string ProjectId, long Version, bool Enabled, double Threshold, string SessionAction, decimal? SlowDownMps, bool EmailNotification, bool WebhookNotification, ProjectHealthPolicyIntegrations Integrations);
public sealed record UpdateProjectHealthPolicyRequest(long Version, bool Enabled, double Threshold, string SessionAction, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? SlowDownMps, bool EmailNotification, bool WebhookNotification);
public sealed record HybridMergeCandidateNumber(string Id, string Name, string Transport, string Status, bool CanBeAbsorbed);
public sealed record HybridMergeCandidate(IReadOnlyList<HybridMergeCandidateNumber> Numbers, bool Eligible, string? IneligibleReason = null);
public sealed partial class Projects
{
    public Task<ApiResponse<DataEnvelope<ProjectSafeMode>>> GetSafeModeAsync(string projectId, RequestOptions? options = null) => new ProjectSettings(http, projectId).GetSafeModeAsync(options);
    public Task<ApiResponse<DataEnvelope<ProjectSafeMode>>> UpdateSafeModeAsync(string projectId, UpdateProjectSafeModeRequest body, RequestOptions? options = null) => new ProjectSettings(http, projectId).UpdateSafeModeAsync(body, options);
    public Task<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> GetWarmupPlanAsync(string projectId, RequestOptions? options = null) => new ProjectSettings(http, projectId).GetWarmupPlanAsync(options);
    public Task<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> UpdateWarmupPlanAsync(string projectId, UpdateProjectWarmupPlanRequest body, RequestOptions? options = null) => new ProjectSettings(http, projectId).UpdateWarmupPlanAsync(body, options);
    public Task<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> GetInsuranceEvidenceAsync(string projectId, RequestOptions? options = null) => new ProjectSettings(http, projectId).GetInsuranceEvidenceAsync(options);
    public Task<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> UpdateInsuranceEvidenceAsync(string projectId, UpdateProjectInsuranceEvidenceRequest body, RequestOptions? options = null) => new ProjectSettings(http, projectId).UpdateInsuranceEvidenceAsync(body, options);
    public Task<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> GetHealthPolicyAsync(string projectId, RequestOptions? options = null) => new ProjectSettings(http, projectId).GetHealthPolicyAsync(options);
    public Task<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> UpdateHealthPolicyAsync(string projectId, UpdateProjectHealthPolicyRequest body, RequestOptions? options = null) => new ProjectSettings(http, projectId).UpdateHealthPolicyAsync(body, options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<HybridMergeCandidate>>>> ListHybridMergeCandidatesAsync(string projectId, RequestOptions? options = null) => http.RequestAsync<DataEnvelope<IReadOnlyList<HybridMergeCandidate>>>(HttpMethod.Get, $"/platform/projects/{Uri.EscapeDataString(projectId)}/hybrid-merge-candidates", null, options);
}
public sealed class ProjectSettings : Resource
{
    private readonly string prefix;
    internal ProjectSettings(HttpTransport http, string projectId) : base(http) => prefix = "/platform/projects/" + E(projectId);
    public Task<ApiResponse<DataEnvelope<ProjectSafeMode>>> GetSafeModeAsync(RequestOptions? options = null) => Get<DataEnvelope<ProjectSafeMode>>(prefix + "/safe-mode", options);
    public Task<ApiResponse<DataEnvelope<ProjectSafeMode>>> UpdateSafeModeAsync(UpdateProjectSafeModeRequest body, RequestOptions? options = null) => Put<DataEnvelope<ProjectSafeMode>>(prefix + "/safe-mode", body, options);
    public Task<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> GetWarmupPlanAsync(RequestOptions? options = null) => Get<DataEnvelope<ProjectWarmupPlan>>(prefix + "/warmup-plan", options);
    public Task<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> UpdateWarmupPlanAsync(UpdateProjectWarmupPlanRequest body, RequestOptions? options = null) => Put<DataEnvelope<ProjectWarmupPlan>>(prefix + "/warmup-plan", body, options);
    public Task<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> GetInsuranceEvidenceAsync(RequestOptions? options = null) => Get<DataEnvelope<ProjectInsuranceEvidence>>(prefix + "/insurance-evidence", options);
    public Task<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> UpdateInsuranceEvidenceAsync(UpdateProjectInsuranceEvidenceRequest body, RequestOptions? options = null) => Put<DataEnvelope<ProjectInsuranceEvidence>>(prefix + "/insurance-evidence", body, options);
    public Task<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> GetHealthPolicyAsync(RequestOptions? options = null) => Get<DataEnvelope<ProjectHealthPolicy>>(prefix + "/health-policy", options);
    public Task<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> UpdateHealthPolicyAsync(UpdateProjectHealthPolicyRequest body, RequestOptions? options = null) => Put<DataEnvelope<ProjectHealthPolicy>>(prefix + "/health-policy", body, options);
}
public sealed class MessagingBanSafe : Resource
{
    internal MessagingBanSafe(HttpTransport http) : base(http) { }
    private static string Path(string projectId, string setting) => $"/messaging/projects/{E(projectId)}/{setting}";
    private Task<ApiResponse<SuccessEnvelope<T>>> Read<T>(string path, RequestOptions? options) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<T>>(path, options); }
    private Task<ApiResponse<SuccessEnvelope<T>>> Write<T>(string path, object body, RequestOptions? options) { Http.Credential.RequireServer(); return Put<SuccessEnvelope<T>>(path, body, options); }
    public Task<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> GetProjectSafeModeAsync(string projectId, RequestOptions? options = null) => Read<ProjectSafeMode>(Path(projectId, "safe-mode"), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> UpdateProjectSafeModeAsync(string projectId, UpdateProjectSafeModeRequest body, RequestOptions? options = null) => Write<ProjectSafeMode>(Path(projectId, "safe-mode"), body, options);
    public Task<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> GetProjectWarmupPlanAsync(string projectId, RequestOptions? options = null) => Read<ProjectWarmupPlan>(Path(projectId, "warmup-plan"), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> UpdateProjectWarmupPlanAsync(string projectId, UpdateProjectWarmupPlanRequest body, RequestOptions? options = null) => Write<ProjectWarmupPlan>(Path(projectId, "warmup-plan"), body, options);
    public Task<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> GetProjectInsuranceEvidenceAsync(string projectId, RequestOptions? options = null) => Read<ProjectInsuranceEvidence>(Path(projectId, "insurance-evidence"), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> UpdateProjectInsuranceEvidenceAsync(string projectId, UpdateProjectInsuranceEvidenceRequest body, RequestOptions? options = null) => Write<ProjectInsuranceEvidence>(Path(projectId, "insurance-evidence"), body, options);
    public Task<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> GetProjectHealthPolicyAsync(string projectId, RequestOptions? options = null) => Read<ProjectHealthPolicy>(Path(projectId, "health-policy"), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> UpdateProjectHealthPolicyAsync(string projectId, UpdateProjectHealthPolicyRequest body, RequestOptions? options = null) => Write<ProjectHealthPolicy>(Path(projectId, "health-policy"), body, options);
    public Task<ApiResponse<SuccessEnvelope<SessionSafeMode>>> GetSessionSafeModeAsync(string session, RequestOptions? options = null) => Read<SessionSafeMode>($"/messaging/{E(session)}/safe-mode", options);
    public Task<ApiResponse<SuccessEnvelope<SessionSafeMode>>> UpdateSessionSafeModeAsync(string session, UpdateSessionSafeModeRequest body, RequestOptions? options = null) => Write<SessionSafeMode>($"/messaging/{E(session)}/safe-mode", body, options);
}
