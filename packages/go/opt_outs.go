package polymorfa

import "context"

type OptOutSettings struct {
	Enabled        bool     `json:"enabled"`
	OptOutKeywords []string `json:"optOutKeywords"`
	OptInKeywords  []string `json:"optInKeywords"`
	UpdatedAt      *int64   `json:"updatedAt"`
}
type UpdateOptOutSettingsRequest struct {
	Enabled        bool     `json:"enabled"`
	OptOutKeywords []string `json:"optOutKeywords"`
	OptInKeywords  []string `json:"optInKeywords"`
}
type OptOuts struct{ t *transport }

func (c *OrganizationClient) OptOuts() *OptOuts { return &OptOuts{c.t} }
func (r *OptOuts) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "GET", "/platform/optouts", nil, nil, options(o))
}
func (r *OptOuts) Create(ctx context.Context, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", "/platform/optouts", nil, b, options(o))
}
func (r *OptOuts) CreateBatch(ctx context.Context, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", "/platform/optouts/batch", nil, b, options(o))
}
func (r *OptOuts) Delete(ctx context.Context, phone string, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "DELETE", "/platform/optouts/"+escaped(phone), nil, nil, options(o))
}
func (r *OptOuts) GetSettings(ctx context.Context, o ...RequestOptions) (Response[Envelope[OptOutSettings]], error) {
	return request[Envelope[OptOutSettings]](ctx, r.t, "GET", "/platform/optouts/settings", nil, nil, options(o))
}
func (r *OptOuts) UpdateSettings(ctx context.Context, b UpdateOptOutSettingsRequest, o ...RequestOptions) (Response[Envelope[OptOutSettings]], error) {
	return request[Envelope[OptOutSettings]](ctx, r.t, "PUT", "/platform/optouts/settings", nil, b, options(o))
}
