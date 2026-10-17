package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
)

// MessagingClient accepts an organization API key, project token, or scoped
// client token. Resource-specific restrictions are enforced before HTTP.
type MessagingClient struct{ t *transport }

func NewMessagingClient(c Config) (*MessagingClient, error) {
	if err := validateCredential(c.Credential, true); err != nil {
		return nil, err
	}
	t, err := newTransport(c, true)
	if err != nil {
		return nil, err
	}
	return &MessagingClient{t}, nil
}
func (c *MessagingClient) Sessions() *MessagingSessions { return &MessagingSessions{c.t} }
func (c *MessagingClient) QuickLinks() *QuickLinks      { return &QuickLinks{c.t} }
func (c *MessagingClient) Messages() *Messages          { return &Messages{c.t} }
func (c *MessagingClient) ClientTokens() *ClientTokens  { return &ClientTokens{c.t} }
func (c *MessagingClient) VoIP() *VoIP                  { return &VoIP{c.t} }
func (c *MessagingClient) Media() *MessagingMedia       { return &MessagingMedia{c.t} }
func (c *MessagingClient) Chats() *Chats                { return &Chats{c.t} }
func serverOnly(t *transport) error {
	if t.config.Credential.Kind == ClientToken {
		return configuration("credential", "This operation requires an organization API key or project token.")
	}
	return nil
}

// OrganizationClient owns the team control plane. Project creates a separate,
// immutable view using the same configuration and HTTP transport.
type OrganizationClient struct{ t *transport }
type ProjectClient struct {
	t         *transport
	projectID string
}

func NewOrganizationClient(c Config) (*OrganizationClient, error) {
	if c.Credential.Kind != OrganizationAPIKey {
		return nil, configuration("credential", "Organization clients require an organization API key.")
	}
	if err := validateCredential(c.Credential, false); err != nil {
		return nil, err
	}
	t, err := newTransport(c, true)
	if err != nil {
		return nil, err
	}
	return &OrganizationClient{t}, nil
}
func NewProjectClient(c Config, projectID string) (*ProjectClient, error) {
	if err := validateCredential(c.Credential, false); err != nil {
		return nil, err
	}
	if err := validateProjectID(projectID); err != nil {
		return nil, err
	}
	t, err := newTransport(c, true)
	if err != nil {
		return nil, err
	}
	return &ProjectClient{t, projectID}, nil
}
func validateProjectID(id string) error {
	if strings.TrimSpace(id) == "" {
		return configuration("projectId", "projectId must be non-empty.")
	}
	return nil
}
func (c *OrganizationClient) Project(id string) (*ProjectClient, error) {
	if err := validateProjectID(id); err != nil {
		return nil, err
	}
	return &ProjectClient{c.t, id}, nil
}
func (c *ProjectClient) Project(id string) (*ProjectClient, error) {
	if err := validateProjectID(id); err != nil {
		return nil, err
	}
	if c.t.config.Credential.Kind == ProjectToken && id != c.projectID {
		return nil, configuration("projectId", "A project token cannot be rebound to another project.")
	}
	return &ProjectClient{c.t, id}, nil
}
func (c *ProjectClient) ProjectID() string            { return c.projectID }
func (c *ProjectClient) prefix() string               { return "/platform/projects/" + escaped(c.projectID) }
func (c *OrganizationClient) Projects() *Projects     { return &Projects{c.t} }
func (c *OrganizationClient) Events() *Events         { return &Events{c.t, "/platform"} }
func (c *ProjectClient) Events() *Events              { return &Events{c.t, c.prefix()} }
func (c *OrganizationClient) Webhooks() *Webhooks     { return &Webhooks{c.t, "/platform"} }
func (c *ProjectClient) Webhooks() *Webhooks          { return &Webhooks{c.t, c.prefix()} }
func (c *OrganizationClient) Operations() *Operations { return &Operations{c.t, "/platform"} }
func (c *ProjectClient) Operations() *Operations      { return &Operations{c.t, c.prefix()} }
func (c *OrganizationClient) WebhookDeliveries() *WebhookDeliveries {
	return &WebhookDeliveries{c.t, "/platform"}
}
func (c *ProjectClient) WebhookDeliveries() *WebhookDeliveries {
	return &WebhookDeliveries{c.t, c.prefix()}
}
func (c *OrganizationClient) Raw(ctx context.Context, r RawRequest) (RawResponse, error) {
	return raw(ctx, c.t, r)
}
func (c *MessagingClient) Raw(ctx context.Context, r RawRequest) (RawResponse, error) {
	return raw(ctx, c.t, r)
}
func (c *ProjectClient) Raw(ctx context.Context, r RawRequest) (RawResponse, error) {
	decoded, err := url.PathUnescape(r.Path)
	if err != nil || !strings.HasPrefix(r.Path, "/") || strings.HasPrefix(r.Path, "//") || strings.ContainsAny(r.Path, "\\?#") || strings.HasPrefix(decoded, "/platform/projects/") {
		return RawResponse{}, validation("Project raw paths must be relative to the bound project.")
	}
	for name := range r.Options.Headers {
		if strings.EqualFold(name, "Authorization") {
			return RawResponse{}, validation("Project raw requests cannot override Authorization.")
		}
	}
	r.Path = c.prefix() + r.Path
	return raw(ctx, c.t, r)
}
func raw(ctx context.Context, t *transport, r RawRequest) (RawResponse, error) {
	return request[json.RawMessage](ctx, t, r.Method, r.Path, r.Query, r.Body, r.Options)
}
