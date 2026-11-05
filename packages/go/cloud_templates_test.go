package polymorfa

import (
	"context"
	"encoding/json"
)

var cloudTemplateFixtures = []operationFixture{
	{"MessagingClient.CloudTemplates.List", "GET", "/messaging/s/templates", "", "", `{"success":true,"data":[{"id":"t","tenantId":"team","session":"s","wabaId":"waba","name":"welcome","language":"en_US","category":"UTILITY","status":"APPROVED","components":[{"type":"BODY","text":"Hello"}],"createdAt":"today","updatedAt":"today"}]}`, "data.0.components.0.text", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudTemplates().List(ctx, "s"))
	}},
	{"MessagingClient.CloudTemplates.Retrieve", "GET", "/messaging/s/templates/welcome", "language=fr", "", `{"success":true,"data":{"id":"t","tenantId":"team","session":"s","wabaId":"waba","name":"welcome","language":"fr","category":"UTILITY","status":"PENDING","components":[],"createdAt":"today","updatedAt":"today"}}`, "data.language", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudTemplates().Retrieve(ctx, "s", "welcome", "fr"))
	}},
	{"MessagingClient.CloudTemplates.Create", "POST", "/messaging/s/templates", "", `{"name":"welcome","language":"en_US","category":"UTILITY","components":[{"type":"BODY","text":"Hello"}]}`, `{"success":true,"data":{"id":"t","tenantId":"team","session":"s","wabaId":"waba","name":"welcome","language":"en_US","category":"UTILITY","status":"PENDING","components":[{"type":"BODY","text":"Hello"}],"createdAt":"today","updatedAt":"today"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudTemplates().Create(ctx, "s", CreateCloudTemplateRequest{"welcome", "en_US", "UTILITY", []json.RawMessage{json.RawMessage(`{"type":"BODY","text":"Hello"}`)}}))
	}},
	{"MessagingClient.CloudTemplates.Update", "PATCH", "/messaging/s/templates/welcome", "language=en_US", `{"components":[]}`, `{"success":true,"data":{"accepted":true,"name":"welcome","language":"en_US"}}`, "data.accepted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudTemplates().Update(ctx, "s", "welcome", "en_US", EditCloudTemplateRequest{[]json.RawMessage{}}))
	}},
	{"MessagingClient.CloudTemplates.Delete", "DELETE", "/messaging/s/templates/welcome", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudTemplates().Delete(ctx, "s", "welcome"))
	}},
}
