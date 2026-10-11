package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
)

type SessionProjectContext struct {
	ProjectID string `json:"projectId,omitempty"`
}
type SessionStartResult struct {
	Starting  bool   `json:"starting"`
	SessionID string `json:"sessionId"`
}
type SessionStopResult struct {
	Stopping  bool   `json:"stopping"`
	SessionID string `json:"sessionId"`
}
type SessionRemoveResult struct {
	Removed   bool   `json:"removed"`
	SessionID string `json:"sessionId"`
}
type SessionBatchRequest struct {
	ProjectID  string   `json:"projectId,omitempty"`
	SessionIDs []string `json:"sessionIds"`
}
type SessionBatchStopResult struct {
	Stopping int `json:"stopping"`
}
type SessionBatchRemoveResult struct {
	Removed int `json:"removed"`
}
type SessionTierOverrideRequest struct {
	ProjectID string `json:"projectId,omitempty"`
	QuoteID   string `json:"quoteId"`
}
type HybridResolution struct {
	Action                  string `json:"action"`
	Transport               string `json:"transport,omitempty"`
	ExistingNumberTransport string `json:"existingNumberTransport,omitempty"`
	NewNumberName           string `json:"newNumberName,omitempty"`
}
type HybridMerge struct {
	AbsorbNumberID string `json:"absorbNumberId"`
}
type NumberTierQuoteRequest struct {
	ProjectID        string            `json:"projectId,omitempty"`
	TierOverride     *string           `json:"tierOverride"`
	HybridResolution *HybridResolution `json:"hybridResolution,omitempty"`
	HybridMerge      *HybridMerge      `json:"hybridMerge,omitempty"`
}
type NumberHybridTransition struct {
	Action                  string  `json:"action"`
	SurvivingNumberID       string  `json:"survivingNumberId"`
	Status                  string  `json:"status,omitempty"`
	FailureReason           *string `json:"failureReason,omitempty"`
	MetaDisconnectRequired  *bool   `json:"metaDisconnectRequired,omitempty"`
	EffectiveAtMs           *int64  `json:"effectiveAtMs,omitempty"`
	KeepTransport           string  `json:"keepTransport,omitempty"`
	ExistingNumberTransport string  `json:"existingNumberTransport,omitempty"`
	NewNumberName           string  `json:"newNumberName,omitempty"`
	NewNumberID             string  `json:"newNumberId,omitempty"`
	AbsorbNumberID          string  `json:"absorbNumberId,omitempty"`
}
type NumberTierQuote struct {
	Tier             string                  `json:"tier"`
	TierOverride     *string                 `json:"tierOverride"`
	AmountCents      float64                 `json:"amountCents"`
	PriceVersion     string                  `json:"priceVersion"`
	Action           string                  `json:"action"`
	EffectiveAtMs    int64                   `json:"effectiveAtMs"`
	ReplacesWindowID *string                 `json:"replacesWindowId"`
	HybridTransition *NumberHybridTransition `json:"hybridTransition,omitempty"`
}
type NumberTierChange struct {
	ID            string          `json:"id"`
	Status        string          `json:"status"`
	FailureReason *string         `json:"failureReason"`
	ExpiresAtMs   int64           `json:"expiresAtMs"`
	Quote         NumberTierQuote `json:"quote"`
}

// SessionCapability keeps unknown capability keys while narrowing value by kind.
type SessionCapability struct {
	Key          string  `json:"key"`
	Source       *string `json:"source"`
	Kind         string  `json:"kind"`
	Unit         *string `json:"unit"`
	FeatureValue *bool   `json:"-"`
	LimitValue   *int64  `json:"-"`
}

func (c *SessionCapability) UnmarshalJSON(b []byte) error {
	var wire struct {
		Key    string          `json:"key"`
		Source *string         `json:"source"`
		Kind   string          `json:"kind"`
		Unit   *string         `json:"unit"`
		Value  json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(b, &wire); err != nil {
		return err
	}
	c.Key, c.Source, c.Kind, c.Unit = wire.Key, wire.Source, wire.Kind, wire.Unit
	switch c.Kind {
	case "feature":
		return json.Unmarshal(wire.Value, &c.FeatureValue)
	case "limit":
		return json.Unmarshal(wire.Value, &c.LimitValue)
	default:
		return validation("Unknown session capability kind.")
	}
}
func (c SessionCapability) MarshalJSON() ([]byte, error) {
	var value any
	if c.Kind == "feature" {
		value = c.FeatureValue
	} else {
		value = c.LimitValue
	}
	return json.Marshal(struct {
		Key    string  `json:"key"`
		Source *string `json:"source"`
		Kind   string  `json:"kind"`
		Unit   *string `json:"unit"`
		Value  any     `json:"value"`
	}{c.Key, c.Source, c.Kind, c.Unit, value})
}

type SessionCapabilities struct {
	Session      string              `json:"session"`
	ProjectID    string              `json:"projectId"`
	Status       string              `json:"status"`
	SyncedAt     *string             `json:"syncedAt"`
	CheckedAt    *string             `json:"checkedAt"`
	AccountType  *string             `json:"accountType"`
	Capabilities []SessionCapability `json:"capabilities"`
}
type SafeModeSettings struct {
	Presence    string `json:"presence"`
	Typing      string `json:"typing"`
	Reads       string `json:"reads"`
	Pacing      string `json:"pacing"`
	OnlineStart int    `json:"onlineStart"`
	OnlineEnd   int    `json:"onlineEnd"`
}
type SafeModeOverride struct {
	Presence string `json:"presence"`
	Typing   string `json:"typing"`
	Reads    string `json:"reads"`
	Pacing   string `json:"pacing"`
}
type SafeModeApplied struct {
	ObservedAt string  `json:"observedAt"`
	Presence   *string `json:"presence"`
	Typing     *string `json:"typing"`
	Reads      *string `json:"reads"`
	Pacing     *string `json:"pacing"`
}
type SessionSafeMode struct {
	Session           string           `json:"session"`
	ProjectID         string           `json:"projectId"`
	Project           SafeModeSettings `json:"project"`
	Override          SafeModeOverride `json:"override"`
	Effective         SafeModeSettings `json:"effective"`
	Applied           *SafeModeApplied `json:"applied"`
	Mismatch          bool             `json:"mismatch"`
	Entitled          bool             `json:"entitled"`
	EntitlementReason *string          `json:"entitlementReason"`
}
type UpdateSessionSafeModeRequest struct {
	Presence string `json:"presence,omitempty"`
	Typing   string `json:"typing,omitempty"`
	Reads    string `json:"reads,omitempty"`
	Pacing   string `json:"pacing,omitempty"`
}
type PlatformSessions struct{ t *transport }

func (c *OrganizationClient) Sessions() *PlatformSessions { return &PlatformSessions{c.t} }
func (r *PlatformSessions) List(ctx context.Context, projectID string, o ...RequestOptions) (Response[Envelope[[]PlatformSession]], error) {
	q := url.Values{}
	setString(q, "projectId", projectID)
	return request[Envelope[[]PlatformSession]](ctx, r.t, "GET", "/platform/sessions", q, nil, options(o))
}
func (r *PlatformSessions) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[Session]], error) {
	return request[Envelope[Session]](ctx, r.t, "GET", sessionPath(id), nil, nil, options(o))
}
func (r *PlatformSessions) Update(ctx context.Context, id string, b UpdateSessionRequest, o ...RequestOptions) (Response[Envelope[Session]], error) {
	return request[Envelope[Session]](ctx, r.t, "PUT", sessionPath(id), nil, b, options(o))
}
func (r *PlatformSessions) Start(ctx context.Context, id string, b SessionProjectContext, o ...RequestOptions) (Response[Envelope[SessionStartResult]], error) {
	return request[Envelope[SessionStartResult]](ctx, r.t, "POST", sessionPath(id)+"/start", nil, b, options(o))
}
func (r *PlatformSessions) Stop(ctx context.Context, id string, b SessionProjectContext, o ...RequestOptions) (Response[Envelope[SessionStopResult]], error) {
	return request[Envelope[SessionStopResult]](ctx, r.t, "POST", sessionPath(id)+"/stop", nil, b, options(o))
}
func (r *PlatformSessions) StopMany(ctx context.Context, b SessionBatchRequest, o ...RequestOptions) (Response[Envelope[SessionBatchStopResult]], error) {
	return request[Envelope[SessionBatchStopResult]](ctx, r.t, "POST", "/platform/sessions/stop", nil, b, options(o))
}
func (r *PlatformSessions) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SessionRemoveResult]], error) {
	return request[Envelope[SessionRemoveResult]](ctx, r.t, "DELETE", sessionPath(id), nil, nil, options(o))
}
func (r *PlatformSessions) DeleteMany(ctx context.Context, b SessionBatchRequest, o ...RequestOptions) (Response[Envelope[SessionBatchRemoveResult]], error) {
	return request[Envelope[SessionBatchRemoveResult]](ctx, r.t, "POST", "/platform/sessions/delete", nil, b, options(o))
}
func (r *PlatformSessions) QuoteTierChange(ctx context.Context, id string, b NumberTierQuoteRequest, o ...RequestOptions) (Response[Envelope[NumberTierChange]], error) {
	if b.HybridResolution != nil && b.HybridMerge != nil {
		return Response[Envelope[NumberTierChange]]{}, validation("Send hybridResolution or hybridMerge, not both.")
	}
	return request[Envelope[NumberTierChange]](ctx, r.t, "POST", sessionPath(id)+"/tier-quotes", nil, b, options(o))
}
func (r *PlatformSessions) RetrieveTierChange(ctx context.Context, id, quoteID string, o ...RequestOptions) (Response[Envelope[NumberTierChange]], error) {
	return request[Envelope[NumberTierChange]](ctx, r.t, "GET", sessionPath(id)+"/tier-quotes/"+escaped(quoteID), nil, nil, options(o))
}
func (r *PlatformSessions) SetTierOverride(ctx context.Context, id string, b SessionTierOverrideRequest, o ...RequestOptions) (Response[Envelope[NumberTierChange]], error) {
	if strings.TrimSpace(b.QuoteID) == "" {
		return Response[Envelope[NumberTierChange]]{}, validation("Review a tier quote and supply its quoteId before confirming.")
	}
	return request[Envelope[NumberTierChange]](ctx, r.t, "PATCH", sessionPath(id), nil, b, options(o))
}
func (r *PlatformSessions) GetCapabilities(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SessionCapabilities]], error) {
	return request[Envelope[SessionCapabilities]](ctx, r.t, "GET", sessionPath(id)+"/capabilities", nil, nil, options(o))
}
func (r *PlatformSessions) GetSafeMode(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[SessionSafeMode]], error) {
	return request[Envelope[SessionSafeMode]](ctx, r.t, "GET", sessionPath(id)+"/safe-mode", nil, nil, options(o))
}
func (r *PlatformSessions) UpdateSafeMode(ctx context.Context, id string, b UpdateSessionSafeModeRequest, o ...RequestOptions) (Response[Envelope[SessionSafeMode]], error) {
	return request[Envelope[SessionSafeMode]](ctx, r.t, "PUT", sessionPath(id)+"/safe-mode", nil, b, options(o))
}
