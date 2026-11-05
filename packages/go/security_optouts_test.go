package polymorfa

import (
	"context"
	"encoding/json"
)

var securityOptOutFixtures = []operationFixture{
	{"OrganizationClient.AuditLogs.List", "GET", "/platform/audit", "action=update&limit=2&resource=project", "", `{"data":[{"id":"audit","actorEmail":"staff@example.com","actorUserId":null,"actorRole":"owner","action":"update","resource":"project","projectId":"p","projectName":"Project","ip":null,"userAgent":null,"duration":12,"source":"api","description":null,"result":"success","metadata":{"fields":["name"]},"createdAt":123}]}`, "data.0.duration", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.AuditLogs().List(ctx, ListAuditLogsParams{Action: "update", Resource: "project", Limit: 2}))
	}},
	{"OrganizationClient.SessionBans.List", "GET", "/platform/bans", "", "", `{"data":[{"id":"ban","sessionName":"s","banCode":42,"banReason":"temporary","banExpiresAt":null,"occurredAt":123,"status":"active"}]}`, "data.0.banCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SessionBans().List(ctx))
	}},
	{"OrganizationClient.SessionBans.ListActive", "GET", "/platform/bans/active", "", "", `{"data":[{"id":"ban","sessionName":"s","banCode":42,"banReason":"temporary","banExpiresAt":null,"occurredAt":123,"status":"active"}]}`, "data.0.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SessionBans().ListActive(ctx))
	}},
	{"OrganizationClient.SecurityIncidents.List", "GET", "/platform/incidents", "", "", `{"data":[{"id":"incident","keyId":"key","tokenType":"project","source":"leak","url":null,"ref":null,"resolution":"revoked","detectedAt":123,"acknowledgedAt":null,"acknowledgedBy":null,"createdAt":123}]}`, "data.0.resolution", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SecurityIncidents().List(ctx))
	}},
	{"OrganizationClient.SecurityIncidents.Acknowledge", "POST", "/platform/incidents/incident/acknowledge", "", "", `{"data":{"acknowledged":true}}`, "data.acknowledged", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SecurityIncidents().Acknowledge(ctx, "incident"))
	}},
	{"OrganizationClient.OptOuts.List", "GET", "/platform/optouts", "", "", `{"data":{"phones":["+15551234567"]}}`, "data.phones.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().List(ctx))
	}},
	{"OrganizationClient.OptOuts.Create", "POST", "/platform/optouts", "", `{"phone":"+15551234567"}`, `{"data":{"created":true}}`, "data.created", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().Create(ctx, PlatformPayload{"phone": json.RawMessage(`"+15551234567"`)}))
	}},
	{"OrganizationClient.OptOuts.CreateBatch", "POST", "/platform/optouts/batch", "", `{"phones":["+15551234567"]}`, `{"data":{"created":1}}`, "data.created", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().CreateBatch(ctx, PlatformPayload{"phones": json.RawMessage(`["+15551234567"]`)}))
	}},
	{"OrganizationClient.OptOuts.Delete", "DELETE", "/platform/optouts/+15551234567", "", "", `{"data":{"deleted":true}}`, "data.deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().Delete(ctx, "+15551234567"))
	}},
	{"OrganizationClient.OptOuts.GetSettings", "GET", "/platform/optouts/settings", "", "", `{"data":{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":null}}`, "data.optOutKeywords.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().GetSettings(ctx))
	}},
	{"OrganizationClient.OptOuts.UpdateSettings", "PUT", "/platform/optouts/settings", "", `{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"]}`, `{"data":{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":123}}`, "data.updatedAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.OptOuts().UpdateSettings(ctx, UpdateOptOutSettingsRequest{OptOutKeywords: []string{"STOP"}, OptInKeywords: []string{"START"}}))
	}},
}
