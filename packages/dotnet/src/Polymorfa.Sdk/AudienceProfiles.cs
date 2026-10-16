namespace Polymorfa.Sdk;

public sealed class AudienceProfiles : Resource
{
    public AudienceProfileImports Imports
    {
        get;
    }
    internal AudienceProfiles(HttpTransport http) : base(http) => Imports = new(http);
    public Task<ApiResponse<AudienceProfilePage<AudienceProfile>>> ListAsync(ListAudienceProfilesParameters? parameters = null, RequestOptions? options = null) => CampaignContractCodec.Request<AudienceProfilePage<AudienceProfile>>(Http, HttpMethod.Get, "/platform/audience-profiles", options: CampaignContractOptions.Select(options), query: CampaignContractValidation.ProfileList(parameters));

    private static string Path(string phone) => "/platform/audience-profiles/" + Uri.EscapeDataString(CampaignContractValidation.Phone(phone));
    public Task<ApiResponse<DataEnvelope<AudienceProfile>>> RetrieveAsync(string phone, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceProfile>>(Http, HttpMethod.Get, Path(phone), options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<DataEnvelope<AudienceProfile>>> PutAsync(string phone, PutAudienceProfileRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceProfile>>(Http, HttpMethod.Put, Path(phone), CampaignContractValidation.Profile(input), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<DeleteAudienceProfileResult>>> DeleteAsync(string phone, long expectedRevision, RequestOptions? options = null)
    {
        CampaignContractValidation.Integer(expectedRevision, "expectedRevision", 1);
        return CampaignContractCodec.Request<DataEnvelope<DeleteAudienceProfileResult>>(Http, HttpMethod.Delete, Path(phone), options: CampaignContractOptions.Select(options, true), query: [new("expectedRevision", expectedRevision.ToString(System.Globalization.CultureInfo.InvariantCulture))]);
    }
    public Task<ApiResponse<AudienceProfilePage<AudienceConsentAssertion>>> ListConsentAsync(string phone, ListAudienceProfilesParameters? parameters = null, RequestOptions? options = null) => CampaignContractCodec.Request<AudienceProfilePage<AudienceConsentAssertion>>(Http, HttpMethod.Get, Path(phone) + "/consent", options: CampaignContractOptions.Select(options), query: CampaignContractValidation.Page(parameters));
}
public sealed class AudienceProfileImports : Resource
{
    internal AudienceProfileImports(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> CreateAsync(CreateAudienceProfileImportRequest input, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceProfileImportJob>>(Http, HttpMethod.Post, "/platform/audience-profile-imports", CampaignContractValidation.Import(input), CampaignContractOptions.Select(options, true));
    public Task<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> RetrieveAsync(string jobId, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceProfileImportJob>>(Http, HttpMethod.Get, "/platform/audience-profile-imports/" + CampaignContractValidation.Uuid(jobId, "jobId"), options: CampaignContractOptions.Select(options));
    public Task<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> CancelAsync(string jobId, RequestOptions? options = null) => CampaignContractCodec.Request<DataEnvelope<AudienceProfileImportJob>>(Http, HttpMethod.Delete, "/platform/audience-profile-imports/" + CampaignContractValidation.Uuid(jobId, "jobId"), options: CampaignContractOptions.Select(options, true));
}
internal static class CampaignContractOptions
{
    internal static RequestOptions Select(RequestOptions? options, bool write = false, bool replay = false)
    {
        var selected = (options ?? new()) with { ApiVersion = options?.ApiVersion ?? "2026-10-14", MaxNetworkRetries = write && !replay && options?.MaxNetworkRetries is null ? 0 : options?.MaxNetworkRetries };
        return replay ? selected.WithIdempotency() : selected;
    }
}
