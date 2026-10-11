package polymorfa

import (
	"context"
	"net/url"
	"strconv"
	"strings"
)

type AnalyticsParams struct {
	ProjectID, SessionID string
	Start, End           *int64
}
type AnalyticsMetricsParams struct {
	ProjectID, SessionID string
	WindowHours          int
	Segments             *bool
	Format               string
}
type Analytics struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) Analytics() *Analytics { return &Analytics{t: c.t} }
func (c *ProjectClient) Analytics() *Analytics      { return &Analytics{c.t, c.projectID} }
func analyticsError(code, message string) error {
	return &Error{Kind: ValidationError, Code: code, Message: message}
}
func (r *Analytics) filters(project, session string) (url.Values, error) {
	q := url.Values{}
	for _, v := range []struct{ name, value string }{{"projectId", project}, {"sessionId", session}} {
		if v.value != "" {
			if !functionUUID.MatchString(strings.ToLower(v.value)) {
				return nil, analyticsError("invalid_analytics_filter", v.name+" must be a UUID.")
			}
			q.Set(v.name, v.value)
		}
	}
	if r.projectID != "" {
		if project != "" && !strings.EqualFold(project, r.projectID) {
			return nil, analyticsError("invalid_analytics_filter", "Analytics cannot read outside the client's project.")
		}
		q.Del("projectId")
	}
	return q, nil
}
func (r *Analytics) path() string {
	if r.projectID != "" {
		return projectPath(r.projectID) + "/analytics"
	}
	return "/platform/analytics"
}
func (r *Analytics) Get(ctx context.Context, p AnalyticsParams, o ...RequestOptions) (Response[WhatsAppAnalytics], error) {
	q, err := r.filters(p.ProjectID, p.SessionID)
	if err != nil {
		return Response[WhatsAppAnalytics]{}, err
	}
	for _, v := range []struct {
		name  string
		value *int64
	}{{"start", p.Start}, {"end", p.End}} {
		if v.value != nil {
			if *v.value < 0 || *v.value > 9007199254740991 {
				return Response[WhatsAppAnalytics]{}, analyticsError("invalid_analytics_range", v.name+" must be Unix milliseconds.")
			}
			q.Set(v.name, strconv.FormatInt(*v.value, 10))
		}
	}
	if p.Start != nil && p.End != nil && (*p.End < *p.Start || *p.End-*p.Start > 366*86400000) {
		return Response[WhatsAppAnalytics]{}, analyticsError("invalid_analytics_range", "Choose an ordered analytics range of up to 366 days.")
	}
	return unwrapped[WhatsAppAnalytics](ctx, r.t, "GET", r.path(), q, nil, options(o))
}
func (r *Analytics) Metrics(ctx context.Context, p AnalyticsMetricsParams, o ...RequestOptions) (Response[string], error) {
	q, err := r.filters(p.ProjectID, p.SessionID)
	if err != nil {
		return Response[string]{}, err
	}
	if p.WindowHours != 0 {
		if p.WindowHours < 1 || p.WindowHours > 168 {
			return Response[string]{}, analyticsError("invalid_analytics_range", "windowHours must be from 1 to 168.")
		}
		setInt(q, "windowHours", p.WindowHours)
	}
	if p.Segments != nil {
		q.Set("segments", strconv.FormatBool(*p.Segments))
	}
	format := p.Format
	if format == "" {
		format = "prometheus"
	}
	if format != "prometheus" && format != "openmetrics" {
		return Response[string]{}, analyticsError("invalid_analytics_filter", "format must be prometheus or openmetrics.")
	}
	q.Set("format", format)
	mime := "text/plain"
	if format == "openmetrics" {
		mime = "application/openmetrics-text"
	}
	rtext, err := requestText(ctx, r.t, r.path()+"/metrics", q, mime, options(o))
	if err != nil {
		return rtext, err
	}
	found := false
	for _, line := range strings.Split(rtext.Data, "\n") {
		if line == "# TYPE polymorfa_analytics_enabled gauge" {
			found = true
			break
		}
	}
	if !found || (format == "openmetrics" && !strings.HasSuffix(rtext.Data, "# EOF\n")) {
		return rtext, &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned an invalid analytics metrics response.", Metadata: rtext.Metadata, Status: rtext.Metadata.Status}
	}
	return rtext, nil
}
