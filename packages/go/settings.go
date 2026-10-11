package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
)

// Nullable separates an omitted pointer field from an explicit JSON null.
type Nullable[T any] struct{ Value *T }

func (n Nullable[T]) MarshalJSON() ([]byte, error)  { return json.Marshal(n.Value) }
func (n *Nullable[T]) UnmarshalJSON(b []byte) error { return json.Unmarshal(b, &n.Value) }

type QuickLinkSettings struct {
	ID                  string   `json:"id"`
	ProjectID           *string  `json:"projectId"`
	Enabled             bool     `json:"enabled"`
	SuccessCallbackURL  *string  `json:"successCallbackUrl"`
	FailureCallbackURL  *string  `json:"failureCallbackUrl"`
	BusinessName        *string  `json:"businessName"`
	Headline            *string  `json:"headline"`
	Description         *string  `json:"description"`
	SuccessMessage      *string  `json:"successMessage"`
	SupportURL          *string  `json:"supportUrl"`
	PrivacyURL          *string  `json:"privacyUrl"`
	TermsURL            *string  `json:"termsUrl"`
	Accent              *string  `json:"accent"`
	Theme               string   `json:"theme"`
	HideWatermark       bool     `json:"hideWatermark"`
	AllowPhoneChange    bool     `json:"allowPhoneChange"`
	Shape               *string  `json:"shape"`
	RadiusPx            *int     `json:"radiusPx"`
	LogoMode            string   `json:"logoMode"`
	LogoStorageID       *string  `json:"logoStorageId"`
	LogoSourceStorageID *string  `json:"logoSourceStorageId"`
	LogoURL             *string  `json:"logoUrl"`
	HistorySync         string   `json:"historySync"`
	Methods             []string `json:"methods"`
	DefaultMethod       *string  `json:"defaultMethod"`
	CreatedAt           int64    `json:"createdAt"`
	UpdatedAt           int64    `json:"updatedAt"`
}
type UpdateQuickLinkSettingsRequest struct {
	Enabled             *bool               `json:"enabled,omitempty"`
	SuccessCallbackURL  *Nullable[string]   `json:"successCallbackUrl,omitempty"`
	FailureCallbackURL  *Nullable[string]   `json:"failureCallbackUrl,omitempty"`
	BusinessName        *Nullable[string]   `json:"businessName,omitempty"`
	Headline            *Nullable[string]   `json:"headline,omitempty"`
	Description         *Nullable[string]   `json:"description,omitempty"`
	SuccessMessage      *Nullable[string]   `json:"successMessage,omitempty"`
	SupportURL          *Nullable[string]   `json:"supportUrl,omitempty"`
	PrivacyURL          *Nullable[string]   `json:"privacyUrl,omitempty"`
	TermsURL            *Nullable[string]   `json:"termsUrl,omitempty"`
	Accent              *Nullable[string]   `json:"accent,omitempty"`
	Theme               string              `json:"theme,omitempty"`
	HideWatermark       *bool               `json:"hideWatermark,omitempty"`
	AllowPhoneChange    *bool               `json:"allowPhoneChange,omitempty"`
	Shape               *Nullable[string]   `json:"shape,omitempty"`
	RadiusPx            *Nullable[int]      `json:"radiusPx,omitempty"`
	LogoMode            string              `json:"logoMode,omitempty"`
	LogoStorageID       *Nullable[string]   `json:"logoStorageId,omitempty"`
	LogoSourceStorageID *Nullable[string]   `json:"logoSourceStorageId,omitempty"`
	HistorySync         string              `json:"historySync,omitempty"`
	Methods             *Nullable[[]string] `json:"methods,omitempty"`
	DefaultMethod       *Nullable[string]   `json:"defaultMethod,omitempty"`
}
type QuickLinkSettingsResource struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) QuickLinkSettings() *QuickLinkSettingsResource {
	return &QuickLinkSettingsResource{t: c.t}
}
func (c *ProjectClient) QuickLinkSettings() *QuickLinkSettingsResource {
	return &QuickLinkSettingsResource{c.t, c.projectID}
}
func (r *QuickLinkSettingsResource) Retrieve(ctx context.Context, o ...RequestOptions) (Response[*QuickLinkSettings], error) {
	q := url.Values{}
	setString(q, "projectId", r.projectID)
	wire, err := request[Envelope[*QuickLinkSettings]](ctx, r.t, "GET", "/platform/quicklink", q, nil, options(o))
	return Response[*QuickLinkSettings]{wire.Data.Data, wire.Metadata}, err
}
func (r *QuickLinkSettingsResource) Update(ctx context.Context, b UpdateQuickLinkSettingsRequest, o ...RequestOptions) (Response[QuickLinkSettings], error) {
	body := struct {
		UpdateQuickLinkSettingsRequest
		ProjectID string `json:"projectId,omitempty"`
	}{b, r.projectID}
	return unwrapped[QuickLinkSettings](ctx, r.t, "PUT", "/platform/quicklink", nil, body, options(o))
}

type SessionConfigurationResource struct {
	t         *transport
	projectID string
}

func (c *OrganizationClient) SessionConfiguration() *SessionConfigurationResource {
	return &SessionConfigurationResource{t: c.t}
}
func (c *ProjectClient) SessionConfiguration() *SessionConfigurationResource {
	return &SessionConfigurationResource{c.t, c.projectID}
}
func (r *SessionConfigurationResource) Retrieve(ctx context.Context, o ...RequestOptions) (Response[SessionConfigurationView], error) {
	q := url.Values{}
	setString(q, "projectId", r.projectID)
	return unwrapped[SessionConfigurationView](ctx, r.t, "GET", "/platform/session-configuration", q, nil, options(o))
}
func (r *SessionConfigurationResource) Update(ctx context.Context, b UpdateSessionRequest, o ...RequestOptions) (Response[SessionConfigurationView], error) {
	body := struct {
		UpdateSessionRequest
		ProjectID string `json:"projectId,omitempty"`
	}{b, r.projectID}
	return unwrapped[SessionConfigurationView](ctx, r.t, "PUT", "/platform/session-configuration", nil, body, options(o))
}

// PlatformPayload is intentionally open in the pinned TypeScript contract.
// Strict resource schemas use their own handwritten request/response structs.
type PlatformPayload map[string]json.RawMessage
type PlatformMedia struct{ t *transport }

func (c *OrganizationClient) Media() *PlatformMedia { return &PlatformMedia{c.t} }
func (r *PlatformMedia) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "GET", "/platform/media/"+escaped(id), nil, nil, options(o))
}
func (r *PlatformMedia) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "DELETE", "/platform/media/"+escaped(id), nil, nil, options(o))
}
func (r *PlatformMedia) CreateUpload(ctx context.Context, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", "/platform/media/uploads", nil, body, options(o))
}
