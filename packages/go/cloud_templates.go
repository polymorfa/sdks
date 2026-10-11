package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

type CloudTemplate struct {
	ID              string            `json:"id"`
	TenantID        string            `json:"tenantId"`
	Session         string            `json:"session"`
	WABAID          string            `json:"wabaId"`
	Name            string            `json:"name"`
	Language        string            `json:"language"`
	Category        string            `json:"category"`
	Status          string            `json:"status"`
	Components      []json.RawMessage `json:"components"`
	MetaTemplateID  string            `json:"metaTemplateId,omitempty"`
	RejectionReason string            `json:"rejectionReason,omitempty"`
	QualityScore    string            `json:"qualityScore,omitempty"`
	CreatedAt       string            `json:"createdAt"`
	UpdatedAt       string            `json:"updatedAt"`
}
type CreateCloudTemplateRequest struct {
	Name       string            `json:"name"`
	Language   string            `json:"language"`
	Category   string            `json:"category"`
	Components []json.RawMessage `json:"components"`
}
type EditCloudTemplateRequest struct {
	Components []json.RawMessage `json:"components"`
}
type EditCloudTemplateResult struct {
	Accepted bool   `json:"accepted"`
	Name     string `json:"name"`
	Language string `json:"language"`
}
type CloudTemplates struct{ t *transport }

func (c *MessagingClient) CloudTemplates() *CloudTemplates { return &CloudTemplates{c.t} }
func cloudTemplatesPath(s string) string                   { return messagingPath(s) + "/templates" }
func (r *CloudTemplates) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[[]CloudTemplate]], error) {
	return serverRead[[]CloudTemplate](ctx, r.t, cloudTemplatesPath(s), nil, options(o))
}
func (r *CloudTemplates) Retrieve(ctx context.Context, s, name, language string, o ...RequestOptions) (Response[Envelope[CloudTemplate]], error) {
	q := url.Values{}
	setString(q, "language", language)
	return serverRead[CloudTemplate](ctx, r.t, cloudTemplatesPath(s)+"/"+escaped(name), q, options(o))
}
func (r *CloudTemplates) Create(ctx context.Context, s string, b CreateCloudTemplateRequest, o ...RequestOptions) (Response[Envelope[CloudTemplate]], error) {
	return serverWriteOnce[CloudTemplate](ctx, r.t, "POST", cloudTemplatesPath(s), b, options(o))
}
func (r *CloudTemplates) Update(ctx context.Context, s, name, language string, b EditCloudTemplateRequest, o ...RequestOptions) (Response[Envelope[EditCloudTemplateResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[EditCloudTemplateResult]]{}, err
	}
	q := url.Values{}
	setString(q, "language", language)
	return request[Envelope[EditCloudTemplateResult]](ctx, r.t, "PATCH", cloudTemplatesPath(s)+"/"+escaped(name), q, b, noRetry(options(o)))
}
func (r *CloudTemplates) Delete(ctx context.Context, s, name string, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "DELETE", cloudTemplatesPath(s)+"/"+escaped(name), nil, nil, noRetry(options(o)))
}
