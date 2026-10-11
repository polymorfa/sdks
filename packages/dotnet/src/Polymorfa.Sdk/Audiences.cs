using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record CampaignRecipientInput(string Phone, IReadOnlyDictionary<string, JsonElement>? Variables = null);
public sealed record InvalidRecipientRow(int Row, string Reason);
public sealed record AudienceImportMapping(string Phone, IReadOnlyDictionary<string, string>? Variables = null);
public sealed record CreateAudienceRequest
{
    public string Name { get; }
    public string? Source { get; }
    public IReadOnlyList<CampaignRecipientInput>? Members { get; }
    public string? FileId { get; }
    public AudienceImportMapping? Mapping { get; }
    private CreateAudienceRequest(string name, string? source, IReadOnlyList<CampaignRecipientInput>? members, string? fileId, AudienceImportMapping? mapping) { Name = name; Source = source; Members = members; FileId = fileId; Mapping = mapping; }
    public static CreateAudienceRequest FromMembers(string name, IReadOnlyList<CampaignRecipientInput>? members = null, string? source = null) => new(name, source, members, null, null);
    public static CreateAudienceRequest FromFile(string name, string fileId, AudienceImportMapping mapping, string? source = null) => new(name, source, null, fileId, mapping);
}
public sealed record AudienceImportResult(string Id, string Name, string Source, long RecipientCount, string? FileId, IReadOnlyList<string>? Columns, IReadOnlyDictionary<string, string>? SampleRow, IReadOnlyDictionary<string, JsonElement>? Mapping, long CreatedAt, long UpdatedAt, long DuplicateCount, long InvalidCount, IReadOnlyList<InvalidRecipientRow> InvalidRows);
public sealed record AudienceMember(string Id, string Phone, IReadOnlyDictionary<string, string> Variables, long CreatedAt);
public sealed record ListAudienceMembersParameters(string? Cursor = null, int? Limit = null);
public sealed record AddAudienceMembersRequest(IReadOnlyList<CampaignRecipientInput> Members);
public sealed record AddAudienceMembersResult(string ListId, long Added, long RecipientCount, long DuplicateCount, long InvalidCount, IReadOnlyList<InvalidRecipientRow> InvalidRows);
public sealed record DeleteAudienceMemberResult(bool Removed, string ListId, string Phone, long RecipientCount);
public sealed class Audiences : Resource
{
    internal Audiences(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/platform/audiences/" + E(id);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>("/platform/audiences", options);
    public Task<ApiResponse<DataEnvelope<AudienceImportResult>>> CreateAsync(CreateAudienceRequest body, RequestOptions? options = null) => Post<DataEnvelope<AudienceImportResult>>("/platform/audiences", body, options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> RetrieveAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id), options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> DeleteAsync(string id, RequestOptions? options = null) => Delete<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>(Path(id), options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>> CreateUploadAsync(IReadOnlyDictionary<string, JsonElement>? body = null, RequestOptions? options = null) => Post<DataEnvelope<IReadOnlyDictionary<string, JsonElement>>>("/platform/audiences/uploads", body, options);
    public Task<ApiResponse<DataEnvelope<AddAudienceMembersResult>>> AddMembersAsync(string id, AddAudienceMembersRequest body, RequestOptions? options = null) => Post<DataEnvelope<AddAudienceMembersResult>>(Path(id) + "/members", body, options is { MaxNetworkRetries: not null, IdempotencyKey: not null } ? options : (options ?? new()) with { MaxNetworkRetries = 0 });
    public Task<CursorPage<AudienceMember>> ListMembersAsync(string id, ListAudienceMembersParameters? parameters = null, RequestOptions? options = null) => CursorPage<AudienceMember>.LoadAsync(Http, Path(id) + "/members", Query(parameters), options ?? new());
    public Task<ApiResponse<DataEnvelope<DeleteAudienceMemberResult>>> DeleteMemberAsync(string id, string phone, RequestOptions? options = null) => Delete<DataEnvelope<DeleteAudienceMemberResult>>(Path(id) + "/members/" + E(phone), options);
}
