package polymorfa

import (
	"context"
	"net/url"
)

type Organization struct {
	ID                       string  `json:"id"`
	ExternalID               string  `json:"externalId"`
	Name                     string  `json:"name"`
	Slug                     *string `json:"slug"`
	Email                    string  `json:"email"`
	Timezone                 *string `json:"timezone"`
	CreditBalanceCents       float64 `json:"creditBalanceCents"`
	LowBalanceThresholdCents float64 `json:"lowBalanceThresholdCents"`
	BillingEmail             string  `json:"billingEmail"`
	Status                   string  `json:"status"`
	Plan                     string  `json:"plan"`
	PlanStatus               string  `json:"planStatus"`
	IsActive                 bool    `json:"isActive"`
	CreatedAt                int64   `json:"createdAt"`
	UpdatedAt                int64   `json:"updatedAt"`
}
type Organizations struct{ t *transport }

func (c *OrganizationClient) Organizations() *Organizations { return &Organizations{c.t} }
func (r *Organizations) Retrieve(ctx context.Context, o ...RequestOptions) (Response[Envelope[Organization]], error) {
	return request[Envelope[Organization]](ctx, r.t, "GET", "/platform/team", nil, nil, options(o))
}

type OrganizationMember struct {
	ID           string  `json:"_id"`
	CreationTime float64 `json:"_creationTime"`
	OrgID        string  `json:"orgId"`
	UserID       string  `json:"userId"`
	Email        string  `json:"email"`
	Name         *string `json:"name"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	InvitedAt    *int64  `json:"invitedAt"`
	JoinedAt     *int64  `json:"joinedAt"`
}
type Members struct{ t *transport }

func (c *OrganizationClient) Members() *Members { return &Members{c.t} }
func (r *Members) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]OrganizationMember]], error) {
	return request[Envelope[[]OrganizationMember]](ctx, r.t, "GET", "/platform/members", nil, nil, options(o))
}

type APIKeyRecord struct {
	ID           string  `json:"id"`
	StorageID    string  `json:"_id"`
	CreationTime float64 `json:"_creationTime"`
	KeyID        string  `json:"keyId"`
	Start        string  `json:"start"`
	Last4        string  `json:"last4"`
	OrgID        string  `json:"orgId"`
	Label        string  `json:"label"`
	Scopes       int64   `json:"scopes"`
	Source       string  `json:"source"`
	ExpiresAt    *int64  `json:"expiresAt"`
	LastUsed     *int64  `json:"lastUsed,omitempty"`
	IsActive     bool    `json:"isActive"`
}
type APIKeyDeactivation struct {
	OK    bool   `json:"ok"`
	KeyID string `json:"keyId"`
}
type APIKeys struct{ t *transport }

func (c *OrganizationClient) APIKeys() *APIKeys { return &APIKeys{c.t} }
func (r *APIKeys) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]APIKeyRecord]], error) {
	return request[Envelope[[]APIKeyRecord]](ctx, r.t, "GET", "/platform/keys", nil, nil, options(o))
}
func (r *APIKeys) Deactivate(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[APIKeyDeactivation]], error) {
	return request[Envelope[APIKeyDeactivation]](ctx, r.t, "DELETE", "/platform/keys/"+escaped(id), nil, nil, options(o))
}

type ProjectTokenRecord struct {
	ID         string  `json:"id"`
	Start      string  `json:"start"`
	Last4      string  `json:"last4"`
	Label      *string `json:"label"`
	Scopes     int64   `json:"scopes"`
	ExpiresAt  *int64  `json:"expiresAt"`
	CreatedAt  int64   `json:"createdAt"`
	LastUsedAt *int64  `json:"lastUsedAt"`
	RevokedAt  *int64  `json:"revokedAt"`
}
type ProjectTokens struct{ t *transport }

func (c *OrganizationClient) ProjectTokens() *ProjectTokens { return &ProjectTokens{c.t} }
func (r *ProjectTokens) List(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[[]ProjectTokenRecord]], error) {
	return request[Envelope[[]ProjectTokenRecord]](ctx, r.t, "GET", "/platform/tokens", url.Values{"projectId": {id}}, nil, options(o))
}
