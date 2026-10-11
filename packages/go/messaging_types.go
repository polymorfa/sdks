package polymorfa

// ConversationReference accepts public IDs, E.164 phone numbers, or BSUIDs.
type ConversationReference struct {
	ID          string `json:"id,omitempty"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	BSUID       string `json:"bsuid,omitempty"`
	Username    string `json:"username,omitempty"`
}
type WhatsAppMessageIDs struct {
	LinkedDevices string `json:"linked_devices,omitempty"`
	OfficialAPI   string `json:"official_api,omitempty"`
}
type MessageTransport string

const (
	TransportAuto          MessageTransport = "auto"
	TransportLinkedDevices MessageTransport = "linked_devices"
	TransportOfficialAPI   MessageTransport = "official_api"
)

type QuotedMessage struct {
	ID   string `json:"id"`
	Type string `json:"type,omitempty"`
	Text string `json:"text,omitempty"`
}
type MediaContent struct {
	URL      string `json:"url,omitempty"`
	Base64   string `json:"base64,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
	Caption  string `json:"caption,omitempty"`
	Filename string `json:"filename,omitempty"`
	PTT      *bool  `json:"ptt,omitempty"`
}
type PollContent struct {
	Title       string   `json:"title"`
	Options     []string `json:"options"`
	MultiSelect *bool    `json:"multiSelect,omitempty"`
}
type LocationContent struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"long"`
	Address   string  `json:"address,omitempty"`
}
type ContactContent struct {
	VCard string `json:"vcard"`
}
type TemplateContent struct {
	Name       string `json:"name"`
	Language   string `json:"language"`
	Components []any  `json:"components,omitempty"`
}
type ProductContent struct {
	BusinessOwnerID     string        `json:"businessOwnerId"`
	ID                  string        `json:"id"`
	Title               string        `json:"title"`
	Description         string        `json:"description,omitempty"`
	CurrencyCode        string        `json:"currencyCode"`
	PriceAmount1000     int64         `json:"priceAmount1000"`
	SalePriceAmount1000 *int64        `json:"salePriceAmount1000,omitempty"`
	RetailerID          string        `json:"retailerId,omitempty"`
	URL                 string        `json:"url,omitempty"`
	ImageCount          *int          `json:"imageCount,omitempty"`
	Image               *MediaContent `json:"image,omitempty"`
	Body                string        `json:"body,omitempty"`
	Footer              string        `json:"footer,omitempty"`
}
type ProductListSection struct {
	Title      string   `json:"title,omitempty"`
	ProductIDs []string `json:"productIds"`
}
type ProductListContent struct {
	BusinessOwnerID string               `json:"businessOwnerId"`
	Title           string               `json:"title"`
	Description     string               `json:"description,omitempty"`
	ButtonText      string               `json:"buttonText"`
	Footer          string               `json:"footer,omitempty"`
	Sections        []ProductListSection `json:"sections"`
}
type OrderContent struct {
	ID                string `json:"id"`
	ThumbnailBase64   string `json:"thumbnailBase64,omitempty"`
	ItemCount         int    `json:"itemCount"`
	Status            string `json:"status"`
	Message           string `json:"message,omitempty"`
	Title             string `json:"title,omitempty"`
	SellerID          string `json:"sellerId"`
	Token             string `json:"token,omitempty"`
	TotalAmount1000   int64  `json:"totalAmount1000"`
	TotalCurrencyCode string `json:"totalCurrencyCode"`
	CatalogType       string `json:"catalogType,omitempty"`
}
type ListRow struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}
type ListSection struct {
	Title string    `json:"title,omitempty"`
	Rows  []ListRow `json:"rows"`
}
type ListContent struct {
	Title       string        `json:"title"`
	Description string        `json:"description,omitempty"`
	ButtonText  string        `json:"buttonText"`
	Footer      string        `json:"footer,omitempty"`
	Sections    []ListSection `json:"sections"`
}
type MessageButton struct {
	Type                string `json:"type"`
	Text                string `json:"text"`
	URL                 string `json:"url,omitempty"`
	PhoneNumber         string `json:"phoneNumber,omitempty"`
	ID                  string `json:"id,omitempty"`
	CopyCode            string `json:"copyCode,omitempty"`
	BusinessPhoneNumber string `json:"businessPhoneNumber,omitempty"`
	CatalogProductID    string `json:"catalogProductId,omitempty"`
}
type ButtonsContent struct {
	Title   string          `json:"title,omitempty"`
	Body    string          `json:"body"`
	Footer  string          `json:"footer,omitempty"`
	Buttons []MessageButton `json:"buttons"`
}
type AddressContent struct {
	Body       string `json:"body"`
	ButtonText string `json:"buttonText,omitempty"`
	Footer     string `json:"footer,omitempty"`
	Country    string `json:"country,omitempty"`
}
type FlowContent struct {
	Body       string `json:"body"`
	ButtonText string `json:"buttonText"`
	Footer     string `json:"footer,omitempty"`
	ID         string `json:"id"`
	Token      string `json:"token"`
	Action     string `json:"action"`
	Screen     string `json:"screen,omitempty"`
	DataJSON   string `json:"dataJson,omitempty"`
}
type CallPermissionRequestContent struct {
	Body string `json:"body"`
}
type PaymentAmount struct {
	Value       int64  `json:"value"`
	Offset      int    `json:"offset"`
	Description string `json:"description,omitempty"`
	ProgramName string `json:"programName,omitempty"`
}
type PixDynamicCode struct {
	Code         string `json:"code"`
	MerchantName string `json:"merchantName"`
	Key          string `json:"key"`
	KeyType      string `json:"keyType"`
}
type PaymentLink struct {
	URI string `json:"uri"`
}
type Boleto struct {
	DigitableLine string `json:"digitableLine"`
}
type PaymentSettings struct {
	PixDynamicCode *PixDynamicCode `json:"pixDynamicCode,omitempty"`
	PaymentLink    *PaymentLink    `json:"paymentLink,omitempty"`
	Boleto         *Boleto         `json:"boleto,omitempty"`
}
type OrderItem struct {
	RetailerID string         `json:"retailerId"`
	Name       string         `json:"name"`
	Amount     PaymentAmount  `json:"amount"`
	Quantity   int            `json:"quantity"`
	SaleAmount *PaymentAmount `json:"saleAmount,omitempty"`
}
type OrderExpiration struct {
	Timestamp   int64  `json:"timestamp"`
	Description string `json:"description"`
}
type OrderItemization struct {
	CatalogID  string           `json:"catalogId,omitempty"`
	Expiration *OrderExpiration `json:"expiration,omitempty"`
	Items      []OrderItem      `json:"items"`
	Subtotal   PaymentAmount    `json:"subtotal"`
	Tax        PaymentAmount    `json:"tax"`
	Shipping   *PaymentAmount   `json:"shipping,omitempty"`
	Discount   *PaymentAmount   `json:"discount,omitempty"`
}
type OrderDetailsContent struct {
	ReferenceID     string            `json:"referenceId"`
	Type            string            `json:"type"`
	Body            string            `json:"body"`
	Footer          string            `json:"footer,omitempty"`
	Currency        string            `json:"currency"`
	TotalAmount     PaymentAmount     `json:"totalAmount"`
	PaymentSettings PaymentSettings   `json:"paymentSettings"`
	Order           *OrderItemization `json:"order,omitempty"`
	HeaderImageURL  string            `json:"headerImageUrl,omitempty"`
}
type OrderStatusValue struct {
	Status      string `json:"status"`
	Description string `json:"description,omitempty"`
}
type OrderPaymentValue struct {
	Status    string `json:"status"`
	Timestamp *int64 `json:"timestamp,omitempty"`
}
type OrderStatusContent struct {
	ReferenceID string             `json:"referenceId"`
	Body        string             `json:"body"`
	Footer      string             `json:"footer,omitempty"`
	Order       *OrderStatusValue  `json:"order,omitempty"`
	Payment     *OrderPaymentValue `json:"payment,omitempty"`
}

// MessageContent is a tagged union: set exactly one field. Send validates this
// invariant before transport while leaving API business validation authoritative.
type MessageContent struct {
	Text                  *string                       `json:"text,omitempty"`
	Image                 *MediaContent                 `json:"image,omitempty"`
	Video                 *MediaContent                 `json:"video,omitempty"`
	File                  *MediaContent                 `json:"file,omitempty"`
	Voice                 *MediaContent                 `json:"voice,omitempty"`
	Poll                  *PollContent                  `json:"poll,omitempty"`
	Location              *LocationContent              `json:"location,omitempty"`
	Contact               *ContactContent               `json:"contact,omitempty"`
	RequestPhoneNumber    *struct{}                     `json:"requestPhoneNumber,omitempty"`
	Product               *ProductContent               `json:"product,omitempty"`
	ProductList           *ProductListContent           `json:"productList,omitempty"`
	Order                 *OrderContent                 `json:"order,omitempty"`
	List                  *ListContent                  `json:"list,omitempty"`
	Buttons               *ButtonsContent               `json:"buttons,omitempty"`
	AddressMessage        *AddressContent               `json:"addressMessage,omitempty"`
	Flow                  *FlowContent                  `json:"flow,omitempty"`
	CallPermissionRequest *CallPermissionRequestContent `json:"callPermissionRequest,omitempty"`
	OrderDetails          *OrderDetailsContent          `json:"orderDetails,omitempty"`
	OrderStatus           *OrderStatusContent           `json:"orderStatus,omitempty"`
	Template              *TemplateContent              `json:"template,omitempty"`
}
type SendMessageRequest struct {
	Transport     MessageTransport      `json:"transport,omitempty"`
	Conversation  ConversationReference `json:"conversation"`
	IsForwarded   *bool                 `json:"isForwarded,omitempty"`
	Mentions      []string              `json:"mentions,omitempty"`
	QuotedMessage *QuotedMessage        `json:"quotedMessage,omitempty"`
	Content       MessageContent        `json:"content"`
}
type MessageReceipt struct {
	ID            string                `json:"id"`
	WhatsAppIDs   WhatsAppMessageIDs    `json:"whatsapp_ids"`
	WhatsAppID    string                `json:"whatsapp_id,omitempty"`
	Conversation  ConversationReference `json:"conversation"`
	Timestamp     string                `json:"timestamp"`
	Status        string                `json:"status"`
	Transport     MessageTransport      `json:"transport,omitempty"`
	RoutingReason string                `json:"routingReason,omitempty"`
	OperationID   string                `json:"operationId,omitempty"`
}
type MessageResult struct {
	MessageReceipt
	Type    string          `json:"type"`
	Content *MessageContent `json:"content,omitempty"`
	MediaID string          `json:"mediaId,omitempty"`
}
type MessageOperation struct {
	OperationID   string           `json:"operationId"`
	Status        string           `json:"status"`
	Transport     MessageTransport `json:"transport,omitempty"`
	RejectionCode string           `json:"rejectionCode,omitempty"`
	Receipt       *struct {
		WhatsAppIDs WhatsAppMessageIDs `json:"whatsapp_ids"`
		Timestamp   string             `json:"timestamp"`
	} `json:"receipt,omitempty"`
}
type SeenRequest struct {
	Conversation ConversationReference `json:"conversation"`
	ID           string                `json:"id"`
}
type TypingRequest struct {
	Conversation ConversationReference `json:"conversation"`
	ID           string                `json:"id,omitempty"`
	State        string                `json:"state"`
}
type ReactionRequest struct {
	Conversation ConversationReference `json:"conversation"`
	Transport    MessageTransport      `json:"transport,omitempty"`
	ID           string                `json:"id"`
	Reaction     string                `json:"reaction"`
}
type StarRequest struct {
	Conversation ConversationReference `json:"conversation"`
	ID           string                `json:"id"`
	Star         bool                  `json:"star"`
}
type StatusResult struct {
	Status string `json:"status"`
}
type Session struct {
	SessionID      string                    `json:"sessionId"`
	Name           string                    `json:"name"`
	ExternalID     string                    `json:"externalId,omitempty"`
	TenantID       string                    `json:"tenantId"`
	Type           string                    `json:"type"`
	TestMode       bool                      `json:"testMode"`
	Status         string                    `json:"status"`
	StatusReason   string                    `json:"statusReason,omitempty"`
	Configuration  *SessionConfigurationView `json:"configuration,omitempty"`
	NewChatCapping *NewChatCapping           `json:"newChatCapping,omitempty"`
	CreatedAt      string                    `json:"createdAt"`
	UpdatedAt      string                    `json:"updatedAt"`
	OperationID    string                    `json:"operationId,omitempty"`
}
type NewChatCapping struct {
	Enabled       *bool   `json:"enabled"`
	Pacing        bool    `json:"pacing"`
	Status        *string `json:"status"`
	Capped        bool    `json:"capped"`
	Limit         *int    `json:"limit"`
	Used          *int    `json:"used"`
	Remaining     *int    `json:"remaining"`
	CycleStartsAt *string `json:"cycleStartsAt"`
	ResetsAt      *string `json:"resetsAt"`
	ObservedAt    string  `json:"observedAt"`
}
type WhatsAppAccount struct {
	ID                string `json:"id,omitempty"`
	BSUID             string `json:"bsuid,omitempty"`
	Username          string `json:"username,omitempty"`
	PhoneNumber       string `json:"phoneNumber,omitempty"`
	PushName          string `json:"pushName"`
	BusinessName      string `json:"businessName,omitempty"`
	PhonePlatform     string `json:"phonePlatform,omitempty"`
	AccountType       string `json:"accountType,omitempty"`
	ProfilePictureURL string `json:"profilePicUrl,omitempty"`
}
type OperationAccepted struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	OperationID string `json:"operationId"`
}
type HistorySyncPolicy struct {
	Mode        string `json:"mode,omitempty"`
	RequestFull *bool  `json:"requestFull,omitempty"`
}
type HMSConfiguration struct {
	Enabled       bool   `json:"enabled"`
	Region        string `json:"region,omitempty"`
	Policy        string `json:"policy,omitempty"`
	RetentionDays *int   `json:"retentionDays,omitempty"`
	PolicyVersion string `json:"policyVersion,omitempty"`
	LegalHold     *bool  `json:"legalHold,omitempty"`
}
type ObservationConfiguration struct {
	PresenceMode   string `json:"presenceMode,omitempty"`
	TypingMode     string `json:"typingMode,omitempty"`
	LabelMode      string `json:"labelMode,omitempty"`
	QuickReplyMode string `json:"quickReplyMode,omitempty"`
}
type SessionConfigurationOverrides struct {
	Observation *ObservationConfiguration `json:"observation,omitempty"`
	HistorySync *HistorySyncPolicy        `json:"historySync,omitempty"`
	HMS         *HMSConfiguration         `json:"hms,omitempty"`
}
type SessionConfigurationPatch struct {
	Set   *SessionConfigurationOverrides `json:"set,omitempty"`
	Reset []string                       `json:"reset,omitempty"`
}
type SessionConfigurationView struct {
	Effective        SessionConfigurationOverrides `json:"effective"`
	Overrides        SessionConfigurationOverrides `json:"overrides"`
	Sources          map[string]string             `json:"sources"`
	RequestedHistory HistorySyncPolicy             `json:"requestedHistory"`
	HistoryConsent   string                        `json:"historyConsent,omitempty"`
	Revisions        struct {
		Team    int `json:"team"`
		Project int `json:"project"`
		Session int `json:"session"`
	} `json:"revisions"`
	Application *struct {
		DesiredGeneration int    `json:"desiredGeneration"`
		AppliedGeneration int    `json:"appliedGeneration"`
		Status            string `json:"status"`
	} `json:"application,omitempty"`
}
type UpdateSessionRequest struct {
	Configuration SessionConfigurationPatch `json:"configuration"`
	Revision      int64                     `json:"revision"`
}
type QRCode struct {
	QR    string `json:"qr,omitempty"`
	Event string `json:"event,omitempty"`
}
type PairingCodeRequest struct {
	Phone string `json:"phone"`
}
type PairingCode struct {
	Code string `json:"code"`
}
type SessionLifecycleResult struct {
	Starting  bool   `json:"starting,omitempty"`
	Stopping  bool   `json:"stopping,omitempty"`
	Removed   bool   `json:"removed,omitempty"`
	SessionID string `json:"sessionId"`
}
