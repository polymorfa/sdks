package polymorfa

import "context"

func wirePage[T any](p *CursorPage[T], err error) (any, error) {
	if err != nil {
		return nil, err
	}
	return struct {
		Data []T `json:"data"`
	}{p.Items}, nil
}

var collectionFixtures = []operationFixture{
	{"OrganizationClient.Events.List", "GET", "/platform/events", "afterOffset=12&limit=2&type=message", "", `{"data":[{"id":"event","offset":"13","organizationId":"org","projectId":"p","type":"message","source":"runner","environment":"testing","createdAt":"today","payloadAvailability":"available","payload":null,"replayableUntil":null,"metadataExpiresAt":"tomorrow"}],"page":{"nextCursor":null,"hasMore":true,"nextOffset":"13","highWatermark":"20"}}`, "data.0.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.Events().List(ctx, ListEventsParams{ListParams: ListParams{Limit: 2}, AfterOffset: "12", Type: "message"}))
	}},
	{"ProjectClient.Events.List", "GET", "/platform/projects/p/events", "limit=2", "", `{"data":[{"id":"event","offset":"13","projectId":"p","type":"message","source":"runner","environment":"testing","createdAt":"today","payloadAvailability":"available","payload":null,"replayableUntil":null,"metadataExpiresAt":"tomorrow"}],"page":{"nextCursor":null}}`, "data.0.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.Events().List(ctx, ListEventsParams{ListParams: ListParams{Limit: 2}}))
	}},
	{"OrganizationClient.Webhooks.List", "GET", "/platform/webhooks", "eventType=message&limit=2", "", `{"data":[{"id":"hook","organizationId":"org","projectId":null,"url":"https://example.com","eventTypes":["message"],"enabled":false}],"page":{"nextCursor":null}}`, "data.0.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.Webhooks().List(ctx, ListWebhooksParams{ListParams: ListParams{Limit: 2}, EventType: "message"}))
	}},
	{"ProjectClient.Webhooks.List", "GET", "/platform/projects/p/webhooks", "limit=2", "", `{"data":[{"id":"hook","organizationId":"org","projectId":"p","url":"https://example.com","eventTypes":[],"enabled":true}],"page":{"nextCursor":null}}`, "data.0.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.Webhooks().List(ctx, ListWebhooksParams{ListParams: ListParams{Limit: 2}}))
	}},
	{"OrganizationClient.WebhookDeliveries.List", "GET", "/platform/webhook-deliveries", "limit=2&status=failed", "", `{"data":[{"id":"delivery","status":"failed","attemptCount":2,"capabilities":{"retryable":true}}],"page":{"nextCursor":null}}`, "data.0.capabilities.retryable", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.WebhookDeliveries().List(ctx, ListWebhookDeliveriesParams{ListParams: ListParams{Limit: 2}, Status: "failed"}))
	}},
	{"ProjectClient.WebhookDeliveries.List", "GET", "/platform/projects/p/webhook-deliveries", "limit=2", "", `{"data":[{"id":"delivery","projectId":"p","status":"failed","attemptCount":2,"capabilities":{"retryable":true}}],"page":{"nextCursor":null}}`, "data.0.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.WebhookDeliveries().List(ctx, ListWebhookDeliveriesParams{ListParams: ListParams{Limit: 2}}))
	}},
	{"OrganizationClient.WebhookDeliveries.ListAttempts", "GET", "/platform/webhook-deliveries/delivery/attempts", "limit=2", "", `{"data":[{"id":"attempt","deliveryId":"delivery","statusCode":503,"errorCode":"down","durationMs":123}],"page":{"nextCursor":null}}`, "data.0.statusCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.WebhookDeliveries().ListAttempts(ctx, "delivery", ListParams{Limit: 2}))
	}},
	{"ProjectClient.WebhookDeliveries.ListAttempts", "GET", "/platform/projects/p/webhook-deliveries/delivery/attempts", "limit=2", "", `{"data":[{"id":"attempt","deliveryId":"delivery","statusCode":503,"errorCode":"down","durationMs":123}],"page":{"nextCursor":null}}`, "data.0.durationMs", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.WebhookDeliveries().ListAttempts(ctx, "delivery", ListParams{Limit: 2}))
	}},
	{"OrganizationClient.Operations.List", "GET", "/platform/operations", "limit=2&projectId=p&status=running", "", `{"data":[{"id":"operation","projectId":"p","status":"running","sequence":2,"resource":{"type":"session","id":"s"},"capabilities":{"watchable":true,"cancellable":false},"progress":{"code":"waiting","current":1,"total":2}}],"page":{"nextCursor":null}}`, "data.0.progress.total", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.Operations().List(ctx, ListOperationsParams{ListParams: ListParams{Limit: 2}, ProjectID: "p", Status: "running"}))
	}},
	{"ProjectClient.Operations.List", "GET", "/platform/projects/p/operations", "limit=2", "", `{"data":[{"id":"operation","projectId":"p","status":"running","sequence":2,"resource":{"type":"session","id":"s"},"capabilities":{"watchable":true,"cancellable":false}}],"page":{"nextCursor":null}}`, "data.0.capabilities.watchable", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.Operations().List(ctx, ListOperationsParams{ListParams: ListParams{Limit: 2}}))
	}},
	{"OrganizationClient.Operations.ListTransitions", "GET", "/platform/operations/operation/transitions", "afterSequence=1&limit=2", "", `{"data":[{"operationId":"operation","sequence":2,"status":"running","createdAt":"today"}],"page":{"nextCursor":null}}`, "data.0.sequence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := int64(1)
		return wirePage(o.Operations().ListTransitions(ctx, "operation", ListParams{Limit: 2}, &v))
	}},
	{"ProjectClient.Operations.ListTransitions", "GET", "/platform/projects/p/operations/operation/transitions", "limit=2", "", `{"data":[{"operationId":"operation","sequence":2,"status":"running","createdAt":"today"}],"page":{"nextCursor":null}}`, "data.0.sequence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(p.Operations().ListTransitions(ctx, "operation", ListParams{Limit: 2}, nil))
	}},
}
