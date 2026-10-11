package polymorfa

import (
	"context"
	"encoding/json"
	"iter"
	"net/url"
)

type UsageDimension struct {
	String *string
	Number *float64
	Bool   *bool
}

func (d *UsageDimension) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil && string(b) != "null" {
		d.String = &s
		return nil
	}
	var n float64
	if json.Unmarshal(b, &n) == nil && string(b) != "null" {
		d.Number = &n
		return nil
	}
	var v bool
	if json.Unmarshal(b, &v) == nil && string(b) != "null" {
		d.Bool = &v
		return nil
	}
	return validation("Usage dimension must be a string, number or boolean.")
}
func (d UsageDimension) MarshalJSON() ([]byte, error) {
	if d.String != nil {
		return json.Marshal(*d.String)
	}
	if d.Number != nil {
		return json.Marshal(*d.Number)
	}
	if d.Bool != nil {
		return json.Marshal(*d.Bool)
	}
	return nil, validation("Usage dimension must be a string, number or boolean.")
}

type UsageRateCard struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}
type UsageRecord struct {
	ID            string                    `json:"id"`
	Meter         string                    `json:"meter"`
	Quantity      float64                   `json:"quantity"`
	Unit          string                    `json:"unit"`
	Dimensions    map[string]UsageDimension `json:"dimensions"`
	KeySource     string                    `json:"keySource"`
	SourceKind    string                    `json:"sourceKind"`
	SourceID      string                    `json:"sourceId"`
	ProjectID     *string                   `json:"projectId"`
	Session       *string                   `json:"session"`
	OccurredAt    string                    `json:"occurredAt"`
	RecordedAt    string                    `json:"recordedAt"`
	Revision      int64                     `json:"revision"`
	PricingState  string                    `json:"pricingState"`
	RateCard      *UsageRateCard            `json:"rateCard"`
	PricedCredits *float64                  `json:"pricedCredits"`
}
type UsageRecordPage struct {
	Records    []UsageRecord `json:"records"`
	NextCursor *string       `json:"nextCursor"`
}
type UsageMeterTotal struct {
	Meter     string  `json:"meter"`
	Unit      string  `json:"unit"`
	KeySource string  `json:"keySource"`
	Quantity  float64 `json:"quantity"`
	Records   int64   `json:"records"`
}
type UsageNumberTotal struct {
	Session   string            `json:"session"`
	ProjectID *string           `json:"projectId"`
	Meters    []UsageMeterTotal `json:"meters"`
}
type UsageSummary struct {
	Period           string             `json:"period"`
	Start            string             `json:"start"`
	End              string             `json:"end"`
	ProjectID        *string            `json:"projectId"`
	Session          *string            `json:"session"`
	BillingEnabled   bool               `json:"billingEnabled"`
	Meters           []UsageMeterTotal  `json:"meters"`
	Numbers          []UsageNumberTotal `json:"numbers"`
	NumbersTruncated bool               `json:"numbersTruncated"`
}
type UsageGateDecisions struct {
	WouldBlock      int64 `json:"wouldBlock"`
	Blocked         int64 `json:"blocked"`
	EvaluationError int64 `json:"evaluationError"`
}
type UsageGate struct {
	Key       string             `json:"key"`
	Kind      string             `json:"kind"`
	Subject   string             `json:"subject"`
	Mode      string             `json:"mode"`
	Active    bool               `json:"active"`
	Limit     *float64           `json:"limit"`
	Used      *float64           `json:"used"`
	Unit      *string            `json:"unit"`
	OverLimit *bool              `json:"overLimit"`
	Decisions UsageGateDecisions `json:"decisions"`
}
type UsageGateList struct {
	Session *string     `json:"session"`
	Gates   []UsageGate `json:"gates"`
}
type UsageSummaryParams struct {
	ProjectID string
	Session   string
	Period    string
}
type UsageRecordParams struct {
	UsageSummaryParams
	CallID string
	Meter  string
	ListParams
}
type UsageGateParams struct {
	ProjectID string
	Session   string
}
type Usage struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) Usage() *Usage { return &Usage{t: c.t} }
func (c *ProjectClient) Usage() *Usage      { return &Usage{c.t, c.projectID} }
func (r *Usage) query(p UsageSummaryParams) url.Values {
	q := url.Values{}
	setString(q, "projectId", p.ProjectID)
	setString(q, "session", p.Session)
	setString(q, "period", p.Period)
	if r.projectID != "" {
		q.Set("projectId", r.projectID)
	}
	return q
}
func (r *Usage) Summary(ctx context.Context, p UsageSummaryParams, o ...RequestOptions) (Response[UsageSummary], error) {
	return unwrapped[UsageSummary](ctx, r.t, "GET", "/platform/usage", r.query(p), nil, options(o))
}
func (r *Usage) ListRecords(ctx context.Context, p UsageRecordParams, o ...RequestOptions) (Response[UsageRecordPage], error) {
	q := r.query(p.UsageSummaryParams)
	setString(q, "callId", p.CallID)
	setString(q, "meter", p.Meter)
	setString(q, "cursor", p.Cursor)
	setInt(q, "limit", p.Limit)
	return unwrapped[UsageRecordPage](ctx, r.t, "GET", "/platform/usage/records", q, nil, options(o))
}
func (r *Usage) ListGates(ctx context.Context, p UsageGateParams, o ...RequestOptions) (Response[UsageGateList], error) {
	return unwrapped[UsageGateList](ctx, r.t, "GET", "/platform/gates", r.query(UsageSummaryParams{ProjectID: p.ProjectID, Session: p.Session}), nil, options(o))
}
func (r *Usage) IterateRecords(ctx context.Context, p UsageRecordParams, o ...RequestOptions) iter.Seq2[UsageRecord, error] {
	return func(yield func(UsageRecord, error) bool) {
		p.Cursor = ""
		seen := map[string]bool{}
		for {
			page, err := r.ListRecords(ctx, p, o...)
			if err != nil {
				yield(UsageRecord{}, err)
				return
			}
			next := page.Data.NextCursor
			if next != nil && seen[*next] {
				yield(UsageRecord{}, &Error{Kind: ServerError, Code: "invalid_response", Message: "Usage pagination cursor did not advance.", Metadata: page.Metadata})
				return
			}
			for _, record := range page.Data.Records {
				if !yield(record, nil) {
					return
				}
			}
			if next == nil {
				return
			}
			seen[*next] = true
			p.Cursor = *next
		}
	}
}
