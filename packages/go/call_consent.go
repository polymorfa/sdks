package polymorfa

import (
	"context"
	"regexp"
	"strings"
)

type CallRetentionPolicy string

const (
	RetentionShort      CallRetentionPolicy = "short"
	RetentionStandard   CallRetentionPolicy = "standard"
	RetentionExtended   CallRetentionPolicy = "extended"
	RetentionCompliance CallRetentionPolicy = "compliance"
	RetentionCustom     CallRetentionPolicy = "custom"
)

type CallRetention struct {
	Policy        CallRetentionPolicy `json:"policy"`
	RetentionDays int                 `json:"retentionDays"`
	AppliesTo     []string            `json:"appliesTo"`
	Revision      int64               `json:"revision"`
	UpdatedAt     *string             `json:"updatedAt"`
}
type UpdateCallRetentionRequest struct {
	Policy           CallRetentionPolicy `json:"policy"`
	RetentionDays    *int                `json:"retentionDays,omitempty"`
	ExpectedRevision *int64              `json:"expectedRevision,omitempty"`
}
type CallRetentionResource struct{ t *transport }

func (c *OrganizationClient) CallRetention() *CallRetentionResource {
	return &CallRetentionResource{c.t}
}
func (c *ProjectClient) CallRetention() *CallRetentionResource { return &CallRetentionResource{c.t} }

// NewTeamCallRetentionClient accepts an organization or project credential
// without requiring a project ID for the team-wide setting.
func NewTeamCallRetentionClient(c Config) (*CallRetentionResource, error) {
	if err := validateCredential(c.Credential, false); err != nil {
		return nil, err
	}
	t, err := newTransport(c, true)
	if err != nil {
		return nil, err
	}
	return &CallRetentionResource{t}, nil
}
func (r *CallRetentionResource) Retrieve(ctx context.Context, o ...RequestOptions) (Response[CallRetention], error) {
	return unwrapped[CallRetention](ctx, r.t, "GET", "/platform/call-retention", nil, nil, options(o))
}
func (r *CallRetentionResource) Update(ctx context.Context, b UpdateCallRetentionRequest, o ...RequestOptions) (Response[CallRetention], error) {
	return unwrapped[CallRetention](ctx, r.t, "PUT", "/platform/call-retention", nil, b, options(o))
}

type CallPolicy struct {
	BlockedCountryCodes []string `json:"blockedCountryCodes"`
	OptOutCount         int      `json:"optOutCount"`
	Revision            int64    `json:"revision"`
	UpdatedAt           *string  `json:"updatedAt"`
}
type UpdateCallPolicyRequest struct {
	BlockedCountryCodes []string `json:"blockedCountryCodes"`
	ExpectedRevision    *int64   `json:"expectedRevision,omitempty"`
}
type CallPolicyResource struct{ t *transport }

func (c *OrganizationClient) CallPolicy() *CallPolicyResource { return &CallPolicyResource{c.t} }
func (r *CallPolicyResource) Retrieve(ctx context.Context, o ...RequestOptions) (Response[CallPolicy], error) {
	return unwrapped[CallPolicy](ctx, r.t, "GET", "/platform/call-policy", nil, nil, options(o))
}

var countryCodePattern = regexp.MustCompile(`^[1-9][0-9]{0,3}$`)

func (r *CallPolicyResource) Update(ctx context.Context, b UpdateCallPolicyRequest, o ...RequestOptions) (Response[CallPolicy], error) {
	if b.BlockedCountryCodes == nil || len(b.BlockedCountryCodes) > 300 {
		return Response[CallPolicy]{}, validation("blockedCountryCodes must contain at most 300 codes; use an empty array to allow every country.")
	}
	for _, code := range b.BlockedCountryCodes {
		if !countryCodePattern.MatchString(code) {
			return Response[CallPolicy]{}, validation("Each country code must have 1 to 4 digits without +.")
		}
	}
	if b.ExpectedRevision != nil && *b.ExpectedRevision < 0 {
		return Response[CallPolicy]{}, validation("expectedRevision must be non-negative.")
	}
	return unwrapped[CallPolicy](ctx, r.t, "PUT", "/platform/call-policy", nil, b, options(o))
}

type CallOptOut struct {
	ID          string  `json:"id"`
	PhoneNumber *string `json:"phoneNumber"`
	BSUID       *string `json:"bsuid"`
	Note        *string `json:"note"`
	Source      string  `json:"source"`
	CreatedAt   string  `json:"createdAt"`
}
type ListCallOptOutsParams struct {
	ListParams
	PhoneNumber string
	BSUID       string
}
type CreateCallOptOutRequest struct {
	PhoneNumber string `json:"phoneNumber,omitempty"`
	BSUID       string `json:"bsuid,omitempty"`
	Note        string `json:"note,omitempty"`
}
type ImportCallOptOutsRequest struct {
	Entries []CreateCallOptOutRequest `json:"entries"`
}
type CallOptOutRejection struct {
	Index  int    `json:"index"`
	Reason string `json:"reason"`
}
type CallOptOutImportResult struct {
	Added    int                   `json:"added"`
	Existing int                   `json:"existing"`
	Rejected []CallOptOutRejection `json:"rejected"`
}
type CallOptOutDeleted struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}
type CallOptOuts struct{ t *transport }

func (c *OrganizationClient) CallOptOuts() *CallOptOuts { return &CallOptOuts{c.t} }
func (r *CallOptOuts) List(ctx context.Context, p ListCallOptOutsParams, o ...RequestOptions) (*CursorPage[CallOptOut], error) {
	if p.PhoneNumber != "" && p.BSUID != "" {
		return nil, validation("Filter by phoneNumber or bsuid, not both.")
	}
	q := p.query()
	setString(q, "phoneNumber", p.PhoneNumber)
	setString(q, "bsuid", p.BSUID)
	return page[CallOptOut](ctx, r.t, "/platform/call-opt-outs", q, options(o))
}
func (r *CallOptOuts) Create(ctx context.Context, b CreateCallOptOutRequest, o ...RequestOptions) (Response[CallOptOut], error) {
	if (b.PhoneNumber == "") == (b.BSUID == "") {
		return Response[CallOptOut]{}, validation("Supply exactly one of phoneNumber or bsuid.")
	}
	return unwrapped[CallOptOut](ctx, r.t, "POST", "/platform/call-opt-outs", nil, b, options(o))
}
func (r *CallOptOuts) Import(ctx context.Context, b ImportCallOptOutsRequest, o ...RequestOptions) (Response[CallOptOutImportResult], error) {
	if len(b.Entries) < 1 || len(b.Entries) > 5000 {
		return Response[CallOptOutImportResult]{}, validation("entries must hold 1 to 5000 entries.")
	}
	return unwrapped[CallOptOutImportResult](ctx, r.t, "POST", "/platform/call-opt-outs/import", nil, b, options(o))
}
func (r *CallOptOuts) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[CallOptOutDeleted], error) {
	if strings.TrimSpace(id) == "" {
		return Response[CallOptOutDeleted]{}, configuration("optOutId", "A call opt-out id is required.")
	}
	return unwrapped[CallOptOutDeleted](ctx, r.t, "DELETE", "/platform/call-opt-outs/"+escaped(id), nil, nil, options(o))
}
