using System.Text.Json;
namespace Polymorfa.Sdk;

public sealed class ProjectCampaigns : Resource
{
    private readonly string projectId;
    internal ProjectCampaigns(HttpTransport http, string projectId) : base(http) => this.projectId = projectId;
    private IReadOnlyList<KeyValuePair<string, string>> Owner() => [new("projectId", CampaignContractValidation.Uuid(projectId, "projectId"))];
    private JsonElement Body(JsonElement body) => CampaignContractValidation.Project(body, projectId);
    private static string Path(string id) => "/platform/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId");
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlow>>> GetReplyFlowAsync(string replyFlowId, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignReplyFlow>>(Http, HttpMethod.Get, "/platform/campaign-reply-flows/" + CampaignContractValidation.Uuid(replyFlowId, "replyFlowId"), options: CampaignContractOptions.Select(options), query: Owner());
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlow>>> CreateReplyFlowAsync(CreateCampaignReplyFlowRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignReplyFlow>>(Http, HttpMethod.Post, "/platform/campaign-reply-flows", Body(CampaignContractValidation.ReplyFlow(input)), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlowAssignment>>> SetReplyFlowAsync(string id, SetCampaignReplyFlowRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignReplyFlowAssignment>>(Http, HttpMethod.Put, Path(id) + "/reply-flow", Body(CampaignContractValidation.Assignment(input)), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<CampaignTestSend>>> TestSendAsync(string id, CampaignTestSendRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignTestSend>>(Http, HttpMethod.Post, Path(id) + "/test-send", Body(CampaignContractValidation.TestSend(input)), CampaignContractOptions.Select(options, true, true));
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CampaignLaunchApproval>>>> ListLaunchApprovalsAsync(string id, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<IReadOnlyList<CampaignLaunchApproval>>>(Http, HttpMethod.Get, Path(id) + "/approvals", options: CampaignContractOptions.Select(options), query: Owner());
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CampaignTrackedLinkReport>>>> LinksAsync(string id, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<IReadOnlyList<CampaignTrackedLinkReport>>>(Http, HttpMethod.Get, Path(id) + "/links", options: CampaignContractOptions.Select(options), query: Owner());
    public Task<ApiResponse<CampaignRecipientExportPage>> ExportRecipientsAsync(string id, CampaignRecipientExportParameters? parameters = null, RequestOptions? options = null) => CampaignContractExport.Request(Http, Path(id) + "/recipients/export", CampaignContractValidation.Export(parameters).Concat(Owner()).ToArray(), options);
}
internal static class CampaignContractExport
{
    internal static async Task<ApiResponse<CampaignRecipientExportPage>> Request(HttpTransport http, string path, IReadOnlyList<KeyValuePair<string, string>> query, RequestOptions? options)
    {
        var response = await http.RequestTextAsync(path, "text/csv", CampaignContractOptions.Select(options), query).ConfigureAwait(false);
        if (response.Metadata.Status != 200 || !string.Equals(response.Metadata.Headers.GetValueOrDefault("content-type")?.Split(';')[0].Trim(), "text/csv", StringComparison.OrdinalIgnoreCase)) throw new PolymorfaServerException("The API did not return a CSV export.", "invalid_response", response.Metadata);
        return new(new(response.Data, response.Metadata.Headers.GetValueOrDefault("polymorfa-next-cursor"), ContentDisposition.ParseFilename(response.Metadata.Headers.GetValueOrDefault("content-disposition"))), response.Metadata);
    }
}
public sealed class SignalCustodyResource : Resource
{
    private readonly string projectId;
    internal SignalCustodyResource(HttpTransport http, string projectId) : base(http) => this.projectId = projectId;
    internal static string Path(string projectId, string? customerId = null) => "/platform/projects/" + CampaignContractValidation.Uuid(projectId, "projectId") + (customerId is null ? "" : "/customers/" + CampaignContractValidation.Uuid(customerId, "customerId")) + "/signal-custody";
    private async Task<ApiResponse<SignalCustodyDefault>> Request(HttpMethod method, string? customerId, JsonElement? body, RequestOptions? options)
    {
        var response = await CampaignContractCodec.Request<DataEnvelope<SignalCustodyDefault>>(Http, method, Path(projectId, customerId), body, CampaignContractOptions.Select(options, method == HttpMethod.Put)).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public Task<ApiResponse<SignalCustodyDefault>> RetrieveAsync(RequestOptions? options = null) => Request(HttpMethod.Get, null, null, options);
    public Task<ApiResponse<SignalCustodyDefault>> UpdateAsync(ProjectSignalCustodyUpdate input, RequestOptions? options = null) => Request(HttpMethod.Put, null, CampaignContractValidation.Custody(input), options);
    public Task<ApiResponse<SignalCustodyDefault>> RetrieveCustomerAsync(string customerId, RequestOptions? options = null) => Request(HttpMethod.Get, CampaignContractValidation.Uuid(customerId, "customerId"), null, options);
    public Task<ApiResponse<SignalCustodyDefault>> UpdateCustomerAsync(string customerId, CustomerSignalCustodyUpdate input, RequestOptions? options = null) => Request(HttpMethod.Put, CampaignContractValidation.Uuid(customerId, "customerId"), CampaignContractValidation.Custody(input, true), options);
}
public sealed partial class Projects
{
    public Task<ApiResponse<DataEnvelope<SignalCustodyDefault>>> GetSignalCustodyAsync(string projectId, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<SignalCustodyDefault>>(http, HttpMethod.Get, SignalCustodyResource.Path(projectId), options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<DataEnvelope<SignalCustodyDefault>>> UpdateSignalCustodyAsync(string projectId, ProjectSignalCustodyUpdate input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<SignalCustodyDefault>>(http, HttpMethod.Put, SignalCustodyResource.Path(projectId), CampaignContractValidation.Custody(input), CampaignContractOptions.Select(options, true));
}
public sealed partial class Customers
{
    public Task<ApiResponse<DataEnvelope<SignalCustodyDefault>>> GetSignalCustodyAsync(string customerId, string projectId, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<SignalCustodyDefault>>(Http, HttpMethod.Get, SignalCustodyResource.Path(projectId, CampaignContractValidation.Uuid(customerId, "customerId")), options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<DataEnvelope<SignalCustodyDefault>>> UpdateSignalCustodyAsync(string customerId, string projectId, CustomerSignalCustodyUpdate input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<SignalCustodyDefault>>(Http, HttpMethod.Put, SignalCustodyResource.Path(projectId, CampaignContractValidation.Uuid(customerId, "customerId")), CampaignContractValidation.Custody(input, true), CampaignContractOptions.Select(options, true));
}
public sealed partial class Audiences
{
    public Task<ApiResponse<DataEnvelope<AudienceFromCampaignResult>>> CreateFromCampaignAsync(CreateAudienceFromCampaignRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceFromCampaignResult>>(Http, HttpMethod.Post, "/platform/audiences/from-campaign", CampaignContractValidation.Retarget(input), CampaignContractOptions.Select(options, true));
}
public sealed partial class OptOuts
{
    public Task<ApiResponse<DataEnvelope<StopConfirmationSettings>>> GetConfirmationSettingsAsync(RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<StopConfirmationSettings>>(Http, HttpMethod.Get, "/platform/optouts/confirmation-settings", options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<DataEnvelope<StopConfirmationSettings>>> UpdateConfirmationSettingsAsync(UpdateStopConfirmationSettingsInput input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<StopConfirmationSettings>>(Http, HttpMethod.Put, "/platform/optouts/confirmation-settings", CampaignContractValidation.Stop(input), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<StopConfirmationSummary>>> GetConfirmationSummaryAsync(RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<StopConfirmationSummary>>(Http, HttpMethod.Get, "/platform/optouts/confirmation-summary", options: CampaignContractOptions.Select(options));
}
public sealed partial class PlatformCampaigns
{
    private ProjectCampaigns ContractProject(string projectId) => new(Http, CampaignContractValidation.Uuid(projectId, "projectId"));
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlow>>> GetReplyFlowAsync(string id, CampaignProjectParameters parameters, RequestOptions? options = null) => ContractProject(parameters?.ProjectId!).GetReplyFlowAsync(id, options);
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlow>>> CreateReplyFlowAsync(CreatePlatformCampaignReplyFlowRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignReplyFlow>>(Http, HttpMethod.Post, "/platform/campaign-reply-flows", CampaignContractValidation.ReplyFlow(input, true), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<CampaignReplyFlowAssignment>>> SetReplyFlowAsync(string id, SetPlatformCampaignReplyFlowRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignReplyFlowAssignment>>(Http, HttpMethod.Put, "/platform/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/reply-flow", CampaignContractValidation.Assignment(input, true), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<CampaignTestSend>>> TestSendAsync(string id, PlatformCampaignTestSendRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignTestSend>>(Http, HttpMethod.Post, "/platform/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/test-send", CampaignContractValidation.TestSend(input, true), CampaignContractOptions.Select(options, true, true));
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CampaignLaunchApproval>>>> ListLaunchApprovalsAsync(string id, CampaignProjectParameters parameters, RequestOptions? options = null) => ContractProject(parameters?.ProjectId!).ListLaunchApprovalsAsync(id, options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CampaignTrackedLinkReport>>>> LinksAsync(string id, CampaignProjectParameters parameters, RequestOptions? options = null) => ContractProject(parameters?.ProjectId!).LinksAsync(id, options);
    public Task<ApiResponse<CampaignRecipientExportPage>> ExportRecipientsAsync(string id, PlatformCampaignRecipientExportParameters parameters, RequestOptions? options = null)
    {
        if (parameters is null) throw new PolymorfaConfigurationException("A project selector is required.");
        return ContractProject(parameters.ProjectId).ExportRecipientsAsync(id, new(parameters.Status, parameters.Reason, parameters.Cursor, parameters.Limit), options);
    }
    public Task<ApiResponse<DataEnvelope<CampaignSettings>>> GetSettingsAsync(RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<CampaignSettings>>(Http, HttpMethod.Get, "/platform/campaign-settings", options: CampaignContractOptions.Select(options));
}
public sealed partial class MessagingCampaigns
{
    private string ContractSlug(string slug)
    {
        Http.Credential.RequireServer();
        CampaignContractValidation.Unicode(slug);
        if (string.IsNullOrEmpty(slug)) throw new PolymorfaConfigurationException("A project slug is required.");
        return "/messaging/projects/" + E(slug);
    }
    public Task<ApiResponse<SuccessEnvelope<CampaignReplyFlow>>> GetReplyFlowAsync(string slug, string id, RequestOptions? options = null) => CampaignContractCodec.Request<SuccessEnvelope<CampaignReplyFlow>>(Http, HttpMethod.Get, ContractSlug(slug) + "/campaign-reply-flows/" + CampaignContractValidation.Uuid(id, "replyFlowId"), options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<SuccessEnvelope<CampaignReplyFlow>>> CreateReplyFlowAsync(string slug, CreateCampaignReplyFlowRequest input, RequestOptions? options = null)
    {
        var prefix = ContractSlug(slug);
        return CampaignContractCodec.Request<SuccessEnvelope<CampaignReplyFlow>>(Http, HttpMethod.Post, prefix + "/campaign-reply-flows", CampaignContractValidation.ReplyFlow(input), CampaignContractOptions.Select(options, true));
    }
    public Task<ApiResponse<SuccessEnvelope<CampaignReplyFlowAssignment>>> SetReplyFlowAsync(string slug, string id, SetCampaignReplyFlowRequest input, RequestOptions? options = null)
    {
        var prefix = ContractSlug(slug);
        return CampaignContractCodec.Request<SuccessEnvelope<CampaignReplyFlowAssignment>>(Http, HttpMethod.Put, prefix + "/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/reply-flow", CampaignContractValidation.Assignment(input), CampaignContractOptions.Select(options, true));
    }
    public Task<ApiResponse<SuccessEnvelope<CampaignTestSend>>> TestSendAsync(string slug, string id, CampaignTestSendRequest input, RequestOptions? options = null)
    {
        var prefix = ContractSlug(slug);
        return CampaignContractCodec.Request<SuccessEnvelope<CampaignTestSend>>(Http, HttpMethod.Post, prefix + "/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/test-send", CampaignContractValidation.TestSend(input), CampaignContractOptions.Select(options, true, true));
    }
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<CampaignTrackedLinkReport>>>> LinksAsync(string slug, string id, RequestOptions? options = null) => CampaignContractCodec.Request<SuccessEnvelope<IReadOnlyList<CampaignTrackedLinkReport>>>(Http, HttpMethod.Get, ContractSlug(slug) + "/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/links", options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<CampaignRecipientExportPage>> ExportRecipientsAsync(string slug, string id, CampaignRecipientExportParameters? parameters = null, RequestOptions? options = null) => CampaignContractExport.Request(Http, ContractSlug(slug) + "/campaigns/" + CampaignContractValidation.Uuid(id, "campaignId") + "/recipients/export", CampaignContractValidation.Export(parameters), options);
}
