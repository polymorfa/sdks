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
	setString(q, "reason", string(p.Reason))
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
	if err := validateExistingCampaign(b, false, false); err != nil {
		return Response[Envelope[Campaign]]{}, err
	}
	return campaignIdentity[Envelope[Campaign]](ctx, r.t, messagingCampaignsPath(project), b, o)
}
func (r *MessagingCampaigns) Retrieve(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[Campaign]], error) {
	return request[Envelope[Campaign]](ctx, r.t, "GET", messagingCampaignPath(project, id), nil, nil, options(o))
}
func (r *MessagingCampaigns) Update(ctx context.Context, project, id string, b UpdateCampaignRequest, o ...RequestOptions) (Response[Envelope[Campaign]], error) {
	if b.TemplateID == nil && b.VariableMapping == nil && b.TrackedLinks == nil && b.Name == nil && b.RecipientListID == nil && b.SenderConfig == nil && b.ScheduledAt == nil && b.SendWindow == nil && b.MessageVariations == nil && b.Variants == nil && b.VariantStrategy == nil && b.FollowUp == nil && b.FrequencyCap == nil && b.Drip == nil {
		return Response[Envelope[Campaign]]{}, validation("At least one campaign field is required.")
	}
	if err := validateExistingCampaign(b, false, true); err != nil {
		return Response[Envelope[Campaign]]{}, err
	}
	return request[Envelope[Campaign]](ctx, r.t, "PATCH", messagingCampaignPath(project, id), nil, b, appendOnce(options(o)))
}
func (r *MessagingCampaigns) Analytics(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignAnalytics]], error) {
	return request[Envelope[CampaignAnalytics]](ctx, r.t, "GET", messagingCampaignPath(project, id)+"/analytics", nil, nil, options(o))
}
func (r *MessagingCampaigns) Launch(ctx context.Context, project, id string, b LaunchCampaignRequest, o ...RequestOptions) (Response[Envelope[CampaignOperation]], error) {
	if err := validateCampaignLaunch(b, false); err != nil {
		return Response[Envelope[CampaignOperation]]{}, err
	}
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
	if err := validateRecipientList(p); err != nil {
		return Response[CursorEnvelope[CampaignRecipient]]{}, err
	}
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
	if err := validateExistingCampaign(b, true, false); err != nil {
		return Response[Envelope[PlatformCampaign]]{}, err
	}
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
		for _, key := range []string{"projectId", "id"} {
			if _, ok := b.Extra[key]; ok {
				return Response[Envelope[PlatformCampaign]]{}, configuration(key, "Select the campaign and project through their method arguments.")
			}
		}
		body = *b
		if err := validateExistingCampaign(*b, true, true); err != nil {
			return Response[Envelope[PlatformCampaign]]{}, err
		}
	}
	return request[Envelope[PlatformCampaign]](ctx, r.t, "PATCH", platformCampaignPath(id), p.query(), body, options(o))
}
func (r *Campaigns) Delete(ctx context.Context, id string, p PlatformCampaignParams, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "DELETE", platformCampaignPath(id), p.query(), nil, options(o))
}
func (r *Campaigns) Launch(ctx context.Context, id string, b LaunchPlatformCampaignRequest, o ...RequestOptions) (Response[Envelope[PlatformCampaignOperation]], error) {
	if err := validateCampaignLaunch(b, true); err != nil {
		return Response[Envelope[PlatformCampaignOperation]]{}, err
	}
	return campaignIdentity[Envelope[PlatformCampaignOperation]](ctx, r.t, platformCampaignPath(id)+"/launch", b, o)
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
	if err := contractUUID(p.ProjectID, "projectId"); err != nil {
		return Response[CursorEnvelope[CampaignRecipient]]{}, err
	}
	if err := validateRecipientList(p.ListCampaignRecipientsParams); err != nil {
		return Response[CursorEnvelope[CampaignRecipient]]{}, err
	}
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
