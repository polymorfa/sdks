package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

type AuditLog struct {
	ID          string          `json:"id"`
	ActorEmail  string          `json:"actorEmail"`
	ActorUserID *string         `json:"actorUserId"`
	ActorRole   *string         `json:"actorRole"`
	Action      string          `json:"action"`
	Resource    string          `json:"resource"`
	ProjectID   *string         `json:"projectId"`
	ProjectName *string         `json:"projectName"`
	IP          *string         `json:"ip"`
	UserAgent   *string         `json:"userAgent"`
	Duration    *float64        `json:"duration"`
	Source      *string         `json:"source"`
	Description *string         `json:"description"`
	Result      string          `json:"result"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   int64           `json:"createdAt"`
}
type ListAuditLogsParams struct {
	Action, Resource string
	Limit            int
}
type SessionBan struct {
	ID           string  `json:"id"`
	SessionName  string  `json:"sessionName"`
	BanCode      *int    `json:"banCode"`
	BanReason    *string `json:"banReason"`
	BanExpiresAt *int64  `json:"banExpiresAt"`
	OccurredAt   int64   `json:"occurredAt"`
	Status       string  `json:"status"`
}
type SecurityIncident struct {
	ID             string  `json:"id"`
	KeyID          string  `json:"keyId"`
	TokenType      string  `json:"tokenType"`
	Source         string  `json:"source"`
	URL            *string `json:"url"`
	Ref            *string `json:"ref"`
	Resolution     string  `json:"resolution"`
	DetectedAt     int64   `json:"detectedAt"`
	AcknowledgedAt *int64  `json:"acknowledgedAt"`
	AcknowledgedBy *string `json:"acknowledgedBy"`
	CreatedAt      int64   `json:"createdAt"`
}
type SecurityIncidentAcknowledgement struct {
	Acknowledged bool `json:"acknowledged"`
}
type AuditLogs struct{ t *transport }
type SessionBans struct{ t *transport }
type SecurityIncidents struct{ t *transport }

func (c *OrganizationClient) AuditLogs() *AuditLogs                 { return &AuditLogs{c.t} }
func (c *OrganizationClient) SessionBans() *SessionBans             { return &SessionBans{c.t} }
func (c *OrganizationClient) SecurityIncidents() *SecurityIncidents { return &SecurityIncidents{c.t} }
func (r *AuditLogs) List(ctx context.Context, p ListAuditLogsParams, o ...RequestOptions) (Response[Envelope[[]AuditLog]], error) {
	q := url.Values{}
	setString(q, "action", p.Action)
	setString(q, "resource", p.Resource)
	setInt(q, "limit", p.Limit)
	return request[Envelope[[]AuditLog]](ctx, r.t, "GET", "/platform/audit", q, nil, options(o))
}
func (r *SessionBans) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]SessionBan]], error) {
	return request[Envelope[[]SessionBan]](ctx, r.t, "GET", "/platform/bans", nil, nil, options(o))
}
func (r *SessionBans) ListActive(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]SessionBan]], error) {
	return request[Envelope[[]SessionBan]](ctx, r.t, "GET", "/platform/bans/active", nil, nil, options(o))
}
func (r *SecurityIncidents) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]SecurityIncident]], error) {
	return request[Envelope[[]SecurityIncident]](ctx, r.t, "GET", "/platform/incidents", nil, nil, options(o))
}
func (r *SecurityIncidents) Acknowledge(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SecurityIncidentAcknowledgement]], error) {
	return request[Envelope[SecurityIncidentAcknowledgement]](ctx, r.t, "POST", "/platform/incidents/"+escaped(id)+"/acknowledge", nil, nil, options(o))
}
