package polymorfa

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

type BanSafeHealthProbabilities struct {
	Healthy    float64 `json:"healthy"`
	Limited    float64 `json:"limited"`
	Restricted float64 `json:"restricted"`
	Banned     float64 `json:"banned"`
}
type BanSafeHealthExplanationFactor struct {
	Group         string  `json:"group"`
	Key           string  `json:"key"`
	Penalty       float64 `json:"penalty"`
	ObservedValue float64 `json:"observedValue"`
	SampleSize    float64 `json:"sampleSize"`
}
type BanSafeHealthPenalties struct {
	Conduct     float64 `json:"conduct"`
	Delivery    float64 `json:"delivery"`
	Connection  float64 `json:"connection"`
	Restriction float64 `json:"restriction"`
	Total       float64 `json:"total"`
}
type BanSafeHealthExplanation struct {
	Penalties      BanSafeHealthPenalties           `json:"penalties"`
	Factors        []BanSafeHealthExplanationFactor `json:"factors"`
	MeasuredGroups []string                         `json:"measuredGroups"`
	MissingGroups  []string                         `json:"missingGroups"`
}
type BanSafeObservedAccountState struct {
	State      string `json:"state"`
	ObservedAt string `json:"observedAt"`
	Source     string `json:"source"`
}
type BanSafeHealthProjection struct {
	Health                  *float64                     `json:"health"`
	Band                    string                       `json:"band"`
	HealthSource            string                       `json:"healthSource"`
	HealthEstimatorVersion  *string                      `json:"healthEstimatorVersion"`
	HealthModelVersion      *string                      `json:"healthModelVersion"`
	HealthEvaluatedAt       *string                      `json:"healthEvaluatedAt"`
	HealthFeatureCoverage   *float64                     `json:"healthFeatureCoverage"`
	HealthReliability       string                       `json:"healthReliability"`
	HealthUnavailableReason *string                      `json:"healthUnavailableReason"`
	HealthProbabilities     *BanSafeHealthProbabilities  `json:"healthProbabilities"`
	MostLikelyHealthState   *string                      `json:"mostLikelyHealthState"`
	HealthExplanation       *BanSafeHealthExplanation    `json:"healthExplanation"`
	ObservedAccountState    *BanSafeObservedAccountState `json:"observedAccountState"`
}
type BanSafeNumberEnforcement struct {
	Rung                string   `json:"rung"`
	PreviousRung        string   `json:"previousRung"`
	OrganizationFloor   string   `json:"organizationFloor"`
	Reason              string   `json:"reason"`
	Source              string   `json:"source"`
	ThroughputPerMinute *float64 `json:"throughputPerMinute"`
	BlocksUnsolicited   bool     `json:"blocksUnsolicited"`
	Suspended           bool     `json:"suspended"`
	StartedAt           string   `json:"startedAt"`
	EligibleLiftAt      *string  `json:"eligibleLiftAt"`
	ExitProgress        float64  `json:"exitProgress"`
	BlockingFindings    []string `json:"blockingFindings"`
	OperatorHold        bool     `json:"operatorHold"`
	AppealState         string   `json:"appealState"`
	State               string   `json:"state"`
}
type BanSafeNumber struct {
	BanSafeHealthProjection
	SessionID   string                    `json:"sessionId"`
	Session     string                    `json:"session"`
	PhoneNumber string                    `json:"phoneNumber"`
	ProjectID   string                    `json:"projectId"`
	Enforcement *BanSafeNumberEnforcement `json:"enforcement"`
}
type BanSafeNumberWarmup struct {
	Enabled      bool               `json:"enabled"`
	TenureSource *string            `json:"tenureSource"`
	TenureDay    int                `json:"tenureDay"`
	Allowance    *float64           `json:"allowance"`
	SentToday    *int               `json:"sentToday"`
	ResetsAt     *string            `json:"resetsAt"`
	Curve        []WarmupCurvePoint `json:"curve"`
}
type BanSafeNumberDetail struct {
	BanSafeNumber
	Warmup       BanSafeNumberWarmup `json:"warmup"`
	Findings     []BanSafeFinding    `json:"findings"`
	LiftRequires *string             `json:"liftRequires"`
	AppealState  string              `json:"appealState"`
}
type BanSafeHealthPoint struct {
	BanSafeHealthProjection
	Band              *string `json:"band"`
	HealthEvaluatedAt string  `json:"healthEvaluatedAt"`
}
type BanSafeHealthHistory struct {
	SessionID string               `json:"sessionId"`
	Session   string               `json:"session"`
	Points    []BanSafeHealthPoint `json:"points"`
}
type BanSafeFinding struct {
	ID                  *string            `json:"id"`
	Key                 string             `json:"key"`
	Title               string             `json:"title"`
	Summary             string             `json:"summary"`
	Fix                 string             `json:"fix"`
	Status              string             `json:"status"`
	Severity            *string            `json:"severity"`
	Occurrences         int                `json:"occurrences"`
	ReopenedCount       int                `json:"reopenedCount"`
	Evidence            map[string]float64 `json:"evidence"`
	SessionID           string             `json:"sessionId"`
	Session             string             `json:"session"`
	PhoneNumber         string             `json:"phoneNumber"`
	FirstSeenAt         *string            `json:"firstSeenAt"`
	LastSeenAt          *string            `json:"lastSeenAt"`
	AcknowledgedAt      *string            `json:"acknowledgedAt"`
	AcknowledgedBy      *string            `json:"acknowledgedBy"`
	AcknowledgementNote *string            `json:"acknowledgementNote"`
	SnoozedUntil        *string            `json:"snoozedUntil"`
	ResolvedAt          *string            `json:"resolvedAt"`
	ResolveReason       *string            `json:"resolveReason"`
}
type BanSafeEnforcementSummary struct {
	BanSafeHealthProjection
	SessionID           string                    `json:"sessionId"`
	Session             string                    `json:"session"`
	PhoneNumber         string                    `json:"phoneNumber"`
	ProjectID           string                    `json:"projectId"`
	Rung                string                    `json:"rung"`
	PreviousRung        string                    `json:"previousRung"`
	OrganizationFloor   string                    `json:"organizationFloor"`
	Reason              string                    `json:"reason"`
	Source              string                    `json:"source"`
	ThroughputPerMinute *float64                  `json:"throughputPerMinute"`
	BlocksUnsolicited   bool                      `json:"blocksUnsolicited"`
	Suspended           bool                      `json:"suspended"`
	Enforcement         *BanSafeNumberEnforcement `json:"enforcement,omitempty"`
	BlockingFindings    []string                  `json:"blockingFindings"`
	StartedAt           string                    `json:"startedAt"`
	EligibleLiftAt      *string                   `json:"eligibleLiftAt"`
	LiftRequires        string                    `json:"liftRequires"`
	OperatorHold        bool                      `json:"operatorHold"`
	AppealState         string                    `json:"appealState"`
	State               string                    `json:"state"`
}
type BanSafeIncident struct {
	ID          string  `json:"id"`
	SessionID   string  `json:"sessionId"`
	Session     string  `json:"session"`
	PhoneNumber string  `json:"phoneNumber"`
	ProjectID   string  `json:"projectId"`
	Kind        string  `json:"kind"`
	Source      string  `json:"source"`
	Ambiguous   bool    `json:"ambiguous"`
	StartedAt   string  `json:"startedAt"`
	EndsAt      *string `json:"endsAt"`
	Resolution  string  `json:"resolution"`
	ClosedAt    *string `json:"closedAt"`
	ClosedBy    *string `json:"closedBy"`
	ClaimID     *string `json:"claimId"`
	Note        *string `json:"note"`
	ReportedBy  *string `json:"reportedBy"`
	CreatedAt   string  `json:"createdAt"`
}
type ReportBanSafeIncidentRequest struct {
	Session    string `json:"session"`
	OccurredAt string `json:"occurredAt,omitempty"`
	Note       string `json:"note,omitempty"`
}
type BanSafeIncidentReceipt struct {
	IncidentID string `json:"incidentId"`
	Created    bool   `json:"created"`
	SessionID  string `json:"sessionId"`
	Session    string `json:"session"`
	OccurredAt string `json:"occurredAt"`
}
type BanSafeClaimEvidence struct {
	AttributionRuleVersion *int `json:"attributionRuleVersion"`
	WindowDays             int  `json:"windowDays"`
	DeviceEvidence         bool `json:"deviceEvidence"`
	OtherDevices           int  `json:"otherDevices"`
	RestrictedInWindow     bool `json:"restrictedInWindow"`
	CriticalFindingDays    int  `json:"criticalFindingDays"`
	SharedConnection       bool `json:"sharedConnection"`
	MeasuredHours          int  `json:"measuredHours"`
}
type BanSafeClaim struct {
	ID            string               `json:"id"`
	IncidentID    string               `json:"incidentId"`
	SessionID     string               `json:"sessionId"`
	Session       string               `json:"session"`
	PhoneNumber   string               `json:"phoneNumber"`
	ProjectID     string               `json:"projectId"`
	Status        string               `json:"status"`
	Verdict       string               `json:"verdict"`
	WindowStart   string               `json:"windowStart"`
	WindowEnd     string               `json:"windowEnd"`
	MeasuredCents float64              `json:"measuredCents"`
	CapCents      float64              `json:"capCents"`
	AmountCents   float64              `json:"amountCents"`
	Evidence      BanSafeClaimEvidence `json:"evidence"`
	Summary       string               `json:"summary"`
	Reason        string               `json:"reason"`
	DecidedAt     *string              `json:"decidedAt"`
	PaidAt        *string              `json:"paidAt"`
	CreatedAt     string               `json:"createdAt"`
}
type BanSafeSignalDefinition struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Group       string `json:"group"`
	Kind        string `json:"kind"`
	Unit        string `json:"unit"`
	Description string `json:"description"`
}

// BanSafeSignalValue retains the contract's primitive, histogram, and null variants.
type BanSafeSignalValue struct {
	Number    *float64
	Boolean   *bool
	Enum      *string
	Histogram []float64
}

func (v *BanSafeSignalValue) UnmarshalJSON(b []byte) error {
	*v = BanSafeSignalValue{}
	if string(b) == "null" {
		return nil
	}
	if len(b) == 0 {
		return fmt.Errorf("empty signal value")
	}
	switch b[0] {
	case '"':
		return json.Unmarshal(b, &v.Enum)
	case '[':
		return json.Unmarshal(b, &v.Histogram)
	case 't', 'f':
		return json.Unmarshal(b, &v.Boolean)
	default:
		return json.Unmarshal(b, &v.Number)
	}
}
func (v BanSafeSignalValue) MarshalJSON() ([]byte, error) {
	count := 0
	var value any
	if v.Number != nil {
		count++
		value = *v.Number
	}
	if v.Boolean != nil {
		count++
		value = *v.Boolean
	}
	if v.Enum != nil {
		count++
		value = *v.Enum
	}
	if v.Histogram != nil {
		count++
		value = v.Histogram
	}
	if count > 1 {
		return nil, fmt.Errorf("signal value must have one variant")
	}
	return json.Marshal(value)
}

type BanSafeSignalCode struct {
	Code  int `json:"code"`
	Count int `json:"count"`
}
type BanSafeSignal struct {
	BanSafeSignalDefinition
	Measured   bool                 `json:"measured"`
	Value      BanSafeSignalValue   `json:"value"`
	SampleSize *float64             `json:"sampleSize"`
	Codes      *[]BanSafeSignalCode `json:"codes"`
}
type BanSafeCollectionStatus struct {
	State            string  `json:"state"`
	LatestFlushedAt  *string `json:"latestFlushedAt"`
	LatestReceivedAt *string `json:"latestReceivedAt"`
	FreshUntil       *string `json:"freshUntil"`
	RecordVersion    *int    `json:"recordVersion"`
	CollectorVersion *int    `json:"collectorVersion"`
	Partial          *bool   `json:"partial"`
	DroppedRecords   *int    `json:"droppedRecords"`
}
type BanSafeTelemetrySnapshot struct {
	BucketStart   string          `json:"bucketStart"`
	FlushedAt     string          `json:"flushedAt"`
	ReceivedAt    string          `json:"receivedAt"`
	Partial       bool            `json:"partial"`
	RecordVersion *int            `json:"recordVersion"`
	Signals       []BanSafeSignal `json:"signals"`
}
type BanSafeCollectionSession struct {
	SessionID  string                  `json:"sessionId"`
	Session    string                  `json:"session"`
	ProjectID  string                  `json:"projectId"`
	Collection BanSafeCollectionStatus `json:"collection"`
}
type BanSafeTelemetryDetail struct {
	BanSafeCollectionSession
	Snapshot *BanSafeTelemetrySnapshot `json:"snapshot"`
}
type BanSafeHealthAction struct {
	ID               string   `json:"id"`
	SessionID        string   `json:"sessionId"`
	Session          string   `json:"session"`
	ProjectID        string   `json:"projectId"`
	Mode             string   `json:"mode"`
	Action           string   `json:"action"`
	Status           string   `json:"status"`
	Health           float64  `json:"health"`
	Threshold        float64  `json:"threshold"`
	HealthSource     string   `json:"healthSource"`
	EstimatorVersion string   `json:"estimatorVersion"`
	ModelVersion     *string  `json:"modelVersion"`
	SlowDownMPS      *float64 `json:"slowDownMps"`
	EvaluatedAt      string   `json:"evaluatedAt"`
	CreatedAt        string   `json:"createdAt"`
	CompletedAt      *string  `json:"completedAt"`
	Outcome          *string  `json:"outcome"`
}

type ListBanSafeHealthParams struct {
	ListParams
	ProjectID string
}

func (p ListBanSafeHealthParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "projectId", p.ProjectID)
	return q
}

type ListBanSafeHealthHistoryParams struct {
	Since string
	Limit int
}
type ListBanSafeFindingsParams struct {
	ListBanSafeHealthParams
	Session, Status, Severity string
}
type ListBanSafeEnforcementParams struct {
	ListBanSafeHealthParams
	Rung string
}
type ListBanSafeIncidentsParams struct {
	ListBanSafeHealthParams
	Session string
}
type ListBanSafeClaimsParams struct {
	ListBanSafeHealthParams
	Session, Status string
}
type ListBanSafeCollectionParams = ListBanSafeHealthParams
type ListBanSafeTelemetryHistoryParams struct {
	ListParams
	Since, Until string
}
type ListBanSafeHealthActionsParams struct {
	ListBanSafeHealthParams
	Session, Status string
}
type BanSafe struct{ t *transport }

func (c *OrganizationClient) BanSafe() *BanSafe { return &BanSafe{c.t} }
func (r *BanSafe) ListHealth(ctx context.Context, p ListBanSafeHealthParams, o ...RequestOptions) (*CursorPage[BanSafeNumber], error) {
	return page[BanSafeNumber](ctx, r.t, "/platform/bansafe/health", p.query(), options(o))
}
func (r *BanSafe) GetHealth(ctx context.Context, session string, o ...RequestOptions) (Response[Envelope[BanSafeNumberDetail]], error) {
	return request[Envelope[BanSafeNumberDetail]](ctx, r.t, "GET", "/platform/bansafe/health/"+escaped(session), nil, nil, options(o))
}
func (r *BanSafe) ListHealthHistory(ctx context.Context, session string, p ListBanSafeHealthHistoryParams, o ...RequestOptions) (Response[Envelope[BanSafeHealthHistory]], error) {
	q := url.Values{}
	setString(q, "since", p.Since)
	setInt(q, "limit", p.Limit)
	return request[Envelope[BanSafeHealthHistory]](ctx, r.t, "GET", "/platform/bansafe/health/"+escaped(session)+"/history", q, nil, options(o))
}
func (r *BanSafe) ListSignals(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]BanSafeSignalDefinition]], error) {
	return request[Envelope[[]BanSafeSignalDefinition]](ctx, r.t, "GET", "/platform/bansafe/signals", nil, nil, options(o))
}
func (r *BanSafe) GetTelemetry(ctx context.Context, session string, o ...RequestOptions) (Response[Envelope[BanSafeTelemetryDetail]], error) {
	return request[Envelope[BanSafeTelemetryDetail]](ctx, r.t, "GET", "/platform/bansafe/telemetry/"+escaped(session), nil, nil, options(o))
}
func (r *BanSafe) ListTelemetryHistory(ctx context.Context, session string, p ListBanSafeTelemetryHistoryParams, o ...RequestOptions) (*CursorPage[BanSafeTelemetrySnapshot], error) {
	q := p.ListParams.query()
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return page[BanSafeTelemetrySnapshot](ctx, r.t, "/platform/bansafe/telemetry/"+escaped(session)+"/history", q, options(o))
}
func (r *BanSafe) ListCollection(ctx context.Context, p ListBanSafeCollectionParams, o ...RequestOptions) (*CursorPage[BanSafeCollectionSession], error) {
	return page[BanSafeCollectionSession](ctx, r.t, "/platform/bansafe/collection", p.query(), options(o))
}
func (r *BanSafe) ListHealthActions(ctx context.Context, p ListBanSafeHealthActionsParams, o ...RequestOptions) (*CursorPage[BanSafeHealthAction], error) {
	q := p.query()
	setString(q, "session", p.Session)
	setString(q, "status", p.Status)
	return page[BanSafeHealthAction](ctx, r.t, "/platform/bansafe/health-actions", q, options(o))
}
func (r *BanSafe) ListFindings(ctx context.Context, p ListBanSafeFindingsParams, o ...RequestOptions) (*CursorPage[BanSafeFinding], error) {
	q := p.query()
	setString(q, "session", p.Session)
	setString(q, "status", p.Status)
	setString(q, "severity", p.Severity)
	return page[BanSafeFinding](ctx, r.t, "/platform/bansafe/findings", q, options(o))
}
func (r *BanSafe) ListEnforcement(ctx context.Context, p ListBanSafeEnforcementParams, o ...RequestOptions) (*CursorPage[BanSafeEnforcementSummary], error) {
	q := p.query()
	setString(q, "rung", p.Rung)
	return page[BanSafeEnforcementSummary](ctx, r.t, "/platform/bansafe/enforcement", q, options(o))
}
func (r *BanSafe) ListIncidents(ctx context.Context, p ListBanSafeIncidentsParams, o ...RequestOptions) (*CursorPage[BanSafeIncident], error) {
	q := p.query()
	setString(q, "session", p.Session)
	return page[BanSafeIncident](ctx, r.t, "/platform/bansafe/incidents", q, options(o))
}
func (r *BanSafe) CreateIncident(ctx context.Context, b ReportBanSafeIncidentRequest, o ...RequestOptions) (Response[Envelope[BanSafeIncidentReceipt]], error) {
	return request[Envelope[BanSafeIncidentReceipt]](ctx, r.t, "POST", "/platform/bansafe/incidents", nil, b, options(o))
}
func (r *BanSafe) RetractIncident(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[BanSafeIncident]], error) {
	return request[Envelope[BanSafeIncident]](ctx, r.t, "POST", "/platform/bansafe/incidents/"+escaped(id)+"/retract", nil, nil, options(o))
}
func (r *BanSafe) ListClaims(ctx context.Context, p ListBanSafeClaimsParams, o ...RequestOptions) (*CursorPage[BanSafeClaim], error) {
	q := p.query()
	setString(q, "session", p.Session)
	setString(q, "status", p.Status)
	return page[BanSafeClaim](ctx, r.t, "/platform/bansafe/claims", q, options(o))
}
func (r *BanSafe) GetClaim(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[BanSafeClaim]], error) {
	return request[Envelope[BanSafeClaim]](ctx, r.t, "GET", "/platform/bansafe/claims/"+escaped(id), nil, nil, options(o))
}
