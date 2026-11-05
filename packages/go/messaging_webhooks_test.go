package polymorfa

import "context"

var messagingWebhookFixtures = []operationFixture{
	{"MessagingClient.Webhooks.List", "GET", "/messaging/webhooks", "", "", `{"data":[{"id":"hook","tenantId":"team","url":"https://example.com/hook","events":[],"retries":{"attempts":3,"delaySeconds":2,"policy":"constant"},"headers":[],"enabled":true,"createdAt":"today"}]}`, "data.0.retries.delaySeconds", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Webhooks().List(ctx))
	}},
	{"MessagingClient.Webhooks.Create", "POST", "/messaging/webhooks", "", `{"session":"s","url":"https://example.com/hook","events":[],"format":"native"}`, `{"data":{"id":"hook","tenantId":"team","session":"s","url":"https://example.com/hook","events":[],"retries":{"attempts":3,"delaySeconds":2,"policy":"constant"},"headers":[],"enabled":true,"format":"native","createdAt":"today"}}`, "data.format", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := []string{}
		return wireData(m.Webhooks().Create(ctx, CreateMessagingWebhookRequest{Session: "s", URL: "https://example.com/hook", Events: &v, Format: "native"}))
	}},
	{"MessagingClient.Webhooks.Retrieve", "GET", "/messaging/webhooks/hook", "", "", `{"data":{"id":"hook","tenantId":"team","url":"https://example.com/hook","events":[],"retries":{"attempts":3,"delaySeconds":2,"policy":"constant"},"headers":[],"enabled":false,"createdAt":"today"}}`, "data.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Webhooks().Retrieve(ctx, "hook"))
	}},
	{"MessagingClient.Webhooks.Update", "PUT", "/messaging/webhooks/hook", "", `{"headers":[],"enabled":false}`, `{"data":{"id":"hook","tenantId":"team","url":"https://example.com/hook","events":[],"retries":{"attempts":3,"delaySeconds":2,"policy":"constant"},"headers":[],"enabled":false,"createdAt":"today"}}`, "data.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		h := []WebhookHeader{}
		return wireData(m.Webhooks().Update(ctx, "hook", UpdateMessagingWebhookRequest{Enabled: &v, Headers: &h}))
	}},
	{"MessagingClient.Webhooks.Delete", "DELETE", "/messaging/webhooks/hook", "", "", `{"success":true,"message":"Removed"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Webhooks().Delete(ctx, "hook"))
	}},
}
