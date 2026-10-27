package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/textproto"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Catalogs reads the Number's saved Official catalog cache, separately from Graph.
type Catalogs struct{ t *transport }

func (c *MessagingClient) Catalogs() *Catalogs { return &Catalogs{c.t} }

type CloudCatalogAttempt struct {
	StartedAt     string  `json:"startedAt"`
	FinishedAt    *string `json:"finishedAt"`
	Outcome       string  `json:"outcome"`
	MetaErrorCode *int    `json:"metaErrorCode,omitempty"`
}
type CloudCatalogSync struct {
	CatalogID    string              `json:"catalogId"`
	SyncedAt     *string             `json:"syncedAt"`
	Stale        bool                `json:"stale"`
	ProductCount int                 `json:"productCount"`
	LastAttempt  CloudCatalogAttempt `json:"lastAttempt"`
}
type CloudCatalogCacheProduct struct {
	ID           string `json:"id"`
	RetailerID   string `json:"retailerId,omitempty"`
	Name         string `json:"name,omitempty"`
	Description  string `json:"description,omitempty"`
	Price        string `json:"price,omitempty"`
	Currency     string `json:"currency,omitempty"`
	Availability string `json:"availability,omitempty"`
	ReviewStatus string `json:"reviewStatus,omitempty"`
	Visibility   string `json:"visibility,omitempty"`
	ImageURL     string `json:"imageUrl,omitempty"`
	URL          string `json:"url,omitempty"`
}
type CloudCatalogCacheList struct {
	Catalogs []CloudCatalogSync `json:"catalogs"`
}
type CloudCatalogProductPage struct {
	Catalog    CloudCatalogSync           `json:"catalog"`
	Products   []CloudCatalogCacheProduct `json:"products"`
	NextCursor string                     `json:"nextCursor,omitempty"`
}
type CatalogProductsParams struct {
	Limit  *int
	Cursor string
}

var catalogIDPattern = regexp.MustCompile(`^[0-9]{1,32}$`)
var catalogCursorPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`)

func catalogPath(s string, id *string) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "", validation("Provide a Number ID.")
	}
	p := messagingPath(s) + "/catalogs"
	if id != nil {
		if !catalogIDPattern.MatchString(*id) {
			return "", validation("catalogId must contain 1 to 32 digits.")
		}
		p += "/" + escaped(*id)
	}
	return p, nil
}
func (r *Catalogs) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[CloudCatalogCacheList]], error) {
	p, e := catalogPath(s, nil)
	if e != nil {
		return Response[Envelope[CloudCatalogCacheList]]{}, e
	}
	return serverRead[CloudCatalogCacheList](ctx, r.t, p, nil, options(o))
}
func (r *Catalogs) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[CloudCatalogSync]], error) {
	p, e := catalogPath(s, &id)
	if e != nil {
		return Response[Envelope[CloudCatalogSync]]{}, e
	}
	return serverRead[CloudCatalogSync](ctx, r.t, p, nil, options(o))
}
func (r *Catalogs) ListProducts(ctx context.Context, s, id string, q CatalogProductsParams, o ...RequestOptions) (Response[Envelope[CloudCatalogProductPage]], error) {
	p, e := catalogPath(s, &id)
	if e != nil {
		return Response[Envelope[CloudCatalogProductPage]]{}, e
	}
	if q.Limit != nil && (*q.Limit < 1 || *q.Limit > 100) || q.Cursor != "" && !catalogCursorPattern.MatchString(q.Cursor) {
		return Response[Envelope[CloudCatalogProductPage]]{}, validation("Invalid catalog pagination.")
	}
	v := url.Values{}
	if q.Limit != nil {
		setInt(v, "limit", *q.Limit)
	}
	setString(v, "cursor", q.Cursor)
	return serverRead[CloudCatalogProductPage](ctx, r.t, p+"/products", v, options(o))
}

// Sync submits once. A failed or uncertain provider operation is never replayed.
func (r *Catalogs) Sync(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[CloudCatalogSync]], error) {
	p, e := catalogPath(s, &id)
	if e != nil {
		return Response[Envelope[CloudCatalogSync]]{}, e
	}
	opts := options(o)
	if opts.Timeout == 0 {
		opts.Timeout = 60 * time.Second
	}
	return serverWriteOnce[CloudCatalogSync](ctx, r.t, "POST", p+"/sync", nil, opts)
}

type MarketingOnboarding struct {
	Status     string  `json:"status"`
	MetaStatus *string `json:"metaStatus"`
}
type MarketingTerms struct {
	Status     string  `json:"status"`
	MetaStatus *string `json:"metaStatus"`
	Date       *string `json:"date"`
}
type MarketingMessagesStatus struct {
	WABAID                    string              `json:"wabaId"`
	Onboarding                MarketingOnboarding `json:"onboarding"`
	Terms                     MarketingTerms      `json:"terms"`
	CloudAPIMarketingDisabled *bool               `json:"cloudApiMarketingDisabled"`
	NextAction                string              `json:"nextAction"`
	GuideURL                  string              `json:"guideUrl"`
	ObservedAt                string              `json:"observedAt"`
}

func (r *CloudMarketing) GetStatus(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[MarketingMessagesStatus]], error) {
	if strings.TrimSpace(s) == "" || len(s) > 128 {
		return Response[Envelope[MarketingMessagesStatus]]{}, validation("Provide a Number ID of 1 to 128 characters.")
	}
	return serverRead[MarketingMessagesStatus](ctx, r.t, messagingPath(s)+"/marketing-messages/status", nil, options(o))
}

type CloudOrderItem struct {
	ProductRetailerID string  `json:"productRetailerId"`
	Quantity          int     `json:"quantity"`
	ItemPrice         float64 `json:"itemPrice"`
	Currency          string  `json:"currency"`
}
type CloudOrder struct {
	CatalogID string           `json:"catalogId"`
	Text      string           `json:"text,omitempty"`
	Items     []CloudOrderItem `json:"items"`
}
type ContactPreviousIdentity struct {
	ID          *string `json:"id,omitempty"`
	BSUID       *string `json:"bsuid,omitempty"`
	ParentBSUID *string `json:"parentBsuid,omitempty"`
}
type ContactIdentityChange struct {
	Reason    string                   `json:"reason"`
	MessageID string                   `json:"messageId"`
	Previous  *ContactPreviousIdentity `json:"previous,omitempty"`
}
type MarketingOnboardingUpdatedPayload struct {
	webhookPayloadBase
	Kind            string `json:"kind"`
	WABAID          string `json:"wabaId"`
	OwnerBusinessID string `json:"ownerBusinessId,omitempty"`
	MetaEvent       string `json:"metaEvent"`
}
type ContactMarketingPreferencePayload struct {
	webhookPayloadBase
	WAID          string `json:"waId"`
	Preference    string `json:"preference"`
	Category      string `json:"category"`
	PhoneNumberID string `json:"phoneNumberId,omitempty"`
}

// QuickLink error codes remain open strings, including future readiness failures.
const (
	ReadinessCredentialsInvalid   = "meta_credentials_invalid"
	ReadinessPhoneNotRegistered   = "meta_phone_not_registered"
	ReadinessWebhookNotSubscribed = "meta_webhook_not_subscribed"
	ReadinessPaymentMethodMissing = "meta_payment_method_missing"
	ReadinessQualityFlagged       = "meta_quality_flagged"
	ReadinessUnknown              = "meta_readiness_unknown"
)

type multipartRequest struct {
	binaryRequest
	contentType string
}

// SetPicture sends JPEG bytes as multipart file; the server checks image dimensions.
func (r *OfficialGroups) SetPicture(ctx context.Context, s, id string, jpeg []byte, o ...RequestOptions) (Response[Envelope[OfficialGroupAccepted]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[OfficialGroupAccepted]]{}, err
	}
	if len(jpeg) < 3 || len(jpeg) > 5*1024*1024 || !bytes.Equal(jpeg[:3], []byte{255, 216, 255}) {
		return Response[Envelope[OfficialGroupAccepted]]{}, validation("Provide JPEG bytes up to 5 MiB.")
	}
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="file"; filename="picture.jpg"`)
	h.Set("Content-Type", "image/jpeg")
	p, e := w.CreatePart(h)
	if e != nil {
		return Response[Envelope[OfficialGroupAccepted]]{}, e
	}
	if _, e = p.Write(jpeg); e != nil {
		return Response[Envelope[OfficialGroupAccepted]]{}, e
	}
	if e = w.Close(); e != nil {
		return Response[Envelope[OfficialGroupAccepted]]{}, e
	}
	data := b.Bytes()
	body := &multipartRequest{binaryRequest{func(context.Context) (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(data)), nil }, int64(len(data))}, w.FormDataContentType()}
	return request[Envelope[OfficialGroupAccepted]](ctx, r.t, "PUT", officialGroupPath(s, id)+"/picture", nil, singleSubmission{body}, noRetry(options(o)))
}

type WebhookBatchingInput struct {
	Enabled   bool `json:"enabled"`
	MaxEvents *int `json:"maxEvents,omitempty"`
	WindowMS  *int `json:"windowMs,omitempty"`
}
type WebhookBatching struct {
	Enabled   bool `json:"enabled"`
	MaxEvents int  `json:"maxEvents"`
	WindowMS  int  `json:"windowMs"`
}

func validateWebhookBatching(b *WebhookBatchingInput, format string) error {
	if b == nil {
		return nil
	}
	if b.MaxEvents != nil && (*b.MaxEvents < 2 || *b.MaxEvents > 100) || b.WindowMS != nil && (*b.WindowMS < 100 || *b.WindowMS > 1000) || b.Enabled && format == "meta" {
		return validation("Invalid native webhook batching settings.")
	}
	return nil
}

type WebhookEventBatch struct {
	Object  string         `json:"object"`
	Version int            `json:"version"`
	ID      string         `json:"id"`
	Events  []WebhookEvent `json:"events"`
}

// WebhookDelivery contains exactly one of Event or Batch. Verify before dispatch;
// deduplicate batch and member IDs and acknowledge the entire delivery.
type VerifiedWebhookDelivery struct {
	Event *WebhookEvent
	Batch *WebhookEventBatch
}

var batchIDPattern = regexp.MustCompile(`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

func ConstructWebhookDelivery(body []byte, signature, secret string) (VerifiedWebhookDelivery, error) {
	if !VerifyWebhookSignature(body, signature, secret) {
		return VerifiedWebhookDelivery{}, &Error{Kind: AuthenticationError, Code: "invalid_webhook_signature", Message: "Webhook signature verification failed."}
	}
	return ParseVerifiedWebhookDelivery(body)
}
func ParseVerifiedWebhookDelivery(body []byte) (VerifiedWebhookDelivery, error) {
	if !utf8.Valid(body) {
		return VerifiedWebhookDelivery{}, &Error{Kind: ValidationError, Code: "invalid_webhook_body", Message: "Webhook body must contain valid UTF-8."}
	}
	var shape map[string]json.RawMessage
	if json.Unmarshal(body, &shape) != nil || string(shape["object"]) != `"event_batch"` {
		e, err := ParseVerifiedWebhookEvent(body)
		return VerifiedWebhookDelivery{Event: &e}, err
	}
	fail := func() (VerifiedWebhookDelivery, error) {
		return VerifiedWebhookDelivery{}, &Error{Kind: ValidationError, Code: "invalid_webhook_batch", Message: "Invalid version 1 event batch."}
	}
	var raw struct {
		Object  string
		Version int
		ID      string
		Events  []json.RawMessage
	}
	if json.Unmarshal(body, &raw) != nil || len(shape) != 4 || raw.Version != 1 || !batchIDPattern.MatchString(raw.ID) || len(raw.Events) < 1 || len(raw.Events) > 100 {
		return fail()
	}
	events := make([]WebhookEvent, 0, len(raw.Events))
	for _, member := range raw.Events {
		var fields map[string]json.RawMessage
		json.Unmarshal(member, &fields)
		if _, ok := fields["object"]; ok {
			return fail()
		}
		e, err := ParseVerifiedWebhookEvent(member)
		if err != nil {
			return fail()
		}
		events = append(events, e)
	}
	return VerifiedWebhookDelivery{Batch: &WebhookEventBatch{"event_batch", 1, raw.ID, events}}, nil
}
