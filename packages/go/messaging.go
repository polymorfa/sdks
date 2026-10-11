package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

type Messages struct{ t *transport }

func (r *Messages) Send(ctx context.Context, session string, b SendMessageRequest, opts ...RequestOptions) (Response[Envelope[MessageResult]], error) {
	var fields map[string]json.RawMessage
	encoded, err := json.Marshal(b.Content)
	if err != nil {
		return Response[Envelope[MessageResult]]{}, validation("Invalid message content.")
	}
	json.Unmarshal(encoded, &fields)
	if len(fields) != 1 {
		return Response[Envelope[MessageResult]]{}, validation("Set exactly one message content field.")
	}
	if b.Conversation.ID == "" && b.Conversation.PhoneNumber == "" && b.Conversation.BSUID == "" {
		return Response[Envelope[MessageResult]]{}, validation("A conversation ID, phoneNumber or BSUID is required.")
	}
	o, err := idempotent(options(opts))
	if err != nil {
		return Response[Envelope[MessageResult]]{}, err
	}
	return request[Envelope[MessageResult]](ctx, r.t, "POST", messageAction(session, "send"), nil, b, o)
}
func messageAction(session, action string) string {
	return "/messaging/" + escaped(session) + "/messages/" + action
}
func (r *Messages) OperationStatus(ctx context.Context, session, id string, opts ...RequestOptions) (Response[Envelope[MessageOperation]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[MessageOperation]]{}, err
	}
	return request[Envelope[MessageOperation]](ctx, r.t, "GET", "/messaging/"+escaped(session)+"/operations/"+escaped(id), nil, nil, options(opts))
}
func (r *Messages) MarkSeen(ctx context.Context, s string, b SeenRequest, o ...RequestOptions) (Response[Envelope[StatusResult]], error) {
	return request[Envelope[StatusResult]](ctx, r.t, "POST", messageAction(s, "seen"), nil, b, options(o))
}
func (r *Messages) SetTyping(ctx context.Context, s string, b TypingRequest, o ...RequestOptions) (Response[Envelope[StatusResult]], error) {
	return request[Envelope[StatusResult]](ctx, r.t, "POST", messageAction(s, "typing"), nil, b, options(o))
}
func (r *Messages) React(ctx context.Context, s string, b ReactionRequest, opts ...RequestOptions) (Response[Envelope[MessageReceipt]], error) {
	o, err := idempotent(options(opts))
	if err != nil {
		return Response[Envelope[MessageReceipt]]{}, err
	}
	return request[Envelope[MessageReceipt]](ctx, r.t, "POST", messageAction(s, "react"), nil, b, o)
}
func (r *Messages) Star(ctx context.Context, s string, b StarRequest, o ...RequestOptions) (Response[Envelope[StatusResult]], error) {
	return request[Envelope[StatusResult]](ctx, r.t, "POST", messageAction(s, "star"), nil, b, options(o))
}

type MessagingSessions struct{ t *transport }

func sessionPath(s string) string { return "/platform/sessions/" + escaped(s) }
func (r *MessagingSessions) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]PlatformSession]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[[]PlatformSession]]{}, err
	}
	return request[Envelope[[]PlatformSession]](ctx, r.t, "GET", "/platform/sessions", nil, nil, options(o))
}
func (r *MessagingSessions) Retrieve(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[Session]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[Session]]{}, err
	}
	return request[Envelope[Session]](ctx, r.t, "GET", sessionPath(s), nil, nil, options(o))
}
func (r *MessagingSessions) Update(ctx context.Context, s string, b UpdateSessionRequest, o ...RequestOptions) (Response[Envelope[Session]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[Session]]{}, err
	}
	return request[Envelope[Session]](ctx, r.t, "PUT", sessionPath(s), nil, b, options(o))
}
func (r *MessagingSessions) Delete(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[SessionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[SessionLifecycleResult]]{}, err
	}
	return request[Envelope[SessionLifecycleResult]](ctx, r.t, "DELETE", sessionPath(s), nil, nil, options(o))
}
func (r *MessagingSessions) Start(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[SessionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[SessionLifecycleResult]]{}, err
	}
	return request[Envelope[SessionLifecycleResult]](ctx, r.t, "POST", sessionPath(s)+"/start", nil, nil, options(o))
}
func (r *MessagingSessions) Stop(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[SessionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[SessionLifecycleResult]]{}, err
	}
	return request[Envelope[SessionLifecycleResult]](ctx, r.t, "POST", sessionPath(s)+"/stop", nil, nil, options(o))
}
func (r *MessagingSessions) Restart(ctx context.Context, s string, o ...RequestOptions) (Response[OperationAccepted], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[OperationAccepted]{}, err
	}
	return request[OperationAccepted](ctx, r.t, "POST", sessionPath(s)+"/restart", nil, nil, options(o))
}
func (r *MessagingSessions) Logout(ctx context.Context, s string, o ...RequestOptions) (Response[OperationAccepted], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[OperationAccepted]{}, err
	}
	return request[OperationAccepted](ctx, r.t, "POST", sessionPath(s)+"/logout", nil, nil, options(o))
}
func (r *MessagingSessions) Account(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[WhatsAppAccount]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[WhatsAppAccount]]{}, err
	}
	return request[Envelope[WhatsAppAccount]](ctx, r.t, "GET", sessionPath(s)+"/me", nil, nil, options(o))
}
func (r *MessagingSessions) QR(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[QRCode]], error) {
	return request[Envelope[QRCode]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/pair/qr", url.Values{"format": {"json"}}, nil, options(o))
}
func (r *MessagingSessions) RequestPairingCode(ctx context.Context, s string, b PairingCodeRequest, o ...RequestOptions) (Response[Envelope[PairingCode]], error) {
	return request[Envelope[PairingCode]](ctx, r.t, "POST", "/messaging/"+escaped(s)+"/pair/code", nil, b, options(o))
}

type QuickLinkConfiguration struct {
	SessionConfigurationOverrides
	Testing               *QuickLinkTesting     `json:"testing,omitempty"`
	ConnectionPreference  string                `json:"connectionPreference,omitempty"`
	ConnectionEnforcement string                `json:"connectionEnforcement,omitempty"`
	Methods               []string              `json:"methods,omitempty"`
	DefaultMethod         *string               `json:"defaultMethod,omitempty"`
	PrefillPhone          string                `json:"prefillPhone,omitempty"`
	AllowPhoneChange      *bool                 `json:"allowPhoneChange,omitempty"`
	HistorySync           *QuickLinkHistorySync `json:"historySync,omitempty"`
}
type QuickLinkTesting struct {
	Country       string                `json:"country,omitempty"`
	Configuration *TestingConfiguration `json:"configuration,omitempty"`
	Editable      []string              `json:"editable,omitempty"`
}
type QuickLinkHistorySync struct {
	Consent     string `json:"consent,omitempty"`
	Mode        string `json:"mode,omitempty"`
	RequestFull *bool  `json:"requestFull,omitempty"`
}
type BillingControls struct {
	LimitCredits *float64 `json:"limitCredits"`
	Priority     int      `json:"priority"`
}
type CreateQuickLinkRequest struct {
	BillingControls *BillingControls        `json:"billingControls,omitempty"`
	Purpose         string                  `json:"purpose,omitempty"`
	Session         string                  `json:"session,omitempty"`
	ConnectionGoal  string                  `json:"connectionGoal,omitempty"`
	AddConnection   string                  `json:"addConnection,omitempty"`
	ProjectID       string                  `json:"projectId,omitempty"`
	CustomerID      string                  `json:"customerId,omitempty"`
	ExternalID      string                  `json:"externalId,omitempty"`
	Configuration   *QuickLinkConfiguration `json:"configuration,omitempty"`
}
type QuickLink struct {
	Purpose        string  `json:"purpose"`
	ConnectionGoal string  `json:"connectionGoal"`
	AddConnection  string  `json:"addConnection,omitempty"`
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Session        string  `json:"session"`
	ExpiresAt      *string `json:"expiresAt"`
}
type CloudSyncRequest struct {
	Request         string `json:"request"`
	ReceiptRecorded bool   `json:"receiptRecorded"`
	Delivery        string `json:"delivery,omitempty"`
}
type CloudSyncStatus struct {
	Contacts CloudSyncRequest `json:"contacts"`
	History  CloudSyncRequest `json:"history"`
}
type QuickLinkOnboarding struct {
	Stage           string          `json:"stage"`
	Connection      *string         `json:"connection"`
	Coexistence     *bool           `json:"coexistence"`
	ContactsSync    string          `json:"contactsSync"`
	HistorySync     string          `json:"historySync"`
	HistoryProgress float64         `json:"historyProgress"`
	Sync            CloudSyncStatus `json:"sync"`
	ErrorCode       *string         `json:"errorCode"`
}
type QuickLinkStatus struct {
	Purpose        string               `json:"purpose"`
	ConnectionGoal string               `json:"connectionGoal"`
	AddConnection  string               `json:"addConnection,omitempty"`
	HybridPhase    *string              `json:"hybridPhase"`
	Onboarding     *QuickLinkOnboarding `json:"onboarding,omitempty"`
	ID             string               `json:"id"`
	Status         string               `json:"status"`
	Session        string               `json:"session"`
	ExpiresAt      *string              `json:"expiresAt"`
	OpenedAt       *string              `json:"openedAt"`
	ConnectedAt    *string              `json:"connectedAt"`
	Phone          *string              `json:"phone"`
	ErrorCode      *string              `json:"errorCode"`
}
type QuickLinkAvailability struct {
	Allowed       bool    `json:"allowed"`
	AddConnection *string `json:"addConnection"`
	Connections   []struct {
		Kind    string `json:"kind"`
		Status  string `json:"status"`
		Enabled bool   `json:"enabled"`
	} `json:"connections"`
	ResumeQuickLinkID *string `json:"resumeQuickLinkId"`
}
type QuickLinks struct{ t *transport }

func (r *QuickLinks) Create(ctx context.Context, b CreateQuickLinkRequest, o ...RequestOptions) (Response[Envelope[QuickLink]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[QuickLink]]{}, err
	}
	if b.Purpose == "add_connection" && b.Session == "" {
		return Response[Envelope[QuickLink]]{}, validation("add_connection requires a session.")
	}
	if b.BillingControls != nil {
		if b.BillingControls.Priority < 0 || b.BillingControls.Priority > 1000000 || b.BillingControls.LimitCredits != nil && *b.BillingControls.LimitCredits < 0 {
			return Response[Envelope[QuickLink]]{}, validation("Invalid initial billing controls.")
		}
		if b.Purpose == "add_connection" || b.Configuration != nil && b.Configuration.Testing != nil {
			return Response[Envelope[QuickLink]]{}, configuration("billingControls", "Initial billing controls require a real new number.")
		}
	}
	return request[Envelope[QuickLink]](ctx, r.t, "POST", "/messaging/quicklinks", nil, b, options(o))
}
func (r *QuickLinks) Availability(ctx context.Context, projectID, session string, o ...RequestOptions) (Response[Envelope[QuickLinkAvailability]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[QuickLinkAvailability]]{}, err
	}
	return request[Envelope[QuickLinkAvailability]](ctx, r.t, "GET", "/messaging/quicklinks/availability", url.Values{"projectId": {projectID}, "session": {session}}, nil, options(o))
}
func (r *QuickLinks) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[QuickLinkStatus]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[QuickLinkStatus]]{}, err
	}
	return request[Envelope[QuickLinkStatus]](ctx, r.t, "GET", "/messaging/quicklinks/"+escaped(id), nil, nil, options(o))
}
func (r *QuickLinks) Cancel(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "DELETE", "/messaging/quicklinks/"+escaped(id), nil, nil, options(o))
}

type MintClientTokenRequest struct {
	EphemeralID string   `json:"ephemeralId"`
	TTLSeconds  *int     `json:"ttlSeconds,omitempty"`
	Session     string   `json:"session,omitempty"`
	Customer    string   `json:"customer,omitempty"`
	Allow       []string `json:"allow,omitempty"`
}
type ClientTokenValue struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}
type ClientRules struct {
	RecipientMode          string `json:"recipientMode"`
	AllowedActions         string `json:"allowedActions"`
	RateLimit              int    `json:"rateLimit"`
	MaxDaily               int    `json:"maxDaily"`
	AllowedOrigins         string `json:"allowedOrigins"`
	ConversationTTLSeconds *int   `json:"conversationTtlSeconds,omitempty"`
	MaxConcurrency         *int   `json:"maxConcurrency,omitempty"`
	MaxSetupsPerMinute     *int   `json:"maxSetupsPerMinute,omitempty"`
	AllowedNumber          string `json:"allowedNumber,omitempty"`
}
type SetClientRulesRequest struct {
	RecipientMode          string  `json:"recipientMode,omitempty"`
	AllowedActions         string  `json:"allowedActions,omitempty"`
	RateLimit              *int    `json:"rateLimit,omitempty"`
	MaxDaily               *int    `json:"maxDaily,omitempty"`
	AllowedOrigins         *string `json:"allowedOrigins,omitempty"`
	ConversationTTLSeconds *int    `json:"conversationTtlSeconds,omitempty"`
	MaxConcurrency         *int    `json:"maxConcurrency,omitempty"`
	MaxSetupsPerMinute     *int    `json:"maxSetupsPerMinute,omitempty"`
	AllowedNumber          *string `json:"allowedNumber,omitempty"`
}
type ClientTokens struct{ t *transport }

func (r *ClientTokens) Mint(ctx context.Context, b MintClientTokenRequest, o ...RequestOptions) (Response[Envelope[ClientTokenValue]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ClientTokenValue]]{}, err
	}
	if (b.Session == "") == (b.Customer == "") {
		return Response[Envelope[ClientTokenValue]]{}, configuration("session", "Provide exactly one of session or customer.")
	}
	if b.Allow != nil && b.Customer == "" {
		return Response[Envelope[ClientTokenValue]]{}, configuration("allow", "allow is only supported for customer-scoped tokens.")
	}
	return request[Envelope[ClientTokenValue]](ctx, r.t, "POST", "/platform/client-tokens", nil, b, options(o))
}
func (r *ClientTokens) RetrieveRules(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ClientRules]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ClientRules]]{}, err
	}
	return request[Envelope[ClientRules]](ctx, r.t, "GET", sessionPath(s)+"/client-rules", nil, nil, options(o))
}
func (r *ClientTokens) UpdateRules(ctx context.Context, s string, b SetClientRulesRequest, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "PUT", sessionPath(s)+"/client-rules", nil, b, options(o))
}
func (r *ClientTokens) DeleteRules(ctx context.Context, s string, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "DELETE", sessionPath(s)+"/client-rules", nil, nil, options(o))
}
