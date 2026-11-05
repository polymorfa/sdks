namespace Polymorfa.Sdk;

public sealed record OfficialGroupCursors(string? Before = null, string? After = null);
public sealed record OfficialGroupSummary(string Id, string? Subject = null, string? CreatedAt = null);
public sealed record OfficialGroupList(IReadOnlyList<OfficialGroupSummary> Groups, OfficialGroupCursors Cursors, bool HasMore);
public sealed record OfficialGroup(string Id, IReadOnlyList<ConversationReference> Participants, string? Subject = null, string? Description = null, bool? Suspended = null, string? CreatedAt = null, int? ParticipantCount = null, bool? JoinApprovalRequired = null);
public sealed record ListOfficialGroupsParameters(int? Limit = null, string? Before = null, string? After = null);
public sealed record CreateOfficialGroupRequest(string Subject, string? Description = null, bool? JoinApprovalRequired = null);
public sealed record CreateOfficialGroupResult(string RequestId);
public sealed record UpdateOfficialGroupRequest(string? Subject = null, string? Description = null);
public sealed record OfficialGroupChangeAccepted(bool Accepted);
public sealed record OfficialGroupInviteLink(string InviteLink) { public override string ToString() => "OfficialGroupInviteLink(redacted)"; }
public sealed record OfficialGroupJoinRequest(string JoinRequestId, ConversationReference User, string? CreatedAt = null);
public sealed record OfficialGroupJoinRequestList(IReadOnlyList<OfficialGroupJoinRequest> Items, OfficialGroupCursors Cursors, bool HasMore);
public sealed record OfficialGroupProviderError(long Code, string? Title = null);
public sealed record OfficialGroupFailedDecision(string JoinRequestId, IReadOnlyList<OfficialGroupProviderError> Errors);
public sealed record OfficialGroupJoinRequestDecision(IReadOnlyList<string> Succeeded, IReadOnlyList<OfficialGroupFailedDecision> Failed);
public sealed record PinOfficialGroupMessageRequest(string Operation, string MessageId, int? ExpirationDays = null)
{
    public static PinOfficialGroupMessageRequest Pin(string messageId, int expirationDays) => new("pin", messageId, expirationDays);
    public static PinOfficialGroupMessageRequest Unpin(string messageId) => new("unpin", messageId);
}
public sealed class OfficialGroups : Resource
{
    public async Task<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> SetPictureAsync(string session, string group, ReadOnlyMemory<byte> jpeg, RequestOptions? options = null)
    {
        Http.Credential.RequireServer();
        if (jpeg.Length < 3 || jpeg.Length > 5 * 1024 * 1024 || jpeg.Span[0] != 255 || jpeg.Span[1] != 216 || jpeg.Span[2] != 255) throw new PolymorfaValidationException("Provide JPEG bytes up to 5 MiB.", "invalid_parameter");
        using var body = new MultipartFormDataContent();
        var file = new ByteArrayContent(jpeg.ToArray()); file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
        body.Add(file, "file", "picture.jpg");
        return await Http.RequestMultipartAsync<SuccessEnvelope<OfficialGroupChangeAccepted>>(Path(session, group) + "/picture", body, (options ?? new()) with { MaxNetworkRetries = 0 }).ConfigureAwait(false);
    }
    internal OfficialGroups(HttpTransport http) : base(http) { }
    private static string Path(string session) => "/messaging/" + E(session) + "/official-groups";
    private static string Path(string session, string group) => Path(session) + "/" + E(group);
    private Task<ApiResponse<SuccessEnvelope<T>>> Read<T>(string path, object? query, RequestOptions? options) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<T>>(path, options, query); }
    private Task<ApiResponse<SuccessEnvelope<T>>> Write<T>(HttpMethod method, string path, object? body, RequestOptions? options) { Http.Credential.RequireServer(); return Http.RequestAsync<SuccessEnvelope<T>>(method, path, body, (options ?? new()) with { MaxNetworkRetries = 0 }); }
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupList>>> ListAsync(string session, ListOfficialGroupsParameters? parameters = null, RequestOptions? options = null) => Read<OfficialGroupList>(Path(session), parameters, options);
    public Task<ApiResponse<SuccessEnvelope<CreateOfficialGroupResult>>> CreateAsync(string session, CreateOfficialGroupRequest body, RequestOptions? options = null) => Write<CreateOfficialGroupResult>(HttpMethod.Post, Path(session), body, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroup>>> RetrieveAsync(string session, string group, RequestOptions? options = null) => Read<OfficialGroup>(Path(session, group), null, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> UpdateAsync(string session, string group, UpdateOfficialGroupRequest body, RequestOptions? options = null) => Write<OfficialGroupChangeAccepted>(HttpMethod.Patch, Path(session, group), body, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> DeleteAsync(string session, string group, RequestOptions? options = null) => Write<OfficialGroupChangeAccepted>(HttpMethod.Delete, Path(session, group), null, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> GetInviteLinkAsync(string session, string group, RequestOptions? options = null) => Read<OfficialGroupInviteLink>(Path(session, group) + "/invite-link", null, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> ResetInviteLinkAsync(string session, string group, RequestOptions? options = null) => Write<OfficialGroupInviteLink>(HttpMethod.Post, Path(session, group) + "/invite-link/reset", null, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> RemoveParticipantsAsync(string session, string group, IReadOnlyList<string> participants, RequestOptions? options = null) => Write<OfficialGroupChangeAccepted>(HttpMethod.Post, Path(session, group) + "/participants/remove", new { participants }, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestList>>> ListJoinRequestsAsync(string session, string group, OfficialGroupCursors? parameters = null, RequestOptions? options = null) => Read<OfficialGroupJoinRequestList>(Path(session, group) + "/join-requests", parameters, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> ApproveJoinRequestsAsync(string session, string group, IReadOnlyList<string> joinRequestIds, RequestOptions? options = null) => Write<OfficialGroupJoinRequestDecision>(HttpMethod.Post, Path(session, group) + "/join-requests/approve", new { joinRequestIds }, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> RejectJoinRequestsAsync(string session, string group, IReadOnlyList<string> joinRequestIds, RequestOptions? options = null) => Write<OfficialGroupJoinRequestDecision>(HttpMethod.Post, Path(session, group) + "/join-requests/reject", new { joinRequestIds }, options);
    public Task<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> PinAsync(string session, string group, PinOfficialGroupMessageRequest body, RequestOptions? options = null)
    {
        if (body.Operation is not ("pin" or "unpin") || body.Operation == "pin" && body.ExpirationDays is not (>= 1 and <= 30) || body.Operation == "unpin" && body.ExpirationDays is not null) throw new PolymorfaValidationException("Invalid group pin operation.", "invalid_parameter");
        return Write<OfficialGroupChangeAccepted>(HttpMethod.Post, Path(session, group) + "/pins", body, options);
    }
}
