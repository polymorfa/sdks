package polymorfa

import "context"

// ProjectCampaigns exposes only the seven project-confined campaign operations.
// A resource retains its selected project; requests cannot retarget it.
type ProjectCampaigns struct {
	t         *transport
	projectID string
}

func (c *ProjectClient) Campaigns() *ProjectCampaigns { return &ProjectCampaigns{c.t, c.projectID} }
func (r *ProjectCampaigns) GetReplyFlow(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return (&Campaigns{r.t}).GetReplyFlow(ctx, id, CampaignProjectParams{r.projectID}, o...)
}
func (r *ProjectCampaigns) CreateReplyFlow(ctx context.Context, b CreateCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlow]], error) {
	return (&Campaigns{r.t}).CreateReplyFlow(ctx, CreatePlatformCampaignReplyFlowRequest{b, r.projectID}, o...)
}
func (r *ProjectCampaigns) SetReplyFlow(ctx context.Context, id string, b SetCampaignReplyFlowRequest, o ...RequestOptions) (Response[Envelope[CampaignReplyFlowAssignment]], error) {
	return (&Campaigns{r.t}).SetReplyFlow(ctx, id, SetPlatformCampaignReplyFlowRequest{b, r.projectID}, o...)
}
func (r *ProjectCampaigns) TestSend(ctx context.Context, id string, b CampaignTestSendRequest, o ...RequestOptions) (Response[Envelope[CampaignTestSend]], error) {
	return (&Campaigns{r.t}).TestSend(ctx, id, PlatformCampaignTestSendRequest{b, r.projectID}, o...)
}
func (r *ProjectCampaigns) ListLaunchApprovals(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[[]CampaignLaunchApproval]], error) {
	return (&Campaigns{r.t}).ListLaunchApprovals(ctx, id, CampaignProjectParams{r.projectID}, o...)
}
func (r *ProjectCampaigns) Links(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[[]CampaignTrackedLinkReport]], error) {
	return (&Campaigns{r.t}).Links(ctx, id, CampaignProjectParams{r.projectID}, o...)
}
func (r *ProjectCampaigns) ExportRecipients(ctx context.Context, id string, p CampaignRecipientExportParams, o ...RequestOptions) (Response[CampaignRecipientExportPage], error) {
	return (&Campaigns{r.t}).ExportRecipients(ctx, id, PlatformCampaignRecipientExportParams{p, r.projectID}, o...)
}
