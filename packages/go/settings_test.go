package polymorfa

import (
	"context"
	"encoding/json"
)

var settingsFixtures = []operationFixture{
	{"TeamClient.QuickLinkSettings.Retrieve", "GET", "/platform/quicklink", "", "", `{"data":{"id":"q","projectId":null,"enabled":true,"theme":"dark","hideWatermark":false,"allowPhoneChange":false,"historySync":"ask","logoMode":"none","methods":["qr"]}}`, "theme", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.QuickLinkSettings().Retrieve(ctx))
	}},
	{"ProjectClient.QuickLinkSettings.Retrieve", "GET", "/platform/quicklink", "projectId=p", "", `{"data":{"id":"q","projectId":"p","enabled":true,"theme":"dark","hideWatermark":false,"allowPhoneChange":false,"historySync":"ask","logoMode":"none","methods":["qr"]}}`, "projectId", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(p.QuickLinkSettings().Retrieve(ctx))
	}},
	{"TeamClient.QuickLinkSettings.Update", "PUT", "/platform/quicklink", "", `{"enabled":false,"headline":null,"methods":[]}`, `{"data":{"id":"q","projectId":null,"enabled":false,"theme":"dark","methods":[]}}`, "enabled", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		v := false
		methods := []string{}
		return wireData(o.QuickLinkSettings().Update(ctx, UpdateQuickLinkSettingsRequest{Enabled: &v, Headline: &Nullable[string]{}, Methods: &Nullable[[]string]{Value: &methods}}))
	}},
	{"ProjectClient.QuickLinkSettings.Update", "PUT", "/platform/quicklink", "", `{"enabled":false,"radiusPx":0,"projectId":"p"}`, `{"data":{"id":"q","projectId":"p","enabled":false,"theme":"dark","radiusPx":0}}`, "radiusPx", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		v := false
		n := 0
		return wireData(p.QuickLinkSettings().Update(ctx, UpdateQuickLinkSettingsRequest{Enabled: &v, RadiusPx: &Nullable[int]{Value: &n}}))
	}},
	{"TeamClient.ConnectionConfiguration.Retrieve", "GET", "/platform/session-configuration", "", "", `{"data":{"revisions":{"team":0,"project":0,"connection":0},"effective":{"hms":{"enabled":false}},"sources":{"hms":"default"}}}`, "sources.hms", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.ConnectionConfiguration().Retrieve(ctx))
	}},
	{"ProjectClient.ConnectionConfiguration.Retrieve", "GET", "/platform/session-configuration", "projectId=p", "", `{"data":{"revisions":{"team":0,"project":0,"connection":0},"effective":{"hms":{"enabled":false}},"sources":{"hms":"default"}}}`, "revisions.team", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(p.ConnectionConfiguration().Retrieve(ctx))
	}},
	{"TeamClient.ConnectionConfiguration.Update", "PUT", "/platform/session-configuration", "", `{"configuration":{"reset":["hms"]},"revision":0}`, `{"data":{"revisions":{"team":1,"project":1,"connection":0},"effective":{"hms":{"enabled":false}},"sources":{"hms":"default"}}}`, "revisions.team", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.ConnectionConfiguration().Update(ctx, UpdateConnectionRequest{Configuration: ConnectionConfigurationPatch{Reset: []string{"hms"}}}))
	}},
	{"ProjectClient.ConnectionConfiguration.Update", "PUT", "/platform/session-configuration", "", `{"configuration":{"reset":["hms"]},"revision":0,"projectId":"p"}`, `{"data":{"revisions":{"team":1,"project":1,"connection":0},"effective":{"hms":{"enabled":false}},"sources":{"hms":"default"}}}`, "revisions.team", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(p.ConnectionConfiguration().Update(ctx, UpdateConnectionRequest{Configuration: ConnectionConfigurationPatch{Reset: []string{"hms"}}}))
	}},
	{"TeamClient.Media.Retrieve", "GET", "/platform/media/x", "", "", `{"data":{"id":"x","status":"ready","size":42}}`, "data.size", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Media().Retrieve(ctx, "x"))
	}},
	{"TeamClient.Media.Delete", "DELETE", "/platform/media/x", "", "", `{"data":{"id":"x","deleted":true}}`, "data.deleted", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Media().Delete(ctx, "x"))
	}},
	{"TeamClient.Media.CreateUpload", "POST", "/platform/media/uploads", "", `{"contentType":"image/png"}`, `{"data":{"id":"x","url":"https://storage.example/upload"}}`, "data.url", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Media().CreateUpload(ctx, PlatformPayload{"contentType": json.RawMessage(`"image/png"`)}))
	}},
	{"TeamClient.Usage.Summary", "GET", "/platform/usage", "period=2026-10&projectId=p&connection=s", "", `{"data":{"period":"2026-10","projectId":"p","connection":"s","billingEnabled":false,"meters":[{"meter":"call.duration","unit":"second","keySource":"none","quantity":12.5,"records":1}],"connections":[],"connectionsTruncated":false}}`, "meters.0.quantity", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Usage().Summary(ctx, UsageSummaryParams{"p", "s", "2026-10"}))
	}},
	{"ProjectClient.Usage.Summary", "GET", "/platform/usage", "projectId=p", "", `{"data":{"period":"2026-10","projectId":"p","connection":null,"billingEnabled":false,"meters":[],"connections":[],"connectionsTruncated":false}}`, "projectId", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(p.Usage().Summary(ctx, UsageSummaryParams{ProjectID: "other"}))
	}},
	{"TeamClient.Usage.ListRecords", "GET", "/platform/usage/records", "callId=call&limit=1&meter=call.duration", "", `{"data":{"records":[{"id":"r","meter":"call.duration","quantity":12.5,"unit":"second","dimensions":{"direction":"outbound","participants":2,"video":false},"keySource":"none","sourceKind":"call","sourceId":"call","projectId":"p","connection":"s","revision":1,"pricingState":"unpriced","rateCard":null,"pricedCredits":null}],"nextCursor":null}}`, "records.0.dimensions.video", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Usage().ListRecords(ctx, UsageRecordParams{CallID: "call", Meter: "call.duration", ListParams: ListParams{Limit: 1}}))
	}},
	{"ProjectClient.Usage.ListRecords", "GET", "/platform/usage/records", "cursor=next&projectId=p", "", `{"data":{"records":[{"id":"r","meter":"call.duration","quantity":12.5,"unit":"second","dimensions":{"direction":"outbound"},"keySource":"none","sourceKind":"call","sourceId":"call","projectId":"p","connection":"s","revision":1,"pricingState":"unpriced","rateCard":null,"pricedCredits":null}],"nextCursor":null}}`, "records.0.revision", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(p.Usage().ListRecords(ctx, UsageRecordParams{ListParams: ListParams{Cursor: "next"}}))
	}},
	{"TeamClient.Usage.ListGates", "GET", "/platform/gates", "connection=s", "", `{"data":{"connection":"s","gates":[{"key":"calls.outbound_monthly","kind":"quota","subject":"team","mode":"record","active":true,"limit":10,"used":20,"unit":"second","overLimit":true,"decisions":{"wouldBlock":2,"blocked":0,"evaluationError":0}}]}}`, "gates.0.decisions.wouldBlock", func(ctx context.Context, m *MessagingClient, o *TeamClient, p *ProjectClient) (any, error) {
		return wireData(o.Usage().ListGates(ctx, UsageGateParams{Connection: "s"}))
	}},
}
