package polymorfa

import (
	"context"
	"net/url"
)

type Customer struct {
	ID                 string  `json:"id"`
	OrgID              string  `json:"orgId"`
	ProjectID          string  `json:"projectId"`
	Name               *string `json:"name"`
	ExternalCustomerID *string `json:"externalCustomerId"`
	Status             string  `json:"status"`
	IsDefault          bool    `json:"isDefault"`
	ArchivedAt         *int64  `json:"archivedAt"`
	CreatedAt          int64   `json:"createdAt"`
	UpdatedAt          int64   `json:"updatedAt"`
}
type CustomerSummary struct {
	Customer
	NumberCount            int     `json:"numberCount"`
	ConnectedNumberCount   int     `json:"connectedNumberCount"`
	ActivePairingLinkState *string `json:"activePairingLinkState"`
	LastActivityAt         *int64  `json:"lastActivityAt"`
	NeedsAttention         bool    `json:"needsAttention"`
}
type CustomersStatus struct {
	Enabled         bool      `json:"enabled"`
	EnabledAt       *int64    `json:"enabledAt"`
	EnabledBy       *string   `json:"enabledBy"`
	DefaultCustomer *Customer `json:"defaultCustomer"`
}
type CustomersEnablement struct {
	CustomersStatus
	MigratedNumberCount int `json:"migratedNumberCount"`
}
type CustomerProjectRequest struct {
	ProjectID string `json:"projectId,omitempty"`
}
type CreateCustomerRequest struct {
	ProjectID          string            `json:"projectId,omitempty"`
	Name               *Nullable[string] `json:"name,omitempty"`
	ExternalCustomerID *Nullable[string] `json:"externalCustomerId,omitempty"`
}
type UpdateCustomerRequest = CreateCustomerRequest
type ListCustomersParams struct {
	ProjectID string
	ListParams
	Search, Status                        string
	IsDefault, HasNumbers, NeedsAttention *bool
}
type CustomerNumber struct {
	ID          string  `json:"id"`
	CustomerID  string  `json:"customerId"`
	SessionID   string  `json:"sessionId"`
	Name        *string `json:"name"`
	PhoneMasked *string `json:"phoneMasked"`
	Status      string  `json:"status"`
	Backend     *string `json:"backend"`
	CreatedAt   int64   `json:"createdAt"`
}
type CustomerEventMetadata struct {
	Fields []string `json:"fields,omitempty"`
}
type CustomerEvent struct {
	ID            string                `json:"id"`
	Action        string                `json:"action"`
	FromStatus    *string               `json:"fromStatus"`
	ToStatus      *string               `json:"toStatus"`
	SessionID     *string               `json:"sessionId"`
	PairingLinkID *string               `json:"pairingLinkId"`
	Metadata      CustomerEventMetadata `json:"metadata"`
	OccurredAt    int64                 `json:"occurredAt"`
}
type CustomerPairingLink struct {
	ID                  string   `json:"id"`
	OrgID               string   `json:"orgId"`
	ProjectID           string   `json:"projectId"`
	CustomerID          string   `json:"customerId"`
	ExpectedPhoneMasked *string  `json:"expectedPhoneMasked"`
	Methods             []string `json:"methods"`
	Locale              *string  `json:"locale"`
	Theme               *string  `json:"theme"`
	ExpiresAt           int64    `json:"expiresAt"`
	Status              string   `json:"status"`
	AttemptCount        int      `json:"attemptCount"`
	MaxAttempts         int      `json:"maxAttempts"`
	PendingSessionID    *string  `json:"pendingSessionId"`
	CreatedBy           *string  `json:"createdBy"`
	ReservedAt          *int64   `json:"reservedAt"`
	OpenedAt            *int64   `json:"openedAt"`
	ConnectingAt        *int64   `json:"connectingAt"`
	ConnectedAt         *int64   `json:"connectedAt"`
	FailedAt            *int64   `json:"failedAt"`
	ExpiredAt           *int64   `json:"expiredAt"`
	RevokedAt           *int64   `json:"revokedAt"`
	LastErrorCode       *string  `json:"lastErrorCode"`
	FailedExchangeCount int      `json:"failedExchangeCount"`
	PhoneMismatchCount  int      `json:"phoneMismatchCount"`
	CreatedAt           int64    `json:"createdAt"`
	UpdatedAt           int64    `json:"updatedAt"`
}
type CreatedCustomerPairingLink struct {
	CustomerPairingLink
	URL *string `json:"url"`
}
type CreateCustomerPairingLinkRequest struct {
	ProjectID        string            `json:"projectId,omitempty"`
	ExpectedPhone    *Nullable[string] `json:"expectedPhone,omitempty"`
	Methods          *[]string         `json:"methods,omitempty"`
	ExpiresInSeconds *int              `json:"expiresInSeconds,omitempty"`
}
type ListCustomerEventsParams struct {
	ProjectID string
	Limit     int
}
type TransferCustomerNumberRequest struct {
	ProjectID        string `json:"projectId"`
	SourceCustomerID string `json:"sourceCustomerId"`
	Confirm          bool   `json:"confirm"`
}
type Customers struct{ t *transport }

func (c *OrganizationClient) Customers() *Customers { return &Customers{c.t} }
func customerPath(id string) string                 { return "/platform/customers/" + escaped(id) }
func projectCustomersPath(id string) string {
	return "/platform/projects/" + escaped(id) + "/customers"
}
func (r *Customers) Status(ctx context.Context, project string, o ...RequestOptions) (Response[Envelope[CustomersStatus]], error) {
	return request[Envelope[CustomersStatus]](ctx, r.t, "GET", projectCustomersPath(project)+"/status", nil, nil, options(o))
}
func (r *Customers) Enable(ctx context.Context, project string, o ...RequestOptions) (Response[Envelope[CustomersEnablement]], error) {
	return request[Envelope[CustomersEnablement]](ctx, r.t, "POST", projectCustomersPath(project)+"/enable", nil, nil, options(o))
}
func (r *Customers) List(ctx context.Context, p ListCustomersParams, o ...RequestOptions) (Response[CursorEnvelope[CustomerSummary]], error) {
	q := p.ListParams.query()
	q.Set("projectId", p.ProjectID)
	setString(q, "search", p.Search)
	setString(q, "status", p.Status)
	setBool(q, "isDefault", p.IsDefault)
	setBool(q, "hasNumbers", p.HasNumbers)
	setBool(q, "needsAttention", p.NeedsAttention)
	return request[CursorEnvelope[CustomerSummary]](ctx, r.t, "GET", "/platform/customers", q, nil, options(o))
}
func (r *Customers) Create(ctx context.Context, b CreateCustomerRequest, o ...RequestOptions) (Response[Envelope[Customer]], error) {
	return request[Envelope[Customer]](ctx, r.t, "POST", "/platform/customers", nil, b, options(o))
}
func (r *Customers) Retrieve(ctx context.Context, id, project string, o ...RequestOptions) (Response[Envelope[Customer]], error) {
	return request[Envelope[Customer]](ctx, r.t, "GET", customerPath(id), url.Values{"projectId": {project}}, nil, options(o))
}
func (r *Customers) Update(ctx context.Context, id string, b UpdateCustomerRequest, o ...RequestOptions) (Response[Envelope[Customer]], error) {
	return request[Envelope[Customer]](ctx, r.t, "PATCH", customerPath(id), nil, b, options(o))
}
func (r *Customers) Archive(ctx context.Context, id string, b CustomerProjectRequest, o ...RequestOptions) (Response[Envelope[Customer]], error) {
	return request[Envelope[Customer]](ctx, r.t, "POST", customerPath(id)+"/archive", nil, b, options(o))
}
func (r *Customers) Restore(ctx context.Context, id string, b CustomerProjectRequest, o ...RequestOptions) (Response[Envelope[Customer]], error) {
	return request[Envelope[Customer]](ctx, r.t, "POST", customerPath(id)+"/restore", nil, b, options(o))
}
func (r *Customers) ListNumbers(ctx context.Context, id, project string, o ...RequestOptions) (Response[Envelope[[]CustomerNumber]], error) {
	return request[Envelope[[]CustomerNumber]](ctx, r.t, "GET", customerPath(id)+"/numbers", url.Values{"projectId": {project}}, nil, options(o))
}
func (r *Customers) ListEvents(ctx context.Context, id string, p ListCustomerEventsParams, o ...RequestOptions) (Response[Envelope[[]CustomerEvent]], error) {
	q := url.Values{"projectId": {p.ProjectID}}
	setInt(q, "limit", p.Limit)
	return request[Envelope[[]CustomerEvent]](ctx, r.t, "GET", customerPath(id)+"/events", q, nil, options(o))
}
func (r *Customers) CreatePairingLink(ctx context.Context, id string, b CreateCustomerPairingLinkRequest, o ...RequestOptions) (Response[Envelope[CreatedCustomerPairingLink]], error) {
	return request[Envelope[CreatedCustomerPairingLink]](ctx, r.t, "POST", customerPath(id)+"/pairing-links", nil, b, options(o))
}
func (r *Customers) ListPairingLinks(ctx context.Context, id, project string, o ...RequestOptions) (Response[Envelope[[]CustomerPairingLink]], error) {
	return request[Envelope[[]CustomerPairingLink]](ctx, r.t, "GET", customerPath(id)+"/pairing-links", url.Values{"projectId": {project}}, nil, options(o))
}
func (r *Customers) RevokePairingLink(ctx context.Context, id, link, project string, o ...RequestOptions) (Response[Envelope[CustomerPairingLink]], error) {
	return request[Envelope[CustomerPairingLink]](ctx, r.t, "DELETE", customerPath(id)+"/pairing-links/"+escaped(link), url.Values{"projectId": {project}}, nil, options(o))
}
func (r *Customers) TransferNumber(ctx context.Context, id, session string, b TransferCustomerNumberRequest, o ...RequestOptions) (Response[Envelope[CustomerNumber]], error) {
	if !b.Confirm {
		return Response[Envelope[CustomerNumber]]{}, validation("Number transfer requires confirm:true.")
	}
	return request[Envelope[CustomerNumber]](ctx, r.t, "POST", customerPath(id)+"/numbers/"+escaped(session)+"/transfer", nil, b, options(o))
}
