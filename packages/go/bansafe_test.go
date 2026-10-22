package polymorfa

import (
	"context"
	"encoding/json"
	"testing"
)

var banSafeFixtures = []operationFixture{
	{"OrganizationClient.BanSafe.ListHealth", "GET", "/platform/bansafe/health", "limit=2&projectId=p", "", `{"data":[{"sessionId":"s","health":81,"healthProbabilities":{"healthy":0.8,"limited":0.2,"restricted":0,"banned":0}}],"page":{"nextCursor":null}}`, "data.0.healthProbabilities.healthy", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListHealth(ctx, ListBanSafeHealthParams{ListParams: ListParams{Limit: 2}, ProjectID: "p"}))
	}},
	{"OrganizationClient.BanSafe.GetHealth", "GET", "/platform/bansafe/health/s", "", "", `{"data":{"sessionId":"s","warmup":{"enabled":true,"curve":[{"day":1,"allowance":20}]}}}`, "data.warmup.curve.0.allowance", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().GetHealth(ctx, "s"))
	}},
	{"OrganizationClient.BanSafe.ListHealthHistory", "GET", "/platform/bansafe/health/s/history", "limit=3&since=2026-10-01", "", `{"data":{"sessionId":"s","points":[{"health":null,"band":null,"healthEvaluatedAt":"2026-10-11"}]}}`, "data.points.0.healthEvaluatedAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().ListHealthHistory(ctx, "s", ListBanSafeHealthHistoryParams{Since: "2026-10-01", Limit: 3}))
	}},
	{"OrganizationClient.BanSafe.ListSignals", "GET", "/platform/bansafe/signals", "", "", `{"data":[{"key":"delivery.latency","kind":"histogram","unit":"milliseconds"}]}`, "data.0.kind", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().ListSignals(ctx))
	}},
	{"OrganizationClient.BanSafe.GetTelemetry", "GET", "/platform/bansafe/telemetry/s", "", "", `{"data":{"sessionId":"s","collection":{"state":"fresh","partial":false},"snapshot":{"signals":[{"key":"latency","measured":true,"value":[10,20],"sampleSize":2}]}}}`, "data.snapshot.signals.0.value", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().GetTelemetry(ctx, "s"))
	}},
	{"OrganizationClient.BanSafe.ListTelemetryHistory", "GET", "/platform/bansafe/telemetry/s/history", "cursor=c&limit=2&since=a&until=b", "", `{"data":[{"bucketStart":"a","partial":false,"signals":[{"value":false,"codes":[{"code":403,"count":1}]}]}],"page":{"nextCursor":null}}`, "data.0.signals.0.codes.0.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListTelemetryHistory(ctx, "s", ListBanSafeTelemetryHistoryParams{ListParams: ListParams{Cursor: "c", Limit: 2}, Since: "a", Until: "b"}))
	}},
	{"OrganizationClient.BanSafe.ListCollection", "GET", "/platform/bansafe/collection", "projectId=p", "", `{"data":[{"sessionId":"s","collection":{"state":"unsupported","recordVersion":null}}],"page":{"nextCursor":null}}`, "data.0.collection.state", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListCollection(ctx, ListBanSafeCollectionParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.BanSafe.ListHealthActions", "GET", "/platform/bansafe/health-actions", "session=s&status=pending", "", `{"data":[{"id":"a","action":"slow_down","slowDownMps":0.2}],"page":{"nextCursor":null}}`, "data.0.slowDownMps", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListHealthActions(ctx, ListBanSafeHealthActionsParams{Session: "s", Status: "pending"}))
	}},
	{"OrganizationClient.BanSafe.ListFindings", "GET", "/platform/bansafe/findings", "session=s&severity=warning&status=open", "", `{"data":[{"key":"delivery","severity":"warning","evidence":{"ratio":0.25}}],"page":{"nextCursor":null}}`, "data.0.evidence.ratio", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListFindings(ctx, ListBanSafeFindingsParams{Session: "s", Status: "open", Severity: "warning"}))
	}},
	{"OrganizationClient.BanSafe.ListEnforcement", "GET", "/platform/bansafe/enforcement", "rung=throttle", "", `{"data":[{"rung":"throttle","enforcement":{"exitProgress":0.3,"blocksUnsolicited":true}}],"page":{"nextCursor":null}}`, "data.0.enforcement.exitProgress", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListEnforcement(ctx, ListBanSafeEnforcementParams{Rung: "throttle"}))
	}},
	{"OrganizationClient.BanSafe.ListIncidents", "GET", "/platform/bansafe/incidents", "session=s", "", `{"data":[{"id":"i","source":"customer","ambiguous":true}],"page":{"nextCursor":null}}`, "data.0.ambiguous", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListIncidents(ctx, ListBanSafeIncidentsParams{Session: "s"}))
	}},
	{"OrganizationClient.BanSafe.CreateIncident", "POST", "/platform/bansafe/incidents", "", `{"session":"s","occurredAt":"2026-10-11","note":"reported"}`, `{"data":{"incidentId":"i","created":true,"sessionId":"s","occurredAt":"2026-10-11"}}`, "data.created", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().CreateIncident(ctx, ReportBanSafeIncidentRequest{Session: "s", OccurredAt: "2026-10-11", Note: "reported"}))
	}},
	{"OrganizationClient.BanSafe.RetractIncident", "POST", "/platform/bansafe/incidents/i/retract", "", "", `{"data":{"id":"i","resolution":"retracted","closedBy":"operator"}}`, "data.closedBy", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().RetractIncident(ctx, "i"))
	}},
	{"OrganizationClient.BanSafe.ListClaims", "GET", "/platform/bansafe/claims", "session=s&status=paid", "", `{"data":[{"id":"c","amountCents":0.123456,"evidence":{"measuredHours":48}}],"page":{"nextCursor":null}}`, "data.0.amountCents", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.BanSafe().ListClaims(ctx, ListBanSafeClaimsParams{Session: "s", Status: "paid"}))
	}},
	{"OrganizationClient.BanSafe.GetClaim", "GET", "/platform/bansafe/claims/c", "", "", `{"data":{"id":"c","status":"paid","evidence":{"attributionRuleVersion":1,"sharedConnection":false}}}`, "data.evidence.attributionRuleVersion", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.BanSafe().GetClaim(ctx, "c"))
	}},
}

func TestBanSafeSignalVariants(t *testing.T) {
	for _, s := range []string{`null`, `0`, `false`, `"unknown"`, `[]`, `[1,2]`} {
		var v BanSafeSignalValue
		if err := json.Unmarshal([]byte(s), &v); err != nil {
			t.Fatal(err)
		}
		b, err := json.Marshal(v)
		if err != nil || string(b) != s {
			t.Fatalf("%s => %s %v", s, b, err)
		}
	}
	for _, s := range []string{`{}`, `[true]`} {
		var v BanSafeSignalValue
		if json.Unmarshal([]byte(s), &v) == nil {
			t.Fatal("invalid signal accepted", s)
		}
	}
}
