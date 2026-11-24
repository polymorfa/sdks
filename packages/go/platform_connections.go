package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
)

type ConnectionProjectContext struct {
	ProjectID string `json:"projectId,omitempty"`
}
type ConnectionStartResult struct {
	Starting     bool   `json:"starting"`
	ConnectionID string `json:"connectionId"`
}
type ConnectionStopResult struct {
	Stopping     bool   `json:"stopping"`
	ConnectionID string `json:"connectionId"`
}
type ConnectionRemoveResult struct {
	Removed      bool   `json:"removed"`
	ConnectionID string `json:"connectionId"`
}
type ConnectionBatchRequest struct {
	ProjectID     string   `json:"projectId,omitempty"`
	ConnectionIDs []string `json:"connectionIds"`
}
type ConnectionBatchStopResult struct {
	Stopping int `json:"stopping"`
}
type ConnectionBatchRemoveResult struct {
	Removed int `json:"removed"`
}
type ConnectionTierOverrideRequest struct {
	ProjectID string `json:"projectId,omitempty"`
	QuoteID   string `json:"quoteId"`
}
type HybridResolution struct {
	Action                      string `json:"action"`
	Transport                   string `json:"transport,omitempty"`
	ExistingConnectionTransport string `json:"existingConnectionTransport,omitempty"`
	NewConnectionName           string `json:"newConnectionName,omitempty"`
}
type HybridMerge struct {
	AbsorbConnectionID string `json:"absorbConnectionId"`
}
type ConnectionTierQuoteRequest struct {
	ProjectID        string            `json:"projectId,omitempty"`
	TierOverride     *string           `json:"tierOverride"`
	HybridResolution *HybridResolution `json:"hybridResolution,omitempty"`
	HybridMerge      *HybridMerge      `json:"hybridMerge,omitempty"`
}
type ConnectionHybridTransition struct {
	Action                      string  `json:"action"`
	SurvivingConnectionID       string  `json:"survivingConnectionId"`
	Status                      string  `json:"status,omitempty"`
	FailureReason               *string `json:"failureReason,omitempty"`
	MetaDisconnectRequired      *bool   `json:"metaDisconnectRequired,omitempty"`
	EffectiveAtMs               *int64  `json:"effectiveAtMs,omitempty"`
	KeepTransport               string  `json:"keepTransport,omitempty"`
	ExistingConnectionTransport string  `json:"existingConnectionTransport,omitempty"`
	NewConnectionName           string  `json:"newConnectionName,omitempty"`
	NewConnectionID             string  `json:"newConnectionId,omitempty"`
	AbsorbConnectionID          string  `json:"absorbConnectionId,omitempty"`
}
type ConnectionTierQuote struct {
	Tier             string                      `json:"tier"`
	TierOverride     *string                     `json:"tierOverride"`
	AmountCents      float64                     `json:"amountCents"`
	PriceVersion     string                      `json:"priceVersion"`
	Action           string                      `json:"action"`
	EffectiveAtMs    int64                       `json:"effectiveAtMs"`
	ReplacesWindowID *string                     `json:"replacesWindowId"`
	HybridTransition *ConnectionHybridTransition `json:"hybridTransition,omitempty"`
}
type ConnectionTierChange struct {
	ID            string              `json:"id"`
	Status        string              `json:"status"`
	FailureReason *string             `json:"failureReason"`
	ExpiresAtMs   int64               `json:"expiresAtMs"`
	Quote         ConnectionTierQuote `json:"quote"`
}

// ConnectionCapability keeps unknown capability keys while narrowing value by kind.
type ConnectionCapability struct {
	Key          string  `json:"key"`
	Source       *string `json:"source"`
	Kind         string  `json:"kind"`
	Unit         *string `json:"unit"`
	FeatureValue *bool   `json:"-"`
	LimitValue   *int64  `json:"-"`
}

func (c *ConnectionCapability) UnmarshalJSON(b []byte) error {
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
		return validation("Unknown connection capability kind.")
	}
}
func (c ConnectionCapability) MarshalJSON() ([]byte, error) {
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

type ConnectionCapabilities struct {
	Connection   string                 `json:"connection"`
	ProjectID    string                 `json:"projectId"`
	Status       string                 `json:"status"`
	SyncedAt     *string                `json:"syncedAt"`
	CheckedAt    *string                `json:"checkedAt"`
	AccountType  *string                `json:"accountType"`
	Capabilities []ConnectionCapability `json:"capabilities"`
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
type ConnectionSafeMode struct {
	Connection        string           `json:"connection"`
	ProjectID         string           `json:"projectId"`
	Project           SafeModeSettings `json:"project"`
	Override          SafeModeOverride `json:"override"`
	Effective         SafeModeSettings `json:"effective"`
	Applied           *SafeModeApplied `json:"applied"`
	Mismatch          bool             `json:"mismatch"`
	Entitled          bool             `json:"entitled"`
	EntitlementReason *string          `json:"entitlementReason"`
}
type UpdateConnectionSafeModeRequest struct {
	Presence string `json:"presence,omitempty"`
	Typing   string `json:"typing,omitempty"`
	Reads    string `json:"reads,omitempty"`
	Pacing   string `json:"pacing,omitempty"`
}
type PlatformConnections struct{ t *transport }

func (c *TeamClient) Connections() *PlatformConnections { return &PlatformConnections{c.t} }
func (r *PlatformConnections) List(ctx context.Context, projectID string, o ...RequestOptions) (Response[Envelope[[]PlatformConnection]], error) {
	q := url.Values{}
	setString(q, "projectId", projectID)
	return request[Envelope[[]PlatformConnection]](ctx, r.t, "GET", "/platform/connections", q, nil, options(o))
}
func (r *PlatformConnections) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[Connection]], error) {
	return request[Envelope[Connection]](ctx, r.t, "GET", connectionPath(id), nil, nil, options(o))
}
func (r *PlatformConnections) Update(ctx context.Context, id string, b UpdateConnectionRequest, o ...RequestOptions) (Response[Envelope[Connection]], error) {
	intent, err := configurationIntent(b)
	if err != nil {
		return Response[Envelope[Connection]]{}, err
	}
	return request[Envelope[Connection]](ctx, r.t, "PUT", connectionPath(id), nil, b, deliveryOptions(options(o), intent))
}
func (r *PlatformConnections) Start(ctx context.Context, id string, b ConnectionProjectContext, o ...RequestOptions) (Response[Envelope[ConnectionStartResult]], error) {
	return request[Envelope[ConnectionStartResult]](ctx, r.t, "POST", connectionPath(id)+"/start", nil, b, options(o))
}
func (r *PlatformConnections) Stop(ctx context.Context, id string, b ConnectionProjectContext, o ...RequestOptions) (Response[Envelope[ConnectionStopResult]], error) {
	return request[Envelope[ConnectionStopResult]](ctx, r.t, "POST", connectionPath(id)+"/stop", nil, b, options(o))
}
func (r *PlatformConnections) StopMany(ctx context.Context, b ConnectionBatchRequest, o ...RequestOptions) (Response[Envelope[ConnectionBatchStopResult]], error) {
	return request[Envelope[ConnectionBatchStopResult]](ctx, r.t, "POST", "/platform/connections/stop", nil, b, options(o))
}
func (r *PlatformConnections) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ConnectionRemoveResult]], error) {
	return request[Envelope[ConnectionRemoveResult]](ctx, r.t, "DELETE", connectionPath(id), nil, nil, options(o))
}
func (r *PlatformConnections) DeleteMany(ctx context.Context, b ConnectionBatchRequest, o ...RequestOptions) (Response[Envelope[ConnectionBatchRemoveResult]], error) {
	return request[Envelope[ConnectionBatchRemoveResult]](ctx, r.t, "POST", "/platform/connections/delete", nil, b, options(o))
}
func (r *PlatformConnections) QuoteTierChange(ctx context.Context, id string, b ConnectionTierQuoteRequest, o ...RequestOptions) (Response[Envelope[ConnectionTierChange]], error) {
	if b.HybridResolution != nil && b.HybridMerge != nil {
		return Response[Envelope[ConnectionTierChange]]{}, validation("Send hybridResolution or hybridMerge, not both.")
	}
	return request[Envelope[ConnectionTierChange]](ctx, r.t, "POST", connectionPath(id)+"/tier-quotes", nil, b, options(o))
}
func (r *PlatformConnections) RetrieveTierChange(ctx context.Context, id, quoteID string, o ...RequestOptions) (Response[Envelope[ConnectionTierChange]], error) {
	return request[Envelope[ConnectionTierChange]](ctx, r.t, "GET", connectionPath(id)+"/tier-quotes/"+escaped(quoteID), nil, nil, options(o))
}
func (r *PlatformConnections) SetTierOverride(ctx context.Context, id string, b ConnectionTierOverrideRequest, o ...RequestOptions) (Response[Envelope[ConnectionTierChange]], error) {
	if strings.TrimSpace(b.QuoteID) == "" {
		return Response[Envelope[ConnectionTierChange]]{}, validation("Review a tier quote and supply its quoteId before confirming.")
	}
	return request[Envelope[ConnectionTierChange]](ctx, r.t, "PATCH", connectionPath(id), nil, b, options(o))
}
func (r *PlatformConnections) GetCapabilities(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ConnectionCapabilities]], error) {
	return request[Envelope[ConnectionCapabilities]](ctx, r.t, "GET", connectionPath(id)+"/capabilities", nil, nil, options(o))
}
func (r *PlatformConnections) GetSafeMode(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[ConnectionSafeMode]], error) {
	return request[Envelope[ConnectionSafeMode]](ctx, r.t, "GET", connectionPath(id)+"/safe-mode", nil, nil, options(o))
}
func (r *PlatformConnections) UpdateSafeMode(ctx context.Context, id string, b UpdateConnectionSafeModeRequest, o ...RequestOptions) (Response[Envelope[ConnectionSafeMode]], error) {
	return request[Envelope[ConnectionSafeMode]](ctx, r.t, "PUT", connectionPath(id)+"/safe-mode", nil, b, options(o))
}
