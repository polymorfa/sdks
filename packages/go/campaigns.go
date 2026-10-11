package polymorfa

import (
	"context"
	"net/url"
)

type MessagingCampaigns struct{ t *transport }
type Campaigns struct{ t *transport }

func (c *MessagingClient) Campaigns() *MessagingCampaigns { return &MessagingCampaigns{c.t} }
func (c *OrganizationClient) Campaigns() *Campaigns       { return &Campaigns{c.t} }
func messagingCampaignsPath(project string) string {
	return messagingProjectPath(project) + "/campaigns"
}
func messagingCampaignPath(project, id string) string {
	return messagingCampaignsPath(project) + "/" + escaped(id)
}
func platformCampaignPath(id string) string        { return "/platform/campaigns/" + escaped(id) }
func (p PlatformCampaignParams) query() url.Values { return url.Values{"projectId": {p.ProjectID}} }
func (p ListCampaignRecipientsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "status", p.Status)
	return q
}
func appendOnce(o RequestOptions) RequestOptions {
	if o.MaxNetworkRetries == nil {
		return noRetry(o)
	}
	return o
}
func campaignIdentity[T any](ctx context.Context, t *transport, path string, b any, o []RequestOptions) (Response[T], error) {
	opts, err := idempotent(options(o))
	if err != nil {
		return Response[T]{}, err
	}
	return request[T](ctx, t, "POST", path, nil, b, opts)
}
func (r *MessagingCampaigns) List(ctx context.Context, project string, o ...RequestOptions) (Response[Envelope[[]Campaign]], error) {
	return request[Envelope[[]Campaign]](ctx, r.t, "GET", messagingCampaignsPath(project), nil, nil, options(o))
}
func (r *MessagingCampaigns) Create(ctx context.Context, project string, b CreateCampaignRequest, o ...RequestOptions) (Response[Envelope[Campaign]], error) {
	return request[Envelope[Campaign]](ctx, r.t, "POST", messagingCampaignsPath(project), nil, b, options(o))
}
func (r *MessagingCampaigns) Retrieve(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[Campaign]], error) {
	return request[Envelope[Campaign]](ctx, r.t, "GET", messagingCampaignPath(project, id), nil, nil, options(o))
}
func (r *MessagingCampaigns) Update(ctx context.Context, project, id string, b UpdateCampaignRequest, o ...RequestOptions) (Response[Envelope[Campaign]], error) {
	if b.Name == nil && b.RecipientListID == nil && b.SenderConfig == nil && b.ScheduledAt == nil && b.SendWindow == nil && b.MessageVariations == nil && b.Variants == nil && b.VariantStrategy == nil {
		return Response[Envelope[Campaign]]{}, validation("At least one campaign field is required.")
	}
	return request[Envelope[Campaign]](ctx, r.t, "PATCH", messagingCampaignPath(project, id), nil, b, appendOnce(options(o)))
}
func (r *MessagingCampaigns) Analytics(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignAnalytics]], error) {
	return request[Envelope[CampaignAnalytics]](ctx, r.t, "GET", messagingCampaignPath(project, id)+"/analytics", nil, nil, options(o))
}
func (r *MessagingCampaigns) Launch(ctx context.Context, project, id string, b LaunchCampaignRequest, o ...RequestOptions) (Response[Envelope[CampaignOperation]], error) {
	return campaignIdentity[Envelope[CampaignOperation]](ctx, r.t, messagingCampaignPath(project, id)+"/launch", b, o)
}
func (r *MessagingCampaigns) Reschedule(ctx context.Context, project, id string, b RescheduleCampaignRequest, o ...RequestOptions) (Response[Envelope[CampaignOperation]], error) {
	return campaignIdentity[Envelope[CampaignOperation]](ctx, r.t, messagingCampaignPath(project, id)+"/reschedule", b, o)
}
func (r *MessagingCampaigns) Pause(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignOperation]], error) {
	return campaignIdentity[Envelope[CampaignOperation]](ctx, r.t, messagingCampaignPath(project, id)+"/pause", nil, o)
}
func (r *MessagingCampaigns) Resume(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignOperation]], error) {
	return campaignIdentity[Envelope[CampaignOperation]](ctx, r.t, messagingCampaignPath(project, id)+"/resume", nil, o)
}
func (r *MessagingCampaigns) Stop(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignStopOperation]], error) {
	return campaignIdentity[Envelope[CampaignStopOperation]](ctx, r.t, messagingCampaignPath(project, id)+"/stop", nil, o)
}
func (r *MessagingCampaigns) ListRecipients(ctx context.Context, project, id string, p ListCampaignRecipientsParams, o ...RequestOptions) (Response[CursorEnvelope[CampaignRecipient]], error) {
	return request[CursorEnvelope[CampaignRecipient]](ctx, r.t, "GET", messagingCampaignPath(project, id)+"/recipients", p.query(), nil, options(o))
}
func (r *MessagingCampaigns) AddRecipients(ctx context.Context, project, id string, b AddCampaignRecipientsRequest, o ...RequestOptions) (Response[Envelope[AddCampaignRecipientsResult]], error) {
	return request[Envelope[AddCampaignRecipientsResult]](ctx, r.t, "POST", messagingCampaignPath(project, id)+"/recipients", nil, b, appendOnce(options(o)))
}
func (r *MessagingCampaigns) Requeue(ctx context.Context, project, id string, b RequeueCampaignRequest, o ...RequestOptions) (Response[Envelope[CampaignRequeueResult]], error) {
	return request[Envelope[CampaignRequeueResult]](ctx, r.t, "POST", messagingCampaignPath(project, id)+"/requeue", nil, b, options(o))
}
func (r *Campaigns) List(ctx context.Context, p ListCampaignsParams, o ...RequestOptions) (Response[Envelope[[]PlatformCampaign]], error) {
	q := url.Values{"projectId": {p.ProjectID}}
	setString(q, "projectSlug", p.ProjectSlug)
	return request[Envelope[[]PlatformCampaign]](ctx, r.t, "GET", "/platform/campaigns", q, nil, options(o))
}
func (r *Campaigns) Create(ctx context.Context, b CreatePlatformCampaignRequest, o ...RequestOptions) (Response[Envelope[PlatformCampaign]], error) {
	opts := noRetry(options(o))
	opts.IdempotencyKey = ""
	return request[Envelope[PlatformCampaign]](ctx, r.t, "POST", "/platform/campaigns", nil, b, opts)
}
func (r *Campaigns) Retrieve(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[*PlatformCampaign]], error) {
	return request[Envelope[*PlatformCampaign]](ctx, r.t, "GET", platformCampaignPath(id), p.query(), nil, options(o))
}
func (r *Campaigns) Update(ctx context.Context, id string, b *UpdatePlatformCampaignRequest, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[PlatformCampaign]], error) {
	var body any
	if b != nil {
		body = *b
	}
	return request[Envelope[PlatformCampaign]](ctx, r.t, "PATCH", platformCampaignPath(id), p.query(), body, options(o))
}
func (r *Campaigns) Delete(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "DELETE", platformCampaignPath(id), p.query(), nil, options(o))
}
func (r *Campaigns) Launch(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return campaignIdentity[Envelope[PlatformPayload]](ctx, r.t, platformCampaignPath(id)+"/launch", body, o)
}
func (r *Campaigns) Reschedule(ctx context.Context, id string, b ReschedulePlatformCampaignRequest, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return campaignIdentity[Envelope[PlatformPayload]](ctx, r.t, platformCampaignPath(id)+"/reschedule", b, o)
}
func (r *Campaigns) Pause(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return campaignIdentity[Envelope[PlatformPayload]](ctx, r.t, platformCampaignPath(id)+"/pause", body, o)
}
func (r *Campaigns) Resume(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return campaignIdentity[Envelope[PlatformPayload]](ctx, r.t, platformCampaignPath(id)+"/resume", body, o)
}
func (r *Campaigns) Stop(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return campaignIdentity[Envelope[PlatformPayload]](ctx, r.t, platformCampaignPath(id)+"/stop", body, o)
}
func (r *Campaigns) Archive(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", platformCampaignPath(id)+"/archive", nil, body, options(o))
}
func (r *Campaigns) Duplicate(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", platformCampaignPath(id)+"/duplicate", nil, body, options(o))
}
func (r *Campaigns) Requeue(ctx context.Context, id string, b PlatformPayload, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	var body any
	if b != nil {
		body = b
	}
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", platformCampaignPath(id)+"/requeue", nil, body, options(o))
}
func (r *Campaigns) Analytics(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[PlatformCampaignAnalytics]], error) {
	return request[Envelope[PlatformCampaignAnalytics]](ctx, r.t, "GET", platformCampaignPath(id)+"/analytics", p.query(), nil, options(o))
}
func (r *Campaigns) Events(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "GET", platformCampaignPath(id)+"/events", p.query(), nil, options(o))
}
func (r *Campaigns) Recipients(ctx context.Context, id string, p ListPlatformCampaignRecipientsParams, o ...RequestOptions) (Response[CursorEnvelope[CampaignRecipient]], error) {
	q := p.ListCampaignRecipientsParams.query()
	q.Set("projectId", p.ProjectID)
	return request[CursorEnvelope[CampaignRecipient]](ctx, r.t, "GET", platformCampaignPath(id)+"/recipients", q, nil, options(o))
}
func (r *Campaigns) AddRecipients(ctx context.Context, id string, b AddPlatformCampaignRecipientsRequest, o ...RequestOptions) (Response[Envelope[AddCampaignRecipientsResult]], error) {
	return request[Envelope[AddCampaignRecipientsResult]](ctx, r.t, "POST", platformCampaignPath(id)+"/recipients", nil, b, appendOnce(options(o)))
}
func (r *Campaigns) RecordConversion(ctx context.Context, id string, b RecordCampaignConversionRequest, o ...RequestOptions) (Response[Envelope[CampaignConversion]], error) {
	return request[Envelope[CampaignConversion]](ctx, r.t, "POST", platformCampaignPath(id)+"/conversions", nil, b, options(o))
}
func (r *Campaigns) Conversions(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[CampaignConversionReport]], error) {
	return request[Envelope[CampaignConversionReport]](ctx, r.t, "GET", platformCampaignPath(id)+"/conversions", p.query(), nil, options(o))
}
