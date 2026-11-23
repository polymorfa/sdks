package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

type Messages struct{ t *transport }

// Send validates one content variant and its interactive media before HTTP,
// then submits an idempotent request with descriptor-specific version handling.
func (r *Messages) Send(ctx context.Context, connection string, b SendMessageRequest, opts ...RequestOptions) (Response[Envelope[MessageResult]], error) {
	if err := validateInteractiveContent(b.Content); err != nil {
		return Response[Envelope[MessageResult]]{}, err
	}
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
	wire, descriptor, err := descriptorMessage(b)
	if err != nil {
		return Response[Envelope[MessageResult]]{}, err
	}
	settings := options(opts)
	if descriptor && settings.APIVersion == "" {
		settings.APIVersion = CustomerOwnedAPIVersion
	}
	o, err := idempotent(settings)
	if err != nil {
		return Response[Envelope[MessageResult]]{}, err
	}
	return request[Envelope[MessageResult]](ctx, r.t, "POST", messageAction(connection, "send"), nil, wire, o)
}
func messageAction(connection, action string) string {
	return "/messaging/" + escaped(connection) + "/messages/" + action
}
func (r *Messages) OperationStatus(ctx context.Context, connection, id string, opts ...RequestOptions) (Response[Envelope[MessageOperation]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[MessageOperation]]{}, err
	}
	return request[Envelope[MessageOperation]](ctx, r.t, "GET", "/messaging/"+escaped(connection)+"/operations/"+escaped(id), nil, nil, options(opts))
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

type MessagingConnections struct{ t *transport }

func connectionPath(s string) string { return "/platform/connections/" + escaped(s) }
func (r *MessagingConnections) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]PlatformConnection]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[[]PlatformConnection]]{}, err
	}
	return request[Envelope[[]PlatformConnection]](ctx, r.t, "GET", "/platform/connections", nil, nil, options(o))
}
func (r *MessagingConnections) Retrieve(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[Connection]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[Connection]]{}, err
	}
	return request[Envelope[Connection]](ctx, r.t, "GET", connectionPath(s), nil, nil, options(o))
}
func (r *MessagingConnections) Update(ctx context.Context, s string, b UpdateConnectionRequest, o ...RequestOptions) (Response[Envelope[Connection]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[Connection]]{}, err
	}
	intent, err := configurationIntent(b)
	if err != nil {
		return Response[Envelope[Connection]]{}, err
	}
	return request[Envelope[Connection]](ctx, r.t, "PUT", connectionPath(s), nil, b, deliveryOptions(options(o), intent))
}
func (r *MessagingConnections) Delete(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ConnectionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ConnectionLifecycleResult]]{}, err
	}
	return request[Envelope[ConnectionLifecycleResult]](ctx, r.t, "DELETE", connectionPath(s), nil, nil, options(o))
}
func (r *MessagingConnections) Start(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ConnectionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ConnectionLifecycleResult]]{}, err
	}
	return request[Envelope[ConnectionLifecycleResult]](ctx, r.t, "POST", connectionPath(s)+"/start", nil, nil, options(o))
}
func (r *MessagingConnections) Stop(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ConnectionLifecycleResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ConnectionLifecycleResult]]{}, err
	}
	return request[Envelope[ConnectionLifecycleResult]](ctx, r.t, "POST", connectionPath(s)+"/stop", nil, nil, options(o))
}
func (r *MessagingConnections) Restart(ctx context.Context, s string, o ...RequestOptions) (Response[OperationAccepted], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[OperationAccepted]{}, err
	}
	return request[OperationAccepted](ctx, r.t, "POST", connectionPath(s)+"/restart", nil, nil, options(o))
}
func (r *MessagingConnections) Logout(ctx context.Context, s string, o ...RequestOptions) (Response[OperationAccepted], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[OperationAccepted]{}, err
	}
	return request[OperationAccepted](ctx, r.t, "POST", connectionPath(s)+"/logout", nil, nil, options(o))
}
func (r *MessagingConnections) Account(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[WhatsAppAccount]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[WhatsAppAccount]]{}, err
	}
	return request[Envelope[WhatsAppAccount]](ctx, r.t, "GET", connectionPath(s)+"/me", nil, nil, options(o))
}
func (r *MessagingConnections) QR(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[QRCode]], error) {
	return request[Envelope[QRCode]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/pair/qr", url.Values{"format": {"json"}}, nil, options(o))
}
func (r *MessagingConnections) RequestPairingCode(ctx context.Context, s string, b PairingCodeRequest, o ...RequestOptions) (Response[Envelope[PairingCode]], error) {
	return request[Envelope[PairingCode]](ctx, r.t, "POST", "/messaging/"+escaped(s)+"/pair/code", nil, b, options(o))
}

type QuickLinkConfiguration struct {
	ConnectionConfigurationOverrides
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
	Delivery    *HistorySyncDeliveryPatch `json:"delivery,omitempty"`
	Consent     string                    `json:"consent,omitempty"`
	Mode        string                    `json:"mode,omitempty"`
	RequestFull *bool                     `json:"requestFull,omitempty"`
}
type BillingControls struct {
	LimitCredits *float64 `json:"limitCredits"`
	Priority     int      `json:"priority"`
}
type CreateQuickLinkRequest struct {
	SignalMode      *SignalCustodyMode      `json:"signalMode,omitempty"`
	BillingControls *BillingControls        `json:"billingControls,omitempty"`
	Purpose         string                  `json:"purpose,omitempty"`
	Connection      string                  `json:"connection,omitempty"`
	ConnectionGoal  string                  `json:"connectionGoal,omitempty"`
	AddMethod       string                  `json:"addMethod,omitempty"`
	ProjectID       string                  `json:"projectId,omitempty"`
	CustomerID      string                  `json:"customerId,omitempty"`
	ExternalID      string                  `json:"externalId,omitempty"`
	Configuration   *QuickLinkConfiguration `json:"configuration,omitempty"`
}
type QuickLink struct {
	Purpose        string  `json:"purpose"`
	ConnectionGoal string  `json:"connectionGoal"`
	AddMethod      string  `json:"addMethod,omitempty"`
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Connection     string  `json:"connection"`
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
	AddMethod      string               `json:"addMethod,omitempty"`
	HybridPhase    *string              `json:"hybridPhase"`
	Onboarding     *QuickLinkOnboarding `json:"onboarding,omitempty"`
	ID             string               `json:"id"`
	Status         string               `json:"status"`
	Connection     string               `json:"connection"`
	ExpiresAt      *string              `json:"expiresAt"`
	OpenedAt       *string              `json:"openedAt"`
	ConnectedAt    *string              `json:"connectedAt"`
	Phone          *string              `json:"phone"`
	ErrorCode      *string              `json:"errorCode"`
}
type QuickLinkAvailability struct {
	Allowed   bool    `json:"allowed"`
	AddMethod *string `json:"addMethod"`
	Methods   []struct {
		Kind    string `json:"kind"`
		Status  string `json:"status"`
		Enabled bool   `json:"enabled"`
	} `json:"methods"`
	ResumeQuickLinkID *string `json:"resumeQuickLinkId"`
}
type QuickLinks struct{ t *transport }

func (r *QuickLinks) Create(ctx context.Context, b CreateQuickLinkRequest, o ...RequestOptions) (Response[Envelope[QuickLink]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[QuickLink]]{}, err
	}
	intent, err := quickLinkIntent(b)
	if err != nil {
		return Response[Envelope[QuickLink]]{}, err
	}
	if b.BillingControls != nil {
		if b.BillingControls.Priority < 0 || b.BillingControls.Priority > 1000000 || b.BillingControls.LimitCredits != nil && *b.BillingControls.LimitCredits < 0 {
			return Response[Envelope[QuickLink]]{}, validation("Invalid initial billing controls.")
		}
		if b.Purpose == "add_method" || b.Configuration != nil && b.Configuration.Testing != nil {
			return Response[Envelope[QuickLink]]{}, configuration("billingControls", "Initial billing controls require a real new Connection.")
		}
	}
	return request[Envelope[QuickLink]](ctx, r.t, "POST", "/messaging/quicklinks", nil, b, deliveryOptions(options(o), intent))
}
func (r *QuickLinks) Availability(ctx context.Context, projectID, connection string, o ...RequestOptions) (Response[Envelope[QuickLinkAvailability]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[QuickLinkAvailability]]{}, err
	}
	return request[Envelope[QuickLinkAvailability]](ctx, r.t, "GET", "/messaging/quicklinks/availability", url.Values{"projectId": {projectID}, "connection": {connection}}, nil, options(o))
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
	EphemeralID string `json:"ephemeralId"`
	TTLSeconds  *int   `json:"ttlSeconds,omitempty"`
	Connection  string `json:"connection,omitempty"`
	Customer    string `json:"customer,omitempty"`
	// A nil ceiling is omitted; an explicit empty slice seals zero actions.
	Allow []string `json:"allow,omitzero"`
}
type ClientTokenValue struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}

func (v ClientTokenValue) String() string   { return "ClientTokenValue[redacted]" }
func (v ClientTokenValue) GoString() string { return v.String() }

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
	if (b.Connection == "") == (b.Customer == "") {
		return Response[Envelope[ClientTokenValue]]{}, configuration("connection", "Provide exactly one of connection or customer.")
	}
	return request[Envelope[ClientTokenValue]](ctx, r.t, "POST", "/platform/client-tokens", nil, b, options(o))
}
func (r *ClientTokens) RetrieveRules(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ClientRules]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[ClientRules]]{}, err
	}
	return request[Envelope[ClientRules]](ctx, r.t, "GET", connectionPath(s)+"/client-rules", nil, nil, options(o))
}
func (r *ClientTokens) UpdateRules(ctx context.Context, s string, b SetClientRulesRequest, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "PUT", connectionPath(s)+"/client-rules", nil, b, options(o))
}
func (r *ClientTokens) DeleteRules(ctx context.Context, s string, o ...RequestOptions) (Response[Success], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "DELETE", connectionPath(s)+"/client-rules", nil, nil, options(o))
}
