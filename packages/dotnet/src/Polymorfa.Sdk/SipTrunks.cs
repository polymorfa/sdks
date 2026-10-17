using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record SipTrunkOutbound(string TargetUri, string Transport, string? AuthUsername, bool HasPassword, string? FromUser);
public sealed record SipTrunkInbound(string Username, string Realm, string? Session, IReadOnlyList<string> AllowedAddresses, IReadOnlyList<string> AllowedDestinations);
public sealed record SipTrunk(string Id, string ProjectId, string Name, bool Enabled, string Direction, SipTrunkOutbound? Outbound, SipTrunkInbound? Inbound, IReadOnlyList<string> Codecs, int MaxConcurrentCalls, long Revision, string CreatedAt, string UpdatedAt);
public sealed record SipTrunkCredentials(string Username, string Password, string Realm)
{
    public override string ToString() => "SipTrunkCredentials(redacted)";
}
public sealed record SipTrunkCreated(SipTrunk Trunk, SipTrunkCredentials? InboundCredentials = null);
public sealed record SipEndpointTransport(string Transport, int Port, string Srtp);
public sealed record SipEndpointRtp(string Protocol, int PortMin, int PortMax);
public sealed record SipEndpoint(string Status, string? Host, IReadOnlyList<SipEndpointTransport> Transports, SipEndpointRtp? Rtp);
public sealed record SipTrunkDeleted(string Id, bool Deleted);
public sealed record SipTrunkOutboundInput(string? TargetUri = null, string? Transport = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> AuthUsername = default,
    string? AuthPassword = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> FromUser = default)
{
    public override string ToString() => "SipTrunkOutboundInput(redacted)";
}
public sealed record SipTrunkInboundInput(IReadOnlyList<string>? AllowedAddresses = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> Session = default,
    IReadOnlyList<string>? AllowedDestinations = null);
public sealed record CreateSipTrunkRequest(string Name, string Direction, SipTrunkOutboundInput? Outbound = null, SipTrunkInboundInput? Inbound = null, bool? Enabled = null, IReadOnlyList<string>? Codecs = null, int? MaxConcurrentCalls = null);
public sealed record UpdateSipTrunkRequest(long? ExpectedRevision = null, string? Name = null, bool? Enabled = null, string? Direction = null, SipTrunkOutboundInput? Outbound = null, SipTrunkInboundInput? Inbound = null, IReadOnlyList<string>? Codecs = null, int? MaxConcurrentCalls = null);

public sealed class SipTrunks : Resource
{
    private readonly string? projectId;
    private readonly bool confineById;
    internal SipTrunks(HttpTransport http, string? projectId) : base(http) { this.projectId = projectId; confineById = projectId is not null && http.Credential.Kind == CredentialKind.OrganizationApiKey; }
    private static string Path(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) throw new PolymorfaConfigurationException("A SIP trunk ID is required.");
        return "/platform/sip-trunks/" + E(id);
    }
    private string Project(string? requested)
    {
        if (projectId is not null) { if (requested is not null && requested != projectId) throw new PolymorfaConfigurationException("Use the bound project."); return projectId; }
        if (string.IsNullOrWhiteSpace(requested)) throw new PolymorfaConfigurationException("A projectId is required for team clients.");
        return requested;
    }
    public async Task<ApiResponse<IReadOnlyList<SipTrunk>>> ListAsync(string? projectId = null, RequestOptions? options = null) { var response = await Get<DataEnvelope<IReadOnlyList<SipTrunk>>>("/platform/sip-trunks", options, new { projectId = Project(projectId) }); return new(response.Data.Data, response.Metadata); }
    public async Task<ApiResponse<SipEndpoint>> EndpointAsync(RequestOptions? options = null) { var response = await Get<DataEnvelope<SipEndpoint>>("/platform/sip/endpoint", options); return new(response.Data.Data, response.Metadata); }
    public async Task<ApiResponse<SipTrunkCreated>> CreateAsync(CreateSipTrunkRequest body, string? projectId = null, RequestOptions? options = null)
    {
        if (body.Direction is not ("outbound" or "inbound" or "both") || body.Direction is "outbound" or "both" && body.Outbound?.TargetUri is null || body.Direction is "inbound" or "both" && body.Inbound?.AllowedAddresses is null || body.Direction == "outbound" && body.Inbound is not null || body.Direction == "inbound" && body.Outbound is not null)
            throw new PolymorfaValidationException("Provide the configuration required by the SIP trunk direction.", "invalid_parameter");
        var response = await Post<DataEnvelope<SipTrunkCreated>>("/platform/sip-trunks", new { body.Name, body.Direction, body.Outbound, body.Inbound, body.Enabled, body.Codecs, body.MaxConcurrentCalls, projectId = Project(projectId) }, options);
        return new(response.Data.Data, response.Metadata);
    }
    public async Task<ApiResponse<SipTrunk>> RetrieveAsync(string id, RequestOptions? options = null)
    {
        var response = await Get<DataEnvelope<SipTrunk>>(Path(id), options); AssertProject(response.Data.Data);
        return new(response.Data.Data, response.Metadata);
    }
    public async Task<ApiResponse<SipTrunk>> UpdateAsync(string id, UpdateSipTrunkRequest body, RequestOptions? options = null) { await ConfineAsync(id, options); var response = await Patch<DataEnvelope<SipTrunk>>(Path(id), body, options); return new(response.Data.Data, response.Metadata); }
    public async Task<ApiResponse<SipTrunkDeleted>> DeleteAsync(string id, RequestOptions? options = null) { await ConfineAsync(id, options); var response = await Delete<DataEnvelope<SipTrunkDeleted>>(Path(id), options); return new(response.Data.Data, response.Metadata); }
    public async Task<ApiResponse<SipTrunkCredentials>> RotateCredentialsAsync(string id, RequestOptions? options = null) { await ConfineAsync(id, options); var response = await Post<DataEnvelope<SipTrunkCredentials>>(Path(id) + "/credentials", null, options); return new(response.Data.Data, response.Metadata); }
    private async Task ConfineAsync(string id, RequestOptions? options) { if (confineById) await RetrieveAsync(id, (options ?? new()) with { IdempotencyKey = null }); }
    private void AssertProject(SipTrunk trunk)
    {
        if (projectId is not null && !projectId.Equals(trunk.ProjectId, StringComparison.OrdinalIgnoreCase)) throw new PolymorfaNotFoundException("SIP trunk not found.", "resource_not_found");
    }
}
