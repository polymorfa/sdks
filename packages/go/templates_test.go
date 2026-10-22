package polymorfa

import "context"

const projectTemplateFixture = `{"data":{"id":"template","name":"Greeting","category":"UTILITY","language":"en","status":"draft","kind":"standard","definition":{"version":1,"kind":"standard","category":"UTILITY","language":"en","header":{"format":"image","example":"https://example.com/image"},"body":"Hi {{name}}","variables":[{"name":"name","type":"text","example":"Alice"}]},"sampleValues":{"name":"Alice"},"cloudLinks":[],"createdAt":123,"updatedAt":123}}`

var templateFixtures = []operationFixture{
	{"MessagingClient.Templates.List", "GET", "/messaging/projects/project/templates", "", "", `{"data":[{"id":"template","name":"Greeting","category":"UTILITY","language":"en","status":"draft","kind":"standard","cloudLinks":[],"createdAt":123,"updatedAt":123}]}`, "data.0.category", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Templates().List(ctx, "project"))
	}},
	{"MessagingClient.Templates.Create", "POST", "/messaging/projects/project/templates", "", `{"name":"Greeting","definition":{"version":1,"kind":"standard","category":"UTILITY","language":"en","header":{"format":"image","example":"https://example.com/image"},"body":"Hi {{name}}","variables":[{"name":"name","type":"text","example":"Alice"}]}}`, projectTemplateFixture, "data.definition.header.example", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		image := "https://example.com/image"
		return wireData(m.Templates().Create(ctx, "project", CreateProjectTemplateRequest{Name: "Greeting", Definition: TemplateDefinition{Version: 1, Kind: "standard", Category: "UTILITY", Language: "en", Header: &TemplateHeader{Format: "image", Example: &TemplateHeaderExample{Media: &image}}, Body: "Hi {{name}}", Variables: []TemplateVariable{{Name: "name", Type: "text", Example: "Alice"}}}}))
	}},
	{"MessagingClient.Templates.Retrieve", "GET", "/messaging/projects/project/templates/template", "", "", projectTemplateFixture, "data.sampleValues.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Templates().Retrieve(ctx, "project", "template"))
	}},
	{"MessagingClient.Templates.Update", "PATCH", "/messaging/projects/project/templates/template", "", `{"name":"Updated","sampleValues":{}}`, projectTemplateFixture, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := "Updated"
		values := map[string]string{}
		return wireData(m.Templates().Update(ctx, "project", "template", UpdateProjectTemplateRequest{Name: &v, SampleValues: &values}))
	}},
	{"MessagingClient.Templates.Delete", "DELETE", "/messaging/projects/project/templates/template", "", "", `{"success":true,"message":"Removed"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Templates().Delete(ctx, "project", "template"))
	}},
	{"MessagingClient.Templates.Preview", "POST", "/messaging/projects/project/templates/template/preview", "", `{"values":{"name":"Alice"},"surface":"sandbox"}`, `{"data":{"text":"Hi Alice","surface":"sandbox"}}`, "data.text", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Templates().Preview(ctx, "project", "template", PreviewProjectTemplateRequest{Values: map[string]string{"name": "Alice"}, Surface: "sandbox"}))
	}},
	{"MessagingClient.Templates.Submit", "POST", "/messaging/projects/project/templates/template/submit", "", `{"session":"s"}`, `{"data":{"submitted":true,"providerId":"provider"}}`, "data.providerId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Templates().Submit(ctx, "project", "template", SubmitProjectTemplateRequest{Session: "s"}))
	}},
}
