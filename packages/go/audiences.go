package polymorfa

import (
	"context"
	"encoding/json"
)

// CampaignVariable is a JSON string, number or boolean, as the API accepts.
type CampaignVariable = UsageDimension
type CampaignRecipientInput struct {
	Phone     string                      `json:"phone"`
	Variables map[string]CampaignVariable `json:"variables,omitempty"`
}
type InvalidRecipientRow struct {
	Row    int    `json:"row"`
	Reason string `json:"reason"`
}
type AudienceImportMapping struct {
	Phone     string            `json:"phone"`
	Variables map[string]string `json:"variables,omitempty"`
}
type CreateAudienceRequest struct {
	Name    string                    `json:"name"`
	Source  string                    `json:"source,omitempty"`
	Members *[]CampaignRecipientInput `json:"members,omitempty"`
	FileID  string                    `json:"fileId,omitempty"`
	Mapping *AudienceImportMapping    `json:"mapping,omitempty"`
}
type Audience struct {
	ID             string                     `json:"id"`
	Name           string                     `json:"name"`
	Source         string                     `json:"source"`
	RecipientCount int                        `json:"recipientCount"`
	FileID         *string                    `json:"fileId"`
	Columns        *[]string                  `json:"columns"`
	SampleRow      map[string]string          `json:"sampleRow"`
	Mapping        map[string]json.RawMessage `json:"mapping"`
	CreatedAt      int64                      `json:"createdAt"`
	UpdatedAt      int64                      `json:"updatedAt"`
}
type AudienceImportResult struct {
	Audience
	DuplicateCount int                   `json:"duplicateCount"`
	InvalidCount   int                   `json:"invalidCount"`
	InvalidRows    []InvalidRecipientRow `json:"invalidRows"`
}
type AudienceMember struct {
	ID        string            `json:"id"`
	Phone     string            `json:"phone"`
	Variables map[string]string `json:"variables"`
	CreatedAt int64             `json:"createdAt"`
}
type CursorEnvelope[T any] struct {
	Data []T `json:"data"`
	Page struct {
		NextCursor *string `json:"nextCursor"`
		HasMore    bool    `json:"hasMore"`
	} `json:"page"`
}
type AddAudienceMembersRequest struct {
	Members []CampaignRecipientInput `json:"members"`
}
type AddAudienceMembersResult struct {
	ListID         string                `json:"listId"`
	Added          int                   `json:"added"`
	RecipientCount int                   `json:"recipientCount"`
	DuplicateCount int                   `json:"duplicateCount"`
	InvalidCount   int                   `json:"invalidCount"`
	InvalidRows    []InvalidRecipientRow `json:"invalidRows"`
}
type DeleteAudienceMemberResult struct {
	Removed        bool   `json:"removed"`
	ListID         string `json:"listId"`
	Phone          string `json:"phone"`
	RecipientCount int    `json:"recipientCount"`
}
type Audiences struct{ t *transport }

func (c *OrganizationClient) Audiences() *Audiences { return &Audiences{c.t} }
func audiencePath(id string) string                 { return "/platform/audiences/" + escaped(id) }

// List, Retrieve, Delete and CreateUpload preserve the TypeScript contract's
// open PlatformPayload response. Import/member operations have closed schemas.
func (r *Audiences) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "GET", "/platform/audiences", nil, nil, options(o))
}
func (r *Audiences) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "GET", audiencePath(id), nil, nil, options(o))
}
func (r *Audiences) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "DELETE", audiencePath(id), nil, nil, options(o))
}
func (r *Audiences) CreateUpload(ctx context.Context, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", "/platform/audiences/uploads", nil, b, options(o))
}
func (r *Audiences) Create(ctx context.Context, b CreateAudienceRequest, o ...RequestOptions) (Response[Envelope[AudienceImportResult]], error) {
	if b.FileID != "" && (b.Mapping == nil || b.Members != nil) || b.FileID == "" && b.Mapping != nil {
		return Response[Envelope[AudienceImportResult]]{}, validation("Use inline members or a fileId with mapping.")
	}
	return request[Envelope[AudienceImportResult]](ctx, r.t, "POST", "/platform/audiences", nil, b, options(o))
}
func (r *Audiences) ListMembers(ctx context.Context, id string, p ListParams, o ...RequestOptions) (Response[CursorEnvelope[AudienceMember]], error) {
	return request[CursorEnvelope[AudienceMember]](ctx, r.t, "GET", audiencePath(id)+"/members", p.query(), nil, options(o))
}
func (r *Audiences) AddMembers(ctx context.Context, id string, b AddAudienceMembersRequest, opts ...RequestOptions) (Response[Envelope[AddAudienceMembersResult]], error) {
	o := options(opts)
	if o.MaxNetworkRetries == nil {
		zero := 0
		o.MaxNetworkRetries = &zero
	}
	return request[Envelope[AddAudienceMembersResult]](ctx, r.t, "POST", audiencePath(id)+"/members", nil, b, o)
}
func (r *Audiences) DeleteMember(ctx context.Context, id, phone string, o ...RequestOptions) (Response[Envelope[DeleteAudienceMemberResult]], error) {
	return request[Envelope[DeleteAudienceMemberResult]](ctx, r.t, "DELETE", audiencePath(id)+"/members/"+escaped(phone), nil, nil, options(o))
}
