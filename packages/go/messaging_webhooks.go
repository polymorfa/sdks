package polymorfa

import "context"

type WebhookRetryConfig struct {
	Attempts     int    `json:"attempts"`
	DelaySeconds int    `json:"delaySeconds"`
	Policy       string `json:"policy"`
}
type WebhookHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type MessagingWebhook struct {
	ID        string             `json:"id"`
	TenantID  string             `json:"tenantId"`
	Session   string             `json:"session,omitempty"`
	URL       string             `json:"url"`
	Events    []string           `json:"events"`
	Retries   WebhookRetryConfig `json:"retries"`
	Headers   []WebhookHeader    `json:"headers"`
	Enabled   bool               `json:"enabled"`
	Format    string             `json:"format,omitempty"`
	CreatedAt string             `json:"createdAt"`
}
type CreateMessagingWebhookRequest struct {
	Session string              `json:"session,omitempty"`
	URL     string              `json:"url"`
	Events  *[]string           `json:"events,omitempty"`
	HMACKey string              `json:"hmacKey,omitempty"`
	Retries *WebhookRetryConfig `json:"retries,omitempty"`
	Headers *[]WebhookHeader    `json:"headers,omitempty"`
	Format  string              `json:"format,omitempty"`
}

func (CreateMessagingWebhookRequest) String() string {
	return "CreateMessagingWebhookRequest{[redacted]}"
}
func (b CreateMessagingWebhookRequest) GoString() string { return b.String() }

type UpdateMessagingWebhookRequest struct {
	URL     *string             `json:"url,omitempty"`
	Events  *[]string           `json:"events,omitempty"`
	HMACKey *string             `json:"hmacKey,omitempty"`
	Retries *WebhookRetryConfig `json:"retries,omitempty"`
	Headers *[]WebhookHeader    `json:"headers,omitempty"`
	Enabled *bool               `json:"enabled,omitempty"`
	Format  string              `json:"format,omitempty"`
}

func (UpdateMessagingWebhookRequest) String() string {
	return "UpdateMessagingWebhookRequest{[redacted]}"
}
func (b UpdateMessagingWebhookRequest) GoString() string { return b.String() }

type MessagingWebhooks struct{ t *transport }

func (c *MessagingClient) Webhooks() *MessagingWebhooks { return &MessagingWebhooks{c.t} }
func (r *MessagingWebhooks) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]MessagingWebhook]], error) {
	return request[Envelope[[]MessagingWebhook]](ctx, r.t, "GET", "/messaging/webhooks", nil, nil, options(o))
}
func (r *MessagingWebhooks) Create(ctx context.Context, b CreateMessagingWebhookRequest, o ...RequestOptions) (Response[Envelope[MessagingWebhook]], error) {
	return request[Envelope[MessagingWebhook]](ctx, r.t, "POST", "/messaging/webhooks", nil, b, options(o))
}
func (r *MessagingWebhooks) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[MessagingWebhook]], error) {
	return request[Envelope[MessagingWebhook]](ctx, r.t, "GET", "/messaging/webhooks/"+escaped(id), nil, nil, options(o))
}
func (r *MessagingWebhooks) Update(ctx context.Context, id string, b UpdateMessagingWebhookRequest, o ...RequestOptions) (Response[Envelope[MessagingWebhook]], error) {
	return request[Envelope[MessagingWebhook]](ctx, r.t, "PUT", "/messaging/webhooks/"+escaped(id), nil, b, options(o))
}
func (r *MessagingWebhooks) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", "/messaging/webhooks/"+escaped(id), nil, nil, options(o))
}
