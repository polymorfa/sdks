using System.Text.Json;

namespace Polymorfa.Sdk;

public abstract class Resource
{
    private protected readonly HttpTransport Http;
    private protected Resource(HttpTransport http) => Http = http;
    private protected Task<ApiResponse<T>> Get<T>(string path, RequestOptions? options, object? query = null) => Http.RequestAsync<T>(HttpMethod.Get, path, null, options, Query(query));
    private protected Task<ApiResponse<T>> Post<T>(string path, object? body, RequestOptions? options) => Http.RequestAsync<T>(HttpMethod.Post, path, body, options);
    private protected Task<ApiResponse<T>> Put<T>(string path, object? body, RequestOptions? options) => Http.RequestAsync<T>(HttpMethod.Put, path, body, options);
    private protected Task<ApiResponse<T>> Patch<T>(string path, object? body, RequestOptions? options) => Http.RequestAsync<T>(HttpMethod.Patch, path, body, options);
    private protected Task<ApiResponse<T>> Delete<T>(string path, RequestOptions? options) => Http.RequestAsync<T>(HttpMethod.Delete, path, null, options);
    private protected static string E(string value) => Uri.EscapeDataString(value);
    internal static IReadOnlyList<KeyValuePair<string, string>> Query(object? parameters)
    {
        if (parameters is null) return [];
        var json = JsonSerializer.SerializeToElement(parameters, parameters.GetType(), HttpTransport.Json);
        var pairs = new List<KeyValuePair<string, string>>();
        foreach (var property in json.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.Null) continue;
            if (property.Value.ValueKind == JsonValueKind.Array) foreach (var element in property.Value.EnumerateArray()) pairs.Add(new(property.Name, Scalar(element)));
            else pairs.Add(new(property.Name, Scalar(property.Value)));
        }
        return pairs;
    }
    private static string Scalar(JsonElement value) => value.ValueKind switch { JsonValueKind.String => value.GetString()!, JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.Number => value.GetRawText(), _ => throw new PolymorfaValidationException("Query values must be scalar.", "invalid_parameter") };
}
public sealed class Contacts : Resource
{
    internal Contacts(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/contacts";
    private static string Path(string session, string contact) => Path(session) + "/" + E(contact);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Contact>>>> ListAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Contact>>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<CheckContactResult>>>> CheckAsync(string session, IReadOnlyList<string> phones, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<CheckContactResult>>>(Path(session) + "/check", options, new { phone = string.Join(',', phones) });
    public Task<ApiResponse<SuccessEnvelope<ContactBlocklist>>> BlocklistAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<ContactBlocklist>>(Path(session) + "/blocked", options);
    public Task<ApiResponse<SuccessEnvelope<Contact>>> RetrieveAsync(string session, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<Contact>>(Path(session, contact), options);
    public Task<ApiResponse<SuccessEnvelope<ContactPicture>>> PictureAsync(string session, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<ContactPicture>>(Path(session, contact) + "/picture", options);
    public Task<ApiResponse<SuccessEnvelope<ContactUserInfo>>> InfoAsync(string session, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<ContactUserInfo>>(Path(session, contact) + "/info", options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<string>>>> DevicesAsync(string session, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<string>>>(Path(session, contact) + "/devices", options);
    public Task<ApiResponse<SuccessEnvelope<BusinessProfile>>> BusinessProfileAsync(string session, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<BusinessProfile>>(Path(session, contact) + "/business-profile", options);
    public Task<ApiResponse<SuccessResponse>> BlockAsync(string session, string contact, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, contact) + "/block", null, options);
    public Task<ApiResponse<SuccessResponse>> UnblockAsync(string session, string contact, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, contact) + "/unblock", null, options);
}
public sealed class Groups : Resource
{
    internal Groups(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/groups";
    private static string Path(string session, string group) => Path(session) + "/" + E(group);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Group>>>> ListAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Group>>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<Group>>> CreateAsync(string session, CreateGroupRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<Group>>(Path(session), body, options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteInfo>>> GetJoinInfoAsync(string session, string code, RequestOptions? options = null) => Get<SuccessEnvelope<GroupInviteInfo>>(Path(session) + "/join-info", options, new { code });
    public Task<ApiResponse<SuccessResponse>> JoinAsync(string session, JoinGroupRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(session) + "/join", body, options);
    public Task<ApiResponse<SuccessEnvelope<Group>>> RetrieveAsync(string session, string group, RequestOptions? options = null) => Get<SuccessEnvelope<Group>>(Path(session, group), options);
    public Task<ApiResponse<SuccessEnvelope<GroupCapabilities>>> GetCapabilitiesAsync(string session, string group, RequestOptions? options = null) => Get<SuccessEnvelope<GroupCapabilities>>(Path(session, group) + "/capabilities", options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string session, string group, RequestOptions? options = null) => Delete<SuccessResponse>(Path(session, group), options);
    public Task<ApiResponse<SuccessResponse>> LeaveAsync(string session, string group, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, group) + "/leave", null, options);
    public Task<ApiResponse<SuccessResponse>> SetSubjectAsync(string session, string group, GroupFieldRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/subject", body, options);
    public Task<ApiResponse<SuccessResponse>> SetDescriptionAsync(string session, string group, GroupFieldRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/description", body, options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteCode>>> GetInviteCodeAsync(string session, string group, RequestOptions? options = null) => Get<SuccessEnvelope<GroupInviteCode>>(Path(session, group) + "/invite-code", options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteCode>>> RevokeInviteCodeAsync(string session, string group, RequestOptions? options = null) => Post<SuccessEnvelope<GroupInviteCode>>(Path(session, group) + "/invite-code/revoke", null, options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<GroupParticipant>>>> ListParticipantsAsync(string session, string group, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<GroupParticipant>>>(Path(session, group) + "/participants", options);
    public Task<ApiResponse<SuccessResponse>> AddParticipantsAsync(string session, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, group) + "/participants/add", body, options);
    public Task<ApiResponse<SuccessResponse>> RemoveParticipantsAsync(string session, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, group) + "/participants/remove", body, options);
    public Task<ApiResponse<SuccessResponse>> PromoteParticipantsAsync(string session, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, group) + "/admin/promote", body, options);
    public Task<ApiResponse<SuccessResponse>> DemoteParticipantsAsync(string session, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, group) + "/admin/demote", body, options);
    public Task<ApiResponse<SuccessResponse>> SetPictureAsync(string session, string group, PictureRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/picture", body, options);
    public Task<ApiResponse<SuccessResponse>> SetInfoEditingAsync(string session, string group, GroupAdminOnlyRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/settings/info-edit", body, options);
    public Task<ApiResponse<SuccessResponse>> SetMessagingAsync(string session, string group, GroupAdminOnlyRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/settings/messages", body, options);
    public Task<ApiResponse<SuccessResponse>> SetMemberAddModeAsync(string session, string group, GroupMemberAddRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/settings/member-add", body, options);
    public Task<ApiResponse<SuccessResponse>> SetJoinApprovalAsync(string session, string group, GroupJoinApprovalRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, group) + "/settings/join-approval", body, options);
}
public sealed class Profile : Resource
{
    internal Profile(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/profile";
    public Task<ApiResponse<SuccessEnvelope<ProfileData>>> GetAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<ProfileData>>(Path(session), options);
    public Task<ApiResponse<SuccessResponse>> SetNameAsync(string session, SetProfileNameRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/name", body, options);
    public Task<ApiResponse<SuccessResponse>> SetStatusAsync(string session, SetProfileStatusRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/status", body, options);
    public Task<ApiResponse<SuccessResponse>> SetPictureAsync(string session, PictureRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/picture", body, options);
    public Task<ApiResponse<SuccessResponse>> DeletePictureAsync(string session, RequestOptions? options = null) => Delete<SuccessResponse>(Path(session) + "/picture", options);
}
public sealed class Presence : Resource
{
    internal Presence(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/presence";
    public Task<ApiResponse<CommandResponse<StatusResult>>> SetAsync(string session, SetPresenceRequest body, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session), body, options);
    public Task<ApiResponse<SuccessEnvelope<PresenceData>>> GetAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<PresenceData>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<ChatPresenceData>>> GetForChatAsync(string session, string chat, RequestOptions? options = null) => Get<SuccessEnvelope<ChatPresenceData>>(Path(session) + "/" + E(chat), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<PresenceSubscription>>>> SubscribeAsync(string session, string chat, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<PresenceSubscription>>>(Path(session) + "/" + E(chat) + "/subscribe", null, options);
}
public sealed class Labels : Resource
{
    internal Labels(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/labels";
    public Task<ApiResponse<SuccessEnvelope<LabelReadData>>> ListAsync(string session, ListLabelsParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<LabelReadData>>(Path(session), options, parameters);
    public Task<ApiResponse<SuccessEnvelope<Label>>> CreateAsync(string session, CreateLabelRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<Label>>(Path(session), body, options);
    public Task<ApiResponse<SuccessResponse>> UpdateAsync(string session, string id, UpdateLabelRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/" + E(id), body, options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string session, string id, RequestOptions? options = null) => Delete<SuccessResponse>(Path(session) + "/" + E(id), options);
    public Task<ApiResponse<SuccessEnvelope<LabelReadData>>> ListForChatAsync(string session, string chat, ListLabelsParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<LabelReadData>>(Path(session) + "/chats/" + E(chat), options, parameters);
    public Task<ApiResponse<SuccessResponse>> ReplaceForChatAsync(string session, string chat, ReplaceChatLabelsRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/chats/" + E(chat), body, options);
}
public sealed class Chats : Resource
{
    internal Chats(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/chats";
    private static string Path(string session, string chat) => Path(session) + "/" + E(chat);
    public Task<ApiResponse<SuccessEnvelope<CustomerServiceWindow>>> GetServiceWindowAsync(string session, string conversation, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<CustomerServiceWindow>>(Path(session, conversation) + "/service-window", options); }
    public Task<ApiResponse<HistoryPage<HistoryChat>>> ListAsync(string session, ListHistoryChatsParameters? parameters = null, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<HistoryPage<HistoryChat>>(Path(session), options, parameters); }
    public Task<ApiResponse<SuccessEnvelope<HistoryChat>>> RetrieveAsync(string session, string chat, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<HistoryChat>>(Path(session, chat), options); }
    public Task<ApiResponse<HistoryPage<HistoryMessage>>> ListMessagesAsync(string session, string chat, ListHistoryMessagesParameters? parameters = null, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<HistoryPage<HistoryMessage>>(Path(session, chat) + "/messages", options, parameters); }
    public Task<ApiResponse<SuccessEnvelope<HistoryMessage>>> RetrieveMessageAsync(string session, string chat, string message, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<HistoryMessage>>(Path(session, chat) + "/messages/" + E(message), options); }
    public Task<MediaDownload> DownloadMessageMediaStreamAsync(string session, string chat, string message, RequestOptions? options = null) { Http.Credential.RequireServer(); return MessagingMedia.OpenDownloadAsync(Http, Path(session, chat) + "/messages/" + E(message) + "/media", options ?? new()); }
    public async Task<ApiResponse<byte[]>> DownloadMessageMediaAsync(string session, string chat, string message, RequestOptions? options = null) { await using var download = await DownloadMessageMediaStreamAsync(session, chat, message, options).ConfigureAwait(false); return new(await download.ReadAllAsync().ConfigureAwait(false), download.Metadata); }
    public Task<ApiResponse<SuccessResponse>> EditMessageAsync(string session, string chat, string message, EditMessageRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, chat) + "/messages/" + E(message), body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessResponse>> DeleteMessageAsync(string session, string chat, string message, string? transport = null, RequestOptions? options = null) => Http.RequestAsync<SuccessResponse>(HttpMethod.Delete, Path(session, chat) + "/messages/" + E(message), null, (options ?? new()).WithIdempotency(), Query(new { transport }));
    public Task<ApiResponse<SuccessResponse>> ArchiveAsync(string session, string chat, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, chat) + "/archive", null, options);
    public Task<ApiResponse<SuccessResponse>> UnarchiveAsync(string session, string chat, RequestOptions? options = null) => Post<SuccessResponse>(Path(session, chat) + "/unarchive", null, options);
    public Task<ApiResponse<SuccessResponse>> SetDisappearingTimerAsync(string session, string chat, DisappearingTimerRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session, chat) + "/disappearing", body, options);
}
public sealed class Privacy : Resource
{
    internal Privacy(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/privacy";
    public Task<ApiResponse<SuccessEnvelope<PrivacySettings>>> GetAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<PrivacySettings>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<PrivacySettings>>> SetAsync(string session, PrivacySettingRequest body, RequestOptions? options = null) => Put<SuccessEnvelope<PrivacySettings>>(Path(session) + "/" + E(body.Setting), new { body.Value }, options);
    public Task<ApiResponse<SuccessResponse>> SetDefaultDisappearingTimerAsync(string session, DisappearingTimerRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(session) + "/disappearing/default", body, options);
}
