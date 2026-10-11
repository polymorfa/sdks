package polymorfa

import (
	"context"
	"net/url"
)

type MetaPricingParams struct{ Since, Until string }
type MetaPricingGroup struct {
	Category     string  `json:"category"`
	PricingModel string  `json:"pricingModel"`
	PricingType  *string `json:"pricingType"`
	Billable     *bool   `json:"billable"`
	Messages     int64   `json:"messages"`
}
type MetaPricingSummary struct {
	Source   string             `json:"source"`
	Since    string             `json:"since"`
	Until    string             `json:"until"`
	Messages int64              `json:"messages"`
	Groups   []MetaPricingGroup `json:"groups"`
}
type CloudCredentialHealth struct {
	Status      string  `json:"status"`
	CheckedAt   *string `json:"checkedAt"`
	NextCheckAt *string `json:"nextCheckAt"`
	Token       struct {
		Status    string  `json:"status"`
		ExpiresAt *string `json:"expiresAt"`
	} `json:"token"`
	MissingPermissions  []string `json:"missingPermissions"`
	PhoneRegistration   string   `json:"phoneRegistration"`
	WebhookSubscription string   `json:"webhookSubscription"`
	FailureCode         *string  `json:"failureCode"`
}
type CloudReauthorization struct {
	QuickLinkID string `json:"quicklinkId"`
	URL         string `json:"url"`
	Session     string `json:"session"`
}

func (r *MessagingSessions) GetMetaPricing(ctx context.Context, s string, p MetaPricingParams, o ...RequestOptions) (Response[Envelope[MetaPricingSummary]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[MetaPricingSummary]]{}, err
	}
	q := url.Values{}
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return request[Envelope[MetaPricingSummary]](ctx, r.t, "GET", messagingPath(s)+"/meta-pricing", q, nil, options(o))
}
func (r *MessagingSessions) GetCloudCredentialHealth(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[CloudCredentialHealth]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[CloudCredentialHealth]]{}, err
	}
	return request[Envelope[CloudCredentialHealth]](ctx, r.t, "GET", messagingPath(s)+"/cloud-credentials", nil, nil, options(o))
}
func (r *MessagingSessions) ReauthorizeCloudCredentials(ctx context.Context, s string, opts ...RequestOptions) (Response[Envelope[CloudReauthorization]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[CloudReauthorization]]{}, err
	}
	o := options(opts)
	zero := 0
	o.MaxNetworkRetries = &zero
	return request[Envelope[CloudReauthorization]](ctx, r.t, "POST", messagingPath(s)+"/cloud-credentials/reauthorize", nil, nil, o)
}
