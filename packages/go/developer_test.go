package polymorfa

import (
	"context"
)

var developerFixtures = []operationFixture{
	{"OrganizationClient.Events.Retrieve", "GET", "/platform/events/x", "includePayload=false", "", `{"data":{"id":"x","type":"message.received","projectId":null,"payloadAvailability":"not_retained","payload":null}}`, "payloadAvailability", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(o.Events().Retrieve(ctx, "x", &v))
	}},
	{"ProjectClient.Events.Retrieve", "GET", "/platform/projects/p/events/x", "", "", `{"data":{"id":"x","type":"message.received","projectId":"p","payloadAvailability":"not_retained","payload":null}}`, "projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Events().Retrieve(ctx, "x", nil))
	}},
	{"OrganizationClient.Events.Replay", "POST", "/platform/events/x/replays", "", `{"webhookId":"w"}`, `{"data":{"eventId":"x","deliveryId":"delivery","operationId":"op","idempotency":{"id":"key","key":"request","replayed":false}}}`, "deliveryId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Events().Replay(ctx, "x", ReplayEventRequest{"w"}))
	}},
	{"ProjectClient.Events.Replay", "POST", "/platform/projects/p/events/x/replays", "", `{"webhookId":"w"}`, `{"data":{"eventId":"x","deliveryId":"delivery","operationId":"op","idempotency":{"id":"key","key":"request","replayed":false}}}`, "operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Events().Replay(ctx, "x", ReplayEventRequest{"w"}))
	}},
	{"OrganizationClient.Webhooks.Create", "POST", "/platform/webhooks", "", `{"url":"https://example.com/hook","eventTypes":["message.received"],"enabled":false}`, `{"data":{"webhook":{"id":"x","enabled":false,"eventTypes":["message.received"]},"secret":"one-time","secretAvailable":true,"idempotency":{"replayed":false}}}`, "secret", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(o.Webhooks().Create(ctx, CreateWebhookRequest{URL: "https://example.com/hook", EventTypes: []string{"message.received"}, Enabled: &v}))
	}},
	{"OrganizationClient.Webhooks.Retrieve", "GET", "/platform/webhooks/x", "", "", `{"data":{"id":"x","owner":"organization","eventTypes":["message.received"],"secret":{"version":3}}}`, "secret.version", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Webhooks().Retrieve(ctx, "x"))
	}},
	{"OrganizationClient.Webhooks.Update", "PATCH", "/platform/webhooks/x", "", `{"eventTypes":[],"enabled":false}`, `{"data":{"webhook":{"id":"x","enabled":false,"eventTypes":[]},"idempotency":{"replayed":false}}}`, "webhook.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		events := []string{}
		return wireData(o.Webhooks().Update(ctx, "x", UpdateWebhookRequest{Enabled: &v, EventTypes: &events}))
	}},
	{"OrganizationClient.Webhooks.Delete", "DELETE", "/platform/webhooks/x", "", "", `{"data":{"webhookId":"x","deleted":true,"idempotency":{"replayed":false}}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Webhooks().Delete(ctx, "x"))
	}},
	{"OrganizationClient.Webhooks.Test", "POST", "/platform/webhooks/x/tests", "", `{"eventType":"message.received"}`, `{"data":{"eventId":"event","deliveryId":"delivery","operationId":"op"}}`, "eventId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Webhooks().Test(ctx, "x", TestWebhookRequest{EventType: "message.received"}))
	}},
	{"OrganizationClient.Webhooks.RotateSecret", "POST", "/platform/webhooks/x/secret-rotations", "", `{"overlapSeconds":0}`, `{"data":{"webhookId":"x","secret":"one-time","secretAvailable":true,"secretMetadata":{"version":4}}}`, "secretMetadata.version", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(o.Webhooks().RotateSecret(ctx, "x", RotateWebhookSecretRequest{OverlapSeconds: &v}))
	}},
	{"ProjectClient.Webhooks.Create", "POST", "/platform/projects/p/webhooks", "", `{"url":"https://example.com/hook","eventTypes":["message.received"]}`, `{"data":{"webhook":{"id":"x","owner":"project","projectId":"p","eventTypes":["message.received"]},"secret":"one-time","secretAvailable":true}}`, "webhook.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Webhooks().Create(ctx, CreateWebhookRequest{URL: "https://example.com/hook", EventTypes: []string{"message.received"}}))
	}},
	{"ProjectClient.Webhooks.Retrieve", "GET", "/platform/projects/p/webhooks/x", "", "", `{"data":{"id":"x","owner":"project","projectId":"p","eventTypes":["message.received"]}}`, "projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Webhooks().Retrieve(ctx, "x"))
	}},
	{"ProjectClient.Webhooks.Update", "PATCH", "/platform/projects/p/webhooks/x", "", `{"enabled":false}`, `{"data":{"webhook":{"id":"x","projectId":"p","enabled":false},"idempotency":{"replayed":false}}}`, "webhook.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(p.Webhooks().Update(ctx, "x", UpdateWebhookRequest{Enabled: &v}))
	}},
	{"ProjectClient.Webhooks.Delete", "DELETE", "/platform/projects/p/webhooks/x", "", "", `{"data":{"webhookId":"x","deleted":true}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Webhooks().Delete(ctx, "x"))
	}},
	{"ProjectClient.Webhooks.Test", "POST", "/platform/projects/p/webhooks/x/tests", "", `{"eventType":"message.received"}`, `{"data":{"eventId":"event","deliveryId":"delivery","operationId":"op"}}`, "deliveryId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Webhooks().Test(ctx, "x", TestWebhookRequest{EventType: "message.received"}))
	}},
	{"ProjectClient.Webhooks.RotateSecret", "POST", "/platform/projects/p/webhooks/x/secret-rotations", "", `{}`, `{"data":{"webhookId":"x","secret":"one-time","secretAvailable":true,"secretMetadata":{"version":4}}}`, "secretAvailable", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Webhooks().RotateSecret(ctx, "x", RotateWebhookSecretRequest{}))
	}},
	{"OrganizationClient.WebhookDeliveries.Retrieve", "GET", "/platform/webhook-deliveries/x", "", "", `{"data":{"id":"x","status":"failed","attemptCount":3,"capabilities":{"retryable":true}}}`, "attemptCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.WebhookDeliveries().Retrieve(ctx, "x"))
	}},
	{"OrganizationClient.WebhookDeliveries.RetrieveAttempt", "GET", "/platform/webhook-deliveries/x/attempts/a", "", "", `{"data":{"id":"a","number":2,"status":"failed","statusCode":503,"response":{"excerpt":"Unavailable","truncated":false,"contentType":"text/plain"}}}`, "response.excerpt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.WebhookDeliveries().RetrieveAttempt(ctx, "x", "a"))
	}},
	{"OrganizationClient.WebhookDeliveries.Retry", "POST", "/platform/webhook-deliveries/x/retry", "", `{}`, `{"data":{"deliveryId":"x","attemptId":"a","operationId":"op"}}`, "attemptId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.WebhookDeliveries().Retry(ctx, "x"))
	}},
	{"ProjectClient.WebhookDeliveries.Retrieve", "GET", "/platform/projects/p/webhook-deliveries/x", "", "", `{"data":{"id":"x","projectId":"p","status":"failed","attemptCount":3}}`, "projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.WebhookDeliveries().Retrieve(ctx, "x"))
	}},
	{"ProjectClient.WebhookDeliveries.RetrieveAttempt", "GET", "/platform/projects/p/webhook-deliveries/x/attempts/a", "", "", `{"data":{"id":"a","projectId":"p","number":2,"status":"failed","statusCode":503}}`, "statusCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.WebhookDeliveries().RetrieveAttempt(ctx, "x", "a"))
	}},
	{"ProjectClient.WebhookDeliveries.Retry", "POST", "/platform/projects/p/webhook-deliveries/x/retry", "", `{}`, `{"data":{"deliveryId":"x","attemptId":"a","operationId":"op"}}`, "operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.WebhookDeliveries().Retry(ctx, "x"))
	}},
	{"OrganizationClient.Operations.Get", "GET", "/platform/operations/x", "wait=1", "", `{"data":{"id":"x","status":"running","sequence":2,"kind":"campaign","capabilities":{"cancellable":true,"watchable":true}}}`, "sequence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Operations().Get(ctx, "x", RetrieveOperationParams{Wait: 1}))
	}},
	{"ProjectClient.Operations.Get", "GET", "/platform/projects/p/operations/x", "", "", `{"data":{"id":"x","status":"failed","sequence":3,"error":{"code":"send_failed","retryable":false}}}`, "error.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Operations().Get(ctx, "x", RetrieveOperationParams{}))
	}},
	{"OrganizationClient.Operations.Cancel", "POST", "/platform/operations/x/cancel", "", "", `{"data":{"operationId":"x","operation":{"id":"x","status":"cancelling","sequence":3}}}`, "operation.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Operations().Cancel(ctx, "x"))
	}},
	{"ProjectClient.Operations.Cancel", "POST", "/platform/projects/p/operations/x/cancel", "", "", `{"data":{"operationId":"x","operation":{"id":"x","status":"cancelling","sequence":3}}}`, "operation.sequence", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Operations().Cancel(ctx, "x"))
	}},
}
