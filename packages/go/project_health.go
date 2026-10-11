package polymorfa

import "context"

type UpdateProjectSafeModeRequest struct {
	Presence    string `json:"presence,omitempty"`
	Typing      string `json:"typing,omitempty"`
	Reads       string `json:"reads,omitempty"`
	Pacing      string `json:"pacing,omitempty"`
	OnlineStart *int   `json:"onlineStart,omitempty"`
	OnlineEnd   *int   `json:"onlineEnd,omitempty"`
}
type ProjectSafeMode struct {
	ProjectID         string           `json:"projectId"`
	Ceiling           SafeModeSettings `json:"ceiling"`
	Entitled          bool             `json:"entitled"`
	EntitlementReason *string          `json:"entitlementReason"`
}
type WarmupPlanSettings struct {
	Enabled    bool `json:"enabled"`
	WarmupDays int  `json:"warmupDays"`
	DailyStart int  `json:"dailyStart"`
}
type WarmupCurvePoint struct {
	Day       int `json:"day"`
	Allowance int `json:"allowance"`
}
type ProjectWarmupPlan struct {
	ProjectID         string             `json:"projectId"`
	Plan              WarmupPlanSettings `json:"plan"`
	Ceiling           int                `json:"ceiling"`
	Curve             []WarmupCurvePoint `json:"curve"`
	Entitled          bool               `json:"entitled"`
	EntitlementReason *string            `json:"entitlementReason"`
}
type UpdateProjectWarmupPlanRequest struct {
	Enabled    *bool `json:"enabled,omitempty"`
	WarmupDays *int  `json:"warmupDays,omitempty"`
	DailyStart *int  `json:"dailyStart,omitempty"`
}
type ProjectInsuranceEvidence struct {
	ProjectID            string `json:"projectId"`
	Enabled              bool   `json:"enabled"`
	BanInsuranceIncluded bool   `json:"banInsuranceIncluded"`
}
type UpdateProjectInsuranceEvidenceRequest struct {
	Enabled bool `json:"enabled"`
}
type ProjectHealthPolicyIntegrations struct {
	EmailConfigured   bool `json:"emailConfigured"`
	WebhookConfigured bool `json:"webhookConfigured"`
}
type ProjectHealthPolicy struct {
	ProjectID           string                          `json:"projectId"`
	Version             int64                           `json:"version"`
	Enabled             bool                            `json:"enabled"`
	Threshold           float64                         `json:"threshold"`
	SessionAction       string                          `json:"sessionAction"`
	SlowDownMPS         *float64                        `json:"slowDownMps"`
	EmailNotification   bool                            `json:"emailNotification"`
	WebhookNotification bool                            `json:"webhookNotification"`
	Integrations        ProjectHealthPolicyIntegrations `json:"integrations"`
}
type UpdateProjectHealthPolicyRequest struct {
	Version             int64    `json:"version"`
	Enabled             bool     `json:"enabled"`
	Threshold           float64  `json:"threshold"`
	SessionAction       string   `json:"sessionAction"`
	SlowDownMPS         *float64 `json:"slowDownMps"`
	EmailNotification   bool     `json:"emailNotification"`
	WebhookNotification bool     `json:"webhookNotification"`
}
type HybridMergeCandidateNumber struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Transport     string `json:"transport"`
	Status        string `json:"status"`
	CanBeAbsorbed bool   `json:"canBeAbsorbed"`
}
type HybridMergeCandidate struct {
	Numbers          [2]HybridMergeCandidateNumber `json:"numbers"`
	Eligible         bool                          `json:"eligible"`
	IneligibleReason string                        `json:"ineligibleReason,omitempty"`
}

func projectPath(id string) string { return "/platform/projects/" + escaped(id) }
func (r *Projects) GetSafeMode(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectSafeMode]], error) {
	return request[Envelope[ProjectSafeMode]](ctx, r.t, "GET", projectPath(id)+"/safe-mode", nil, nil, options(o))
}
func (r *Projects) UpdateSafeMode(ctx context.Context, id string, b UpdateProjectSafeModeRequest, o ...RequestOptions) (Response[Envelope[ProjectSafeMode]], error) {
	return request[Envelope[ProjectSafeMode]](ctx, r.t, "PUT", projectPath(id)+"/safe-mode", nil, b, options(o))
}
func (r *Projects) GetWarmupPlan(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectWarmupPlan]], error) {
	return request[Envelope[ProjectWarmupPlan]](ctx, r.t, "GET", projectPath(id)+"/warmup-plan", nil, nil, options(o))
}
func (r *Projects) UpdateWarmupPlan(ctx context.Context, id string, b UpdateProjectWarmupPlanRequest, o ...RequestOptions) (Response[Envelope[ProjectWarmupPlan]], error) {
	return request[Envelope[ProjectWarmupPlan]](ctx, r.t, "PUT", projectPath(id)+"/warmup-plan", nil, b, options(o))
}
func (r *Projects) GetInsuranceEvidence(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectInsuranceEvidence]], error) {
	return request[Envelope[ProjectInsuranceEvidence]](ctx, r.t, "GET", projectPath(id)+"/insurance-evidence", nil, nil, options(o))
}
func (r *Projects) UpdateInsuranceEvidence(ctx context.Context, id string, b UpdateProjectInsuranceEvidenceRequest, o ...RequestOptions) (Response[Envelope[ProjectInsuranceEvidence]], error) {
	return request[Envelope[ProjectInsuranceEvidence]](ctx, r.t, "PUT", projectPath(id)+"/insurance-evidence", nil, b, options(o))
}
func (r *Projects) GetHealthPolicy(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectHealthPolicy]], error) {
	return request[Envelope[ProjectHealthPolicy]](ctx, r.t, "GET", projectPath(id)+"/health-policy", nil, nil, options(o))
}
func (r *Projects) UpdateHealthPolicy(ctx context.Context, id string, b UpdateProjectHealthPolicyRequest, o ...RequestOptions) (Response[Envelope[ProjectHealthPolicy]], error) {
	return request[Envelope[ProjectHealthPolicy]](ctx, r.t, "PUT", projectPath(id)+"/health-policy", nil, b, options(o))
}
func (r *Projects) ListHybridMergeCandidates(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[[]HybridMergeCandidate]], error) {
	return request[Envelope[[]HybridMergeCandidate]](ctx, r.t, "GET", projectPath(id)+"/hybrid-merge-candidates", nil, nil, options(o))
}

type MessagingBanSafe struct{ t *transport }

func (c *MessagingClient) BanSafe() *MessagingBanSafe { return &MessagingBanSafe{c.t} }
func messagingProjectPath(id string) string           { return "/messaging/projects/" + escaped(id) }
func messagingSettingRequest[T any](ctx context.Context, t *transport, method, path string, b any, o []RequestOptions) (Response[Envelope[T]], error) {
	if err := serverOnly(t); err != nil {
		return Response[Envelope[T]]{}, err
	}
	return request[Envelope[T]](ctx, t, method, path, nil, b, options(o))
}
func (r *MessagingBanSafe) GetProjectSafeMode(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectSafeMode]], error) {
	return messagingSettingRequest[ProjectSafeMode](ctx, r.t, "GET", messagingProjectPath(id)+"/safe-mode", nil, o)
}
func (r *MessagingBanSafe) UpdateProjectSafeMode(ctx context.Context, id string, b UpdateProjectSafeModeRequest, o ...RequestOptions) (Response[Envelope[ProjectSafeMode]], error) {
	return messagingSettingRequest[ProjectSafeMode](ctx, r.t, "PUT", messagingProjectPath(id)+"/safe-mode", b, o)
}
func (r *MessagingBanSafe) GetProjectWarmupPlan(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectWarmupPlan]], error) {
	return messagingSettingRequest[ProjectWarmupPlan](ctx, r.t, "GET", messagingProjectPath(id)+"/warmup-plan", nil, o)
}
func (r *MessagingBanSafe) UpdateProjectWarmupPlan(ctx context.Context, id string, b UpdateProjectWarmupPlanRequest, o ...RequestOptions) (Response[Envelope[ProjectWarmupPlan]], error) {
	return messagingSettingRequest[ProjectWarmupPlan](ctx, r.t, "PUT", messagingProjectPath(id)+"/warmup-plan", b, o)
}
func (r *MessagingBanSafe) GetProjectInsuranceEvidence(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectInsuranceEvidence]], error) {
	return messagingSettingRequest[ProjectInsuranceEvidence](ctx, r.t, "GET", messagingProjectPath(id)+"/insurance-evidence", nil, o)
}
func (r *MessagingBanSafe) UpdateProjectInsuranceEvidence(ctx context.Context, id string, b UpdateProjectInsuranceEvidenceRequest, o ...RequestOptions) (Response[Envelope[ProjectInsuranceEvidence]], error) {
	return messagingSettingRequest[ProjectInsuranceEvidence](ctx, r.t, "PUT", messagingProjectPath(id)+"/insurance-evidence", b, o)
}
func (r *MessagingBanSafe) GetProjectHealthPolicy(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectHealthPolicy]], error) {
	return messagingSettingRequest[ProjectHealthPolicy](ctx, r.t, "GET", messagingProjectPath(id)+"/health-policy", nil, o)
}
func (r *MessagingBanSafe) UpdateProjectHealthPolicy(ctx context.Context, id string, b UpdateProjectHealthPolicyRequest, o ...RequestOptions) (Response[Envelope[ProjectHealthPolicy]], error) {
	return messagingSettingRequest[ProjectHealthPolicy](ctx, r.t, "PUT", messagingProjectPath(id)+"/health-policy", b, o)
}
func (r *MessagingBanSafe) GetSessionSafeMode(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SessionSafeMode]], error) {
	return messagingSettingRequest[SessionSafeMode](ctx, r.t, "GET", messagingPath(id)+"/safe-mode", nil, o)
}
func (r *MessagingBanSafe) UpdateSessionSafeMode(ctx context.Context, id string, b UpdateSessionSafeModeRequest, o ...RequestOptions) (Response[Envelope[SessionSafeMode]], error) {
	return messagingSettingRequest[SessionSafeMode](ctx, r.t, "PUT", messagingPath(id)+"/safe-mode", b, o)
}
