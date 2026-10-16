package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"iter"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type RequestLogResult string

const (
	RequestLogSuccess RequestLogResult = "success"
	RequestLogFailure RequestLogResult = "failure"
)

type RequestLogSource string
type RequestLogCredentialType string
type RequestLogMethod string
type RequestLogStatus string

const (
	RequestLogAPI          RequestLogSource         = "api"
	RequestLogMCP          RequestLogSource         = "mcp"
	RequestLogTeamKey      RequestLogCredentialType = "team_key"
	RequestLogProjectToken RequestLogCredentialType = "project_token"
	RequestLogClientToken  RequestLogCredentialType = "client_token"
	RequestLogGET          RequestLogMethod         = "GET"
	RequestLogPOST         RequestLogMethod         = "POST"
	RequestLogPUT          RequestLogMethod         = "PUT"
	RequestLogPATCH        RequestLogMethod         = "PATCH"
	RequestLogDELETE       RequestLogMethod         = "DELETE"
	RequestLog1xx          RequestLogStatus         = "1xx"
	RequestLog2xx          RequestLogStatus         = "2xx"
	RequestLog3xx          RequestLogStatus         = "3xx"
	RequestLog4xx          RequestLogStatus         = "4xx"
	RequestLog5xx          RequestLogStatus         = "5xx"
)

func RequestLogStatusCode(status int) RequestLogStatus { return RequestLogStatus(strconv.Itoa(status)) }

type RequestLogCredential struct {
	Type  RequestLogCredentialType `json:"type"`
	ID    *string                  `json:"id"`
	Last4 *string                  `json:"last4"`
}
type RequestLog struct {
	ID         string                `json:"id"`
	ProjectID  string                `json:"projectId"`
	CreatedAt  string                `json:"createdAt"`
	Method     string                `json:"method"`
	Route      string                `json:"route"`
	Status     *int                  `json:"status"`
	DurationMs *float64              `json:"durationMs"`
	Result     RequestLogResult      `json:"result"`
	Source     RequestLogSource      `json:"source"`
	RequestID  *string               `json:"requestId"`
	TraceID    *string               `json:"traceId"`
	ErrorCode  *string               `json:"errorCode"`
	MCPTool    *string               `json:"mcpTool"`
	Credential *RequestLogCredential `json:"credential"`
}
type RequestLogFilters struct {
	Status                           []RequestLogStatus
	Method                           []RequestLogMethod
	Route                            *string
	Source                           RequestLogSource
	CredentialID, RequestID, TraceID *string
	Since, Until                     *string
	SinceTime, UntilTime             *time.Time
}
type ListRequestLogsParams struct {
	RequestLogFilters
	ProjectID string
	Limit     *int
	Cursor    *string
}
type FollowRequestLogsParams struct {
	ProjectID string
	After     string
	Limit     *int
}
type TailRequestLogsParams struct {
	RequestLogFilters
	ProjectID string
	Interval  time.Duration
	Backfill  int
}
type RequestLogPage struct {
	Items        []RequestLog
	HasMore      bool
	NextCursor   *string
	FollowCursor string
	Metadata     Metadata
}
type RequestLogs struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) RequestLogs() *RequestLogs { return &RequestLogs{t: c.t} }
func (c *ProjectClient) RequestLogs() *RequestLogs      { return &RequestLogs{c.t, c.projectID} }
func (r *RequestLogs) project(requested string) (string, error) {
	if r.projectID != "" {
		if requested != "" && requested != r.projectID {
			return "", validation("This client reads only its own project's request log.")
		}
		return r.projectID, nil
	}
	if requested == "" {
		return "", configuration("projectId", "projectId is required to read a request log with an organization key.")
	}
	return requested, nil
}
func (f RequestLogFilters) query() (url.Values, error) {
	q := url.Values{}
	if len(f.Status) > 0 {
		values := make([]string, len(f.Status))
		for i, v := range f.Status {
			values[i] = string(v)
		}
		q.Set("status", strings.Join(values, ","))
	}
	if len(f.Method) > 0 {
		values := make([]string, len(f.Method))
		for i, v := range f.Method {
			values[i] = string(v)
		}
		q.Set("method", strings.Join(values, ","))
	}
	for name, value := range map[string]*string{"route": f.Route, "credentialId": f.CredentialID, "requestId": f.RequestID, "traceId": f.TraceID, "since": f.Since, "until": f.Until} {
		if value != nil {
			q.Set(name, *value)
		}
	}
	if f.Source != "" {
		q.Set("source", string(f.Source))
	}
	for _, entry := range []struct {
		name  string
		raw   *string
		value *time.Time
	}{{"since", f.Since, f.SinceTime}, {"until", f.Until, f.UntilTime}} {
		if entry.value != nil {
			if entry.raw != nil {
				return nil, validation("Supply one timestamp representation for " + entry.name + ".")
			}
			q.Set(entry.name, entry.value.UTC().Format("2006-01-02T15:04:05.000Z"))
		}
	}
	return q, nil
}
func (r *RequestLogs) List(ctx context.Context, p ListRequestLogsParams, opts ...RequestOptions) (*RequestLogPage, error) {
	q, err := p.RequestLogFilters.query()
	if err != nil {
		return nil, err
	}
	if p.Cursor != nil && len(q) > 0 {
		return nil, validation("cursor keeps the filters of the page that returned it; do not combine it with filters.")
	}
	if p.Cursor != nil {
		q.Set("cursor", *p.Cursor)
	}
	if p.Limit != nil {
		q.Set("limit", strconv.Itoa(*p.Limit))
	}
	return r.read(ctx, p.ProjectID, q, options(opts))
}
func (r *RequestLogs) Follow(ctx context.Context, p FollowRequestLogsParams, opts ...RequestOptions) (*RequestLogPage, error) {
	q := url.Values{"after": {p.After}}
	if p.Limit != nil {
		q.Set("limit", strconv.Itoa(*p.Limit))
	}
	return r.read(ctx, p.ProjectID, q, options(opts))
}
func (r *RequestLogs) read(ctx context.Context, projectID string, q url.Values, o RequestOptions) (*RequestLogPage, error) {
	project, err := r.project(projectID)
	if err != nil {
		return nil, err
	}
	response, err := request[json.RawMessage](ctx, r.t, "GET", "/platform/projects/"+escaped(project)+"/request-logs", q, nil, o)
	if err != nil {
		return nil, err
	}
	var wire struct {
		Data json.RawMessage `json:"data"`
		Page *struct {
			HasMore      *bool           `json:"hasMore"`
			NextCursor   json.RawMessage `json:"nextCursor"`
			FollowCursor *string         `json:"followCursor"`
		} `json:"page"`
	}
	invalid := func() (*RequestLogPage, error) {
		return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned an invalid request log page.", Status: response.Metadata.Status, RequestID: response.Metadata.RequestID, Metadata: response.Metadata, Details: response.Data}
	}
	if !jsonResult(response.Metadata, 200) || json.Unmarshal(response.Data, &wire) != nil || wire.Page == nil || wire.Page.HasMore == nil || wire.Page.FollowCursor == nil || len(wire.Page.NextCursor) == 0 || len(wire.Data) == 0 || wire.Data[0] != '[' {
		return invalid()
	}
	var items []RequestLog
	if campaignDecode(wire.Data, &items) != nil {
		return invalid()
	}
	var next *string
	if json.Unmarshal(wire.Page.NextCursor, &next) != nil {
		return invalid()
	}
	return &RequestLogPage{items, *wire.Page.HasMore, next, *wire.Page.FollowCursor, response.Metadata}, nil
}

var requestLogSeconds = regexp.MustCompile(`^\d+$`)

// RequestLogRetryAfter returns a bounded delay; absent or invalid values use one minute.
func RequestLogRetryAfter(header string, now time.Time) time.Duration {
	value := strings.TrimSpace(header)
	if requestLogSeconds.MatchString(value) {
		seconds, _ := strconv.ParseFloat(value, 64)
		if seconds >= 300 || math.IsInf(seconds, 1) {
			return 5 * time.Minute
		}
		return time.Duration(seconds * float64(time.Second))
	}
	if date, err := http.ParseTime(value); err == nil {
		delay := date.Sub(now)
		if delay < 0 {
			return 0
		}
		if delay > 5*time.Minute {
			return 5 * time.Minute
		}
		return delay
	}
	return time.Minute
}
func (r *RequestLogs) rateLimited(ctx context.Context, read func() (*RequestLogPage, error)) (*RequestLogPage, error) {
	for {
		if ctx.Err() != nil {
			return nil, nil
		}
		page, err := read()
		if ctx.Err() != nil {
			return nil, nil
		}
		var api *Error
		if !errors.As(err, &api) || api.Kind != RateLimitError {
			return page, err
		}
		if sleep(ctx, RequestLogRetryAfter(api.Metadata.Headers.Get("Retry-After"), time.Now())) != nil {
			return nil, nil
		}
	}
}

// Tail yields chronologically, follows without delay while pages remain, and stops gracefully on cancellation or loop exit.
func (r *RequestLogs) Tail(ctx context.Context, p TailRequestLogsParams, opts ...RequestOptions) iter.Seq2[RequestLog, error] {
	return func(yield func(RequestLog, error) bool) {
		interval := p.Interval
		if interval == 0 {
			interval = 2 * time.Second
		}
		if interval < time.Second || interval > time.Minute || interval%time.Millisecond != 0 {
			yield(RequestLog{}, validation("interval must be an integer number of milliseconds from 1000 to 60000."))
			return
		}
		if p.Backfill < 0 || p.Backfill > 100 {
			yield(RequestLog{}, validation("backfill must be from 0 to 100."))
			return
		}
		limit := max(1, p.Backfill)
		first, err := r.rateLimited(ctx, func() (*RequestLogPage, error) {
			return r.List(ctx, ListRequestLogsParams{RequestLogFilters: p.RequestLogFilters, ProjectID: p.ProjectID, Limit: &limit}, opts...)
		})
		if err != nil {
			yield(RequestLog{}, err)
			return
		}
		if first == nil {
			return
		}
		if p.Backfill > 0 {
			for i := len(first.Items) - 1; i >= 0; i-- {
				if ctx.Err() != nil || !yield(first.Items[i], nil) {
					return
				}
			}
		}
		after := first.FollowCursor
		followLimit := 100
		for ctx.Err() == nil {
			page, err := r.rateLimited(ctx, func() (*RequestLogPage, error) {
				return r.Follow(ctx, FollowRequestLogsParams{p.ProjectID, after, &followLimit}, opts...)
			})
			if err != nil {
				yield(RequestLog{}, err)
				return
			}
			if page == nil {
				return
			}
			for _, item := range page.Items {
				if ctx.Err() != nil || !yield(item, nil) {
					return
				}
			}
			after = page.FollowCursor
			if !page.HasMore && sleep(ctx, interval) != nil {
				return
			}
		}
	}
}
