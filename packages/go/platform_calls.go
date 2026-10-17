package polymorfa

import (
	"context"
	"iter"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type CallRecord struct {
	CallID          string   `json:"callId"`
	ProjectID       *string  `json:"projectId"`
	SessionID       string   `json:"sessionId"`
	Direction       string   `json:"direction"`
	Upstream        string   `json:"upstream"`
	Outcome         string   `json:"outcome"`
	State           string   `json:"state"`
	HasVideo        bool     `json:"hasVideo"`
	PeerRef         *string  `json:"peerRef"`
	StartedAt       string   `json:"startedAt"`
	ConnectedAt     *string  `json:"connectedAt"`
	EndedAt         *string  `json:"endedAt"`
	DurationSeconds *float64 `json:"durationSeconds"`
	EndReason       *string  `json:"endReason"`
}
type CallRecordEndReason struct {
	Code  string `json:"code"`
	Label string `json:"label"`
}
type CallRecordParticipant struct {
	ID          string  `json:"id"`
	State       string  `json:"state"`
	FirstSeenAt string  `json:"firstSeenAt"`
	UpdatedAt   string  `json:"updatedAt"`
	LeftReason  *string `json:"leftReason"`
}
type CallRecordConnection struct {
	ID          string  `json:"id"`
	Participant string  `json:"participant"`
	Transport   string  `json:"transport"`
	JoinedAt    *string `json:"joinedAt"`
	LeftAt      *string `json:"leftAt"`
	Reason      *string `json:"reason"`
}
type CallRecordTelemetry struct {
	Status       string   `json:"status"`
	Source       string   `json:"source"`
	SetupMS      *float64 `json:"setupMs"`
	RingMS       *float64 `json:"ringMs"`
	Codec        *string  `json:"codec"`
	JitterMS     *float64 `json:"jitterMs"`
	PacketsLost  *float64 `json:"packetsLost"`
	RTTMS        *float64 `json:"rttMs"`
	ReceivedKBPS *float64 `json:"receivedKbps"`
	SentKBPS     *float64 `json:"sentKbps"`
}
type CallRecordAppQuality struct {
	ReportedAt      string   `json:"reportedAt"`
	RTTMS           *float64 `json:"rttMs"`
	JitterMS        *float64 `json:"jitterMs"`
	PacketsLost     *float64 `json:"packetsLost"`
	PacketsReceived *float64 `json:"packetsReceived"`
	AudioCodec      *string  `json:"audioCodec"`
	VideoCodec      *string  `json:"videoCodec"`
	CandidateType   *string  `json:"candidateType"`
	Reconnects      *int     `json:"reconnects"`
}
type CallRecordAppError struct {
	Code       string `json:"code"`
	ReportedAt string `json:"reportedAt"`
}
type CallRecordAppConnection struct {
	ConnectionID string                `json:"connectionId"`
	Participant  string                `json:"participant"`
	Client       *CallReportClient     `json:"client"`
	Quality      *CallRecordAppQuality `json:"quality"`
	Errors       []CallRecordAppError  `json:"errors"`
}
type CallRecordAppReports struct {
	Status      string                    `json:"status"`
	Connections []CallRecordAppConnection `json:"connections"`
	Truncated   bool                      `json:"truncated"`
}
type CallRecordSummary struct {
	CallID          string               `json:"callId"`
	SessionID       string               `json:"sessionId"`
	ProjectID       *string              `json:"projectId"`
	Direction       string               `json:"direction"`
	State           string               `json:"state"`
	Live            bool                 `json:"live"`
	Backend         string               `json:"backend"`
	HasVideo        bool                 `json:"hasVideo"`
	PeerRef         *string              `json:"peerRef"`
	StartedAt       string               `json:"startedAt"`
	ConnectedAt     *string              `json:"connectedAt"`
	EndedAt         *string              `json:"endedAt"`
	DurationSeconds *float64             `json:"durationSeconds"`
	EndReason       *CallRecordEndReason `json:"endReason"`
	AnsweredBy      *string              `json:"answeredBy"`
	Exclusive       *bool                `json:"exclusive"`
}
type CallRecordEvent struct {
	EventID    string `json:"eventId"`
	Type       string `json:"type"`
	OccurredAt string `json:"occurredAt"`
}
type CallRecordHistory struct {
	Events    []CallRecordEvent `json:"events"`
	Truncated bool              `json:"truncated"`
}
type CallRecordCorrelation struct {
	CallID    string `json:"callId"`
	SessionID string `json:"sessionId"`
}
type CallRecordDetail struct {
	Call         CallRecordSummary       `json:"call"`
	Participants []CallRecordParticipant `json:"participants"`
	Connections  []CallRecordConnection  `json:"connections"`
	Telemetry    CallRecordTelemetry     `json:"telemetry"`
	AppReports   CallRecordAppReports    `json:"appReports"`
	History      CallRecordHistory       `json:"history"`
	Correlation  CallRecordCorrelation   `json:"correlation"`
}
type CallStatsMetrics struct {
	Calls                  int64    `json:"calls"`
	Answered               int64    `json:"answered"`
	Missed                 int64    `json:"missed"`
	Declined               int64    `json:"declined"`
	Failed                 int64    `json:"failed"`
	InProgress             int64    `json:"inProgress"`
	AnswerRate             *float64 `json:"answerRate"`
	TotalDurationSeconds   float64  `json:"totalDurationSeconds"`
	AverageDurationSeconds *float64 `json:"averageDurationSeconds"`
}
type CallStatsGroup struct {
	CallStatsMetrics
	Key   string  `json:"key"`
	Start *string `json:"start"`
}
type CallStatsHeatmapCell struct {
	DayOfWeek int   `json:"dayOfWeek"`
	Hour      int   `json:"hour"`
	Calls     int64 `json:"calls"`
	Answered  int64 `json:"answered"`
}
type CallStats struct {
	Since           string                 `json:"since"`
	Until           string                 `json:"until"`
	Timezone        string                 `json:"timezone"`
	GroupBy         string                 `json:"groupBy"`
	Totals          CallStatsMetrics       `json:"totals"`
	Groups          []CallStatsGroup       `json:"groups"`
	GroupsTruncated bool                   `json:"groupsTruncated"`
	Heatmap         []CallStatsHeatmapCell `json:"heatmap"`
}
type CallFilters struct{ ProjectID, SessionID, Direction, Upstream, Outcome, Since, Until string }
type ListCallRecordsParams struct {
	CallFilters
	ListParams
}
type RetrieveCallRecordParams struct{ ProjectID string }
type CallStatsParams struct {
	CallFilters
	GroupBy, Timezone string
}
type ExportCallRecordsParams struct {
	CallFilters
	ListParams
	Format string
}
type CallRecordExportPage struct {
	Format     string
	Body       string
	NextCursor *string
}
type PlatformCalls struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) Calls() *PlatformCalls { return &PlatformCalls{t: c.t} }
func (c *ProjectClient) Calls() *PlatformCalls      { return &PlatformCalls{c.t, c.projectID} }

var callIDPattern = regexp.MustCompile(`^[\x21-\x7e]{1,128}$`)
var callTimestampPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$`)

func callText(s, field string, max int) error {
	if strings.TrimSpace(s) == "" || len(s) > max {
		return configuration(field, field+" must be a non-empty string within its length limit.")
	}
	return nil
}
func callEnum(s, field string, values ...string) error {
	for _, v := range values {
		if s == v {
			return nil
		}
	}
	return configuration(field, "Invalid "+field+" value.")
}
func (r *PlatformCalls) filters(p CallFilters) (url.Values, error) {
	q := url.Values{}
	if r.projectID != "" {
		if p.ProjectID != "" && p.ProjectID != r.projectID {
			return nil, configuration("projectId", "A project client reads only its own project's calls.")
		}
		q.Set("projectId", r.projectID)
	} else if p.ProjectID != "" {
		if err := callText(p.ProjectID, "projectId", 64); err != nil {
			return nil, err
		}
		q.Set("projectId", p.ProjectID)
	}
	if p.SessionID != "" {
		if err := callText(p.SessionID, "sessionId", 128); err != nil {
			return nil, err
		}
		q.Set("sessionId", p.SessionID)
	}
	for _, v := range []struct {
		s, key string
		values []string
	}{{p.Direction, "direction", []string{"inbound", "outbound"}}, {p.Upstream, "upstream", []string{"linked_device", "cloud_api"}}, {p.Outcome, "outcome", []string{"answered", "missed", "declined", "failed", "in_progress"}}} {
		if v.s != "" {
			if err := callEnum(v.s, v.key, v.values...); err != nil {
				return nil, err
			}
			q.Set(v.key, v.s)
		}
	}
	for key, s := range map[string]string{"since": p.Since, "until": p.Until} {
		if s != "" {
			if !callTimestampPattern.MatchString(s) {
				return nil, configuration(key, key+" must be an RFC3339 timestamp with time zone.")
			}
			if _, err := time.Parse(time.RFC3339Nano, s); err != nil {
				return nil, configuration(key, "Invalid calendar instant.")
			}
			q.Set(key, s)
		}
	}
	return q, nil
}
func callPagination(q url.Values, p ListParams, max int) error {
	if p.Limit != 0 {
		if p.Limit < 1 || p.Limit > max {
			return configuration("limit", "limit is outside the allowed range.")
		}
		setInt(q, "limit", p.Limit)
	}
	if p.Cursor != "" {
		if err := callText(p.Cursor, "cursor", 256); err != nil {
			return err
		}
		q.Set("cursor", p.Cursor)
	}
	return nil
}
func (r *PlatformCalls) Retrieve(ctx context.Context, id string, p RetrieveCallRecordParams, o ...RequestOptions) (Response[CallRecordDetail], error) {
	if !callIDPattern.MatchString(id) {
		return Response[CallRecordDetail]{}, configuration("callId", "callId must have 1 to 128 printable ASCII characters without spaces.")
	}
	q, err := r.filters(CallFilters{ProjectID: p.ProjectID})
	if err != nil {
		return Response[CallRecordDetail]{}, err
	}
	return unwrapped[CallRecordDetail](ctx, r.t, "GET", "/platform/calls/"+escaped(id), q, nil, options(o))
}
func (r *PlatformCalls) Stats(ctx context.Context, p CallStatsParams, o ...RequestOptions) (Response[CallStats], error) {
	q, err := r.filters(p.CallFilters)
	if err != nil {
		return Response[CallStats]{}, err
	}
	if p.GroupBy != "" {
		if err = callEnum(p.GroupBy, "groupBy", "day", "hour", "session", "outcome"); err != nil {
			return Response[CallStats]{}, err
		}
		q.Set("groupBy", p.GroupBy)
	}
	if p.Timezone != "" {
		if err = callText(p.Timezone, "timezone", 64); err != nil {
			return Response[CallStats]{}, err
		}
		q.Set("timezone", p.Timezone)
	}
	return unwrapped[CallStats](ctx, r.t, "GET", "/platform/calls/stats", q, nil, options(o))
}
func (r *PlatformCalls) List(ctx context.Context, p ListCallRecordsParams, o ...RequestOptions) (*CursorPage[CallRecord], error) {
	q, err := r.filters(p.CallFilters)
	if err != nil {
		return nil, err
	}
	if err = callPagination(q, p.ListParams, 100); err != nil {
		return nil, err
	}
	return page[CallRecord](ctx, r.t, "/platform/calls", q, options(o))
}
func (r *PlatformCalls) Export(ctx context.Context, p ExportCallRecordsParams, o ...RequestOptions) (Response[CallRecordExportPage], error) {
	result := Response[CallRecordExportPage]{}
	q, err := r.filters(p.CallFilters)
	if err != nil {
		return result, err
	}
	format := p.Format
	if format == "" {
		format = "csv"
	}
	if err = callEnum(format, "format", "csv", "ndjson"); err != nil {
		return result, err
	}
	q.Set("format", format)
	if err = callPagination(q, p.ListParams, 1000); err != nil {
		return result, err
	}
	mime := "text/csv"
	if format == "ndjson" {
		mime = "application/x-ndjson"
	}
	text, err := requestText(ctx, r.t, "/platform/calls/export", q, mime, options(o))
	result.Metadata = text.Metadata
	if err != nil {
		return result, err
	}
	result.Data = CallRecordExportPage{Format: format, Body: text.Data}
	if next := text.Metadata.Headers.Get("Polymorfa-Next-Cursor"); next != "" {
		result.Data.NextCursor = &next
	}
	return result, nil
}
func (r *PlatformCalls) ExportAll(ctx context.Context, p ExportCallRecordsParams, o ...RequestOptions) iter.Seq2[string, error] {
	return func(yield func(string, error) bool) {
		seen := map[string]bool{}
		if p.Cursor != "" {
			seen[p.Cursor] = true
		}
		first := true
		for {
			resp, err := r.Export(ctx, p, o...)
			if err != nil {
				yield("", err)
				return
			}
			data := resp.Data
			if data.NextCursor != nil && seen[*data.NextCursor] {
				yield("", &Error{Kind: ServerError, Code: "invalid_response", Message: "The API repeated an export cursor.", Metadata: resp.Metadata})
				return
			}
			body := data.Body
			if !first && data.Format == "csv" {
				if i := strings.IndexByte(body, '\n'); i >= 0 {
					body = body[i+1:]
				} else {
					body = ""
				}
			}
			first = false
			if body != "" && !yield(body, nil) {
				return
			}
			if data.NextCursor == nil {
				return
			}
			p.Cursor = *data.NextCursor
			seen[p.Cursor] = true
		}
	}
}
