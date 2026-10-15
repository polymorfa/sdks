package polymorfa

import (
	"context"
	"net/url"
	"strings"
)

func campaignDo[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, opts []RequestOptions, replay bool, checks ...error) (Response[Envelope[T]], error) {
	for _, err := range checks {
		if err != nil {
			return Response[Envelope[T]]{}, err
		}
	}
	if strings.HasPrefix(path, "/messaging/") {
		if err := serverOnly(t); err != nil {
			return Response[Envelope[T]]{}, err
		}
	}
	o, err := campaignOptions(options(opts), method != "GET", replay)
	if err != nil {
		return Response[Envelope[T]]{}, err
	}
	return campaignRequest[T](ctx, t, method, path, q, body, o)
}
func messagingReplyFlowPath(project string) string {
	return "/messaging/projects/" + escaped(project) + "/campaign-reply-flows"
}
func campaignSlug(v string) error { return contractText(v, "projectSlug", 1, int(^uint(0)>>1)) }
func (r *MessagingCampaigns) GetReplyFlow(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return campaignDo[CampaignReplyFlow](ctx, r.t, "GET", messagingReplyFlowPath(project)+"/"+escaped(id), nil, nil, o, false, campaignSlug(project), contractUUID(id, "replyFlowId"))
}
func (r *MessagingCampaigns) CreateReplyFlow(ctx context.Context, project string, b CreateCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return campaignDo[CampaignReplyFlow](ctx, r.t, "POST", messagingReplyFlowPath(project), nil, b, o, false, campaignSlug(project), validateReplyCreate(b))
}
func (r *MessagingCampaigns) SetReplyFlow(ctx context.Context, project, id string, b SetCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlowAssignment]], error) {
	return campaignDo[CampaignReplyFlowAssignment](ctx, r.t, "PUT", messagingCampaignPath(project, id)+"/reply-flow", nil, b, o, false, campaignSlug(project), contractUUID(id, "campaignId"), validateReplyAssignment(b))
}
func (r *MessagingCampaigns) TestSend(ctx context.Context, project, id string, b CampaignTestSendRequest, o ...RequestOptions) (Response[Envelope[CampaignTestSend]], error) {
	return campaignDo[CampaignTestSend](ctx, r.t, "POST", messagingCampaignPath(project, id)+"/test-send", nil, b, o, true, campaignSlug(project), contractUUID(id, "campaignId"), validateTestSend(b))
}
func (r *MessagingCampaigns) Links(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[[]CampaignTrackedLinkReport]], error) {
	return campaignDo[[]CampaignTrackedLinkReport](ctx, r.t, "GET", messagingCampaignPath(project, id)+"/links", nil, nil, o, false, campaignSlug(project), contractUUID(id, "campaignId"))
}
func (r *MessagingCampaigns) ExportRecipients(ctx context.Context, project, id string, p CampaignRecipientExportParams, o ...RequestOptions) (Response[CampaignRecipientExportPage], error) {
	if err := campaignSlug(project); err != nil {
		return Response[CampaignRecipientExportPage]{}, err
	}
	if err := serverOnly(r.t); err != nil {
		return Response[CampaignRecipientExportPage]{}, err
	}
	return requestCampaignExport(ctx, r.t, messagingCampaignPath(project, id)+"/recipients/export", id, p, "", o)
}
func (r *Campaigns) GetReplyFlow(ctx context.Context, id string, p CampaignProjectParams, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return campaignDo[CampaignReplyFlow](ctx, r.t, "GET", "/platform/campaign-reply-flows/"+escaped(id), url.Values{"projectId": {p.ProjectID}}, nil, o, false, contractUUID(id, "replyFlowId"), contractUUID(p.ProjectID, "projectId"))
}
func (r *Campaigns) CreateReplyFlow(ctx context.Context, b CreatePlatformCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return campaignDo[CampaignReplyFlow](ctx, r.t, "POST", "/platform/campaign-reply-flows", nil, b, o, false, contractUUID(b.ProjectID, "projectId"), validateReplyCreate(b.CreateCampaignReplyFlowRequest))
}
func (r *Campaigns) SetReplyFlow(ctx context.Context, id string, b SetPlatformCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlowAssignment]], error) {
	return campaignDo[CampaignReplyFlowAssignment](ctx, r.t, "PUT", platformCampaignPath(id)+"/reply-flow", nil, b, o, false, contractUUID(id, "campaignId"), contractUUID(b.ProjectID, "projectId"), validateReplyAssignment(b.SetCampaignReplyFlowRequest))
}
func (r *Campaigns) TestSend(ctx context.Context, id string, b PlatformCampaignTestSendRequest, o ...RequestOptions) (Response[Envelope[CampaignTestSend]], error) {
	return campaignDo[CampaignTestSend](ctx, r.t, "POST", platformCampaignPath(id)+"/test-send", nil, b, o, true, contractUUID(id, "campaignId"), contractUUID(b.ProjectID, "projectId"), validateTestSend(b.CampaignTestSendRequest))
}
func (r *Campaigns) ListLaunchApprovals(ctx context.Context, id string, p CampaignProjectParams, o ...RequestOptions) (Response[Envelope[[]CampaignLaunchApproval]], error) {
	return campaignDo[[]CampaignLaunchApproval](ctx, r.t, "GET", platformCampaignPath(id)+"/approvals", url.Values{"projectId": {p.ProjectID}}, nil, o, false, contractUUID(id, "campaignId"), contractUUID(p.ProjectID, "projectId"))
}
func (r *Campaigns) Links(ctx context.Context, id string, p CampaignProjectParams, o ...RequestOptions) (Response[Envelope[[]CampaignTrackedLinkReport]], error) {
	return campaignDo[[]CampaignTrackedLinkReport](ctx, r.t, "GET", platformCampaignPath(id)+"/links", url.Values{"projectId": {p.ProjectID}}, nil, o, false, contractUUID(id, "campaignId"), contractUUID(p.ProjectID, "projectId"))
}
func (r *Campaigns) ExportRecipients(ctx context.Context, id string, p PlatformCampaignRecipientExportParams, o ...RequestOptions) (Response[CampaignRecipientExportPage], error) {
	if err := contractUUID(p.ProjectID, "projectId"); err != nil {
		return Response[CampaignRecipientExportPage]{}, err
	}
	return requestCampaignExport(ctx, r.t, platformCampaignPath(id)+"/recipients/export", id, p.CampaignRecipientExportParams, p.ProjectID, o)
}
func (r *Campaigns) GetSettings(ctx context.Context, o ...RequestOptions) (Response[Envelope[CampaignSettings]], error) {
	return campaignDo[CampaignSettings](ctx, r.t, "GET", "/platform/campaign-settings", nil, nil, o, false)
}
func (r *Audiences) CreateFromCampaign(ctx context.Context, b CreateAudienceFromCampaignRequest, o ...RequestOptions) (Response[Envelope[AudienceFromCampaignResult]], error) {
	return campaignDo[AudienceFromCampaignResult](ctx, r.t, "POST", "/platform/audiences/from-campaign", nil, b, o, false, validateRetarget(b))
}
func (r *OptOuts) GetConfirmationSettings(ctx context.Context, o ...RequestOptions) (Response[Envelope[StopConfirmationSettings]], error) {
	return campaignDo[StopConfirmationSettings](ctx, r.t, "GET", "/platform/optouts/confirmation-settings", nil, nil, o, false)
}
func (r *OptOuts) UpdateConfirmationSettings(ctx context.Context, b UpdateStopConfirmationSettingsRequest, o ...RequestOptions) (Response[Envelope[StopConfirmationSettings]], error) {
	return campaignDo[StopConfirmationSettings](ctx, r.t, "PUT", "/platform/optouts/confirmation-settings", nil, b, o, false, validateConfirmation(b))
}
func (r *OptOuts) GetConfirmationSummary(ctx context.Context, o ...RequestOptions) (Response[Envelope[StopConfirmationSummary]], error) {
	return campaignDo[StopConfirmationSummary](ctx, r.t, "GET", "/platform/optouts/confirmation-summary", nil, nil, o, false)
}
func requestCampaignExport(ctx context.Context, t *transport, path, id string, p CampaignRecipientExportParams, project string, opts []RequestOptions) (Response[CampaignRecipientExportPage], error) {
	var result Response[CampaignRecipientExportPage]
	if err := contractUUID(id, "campaignId"); err != nil {
		return result, err
	}
	q, err := campaignExportQuery(p)
	if err != nil {
		return result, err
	}
	if project != "" {
		q.Set("projectId", project)
	}
	o, err := campaignOptions(options(opts), false, false)
	if err != nil {
		return result, err
	}
	text, err := requestText(ctx, t, path, q, "text/csv", o)
	result.Metadata = text.Metadata
	if err != nil {
		return result, err
	}
	if text.Metadata.Status != 200 {
		return result, campaignResponseError(text.Metadata)
	}
	result.Data.CSV = text.Data
	if s := text.Metadata.Headers.Get("Polymorfa-Next-Cursor"); s != "" {
		result.Data.NextCursor = &s
	}
	if s := ParseContentDispositionFilename(text.Metadata.Headers.Get("Content-Disposition")); s != "" {
		result.Data.Filename = &s
	}
	return result, nil
}
