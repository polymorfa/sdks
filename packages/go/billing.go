package polymorfa

import (
	"context"
	"math"
	"net/url"
	"strconv"
	"strings"
)

type BillingCurrency string
type BillingScope string

const (
	BillingProject  BillingScope = "project"
	BillingCustomer BillingScope = "customer"
	BillingNumber   BillingScope = "number"
)

type BillingBalance struct {
	BalanceCents      float64         `json:"balanceCents"`
	PreferredCurrency BillingCurrency `json:"preferredCurrency"`
}
type BillingUsage struct {
	ActiveNumbers     int64   `json:"activeNumbers"`
	TotalChargedCents float64 `json:"totalChargedCents"`
}
type BillingTransaction struct {
	ID                string  `json:"id"`
	AmountCents       float64 `json:"amountCents"`
	BalanceAfterCents float64 `json:"balanceAfterCents"`
	Type              string  `json:"type"`
	Description       string  `json:"description"`
	SessionID         *string `json:"sessionId"`
	ProjectID         *string `json:"projectId"`
	Tier              *string `json:"tier"`
	Currency          *string `json:"currency"`
	PaymentStatus     string  `json:"paymentStatus"`
	CreatedAt         int64   `json:"createdAt"`
}
type TierPricing struct {
	ID             string   `json:"id"`
	Tier           string   `json:"tier"`
	DailyRateCents float64  `json:"dailyRateCents"`
	Label          string   `json:"label"`
	Description    string   `json:"description"`
	Features       []string `json:"features"`
}
type BillingPriority struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Priority int    `json:"priority"`
}
type BillingResourcePriority struct {
	BillingPriority
	ProjectID string `json:"projectId"`
}
type BillingPriorities struct {
	Revision  int64                     `json:"revision"`
	Projects  []BillingPriority         `json:"projects"`
	Customers []BillingResourcePriority `json:"customers"`
	Numbers   []BillingResourcePriority `json:"numbers"`
}
type BillingLimit struct {
	Scope           BillingScope `json:"scope"`
	ResourceID      string       `json:"resourceId"`
	ProjectID       string       `json:"projectId"`
	Name            string       `json:"name"`
	LimitCredits    *float64     `json:"limitCredits"`
	SpentCredits    float64      `json:"spentCredits"`
	ReservedCredits float64      `json:"reservedCredits"`
	Revision        int64        `json:"revision"`
}
type BillingDailyCredits struct {
	Date    string  `json:"date"`
	Credits float64 `json:"credits"`
}
type BillingLimits struct {
	CheckedAt    string                `json:"checkedAt"`
	PeriodStart  string                `json:"periodStart"`
	PeriodEnd    string                `json:"periodEnd"`
	TodayCredits float64               `json:"todayCredits"`
	MonthCredits float64               `json:"monthCredits"`
	Daily        []BillingDailyCredits `json:"daily"`
	Budgets      []BillingLimit        `json:"budgets"`
}
type ResourceBillingControls struct {
	Budget           BillingLimit `json:"budget"`
	Priority         int          `json:"priority"`
	PriorityRevision int64        `json:"priorityRevision"`
}
type BillingReadParams struct {
	ProjectID string
	Scope     string
}
type SetResourceBillingControlsRequest struct {
	LimitCredits             *float64 `json:"limitCredits"`
	Priority                 int      `json:"priority"`
	ExpectedBudgetRevision   int64    `json:"expectedBudgetRevision"`
	ExpectedPriorityRevision int64    `json:"expectedPriorityRevision"`
}
type SetBillingLimitRequest struct {
	LimitCredits     *float64 `json:"limitCredits"`
	ExpectedRevision int64    `json:"expectedRevision"`
}
type SetBillingPriorityRequest struct {
	Priority         int   `json:"priority"`
	ExpectedRevision int64 `json:"expectedRevision"`
}
type BillingSavedResult struct {
	Saved bool `json:"saved"`
}
type BillingReorderResource struct {
	Scope      BillingScope `json:"scope"`
	ResourceID string       `json:"resourceId"`
}
type ReorderBillingPrioritiesRequest struct {
	Scope            string                    `json:"scope"`
	ProjectID        string                    `json:"projectId,omitempty"`
	ResourceIDs      *[]string                 `json:"resourceIds,omitempty"`
	Resources        *[]BillingReorderResource `json:"resources,omitempty"`
	ExpectedRevision int64                     `json:"expectedRevision"`
}
type Billing struct{ t *transport }

func (c *OrganizationClient) Billing() *Billing { return &Billing{c.t} }
func billingInvalid(message string) error {
	return &Error{Kind: ValidationError, Code: "invalid_billing_control", Message: message}
}
func billingID(id string) (string, error) {
	id = strings.ToLower(id)
	if !functionUUID.MatchString(id) {
		return "", billingInvalid("Resource must be a UUID.")
	}
	return id, nil
}
func billingResourcePath(prefix string, scope BillingScope, id string) (string, error) {
	if scope != BillingProject && scope != BillingCustomer && scope != BillingNumber {
		return "", billingInvalid("Scope must be project, customer or number.")
	}
	v, err := billingID(id)
	return "/platform/billing/" + prefix + "/" + string(scope) + "/" + v, err
}
func billingRevision(v int64) error {
	if v < 0 || v > 2147483646 {
		return billingInvalid("Expected revision must be a nonnegative integer.")
	}
	return nil
}
func billingPriority(v int) error {
	if v < 0 || v > 1000000 {
		return billingInvalid("Priority must be from 0 to 1000000.")
	}
	return nil
}
func billingLimit(v *float64) error {
	if v == nil {
		return nil
	}
	text := strconv.FormatFloat(*v, 'f', -1, 64)
	fraction := ""
	if pos := strings.IndexByte(text, '.'); pos >= 0 {
		fraction = text[pos+1:]
	}
	if math.IsNaN(*v) || math.IsInf(*v, 0) || *v < 0 || *v > 1000000 || len(fraction) > 6 {
		return billingInvalid("Limit must be null or 0 to 1000000 credits with at most six decimal places.")
	}
	return nil
}
func billingReadQuery(p BillingReadParams) (url.Values, error) {
	q := url.Values{}
	if p.Scope != "" && p.Scope != "project" {
		return nil, billingInvalid("Read scope must be project.")
	}
	setString(q, "scope", p.Scope)
	if p.ProjectID != "" {
		v, err := billingID(p.ProjectID)
		if err != nil {
			return nil, err
		}
		q.Set("projectId", v)
	}
	return q, nil
}
func (r *Billing) Retrieve(ctx context.Context, o ...RequestOptions) (Response[Envelope[BillingBalance]], error) {
	return request[Envelope[BillingBalance]](ctx, r.t, "GET", "/platform/billing", nil, nil, options(o))
}
func (r *Billing) Usage(ctx context.Context, o ...RequestOptions) (Response[Envelope[BillingUsage]], error) {
	return request[Envelope[BillingUsage]](ctx, r.t, "GET", "/platform/billing/usage", nil, nil, options(o))
}
func (r *Billing) ListTransactions(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]BillingTransaction]], error) {
	return request[Envelope[[]BillingTransaction]](ctx, r.t, "GET", "/platform/billing/transactions", nil, nil, options(o))
}
func (r *Billing) ListPricing(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]TierPricing]], error) {
	return request[Envelope[[]TierPricing]](ctx, r.t, "GET", "/platform/billing/pricing", nil, nil, options(o))
}
func (r *Billing) GetResourceControls(ctx context.Context, scope BillingScope, id string, o ...RequestOptions) (Response[Envelope[ResourceBillingControls]], error) {
	path, err := billingResourcePath("controls", scope, id)
	if err != nil {
		return Response[Envelope[ResourceBillingControls]]{}, err
	}
	return request[Envelope[ResourceBillingControls]](ctx, r.t, "GET", path, nil, nil, options(o))
}
func (r *Billing) SetResourceControls(ctx context.Context, scope BillingScope, id string, b SetResourceBillingControlsRequest, o ...RequestOptions) (Response[Envelope[ResourceBillingControls]], error) {
	path, err := billingResourcePath("controls", scope, id)
	if err == nil {
		err = billingLimit(b.LimitCredits)
	}
	if err == nil {
		err = billingPriority(b.Priority)
	}
	if err == nil {
		err = billingRevision(b.ExpectedBudgetRevision)
	}
	if err == nil {
		err = billingRevision(b.ExpectedPriorityRevision)
	}
	if err != nil {
		return Response[Envelope[ResourceBillingControls]]{}, err
	}
	return request[Envelope[ResourceBillingControls]](ctx, r.t, "PUT", path, nil, b, options(o))
}
func (r *Billing) GetLimits(ctx context.Context, p BillingReadParams, o ...RequestOptions) (Response[Envelope[BillingLimits]], error) {
	q, err := billingReadQuery(p)
	if err != nil {
		return Response[Envelope[BillingLimits]]{}, err
	}
	return request[Envelope[BillingLimits]](ctx, r.t, "GET", "/platform/billing/limits", q, nil, options(o))
}
func (r *Billing) SetLimit(ctx context.Context, scope BillingScope, id string, b SetBillingLimitRequest, o ...RequestOptions) (Response[Envelope[BillingSavedResult]], error) {
	path, err := billingResourcePath("limits", scope, id)
	if err == nil {
		err = billingLimit(b.LimitCredits)
	}
	if err == nil {
		err = billingRevision(b.ExpectedRevision)
	}
	if err != nil {
		return Response[Envelope[BillingSavedResult]]{}, err
	}
	return request[Envelope[BillingSavedResult]](ctx, r.t, "PUT", path, nil, b, options(o))
}
func (r *Billing) GetPriorities(ctx context.Context, p BillingReadParams, o ...RequestOptions) (Response[Envelope[BillingPriorities]], error) {
	q, err := billingReadQuery(p)
	if err != nil {
		return Response[Envelope[BillingPriorities]]{}, err
	}
	return request[Envelope[BillingPriorities]](ctx, r.t, "GET", "/platform/billing/priorities", q, nil, options(o))
}
func (r *Billing) SetPriority(ctx context.Context, scope BillingScope, id string, b SetBillingPriorityRequest, o ...RequestOptions) (Response[Envelope[BillingPriorities]], error) {
	path, err := billingResourcePath("priorities", scope, id)
	if err == nil {
		err = billingPriority(b.Priority)
	}
	if err == nil {
		err = billingRevision(b.ExpectedRevision)
	}
	if err != nil {
		return Response[Envelope[BillingPriorities]]{}, err
	}
	return request[Envelope[BillingPriorities]](ctx, r.t, "PUT", path, nil, b, options(o))
}
func (r *Billing) ReorderPriorities(ctx context.Context, b ReorderBillingPrioritiesRequest, o ...RequestOptions) (Response[Envelope[BillingPriorities]], error) {
	fail := func(err error) (Response[Envelope[BillingPriorities]], error) {
		return Response[Envelope[BillingPriorities]]{}, err
	}
	if err := billingRevision(b.ExpectedRevision); err != nil {
		return fail(err)
	}
	if b.Scope != "project" && b.Scope != "customer" && b.Scope != "number" && b.Scope != "resource" {
		return fail(billingInvalid("Invalid reorder scope."))
	}
	if b.Scope == "project" {
		b.ProjectID = ""
	} else {
		v, err := billingID(b.ProjectID)
		if err != nil {
			return fail(err)
		}
		b.ProjectID = v
	}
	seen := map[string]bool{}
	if b.Scope == "resource" {
		if b.Resources == nil || b.ResourceIDs != nil || len(*b.Resources) > 1000000 {
			return fail(billingInvalid("Resources must be a unique complete list."))
		}
		rows := append([]BillingReorderResource{}, (*b.Resources)...)
		for i, row := range rows {
			if row.Scope != BillingCustomer && row.Scope != BillingNumber {
				return fail(billingInvalid("Resource scope must be customer or number."))
			}
			v, err := billingID(row.ResourceID)
			if err != nil {
				return fail(err)
			}
			key := string(row.Scope) + ":" + v
			if seen[key] {
				return fail(billingInvalid("Resources must be unique."))
			}
			seen[key] = true
			rows[i].ResourceID = v
		}
		b.Resources = &rows
	} else {
		if b.ResourceIDs == nil || b.Resources != nil {
			return fail(billingInvalid("Resource IDs are required."))
		}
		ids := append([]string{}, (*b.ResourceIDs)...)
		for i, id := range ids {
			v, err := billingID(id)
			if err != nil {
				return fail(err)
			}
			if seen[v] {
				return fail(billingInvalid("Resource IDs must not contain duplicates."))
			}
			seen[v] = true
			ids[i] = v
		}
		b.ResourceIDs = &ids
	}
	return request[Envelope[BillingPriorities]](ctx, r.t, "PUT", "/platform/billing/priorities", nil, b, options(o))
}
