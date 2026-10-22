package polymorfa

import "context"

var platformSessionFixtures = []operationFixture{
	{"OrganizationClient.Sessions.List", "GET", "/platform/sessions", "projectId=p", "", `{"data":[{"sessionId":"s","projectId":"p","name":"Support","phone":null,"platform":null,"tierOverride":null,"status":"connected","messageCount":12,"paidUntil":42}]}`, "data.0.paidUntil", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().List(ctx, "p"))
	}},
	{"OrganizationClient.Sessions.Retrieve", "GET", "/platform/sessions/s", "", "", `{"success":true,"data":{"sessionId":"s","name":"Support","tenantId":"team","type":"linked_devices","testMode":false,"status":"connected"}}`, "data.tenantId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().Retrieve(ctx, "s"))
	}},
	{"OrganizationClient.Sessions.Update", "PUT", "/platform/sessions/s", "", `{"configuration":{"reset":["hms"]},"revision":0}`, `{"success":true,"data":{"sessionId":"s","name":"Support","status":"connected"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().Update(ctx, "s", UpdateSessionRequest{Configuration: SessionConfigurationPatch{Reset: []string{"hms"}}, Revision: 0}))
	}},
	{"OrganizationClient.Sessions.Start", "POST", "/platform/sessions/s/start", "", `{"projectId":"p"}`, `{"data":{"starting":true,"sessionId":"s"}}`, "data.starting", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().Start(ctx, "s", SessionProjectContext{"p"}))
	}},
	{"OrganizationClient.Sessions.Stop", "POST", "/platform/sessions/s/stop", "", `{}`, `{"data":{"stopping":true,"sessionId":"s"}}`, "data.stopping", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().Stop(ctx, "s", SessionProjectContext{}))
	}},
	{"OrganizationClient.Sessions.StopMany", "POST", "/platform/sessions/stop", "", `{"projectId":"p","sessionIds":["s","s2"]}`, `{"data":{"stopping":2}}`, "data.stopping", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().StopMany(ctx, SessionBatchRequest{"p", []string{"s", "s2"}}))
	}},
	{"OrganizationClient.Sessions.Delete", "DELETE", "/platform/sessions/s", "", "", `{"data":{"removed":true,"sessionId":"s"}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().Delete(ctx, "s"))
	}},
	{"OrganizationClient.Sessions.DeleteMany", "POST", "/platform/sessions/delete", "", `{"sessionIds":["s"]}`, `{"data":{"removed":1}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().DeleteMany(ctx, SessionBatchRequest{SessionIDs: []string{"s"}}))
	}},
	{"OrganizationClient.Sessions.QuoteTierChange", "POST", "/platform/sessions/s/tier-quotes", "", `{"tierOverride":null,"hybridResolution":{"action":"split","existingNumberTransport":"linked_devices","newNumberName":"Other"}}`, `{"data":{"id":"q","status":"quoted","failureReason":null,"expiresAtMs":99,"quote":{"tier":"standard","tierOverride":null,"amountCents":1.5,"priceVersion":"v1","action":"downgrade","effectiveAtMs":42,"replacesWindowId":null,"hybridTransition":{"action":"split","survivingNumberId":"s","existingNumberTransport":"linked_devices","newNumberName":"Other"}}}}`, "data.quote.hybridTransition.newNumberName", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().QuoteTierChange(ctx, "s", NumberTierQuoteRequest{HybridResolution: &HybridResolution{Action: "split", ExistingNumberTransport: "linked_devices", NewNumberName: "Other"}}))
	}},
	{"OrganizationClient.Sessions.RetrieveTierChange", "GET", "/platform/sessions/s/tier-quotes/q", "", "", `{"data":{"id":"q","status":"applied","failureReason":null,"expiresAtMs":99,"quote":{"tier":"pro","tierOverride":"pro","amountCents":1.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":42,"replacesWindowId":null}}}`, "data.quote.amountCents", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().RetrieveTierChange(ctx, "s", "q"))
	}},
	{"OrganizationClient.Sessions.SetTierOverride", "PATCH", "/platform/sessions/s", "", `{"projectId":"p","quoteId":"q"}`, `{"data":{"id":"q","status":"queued","failureReason":null,"expiresAtMs":99,"quote":{"tier":"pro","tierOverride":"pro","amountCents":1.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":42,"replacesWindowId":null}}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().SetTierOverride(ctx, "s", SessionTierOverrideRequest{"p", "q"}))
	}},
	{"OrganizationClient.Sessions.GetCapabilities", "GET", "/platform/sessions/s/capabilities", "", "", `{"data":{"session":"s","projectId":"p","status":"synced","syncedAt":null,"checkedAt":null,"accountType":"business","capabilities":[{"key":"messageEdit.windowSeconds","kind":"limit","unit":"seconds","value":900,"source":"server"},{"key":"channels","kind":"feature","unit":null,"value":false,"source":"client_default"}]}}`, "data.capabilities.0.value", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().GetCapabilities(ctx, "s"))
	}},
	{"OrganizationClient.Sessions.GetSafeMode", "GET", "/platform/sessions/s/safe-mode", "", "", `{"data":{"session":"s","projectId":"p","project":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"applied":null,"mismatch":false,"entitled":false,"entitlementReason":"not_available"}}`, "data.entitlementReason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().GetSafeMode(ctx, "s"))
	}},
	{"OrganizationClient.Sessions.UpdateSafeMode", "PUT", "/platform/sessions/s/safe-mode", "", `{"presence":"inherit"}`, `{"data":{"session":"s","projectId":"p","project":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"applied":null,"mismatch":false,"entitled":true,"entitlementReason":null}}`, "data.override.presence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Sessions().UpdateSafeMode(ctx, "s", UpdateSessionSafeModeRequest{Presence: "inherit"}))
	}},
}
