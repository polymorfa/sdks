package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/url"
	"strconv"
	"strings"
)

// CampaignFrequencyCap holds rolling per-contact limits. A nil limit means no
// additional limit for that window. MaxPer24Hours is 1..50 and cannot exceed
// MaxPer7Days (1..200) when both are set.
type CampaignFrequencyCap struct {
	MaxPer24Hours *int `json:"maxPer24Hours"`
	MaxPer7Days   *int `json:"maxPer7Days"`
}

// CampaignFrequencyCapSettings is the team cap. Revision is 0 and UpdatedAt is
// nil until the team first saves.
type CampaignFrequencyCapSettings struct {
	CampaignFrequencyCap
	TeamID    string `json:"teamId"`
	Revision  int    `json:"revision"`
	UpdatedAt *int64 `json:"updatedAt"`
}

// UpdateCampaignFrequencyCapInput replaces both windows. Revision is the value
// from the last read; nil limits remove the cap without beta access.
type UpdateCampaignFrequencyCapInput struct {
	CampaignFrequencyCap
	Revision int `json:"revision"`
}

// CampaignFrequencyCapAnalytics counts recipients with a message skipped by the cap.
type CampaignFrequencyCapAnalytics struct {
	SkippedRecipientCount int `json:"skippedRecipientCount"`
}

type CampaignDripEnrollment string

const (
	CampaignDripAudience   CampaignDripEnrollment = "audience"
	CampaignDripContinuous CampaignDripEnrollment = "continuous"
)

// CampaignDrip is the stored beta drip configuration. A GET request to a
// tracked link counts as a click, including link previews and scanners.
type CampaignDrip struct {
	Enrollment      CampaignDripEnrollment `json:"enrollment"`
	ExitOnReply     bool                   `json:"exitOnReply"`
	ExitOnLinkClick bool                   `json:"exitOnLinkClick"`
}

// CampaignDripInput creates a drip. The API applies the defaults audience,
// exit on reply and no exit on link click to omitted fields.
type CampaignDripInput struct {
	Enrollment      CampaignDripEnrollment `json:"enrollment,omitempty"`
	ExitOnReply     *bool                  `json:"exitOnReply,omitempty"`
	ExitOnLinkClick *bool                  `json:"exitOnLinkClick,omitempty"`
}

// CampaignDripPatch changes stored drip settings. Omitted fields keep their
// stored values; the SDK applies no defaults.
type CampaignDripPatch struct {
	Enrollment      CampaignDripEnrollment `json:"enrollment,omitempty"`
	ExitOnReply     *bool                  `json:"exitOnReply,omitempty"`
	ExitOnLinkClick *bool                  `json:"exitOnLinkClick,omitempty"`
}

type CampaignDripStepStats struct {
	Step      int `json:"step"`
	Entered   int `json:"entered"`
	Waiting   int `json:"waiting"`
	Sent      int `json:"sent"`
	Delivered int `json:"delivered"`
	Read      int `json:"read"`
	Replied   int `json:"replied"`
	Exited    int `json:"exited"`
	Failed    int `json:"failed"`
}
type CampaignDripStats struct {
	Enrollment    CampaignDripEnrollment  `json:"enrollment"`
	Enrolled      int                     `json:"enrolled"`
	EnrolledByAPI int                     `json:"enrolledByApi"`
	Active        int                     `json:"active"`
	Completed     int                     `json:"completed"`
	Exited        int                     `json:"exited"`
	Steps         []CampaignDripStepStats `json:"steps"`
}

// CampaignDripExitReason values appear in CampaignRecipient.SequenceError;
// arbitrary send failure codes also occur there.
type CampaignDripExitReason string

const (
	CampaignDripExitReplied     CampaignDripExitReason = "replied"
	CampaignDripExitLinkClicked CampaignDripExitReason = "link_clicked"
	CampaignDripExitOptedOut    CampaignDripExitReason = "opted_out"
)

// CampaignSegmentSnapshot is what launch froze from a saved segment.
type CampaignSegmentSnapshot struct {
	Revision     int   `json:"revision"`
	EvaluatedAt  int64 `json:"evaluatedAt"`
	MatchedCount int   `json:"matchedCount"`
}

type CampaignDelayUnit string

const (
	CampaignDelayMinutes CampaignDelayUnit = "minutes"
	CampaignDelayHours   CampaignDelayUnit = "hours"
	CampaignDelayDays    CampaignDelayUnit = "days"
)

// CampaignStepWindow replaces the campaign weekdays and hours for a later drip
// step. At most four hour ranges, in the campaign's time zone.
type CampaignStepWindow struct {
	Days  []string                  `json:"days"`
	Hours []CampaignSendWindowRange `json:"hours"`
}

// EnrollCampaignContactRequest enrolls one phone in a continuous drip. A phone
// already in the drip returns created=false and is never restarted.
type EnrollCampaignContactRequest struct {
	Phone     string                      `json:"phone"`
	Variables map[string]CampaignVariable `json:"variables,omitempty"`
}

// EnrollPlatformCampaignContactRequest selects the owning project explicitly.
type EnrollPlatformCampaignContactRequest struct {
	ProjectID string `json:"projectId"`
	EnrollCampaignContactRequest
}

type CampaignEnrollment struct {
	CampaignID  string `json:"campaignId"`
	RecipientID string `json:"recipientId"`
	Phone       string `json:"phone"`
	Created     bool   `json:"created"`
	Status      string `json:"status"`
	// EnrolledAt is Unix milliseconds.
	EnrolledAt float64 `json:"enrolledAt"`
}

// Enroll adds a contact to a running or paused continuous drip. The write is
// sent once: per-phone server idempotency does not make an ambiguous retry safe.
func (r *Campaigns) Enroll(ctx context.Context, id string, b EnrollPlatformCampaignContactRequest, o ...RequestOptions) (Response[Envelope[CampaignEnrollment]], error) {
	if err := contractUUID(b.ProjectID, "projectId"); err != nil {
		return Response[Envelope[CampaignEnrollment]]{}, err
	}
	return request[Envelope[CampaignEnrollment]](ctx, r.t, "POST", platformCampaignPath(id)+"/enrollments", nil, b, noRetry(options(o)))
}

// Enroll adds a contact to a running or paused continuous drip; sent once.
func (r *MessagingCampaigns) Enroll(ctx context.Context, project, id string, b EnrollCampaignContactRequest, o ...RequestOptions) (Response[Envelope[CampaignEnrollment]], error) {
	return request[Envelope[CampaignEnrollment]](ctx, r.t, "POST", messagingCampaignPath(project, id)+"/enrollments", nil, b, noRetry(options(o)))
}

const frequencyCapPath = "/platform/campaign-settings/frequency-cap"

// GetFrequencyCap reads the team cap. Organization API key with campaigns:read.
func (r *Campaigns) GetFrequencyCap(ctx context.Context, o ...RequestOptions) (Response[Envelope[CampaignFrequencyCapSettings]], error) {
	return request[Envelope[CampaignFrequencyCapSettings]](ctx, r.t, "GET", frequencyCapPath, nil, nil, options(o))
}

// UpdateFrequencyCap replaces both team limits. A stale revision returns a
// conflict; read again and reconcile. Setting limits requires beta access.
// Sent once: reconcile a lost response with a fresh read.
func (r *Campaigns) UpdateFrequencyCap(ctx context.Context, b UpdateCampaignFrequencyCapInput, o ...RequestOptions) (Response[Envelope[CampaignFrequencyCapSettings]], error) {
	return request[Envelope[CampaignFrequencyCapSettings]](ctx, r.t, "PUT", frequencyCapPath, nil, b, noRetry(options(o)))
}

type AudienceSegmentMatch string

const (
	AudienceSegmentMatchAll AudienceSegmentMatch = "all"
	AudienceSegmentMatchAny AudienceSegmentMatch = "any"
)

type AudienceSegmentOperator string

const (
	AudienceSegmentContains    AudienceSegmentOperator = "contains"
	AudienceSegmentBefore      AudienceSegmentOperator = "before"
	AudienceSegmentAfter       AudienceSegmentOperator = "after"
	AudienceSegmentGreaterThan AudienceSegmentOperator = "greater_than"
	AudienceSegmentLessThan    AudienceSegmentOperator = "less_than"
)

// AudienceSegmentCondition is one rule condition. Missing, null or wrong-type
// attributes do not match. Unknown server conditions decode as
// AudienceSegmentUnknownCondition so reads stay forward compatible.
type AudienceSegmentCondition interface{ audienceSegmentCondition() }

type AudienceSegmentTagContains struct{ Value string }
type AudienceSegmentTagIn struct{ Values []string }
type AudienceSegmentTagExists struct{}

// AudienceSegmentAttributeEquals matches a string, number or boolean of the same type.
type AudienceSegmentAttributeEquals struct {
	Name  string
	Value any
}

// AudienceSegmentAttributeText uses contains, before or after with a string value.
type AudienceSegmentAttributeText struct {
	Name     string
	Operator AudienceSegmentOperator
	Value    string
}

// AudienceSegmentAttributeIn matches any of up to 50 strings or numbers.
type AudienceSegmentAttributeIn struct {
	Name   string
	Values []any
}

// AudienceSegmentAttributeCompare uses greater_than or less_than.
type AudienceSegmentAttributeCompare struct {
	Name     string
	Operator AudienceSegmentOperator
	Value    float64
}
type AudienceSegmentAttributeExists struct{ Name string }
type AudienceSegmentConsentEquals struct{ Value bool }

// AudienceSegmentCampaignOutcome outcome is delivered, not_delivered, read,
// not_read, replied, not_replied or failed.
type AudienceSegmentCampaignOutcome struct {
	CampaignID string
	Outcome    string
}

// AudienceSegmentUnknownCondition preserves a condition this SDK does not model.
// It is read-only: requests containing it are rejected before sending.
type AudienceSegmentUnknownCondition struct{ Raw json.RawMessage }

func (AudienceSegmentTagContains) audienceSegmentCondition()      {}
func (AudienceSegmentTagIn) audienceSegmentCondition()            {}
func (AudienceSegmentTagExists) audienceSegmentCondition()        {}
func (AudienceSegmentAttributeEquals) audienceSegmentCondition()  {}
func (AudienceSegmentAttributeText) audienceSegmentCondition()    {}
func (AudienceSegmentAttributeIn) audienceSegmentCondition()      {}
func (AudienceSegmentAttributeCompare) audienceSegmentCondition() {}
func (AudienceSegmentAttributeExists) audienceSegmentCondition()  {}
func (AudienceSegmentConsentEquals) audienceSegmentCondition()    {}
func (AudienceSegmentCampaignOutcome) audienceSegmentCondition()  {}
func (AudienceSegmentUnknownCondition) audienceSegmentCondition() {}

type segmentConditionWire struct {
	Field      string          `json:"field"`
	Name       *string         `json:"name,omitempty"`
	Operator   string          `json:"operator,omitempty"`
	Value      json.RawMessage `json:"value,omitempty"`
	Values     json.RawMessage `json:"values,omitempty"`
	CampaignID *string         `json:"campaignId,omitempty"`
	Outcome    *string         `json:"outcome,omitempty"`
}

func rawJSON(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
func (v AudienceSegmentTagContains) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "tag", Operator: "contains", Value: rawJSON(v.Value)})
}
func (v AudienceSegmentTagIn) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "tag", Operator: "in", Values: rawJSON(v.Values)})
}
func (AudienceSegmentTagExists) MarshalJSON() ([]byte, error) {
	return []byte(`{"field":"tag","operator":"exists"}`), nil
}
func (v AudienceSegmentAttributeEquals) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "attribute", Name: &v.Name, Operator: "equals", Value: rawJSON(v.Value)})
}
func (v AudienceSegmentAttributeText) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "attribute", Name: &v.Name, Operator: string(v.Operator), Value: rawJSON(v.Value)})
}
func (v AudienceSegmentAttributeIn) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "attribute", Name: &v.Name, Operator: "in", Values: rawJSON(v.Values)})
}
func (v AudienceSegmentAttributeCompare) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "attribute", Name: &v.Name, Operator: string(v.Operator), Value: rawJSON(v.Value)})
}
func (v AudienceSegmentAttributeExists) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "attribute", Name: &v.Name, Operator: "exists"})
}
func (v AudienceSegmentConsentEquals) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "consent", Operator: "equals", Value: rawJSON(v.Value)})
}
func (v AudienceSegmentCampaignOutcome) MarshalJSON() ([]byte, error) {
	return json.Marshal(segmentConditionWire{Field: "campaign", CampaignID: &v.CampaignID, Outcome: &v.Outcome})
}
func (v AudienceSegmentUnknownCondition) MarshalJSON() ([]byte, error) {
	if len(v.Raw) == 0 {
		return []byte("null"), nil
	}
	return v.Raw, nil
}

func decodeSegmentCondition(b []byte) (AudienceSegmentCondition, error) {
	var w segmentConditionWire
	var keys map[string]json.RawMessage
	if json.Unmarshal(b, &keys) != nil || keys == nil || json.Unmarshal(b, &w) != nil {
		return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned an invalid audience segment condition."}
	}
	unknown := AudienceSegmentUnknownCondition{Raw: append(json.RawMessage(nil), b...)}
	only := func(allowed ...string) bool {
		if len(keys) != len(allowed) {
			return false
		}
		for _, k := range allowed {
			if _, ok := keys[k]; !ok {
				return false
			}
		}
		return true
	}
	str := func(raw json.RawMessage) (string, bool) {
		var s string
		return s, len(raw) > 0 && raw[0] == '"' && json.Unmarshal(raw, &s) == nil
	}
	name := ""
	if w.Name != nil {
		name = *w.Name
	}
	switch {
	case w.Field == "tag" && w.Operator == "contains" && only("field", "operator", "value"):
		if s, ok := str(w.Value); ok {
			return AudienceSegmentTagContains{Value: s}, nil
		}
	case w.Field == "tag" && w.Operator == "in" && only("field", "operator", "values"):
		var values []string
		if json.Unmarshal(w.Values, &values) == nil && values != nil {
			return AudienceSegmentTagIn{Values: values}, nil
		}
	case w.Field == "tag" && w.Operator == "exists" && only("field", "operator"):
		return AudienceSegmentTagExists{}, nil
	case w.Field == "attribute" && w.Operator == "equals" && only("field", "name", "operator", "value"):
		var value any
		if json.Unmarshal(w.Value, &value) == nil && segmentScalar(value, true) {
			return AudienceSegmentAttributeEquals{Name: name, Value: value}, nil
		}
	case w.Field == "attribute" && (w.Operator == "contains" || w.Operator == "before" || w.Operator == "after") && only("field", "name", "operator", "value"):
		if s, ok := str(w.Value); ok {
			return AudienceSegmentAttributeText{Name: name, Operator: AudienceSegmentOperator(w.Operator), Value: s}, nil
		}
	case w.Field == "attribute" && w.Operator == "in" && only("field", "name", "operator", "values"):
		var values []any
		if json.Unmarshal(w.Values, &values) == nil && values != nil {
			return AudienceSegmentAttributeIn{Name: name, Values: values}, nil
		}
	case w.Field == "attribute" && (w.Operator == "greater_than" || w.Operator == "less_than") && only("field", "name", "operator", "value"):
		var n float64
		if json.Unmarshal(w.Value, &n) == nil && !bytes.Equal(w.Value, []byte("null")) {
			return AudienceSegmentAttributeCompare{Name: name, Operator: AudienceSegmentOperator(w.Operator), Value: n}, nil
		}
	case w.Field == "attribute" && w.Operator == "exists" && only("field", "name", "operator"):
		return AudienceSegmentAttributeExists{Name: name}, nil
	case w.Field == "consent" && w.Operator == "equals" && only("field", "operator", "value"):
		var value bool
		if json.Unmarshal(w.Value, &value) == nil && !bytes.Equal(w.Value, []byte("null")) {
			return AudienceSegmentConsentEquals{Value: value}, nil
		}
	case w.Field == "campaign" && only("field", "campaignId", "outcome") && w.CampaignID != nil && w.Outcome != nil:
		return AudienceSegmentCampaignOutcome{CampaignID: *w.CampaignID, Outcome: *w.Outcome}, nil
	}
	return unknown, nil
}

// AudienceSegmentGroup combines up to 20 conditions. Negate inverts the result.
type AudienceSegmentGroup struct {
	Match      AudienceSegmentMatch       `json:"match"`
	Negate     *bool                      `json:"negate,omitempty"`
	Conditions []AudienceSegmentCondition `json:"conditions"`
}

func (g *AudienceSegmentGroup) UnmarshalJSON(b []byte) error {
	var w struct {
		Match      AudienceSegmentMatch `json:"match"`
		Negate     *bool                `json:"negate,omitempty"`
		Conditions []json.RawMessage    `json:"conditions"`
	}
	if err := json.Unmarshal(b, &w); err != nil {
		return err
	}
	out := AudienceSegmentGroup{Match: w.Match, Negate: w.Negate, Conditions: make([]AudienceSegmentCondition, 0, len(w.Conditions))}
	for _, raw := range w.Conditions {
		c, err := decodeSegmentCondition(raw)
		if err != nil {
			return err
		}
		out.Conditions = append(out.Conditions, c)
	}
	*g = out
	return nil
}

// AudienceSegmentRules allows at most 10 groups, 20 conditions per group, 40
// conditions, 5 campaign conditions, 50 values per in condition and 16 KiB.
// The API enforces these limits.
type AudienceSegmentRules struct {
	Match  AudienceSegmentMatch   `json:"match"`
	Groups []AudienceSegmentGroup `json:"groups"`
}

type AudienceSegment struct {
	ID        string               `json:"id"`
	Name      string               `json:"name"`
	Revision  int                  `json:"revision"`
	Rules     AudienceSegmentRules `json:"rules"`
	CreatedAt int64                `json:"createdAt"`
	UpdatedAt int64                `json:"updatedAt"`
}
type AudienceSegmentSample struct {
	// Phone is masked, for example +49*******12.
	Phone string   `json:"phone"`
	Tags  []string `json:"tags"`
}
type AudienceSegmentPreview struct {
	MatchedCount         int                     `json:"matchedCount"`
	OptedOutCount        int                     `json:"optedOutCount"`
	ConsentWithheldCount int                     `json:"consentWithheldCount"`
	EligibleCount        int                     `json:"eligibleCount"`
	Sample               []AudienceSegmentSample `json:"sample"`
	EvaluatedAt          int64                   `json:"evaluatedAt"`
}
type SavedAudienceSegmentPreview struct {
	AudienceSegmentPreview
	Revision int `json:"revision"`
}
type CreateAudienceSegmentRequest struct {
	Name  string               `json:"name"`
	Rules AudienceSegmentRules `json:"rules"`
}

// UpdateAudienceSegmentRequest requires the last observed revision.
type UpdateAudienceSegmentRequest struct {
	ExpectedRevision int                   `json:"expectedRevision"`
	Name             *string               `json:"name,omitempty"`
	Rules            *AudienceSegmentRules `json:"rules,omitempty"`
}
type ListAudienceSegmentsParams struct{ ListParams }
type AudienceSegmentDeletion struct {
	Deleted bool   `json:"deleted"`
	ID      string `json:"id"`
}

// AudienceSegments are organization resources: organization API keys only,
// campaigns:read for reads and campaigns:manage for writes and unsaved previews.
// Revision conflicts and bounded evaluation timeouts return 409 state_conflict;
// re-read, reconcile or simplify rules before trying again. Writes and
// previews are sent once.
type AudienceSegments struct{ t *transport }

func (c *OrganizationClient) AudienceSegments() *AudienceSegments { return &AudienceSegments{c.t} }

func audienceSegmentPath(id string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", configuration("segmentId", "A segment ID is required.")
	}
	return "/platform/audience-segments/" + escaped(id), nil
}
func segmentScalar(v any, booleans bool) bool {
	switch n := v.(type) {
	case string:
		return true
	case bool:
		return booleans
	case float64:
		return !math.IsNaN(n) && !math.IsInf(n, 0)
	case float32:
		return !math.IsNaN(float64(n)) && !math.IsInf(float64(n), 0)
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, json.Number:
		return true
	}
	return false
}

// validateSegmentRules checks only the shapes a typed request can get wrong;
// counts, sizes and patterns remain API authority.
func validateSegmentRules(r AudienceSegmentRules) error {
	for _, g := range r.Groups {
		for _, c := range g.Conditions {
			ok := true
			switch v := c.(type) {
			case AudienceSegmentAttributeEquals:
				ok = segmentScalar(v.Value, true)
			case AudienceSegmentAttributeIn:
				for _, x := range v.Values {
					ok = ok && segmentScalar(x, false)
				}
			case AudienceSegmentAttributeCompare:
				ok = !math.IsNaN(v.Value) && !math.IsInf(v.Value, 0)
			case AudienceSegmentUnknownCondition, nil:
				ok = false
			}
			if !ok {
				return configuration("rules", "Audience segment conditions need a supported shape and value type.")
			}
		}
	}
	return nil
}

func (r *AudienceSegments) List(ctx context.Context, p ListAudienceSegmentsParams, o ...RequestOptions) (*CursorPage[AudienceSegment], error) {
	return page[AudienceSegment](ctx, r.t, "/platform/audience-segments", p.ListParams.query(), options(o))
}
func (r *AudienceSegments) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[AudienceSegment]], error) {
	path, err := audienceSegmentPath(id)
	if err != nil {
		return Response[Envelope[AudienceSegment]]{}, err
	}
	return request[Envelope[AudienceSegment]](ctx, r.t, "GET", path, nil, nil, options(o))
}
func (r *AudienceSegments) Create(ctx context.Context, b CreateAudienceSegmentRequest, o ...RequestOptions) (Response[Envelope[AudienceSegment]], error) {
	if err := validateSegmentRules(b.Rules); err != nil {
		return Response[Envelope[AudienceSegment]]{}, err
	}
	return request[Envelope[AudienceSegment]](ctx, r.t, "POST", "/platform/audience-segments", nil, b, noRetry(options(o)))
}
func (r *AudienceSegments) Update(ctx context.Context, id string, b UpdateAudienceSegmentRequest, o ...RequestOptions) (Response[Envelope[AudienceSegment]], error) {
	path, err := audienceSegmentPath(id)
	if err == nil && b.Rules != nil {
		err = validateSegmentRules(*b.Rules)
	}
	if err != nil {
		return Response[Envelope[AudienceSegment]]{}, err
	}
	return request[Envelope[AudienceSegment]](ctx, r.t, "PATCH", path, nil, b, noRetry(options(o)))
}

// Delete is refused while an unlaunched draft uses the segment. Launched
// campaigns keep their snapshot and recipients; their segment ID becomes nil.
func (r *AudienceSegments) Delete(ctx context.Context, id string, expectedRevision int, o ...RequestOptions) (Response[Envelope[AudienceSegmentDeletion]], error) {
	path, err := audienceSegmentPath(id)
	if err != nil {
		return Response[Envelope[AudienceSegmentDeletion]]{}, err
	}
	q := url.Values{"expectedRevision": {strconv.Itoa(expectedRevision)}}
	return request[Envelope[AudienceSegmentDeletion]](ctx, r.t, "DELETE", path, q, nil, noRetry(options(o)))
}

// Preview evaluates the saved segment once; a bounded evaluation timeout is a 409.
func (r *AudienceSegments) Preview(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SavedAudienceSegmentPreview]], error) {
	path, err := audienceSegmentPath(id)
	if err != nil {
		return Response[Envelope[SavedAudienceSegmentPreview]]{}, err
	}
	return request[Envelope[SavedAudienceSegmentPreview]](ctx, r.t, "GET", path+"/preview", nil, nil, noRetry(options(o)))
}

// PreviewRules evaluates unsaved rules once.
func (r *AudienceSegments) PreviewRules(ctx context.Context, rules AudienceSegmentRules, o ...RequestOptions) (Response[Envelope[AudienceSegmentPreview]], error) {
	if err := validateSegmentRules(rules); err != nil {
		return Response[Envelope[AudienceSegmentPreview]]{}, err
	}
	body := struct {
		Rules AudienceSegmentRules `json:"rules"`
	}{rules}
	return request[Envelope[AudienceSegmentPreview]](ctx, r.t, "POST", "/platform/audience-segments/preview", nil, body, noRetry(options(o)))
}
