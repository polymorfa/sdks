package polymorfa

import "context"

const projectSafeFixture = `{"data":{"projectId":"p","ceiling":{"presence":"dark","typing":"off","reads":"off","pacing":"jittered","onlineStart":0,"onlineEnd":24},"entitled":false,"entitlementReason":"not_enrolled"}}`
const warmupFixture = `{"data":{"projectId":"p","plan":{"enabled":false,"warmupDays":30,"dailyStart":10},"ceiling":100,"curve":[{"day":1,"allowance":10}],"entitled":false,"entitlementReason":"not_enrolled"}}`
const insuranceFixture = `{"data":{"projectId":"p","enabled":false,"banInsuranceIncluded":true}}`
const healthFixture = `{"data":{"projectId":"p","version":2,"enabled":false,"threshold":0.5,"sessionAction":"none","slowDownMps":null,"emailNotification":false,"webhookNotification":true,"integrations":{"emailConfigured":false,"webhookConfigured":true}}}`
const sessionSafeFixture = `{"data":{"session":"s","projectId":"p","project":{"presence":"dark"},"override":{"presence":"inherit"},"effective":{"presence":"dark"},"applied":null,"mismatch":false,"entitled":false,"entitlementReason":"not_enrolled"}}`

func fixtureWarmupUpdate() UpdateProjectWarmupPlanRequest {
	v, n := false, 0
	return UpdateProjectWarmupPlanRequest{Enabled: &v, DailyStart: &n}
}
func fixtureHealthUpdate() UpdateProjectHealthPolicyRequest {
	return UpdateProjectHealthPolicyRequest{Version: 1, Threshold: 0.5, SessionAction: "none", WebhookNotification: true}
}

var projectHealthFixtures = []operationFixture{
	{"OrganizationClient.Projects.GetSafeMode", "GET", "/platform/projects/p/safe-mode", "", "", projectSafeFixture, "data.entitlementReason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().GetSafeMode(ctx, "p"))
	}},
	{"OrganizationClient.Projects.UpdateSafeMode", "PUT", "/platform/projects/p/safe-mode", "", `{"presence":"dark","onlineStart":0}`, projectSafeFixture, "data.ceiling.onlineStart", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(o.Projects().UpdateSafeMode(ctx, "p", UpdateProjectSafeModeRequest{Presence: "dark", OnlineStart: &v}))
	}},
	{"OrganizationClient.Projects.GetWarmupPlan", "GET", "/platform/projects/p/warmup-plan", "", "", warmupFixture, "data.curve.0.allowance", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().GetWarmupPlan(ctx, "p"))
	}},
	{"OrganizationClient.Projects.UpdateWarmupPlan", "PUT", "/platform/projects/p/warmup-plan", "", `{"enabled":false,"dailyStart":0}`, warmupFixture, "data.plan.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().UpdateWarmupPlan(ctx, "p", fixtureWarmupUpdate()))
	}},
	{"OrganizationClient.Projects.GetInsuranceEvidence", "GET", "/platform/projects/p/insurance-evidence", "", "", insuranceFixture, "data.banInsuranceIncluded", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().GetInsuranceEvidence(ctx, "p"))
	}},
	{"OrganizationClient.Projects.UpdateInsuranceEvidence", "PUT", "/platform/projects/p/insurance-evidence", "", `{"enabled":false}`, insuranceFixture, "data.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().UpdateInsuranceEvidence(ctx, "p", UpdateProjectInsuranceEvidenceRequest{}))
	}},
	{"OrganizationClient.Projects.GetHealthPolicy", "GET", "/platform/projects/p/health-policy", "", "", healthFixture, "data.integrations.webhookConfigured", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().GetHealthPolicy(ctx, "p"))
	}},
	{"OrganizationClient.Projects.UpdateHealthPolicy", "PUT", "/platform/projects/p/health-policy", "", `{"version":1,"enabled":false,"threshold":0.5,"sessionAction":"none","slowDownMps":null,"emailNotification":false,"webhookNotification":true}`, healthFixture, "data.version", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().UpdateHealthPolicy(ctx, "p", fixtureHealthUpdate()))
	}},
	{"OrganizationClient.Projects.ListHybridMergeCandidates", "GET", "/platform/projects/p/hybrid-merge-candidates", "", "", `{"data":[{"numbers":[{"id":"a","name":"A","transport":"linked_devices","status":"connected","canBeAbsorbed":false},{"id":"b","name":"B","transport":"official_api","status":"connected","canBeAbsorbed":true}],"eligible":false,"ineligibleReason":"hms_enabled"}]}`, "data.0.numbers.0.canBeAbsorbed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().ListHybridMergeCandidates(ctx, "p"))
	}},
	{"MessagingClient.BanSafe.GetProjectSafeMode", "GET", "/messaging/projects/p/safe-mode", "", "", projectSafeFixture, "data.entitlementReason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().GetProjectSafeMode(ctx, "p"))
	}},
	{"MessagingClient.BanSafe.UpdateProjectSafeMode", "PUT", "/messaging/projects/p/safe-mode", "", `{"presence":"dark","onlineStart":0}`, projectSafeFixture, "data.ceiling.onlineStart", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(m.BanSafe().UpdateProjectSafeMode(ctx, "p", UpdateProjectSafeModeRequest{Presence: "dark", OnlineStart: &v}))
	}},
	{"MessagingClient.BanSafe.GetProjectWarmupPlan", "GET", "/messaging/projects/p/warmup-plan", "", "", warmupFixture, "data.curve.0.allowance", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().GetProjectWarmupPlan(ctx, "p"))
	}},
	{"MessagingClient.BanSafe.UpdateProjectWarmupPlan", "PUT", "/messaging/projects/p/warmup-plan", "", `{"enabled":false,"dailyStart":0}`, warmupFixture, "data.plan.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().UpdateProjectWarmupPlan(ctx, "p", fixtureWarmupUpdate()))
	}},
	{"MessagingClient.BanSafe.GetProjectInsuranceEvidence", "GET", "/messaging/projects/p/insurance-evidence", "", "", insuranceFixture, "data.banInsuranceIncluded", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().GetProjectInsuranceEvidence(ctx, "p"))
	}},
	{"MessagingClient.BanSafe.UpdateProjectInsuranceEvidence", "PUT", "/messaging/projects/p/insurance-evidence", "", `{"enabled":false}`, insuranceFixture, "data.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().UpdateProjectInsuranceEvidence(ctx, "p", UpdateProjectInsuranceEvidenceRequest{}))
	}},
	{"MessagingClient.BanSafe.GetProjectHealthPolicy", "GET", "/messaging/projects/p/health-policy", "", "", healthFixture, "data.integrations.webhookConfigured", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().GetProjectHealthPolicy(ctx, "p"))
	}},
	{"MessagingClient.BanSafe.UpdateProjectHealthPolicy", "PUT", "/messaging/projects/p/health-policy", "", `{"version":1,"enabled":false,"threshold":0.5,"sessionAction":"none","slowDownMps":null,"emailNotification":false,"webhookNotification":true}`, healthFixture, "data.version", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().UpdateProjectHealthPolicy(ctx, "p", fixtureHealthUpdate()))
	}},
	{"MessagingClient.BanSafe.GetSessionSafeMode", "GET", "/messaging/s/safe-mode", "", "", sessionSafeFixture, "data.override.presence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().GetSessionSafeMode(ctx, "s"))
	}},
	{"MessagingClient.BanSafe.UpdateSessionSafeMode", "PUT", "/messaging/s/safe-mode", "", `{"presence":"inherit"}`, sessionSafeFixture, "data.entitlementReason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.BanSafe().UpdateSessionSafeMode(ctx, "s", UpdateSessionSafeModeRequest{Presence: "inherit"}))
	}},
}
