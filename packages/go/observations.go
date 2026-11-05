package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

type Label struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Color      int    `json:"color"`
	OrderIndex *int   `json:"orderIndex,omitempty"`
	ChatCount  *int   `json:"chatCount,omitempty"`
	ObservedAt string `json:"observedAt,omitempty"`
}
type LabelCollection struct {
	Policy        string  `json:"policy"`
	Status        string  `json:"status"`
	UnknownReason string  `json:"unknownReason,omitempty"`
	ObservedAt    string  `json:"observedAt,omitempty"`
	ExpiresAt     string  `json:"expiresAt,omitempty"`
	Labels        []Label `json:"labels"`
}

// LabelRead preserves the two documented response shapes. Collection is present
// when observation metadata was requested; Labels holds the older array shape.
type LabelRead struct {
	Labels     []Label
	Collection *LabelCollection
}

func (l *LabelRead) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '[' {
		return json.Unmarshal(b, &l.Labels)
	}
	var c LabelCollection
	if err := json.Unmarshal(b, &c); err != nil {
		return err
	}
	l.Collection = &c
	return nil
}
func (l LabelRead) MarshalJSON() ([]byte, error) {
	if l.Collection != nil {
		return json.Marshal(l.Collection)
	}
	return json.Marshal(l.Labels)
}

type ListLabelsParams struct{ IncludeObservation *bool }
type CreateLabelRequest struct {
	Name  string `json:"name"`
	Color *int   `json:"color,omitempty"`
}
type UpdateLabelRequest struct {
	Name  *string `json:"name,omitempty"`
	Color *int    `json:"color,omitempty"`
}
type ReplaceChatLabelsRequest struct {
	Labels []string `json:"labels"`
}
type Labels struct{ t *transport }

func (c *MessagingClient) Labels() *Labels { return &Labels{c.t} }
func labelQuery(p ListLabelsParams) url.Values {
	q := url.Values{}
	setBool(q, "includeObservation", p.IncludeObservation)
	return q
}
func (r *Labels) List(ctx context.Context, s string, p ListLabelsParams, o ...RequestOptions) (Response[Envelope[LabelRead]], error) {
	return request[Envelope[LabelRead]](ctx, r.t, "GET", messagingPath(s)+"/labels", labelQuery(p), nil, options(o))
}
func (r *Labels) Create(ctx context.Context, s string, b CreateLabelRequest, o ...RequestOptions) (Response[Envelope[Label]], error) {
	return request[Envelope[Label]](ctx, r.t, "POST", messagingPath(s)+"/labels", nil, b, options(o))
}
func (r *Labels) Update(ctx context.Context, s, id string, b UpdateLabelRequest, o ...RequestOptions) (Response[Success], error) {
	if b.Name == nil && b.Color == nil {
		return Response[Success]{}, validation("A label name or color is required.")
	}
	return request[Success](ctx, r.t, "PUT", messagingPath(s)+"/labels/"+escaped(id), nil, b, options(o))
}
func (r *Labels) Delete(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", messagingPath(s)+"/labels/"+escaped(id), nil, nil, options(o))
}
func (r *Labels) ListForChat(ctx context.Context, s, id string, p ListLabelsParams, o ...RequestOptions) (Response[Envelope[LabelRead]], error) {
	return request[Envelope[LabelRead]](ctx, r.t, "GET", messagingPath(s)+"/labels/chats/"+escaped(id), labelQuery(p), nil, options(o))
}
func (r *Labels) ReplaceForChat(ctx context.Context, s, id string, b ReplaceChatLabelsRequest, o ...RequestOptions) (Response[Success], error) {
	if b.Labels == nil {
		b.Labels = []string{}
	}
	return request[Success](ctx, r.t, "PUT", messagingPath(s)+"/labels/chats/"+escaped(id), nil, b, options(o))
}

type QuickReplyMutation struct {
	Shortcut string   `json:"shortcut"`
	Message  string   `json:"message"`
	Keywords []string `json:"keywords,omitempty"`
	Count    *int     `json:"count,omitempty"`
}
type QuickReply struct {
	QuickReplyMutation
	ID string `json:"id"`
}
type ObservedQuickReply struct {
	QuickReply
	AssociatedLabelIDs []string `json:"associatedLabelIds"`
	ObservedAt         string   `json:"observedAt"`
}
type QuickReplyCollection struct {
	Policy        string               `json:"policy"`
	Status        string               `json:"status"`
	UnknownReason string               `json:"unknownReason,omitempty"`
	ObservedAt    string               `json:"observedAt,omitempty"`
	QuickReplies  []ObservedQuickReply `json:"quickReplies"`
}
type DeletedQuickReply struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
type QuickReplies struct{ t *transport }

func (c *MessagingClient) QuickReplies() *QuickReplies { return &QuickReplies{c.t} }
func (r *QuickReplies) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[QuickReplyCollection]], error) {
	return request[Envelope[QuickReplyCollection]](ctx, r.t, "GET", messagingPath(s)+"/business/quick-replies", nil, nil, options(o))
}
func (r *QuickReplies) Create(ctx context.Context, s string, b QuickReplyMutation, o ...RequestOptions) (Response[Envelope[QuickReply]], error) {
	return request[Envelope[QuickReply]](ctx, r.t, "POST", messagingPath(s)+"/business/quick-replies", nil, b, options(o))
}
func (r *QuickReplies) Replace(ctx context.Context, s, id string, b QuickReplyMutation, o ...RequestOptions) (Response[Envelope[QuickReply]], error) {
	return request[Envelope[QuickReply]](ctx, r.t, "PUT", messagingPath(s)+"/business/quick-replies/"+escaped(id), nil, b, options(o))
}
func (r *QuickReplies) Delete(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[DeletedQuickReply]], error) {
	return request[Envelope[DeletedQuickReply]](ctx, r.t, "DELETE", messagingPath(s)+"/business/quick-replies/"+escaped(id), nil, nil, options(o))
}

type ObservationValues struct {
	PresenceMode   string `json:"presenceMode"`
	TypingMode     string `json:"typingMode"`
	LabelMode      string `json:"labelMode"`
	QuickReplyMode string `json:"quickReplyMode,omitempty"`
}
type ProjectObservationPolicy struct {
	ProjectID string `json:"projectId"`
	ObservationValues
}
type SessionObservationPolicy struct {
	SessionName string            `json:"sessionName"`
	ProjectID   string            `json:"projectId"`
	Project     ObservationValues `json:"project"`
	Override    ObservationValues `json:"override"`
	Effective   ObservationValues `json:"effective"`
}
type ObservationPolicies struct{ t *transport }

func (c *MessagingClient) ObservationPolicies() *ObservationPolicies {
	return &ObservationPolicies{c.t}
}
func (r *ObservationPolicies) RetrieveForProject(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ProjectObservationPolicy]], error) {
	return request[Envelope[ProjectObservationPolicy]](ctx, r.t, "GET", "/messaging/projects/"+escaped(id)+"/observation-policy", nil, nil, options(o))
}
func (r *ObservationPolicies) RetrieveForSession(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[SessionObservationPolicy]], error) {
	return request[Envelope[SessionObservationPolicy]](ctx, r.t, "GET", messagingPath(s)+"/observation-policy", nil, nil, options(o))
}

type HybridScope struct {
	Scope     string
	ProjectID string
	Session   string
}

func (s HybridScope) query() (url.Values, error) {
	q := url.Values{"scope": {s.Scope}}
	switch s.Scope {
	case "team":
		if s.ProjectID != "" || s.Session != "" {
			return nil, validation("Team scope has no project or session.")
		}
	case "project":
		if s.ProjectID == "" || s.Session != "" {
			return nil, validation("Project scope requires projectId.")
		}
		q.Set("projectId", s.ProjectID)
	case "session":
		if s.ProjectID == "" || s.Session == "" {
			return nil, validation("Session scope requires projectId and session.")
		}
		q.Set("projectId", s.ProjectID)
		q.Set("session", s.Session)
	default:
		return nil, validation("Invalid Hybrid Link scope.")
	}
	return q, nil
}

type HybridRoutingPolicy struct {
	Scope             string   `json:"scope"`
	Revision          string   `json:"revision"`
	Prefer            *string  `json:"prefer"`
	AllowedTransports []string `json:"allowedTransports"`
}
type SetHybridRoutingPolicyRequest struct {
	ExpectedRevision  string   `json:"expectedRevision"`
	Prefer            *string  `json:"prefer"`
	AllowedTransports []string `json:"allowedTransports"`
}
type HybridConnection struct {
	Kind    string `json:"kind"`
	Status  string `json:"status"`
	Enabled bool   `json:"enabled"`
}
type HybridLinkState struct {
	Revision    string             `json:"revision"`
	Paused      bool               `json:"paused"`
	Connections []HybridConnection `json:"connections"`
}
type HybridPaused struct {
	Revision string `json:"revision"`
	Paused   bool   `json:"paused"`
}
type SetHybridPausedRequest struct {
	ExpectedRevision string `json:"expectedRevision"`
	Paused           bool   `json:"paused"`
}
type HybridLink struct{ t *transport }

func (c *MessagingClient) HybridLink() *HybridLink { return &HybridLink{c.t} }
func (r *HybridLink) GetPolicy(ctx context.Context, s HybridScope, o ...RequestOptions) (Response[Envelope[HybridRoutingPolicy]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HybridRoutingPolicy]]{}, err
	}
	q, err := s.query()
	if err != nil {
		return Response[Envelope[HybridRoutingPolicy]]{}, err
	}
	return request[Envelope[HybridRoutingPolicy]](ctx, r.t, "GET", "/messaging/routing/hybrid", q, nil, options(o))
}
func (r *HybridLink) SetPolicy(ctx context.Context, s HybridScope, b SetHybridRoutingPolicyRequest, o ...RequestOptions) (Response[Envelope[HybridRoutingPolicy]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HybridRoutingPolicy]]{}, err
	}
	q, err := s.query()
	if err != nil {
		return Response[Envelope[HybridRoutingPolicy]]{}, err
	}
	return request[Envelope[HybridRoutingPolicy]](ctx, r.t, "PUT", "/messaging/routing/hybrid", q, b, options(o))
}
func (r *HybridLink) State(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[HybridLinkState]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HybridLinkState]]{}, err
	}
	return request[Envelope[HybridLinkState]](ctx, r.t, "GET", messagingPath(s)+"/hybrid-link", nil, nil, options(o))
}
func (r *HybridLink) SetPaused(ctx context.Context, s string, b SetHybridPausedRequest, o ...RequestOptions) (Response[Envelope[HybridPaused]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HybridPaused]]{}, err
	}
	return request[Envelope[HybridPaused]](ctx, r.t, "PUT", messagingPath(s)+"/hybrid-link", nil, b, options(o))
}

func messagingPath(s string) string { return "/messaging/" + escaped(s) }
