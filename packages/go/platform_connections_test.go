package polymorfa

import "context"

var platformConnectionFixtures = []operationFixture{
	{"TeamClient.Connections.List", "GET", "/platform/connections", "projectId=p", "", `{"data":[{"connectionId":"s","projectId":"p","name":"Support","phone":null,"platform":null,"tierOverride":null,"status":"connected","messageCount":12,"paidUntil":42}]}`, "data.0.paidUntil", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().List(ctx, "p"))
	}},
	{"TeamClient.Connections.Retrieve", "GET", "/platform/connections/s", "", "", `{"success":true,"data":{"connectionId":"s","name":"Support","tenantId":"team","type":"linked_devices","testMode":false,"status":"connected"}}`, "data.tenantId", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().Retrieve(ctx, "s"))
	}},
	{"TeamClient.Connections.Update", "PUT", "/platform/connections/s", "", `{"configuration":{"reset":["hms"]},"revision":0}`, `{"success":true,"data":{"connectionId":"s","name":"Support","status":"connected"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().Update(ctx, "s", UpdateConnectionRequest{Configuration: ConnectionConfigurationPatch{Reset: []string{"hms"}}, Revision: 0}))
	}},
	{"TeamClient.Connections.Start", "POST", "/platform/connections/s/start", "", `{"projectId":"p"}`, `{"data":{"starting":true,"connectionId":"s"}}`, "data.starting", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().Start(ctx, "s", ConnectionProjectContext{"p"}))
	}},
	{"TeamClient.Connections.Stop", "POST", "/platform/connections/s/stop", "", `{}`, `{"data":{"stopping":true,"connectionId":"s"}}`, "data.stopping", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().Stop(ctx, "s", ConnectionProjectContext{}))
	}},
	{"TeamClient.Connections.StopMany", "POST", "/platform/connections/stop", "", `{"projectId":"p","connectionIds":["s","s2"]}`, `{"data":{"stopping":2}}`, "data.stopping", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().StopMany(ctx, ConnectionBatchRequest{"p", []string{"s", "s2"}}))
	}},
	{"TeamClient.Connections.Delete", "DELETE", "/platform/connections/s", "", "", `{"data":{"removed":true,"connectionId":"s"}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().Delete(ctx, "s"))
	}},
	{"TeamClient.Connections.DeleteMany", "POST", "/platform/connections/delete", "", `{"connectionIds":["s"]}`, `{"data":{"removed":1}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().DeleteMany(ctx, ConnectionBatchRequest{ConnectionIDs: []string{"s"}}))
	}},
	{"TeamClient.Connections.QuoteTierChange", "POST", "/platform/connections/s/tier-quotes", "", `{"tierOverride":null,"hybridResolution":{"action":"split","existingConnectionTransport":"linked_devices","newConnectionName":"Other"}}`, `{"data":{"id":"q","status":"quoted","failureReason":null,"expiresAtMs":99,"quote":{"tier":"standard","tierOverride":null,"amountCents":1.5,"priceVersion":"v1","action":"downgrade","effectiveAtMs":42,"replacesWindowId":null,"hybridTransition":{"action":"split","survivingConnectionId":"s","existingConnectionTransport":"linked_devices","newConnectionName":"Other"}}}}`, "data.quote.hybridTransition.newConnectionName", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().QuoteTierChange(ctx, "s", ConnectionTierQuoteRequest{HybridResolution: &HybridResolution{Action: "split", ExistingConnectionTransport: "linked_devices", NewConnectionName: "Other"}}))
	}},
	{"TeamClient.Connections.RetrieveTierChange", "GET", "/platform/connections/s/tier-quotes/q", "", "", `{"data":{"id":"q","status":"applied","failureReason":null,"expiresAtMs":99,"quote":{"tier":"pro","tierOverride":"pro","amountCents":1.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":42,"replacesWindowId":null}}}`, "data.quote.amountCents", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().RetrieveTierChange(ctx, "s", "q"))
	}},
	{"TeamClient.Connections.SetTierOverride", "PATCH", "/platform/connections/s", "", `{"projectId":"p","quoteId":"q"}`, `{"data":{"id":"q","status":"queued","failureReason":null,"expiresAtMs":99,"quote":{"tier":"pro","tierOverride":"pro","amountCents":1.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":42,"replacesWindowId":null}}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().SetTierOverride(ctx, "s", ConnectionTierOverrideRequest{"p", "q"}))
	}},
	{"TeamClient.Connections.GetCapabilities", "GET", "/platform/connections/s/capabilities", "", "", `{"data":{"connection":"s","projectId":"p","status":"synced","syncedAt":null,"checkedAt":null,"accountType":"business","capabilities":[{"key":"messageEdit.windowSeconds","kind":"limit","unit":"seconds","value":900,"source":"server"},{"key":"channels","kind":"feature","unit":null,"value":false,"source":"client_default"}]}}`, "data.capabilities.0.value", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().GetCapabilities(ctx, "s"))
	}},
	{"TeamClient.Connections.GetSafeMode", "GET", "/platform/connections/s/safe-mode", "", "", `{"data":{"connection":"s","projectId":"p","project":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"applied":null,"mismatch":false,"entitled":false,"entitlementReason":"not_available"}}`, "data.entitlementReason", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().GetSafeMode(ctx, "s"))
	}},
	{"TeamClient.Connections.UpdateSafeMode", "PUT", "/platform/connections/s/safe-mode", "", `{"presence":"inherit"}`, `{"data":{"connection":"s","projectId":"p","project":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":9,"onlineEnd":17},"applied":null,"mismatch":false,"entitled":true,"entitlementReason":null}}`, "data.override.presence", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Connections().UpdateSafeMode(ctx, "s", UpdateConnectionSafeModeRequest{Presence: "inherit"}))
	}},
}
