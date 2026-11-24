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
    private static string Path(string connection) => $"/messaging/{E(connection)}/contacts";
    private static string Path(string connection, string contact) => Path(connection) + "/" + E(contact);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Contact>>>> ListAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Contact>>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<CheckContactResult>>>> CheckAsync(string connection, IReadOnlyList<string> phones, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<CheckContactResult>>>(Path(connection) + "/check", options, new { phone = string.Join(',', phones) });
    public Task<ApiResponse<SuccessEnvelope<ContactBlocklist>>> BlocklistAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<ContactBlocklist>>(Path(connection) + "/blocked", options);
    public Task<ApiResponse<SuccessEnvelope<Contact>>> RetrieveAsync(string connection, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<Contact>>(Path(connection, contact), options);
    public Task<ApiResponse<SuccessEnvelope<ContactPicture>>> PictureAsync(string connection, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<ContactPicture>>(Path(connection, contact) + "/picture", options);
    public Task<ApiResponse<SuccessEnvelope<ContactUserInfo>>> InfoAsync(string connection, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<ContactUserInfo>>(Path(connection, contact) + "/info", options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<string>>>> DevicesAsync(string connection, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<string>>>(Path(connection, contact) + "/devices", options);
    public Task<ApiResponse<SuccessEnvelope<BusinessProfile>>> BusinessProfileAsync(string connection, string contact, RequestOptions? options = null) => Get<SuccessEnvelope<BusinessProfile>>(Path(connection, contact) + "/business-profile", options);
    public Task<ApiResponse<SuccessResponse>> BlockAsync(string connection, string contact, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, contact) + "/block", null, options);
    public Task<ApiResponse<SuccessResponse>> UnblockAsync(string connection, string contact, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, contact) + "/unblock", null, options);
}
public sealed class Groups : Resource
{
    internal Groups(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/groups";
    private static string Path(string connection, string group) => Path(connection) + "/" + E(group);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Group>>>> ListAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Group>>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<Group>>> CreateAsync(string connection, CreateGroupRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<Group>>(Path(connection), body, options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteInfo>>> GetJoinInfoAsync(string connection, string code, RequestOptions? options = null) => Get<SuccessEnvelope<GroupInviteInfo>>(Path(connection) + "/join-info", options, new { code });
    public Task<ApiResponse<SuccessResponse>> JoinAsync(string connection, JoinGroupRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection) + "/join", body, options);
    public Task<ApiResponse<SuccessEnvelope<Group>>> RetrieveAsync(string connection, string group, RequestOptions? options = null) => Get<SuccessEnvelope<Group>>(Path(connection, group), options);
    public Task<ApiResponse<SuccessEnvelope<GroupCapabilities>>> GetCapabilitiesAsync(string connection, string group, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<GroupCapabilities>>(Http, HttpMethod.Get, Path(connection, group) + "/capabilities", options: options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string connection, string group, RequestOptions? options = null) => Delete<SuccessResponse>(Path(connection, group), options);
    public Task<ApiResponse<SuccessResponse>> LeaveAsync(string connection, string group, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, group) + "/leave", null, options);
    public Task<ApiResponse<SuccessResponse>> SetSubjectAsync(string connection, string group, GroupFieldRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/subject", body, options);
    public Task<ApiResponse<SuccessResponse>> SetDescriptionAsync(string connection, string group, GroupFieldRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/description", body, options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteCode>>> GetInviteCodeAsync(string connection, string group, RequestOptions? options = null) => Get<SuccessEnvelope<GroupInviteCode>>(Path(connection, group) + "/invite-code", options);
    public Task<ApiResponse<SuccessEnvelope<GroupInviteCode>>> RevokeInviteCodeAsync(string connection, string group, RequestOptions? options = null) => Post<SuccessEnvelope<GroupInviteCode>>(Path(connection, group) + "/invite-code/revoke", null, options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<GroupParticipant>>>> ListParticipantsAsync(string connection, string group, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<GroupParticipant>>>(Path(connection, group) + "/participants", options);
    public Task<ApiResponse<SuccessResponse>> AddParticipantsAsync(string connection, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, group) + "/participants/add", body, options);
    public Task<ApiResponse<SuccessResponse>> RemoveParticipantsAsync(string connection, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, group) + "/participants/remove", body, options);
    public Task<ApiResponse<SuccessResponse>> PromoteParticipantsAsync(string connection, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, group) + "/admin/promote", body, options);
    public Task<ApiResponse<SuccessResponse>> DemoteParticipantsAsync(string connection, string group, GroupParticipantsRequest body, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, group) + "/admin/demote", body, options);
    public Task<ApiResponse<SuccessResponse>> SetPictureAsync(string connection, string group, PictureRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/picture", body, options);
    public Task<ApiResponse<SuccessResponse>> SetInfoEditingAsync(string connection, string group, GroupAdminOnlyRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/settings/info-edit", body, options);
    public Task<ApiResponse<SuccessResponse>> SetMessagingAsync(string connection, string group, GroupAdminOnlyRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/settings/messages", body, options);
    public Task<ApiResponse<SuccessResponse>> SetMemberAddModeAsync(string connection, string group, GroupMemberAddRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/settings/member-add", body, options);
    public Task<ApiResponse<SuccessResponse>> SetJoinApprovalAsync(string connection, string group, GroupJoinApprovalRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, group) + "/settings/join-approval", body, options);
}
public sealed class Profile : Resource
{
    internal Profile(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/profile";
    public Task<ApiResponse<SuccessEnvelope<ProfileData>>> GetAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<ProfileData>>(Path(connection), options);
    public Task<ApiResponse<SuccessResponse>> SetNameAsync(string connection, SetProfileNameRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/name", body, options);
    public Task<ApiResponse<SuccessResponse>> SetStatusAsync(string connection, SetProfileStatusRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/status", body, options);
    public Task<ApiResponse<SuccessResponse>> SetPictureAsync(string connection, PictureRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/picture", body, options);
    public Task<ApiResponse<SuccessResponse>> DeletePictureAsync(string connection, RequestOptions? options = null) => Delete<SuccessResponse>(Path(connection) + "/picture", options);
}
public sealed class Presence : Resource
{
    internal Presence(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/presence";
    public Task<ApiResponse<CommandResponse<StatusResult>>> SetAsync(string connection, SetPresenceRequest body, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection), body, options);
    public Task<ApiResponse<SuccessEnvelope<PresenceData>>> GetAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<PresenceData>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<ChatPresenceData>>> GetForChatAsync(string connection, string chat, RequestOptions? options = null) => Get<SuccessEnvelope<ChatPresenceData>>(Path(connection) + "/" + E(chat), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<PresenceSubscription>>>> SubscribeAsync(string connection, string chat, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<PresenceSubscription>>>(Path(connection) + "/" + E(chat) + "/subscribe", null, options);
}
public sealed class Labels : Resource
{
    internal Labels(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/labels";
    public Task<ApiResponse<SuccessEnvelope<LabelReadData>>> ListAsync(string connection, ListLabelsParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<LabelReadData>>(Path(connection), options, parameters);
    public Task<ApiResponse<SuccessEnvelope<Label>>> CreateAsync(string connection, CreateLabelRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<Label>>(Path(connection), body, options);
    public Task<ApiResponse<SuccessResponse>> UpdateAsync(string connection, string id, UpdateLabelRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/" + E(id), body, options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string connection, string id, RequestOptions? options = null) => Delete<SuccessResponse>(Path(connection) + "/" + E(id), options);
    public Task<ApiResponse<SuccessEnvelope<LabelReadData>>> ListForChatAsync(string connection, string chat, ListLabelsParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<LabelReadData>>(Path(connection) + "/chats/" + E(chat), options, parameters);
    public Task<ApiResponse<SuccessResponse>> ReplaceForChatAsync(string connection, string chat, ReplaceChatLabelsRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/chats/" + E(chat), body, options);
}
public sealed class Chats : Resource
{
    internal Chats(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/chats";
    private static string Path(string connection, string chat) => Path(connection) + "/" + E(chat);
    public Task<ApiResponse<SuccessEnvelope<CustomerServiceWindow>>> GetServiceWindowAsync(string connection, string conversation, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<CustomerServiceWindow>>(Path(connection, conversation) + "/service-window", options); }
    public Task<ApiResponse<HistoryPage<HistoryChat>>> ListAsync(string connection, ListHistoryChatsParameters? parameters = null, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<HistoryPage<HistoryChat>>(Path(connection), options, parameters); }
    public Task<ApiResponse<SuccessEnvelope<HistoryChat>>> RetrieveAsync(string connection, string chat, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<HistoryChat>>(Path(connection, chat), options); }
    public Task<ApiResponse<HistoryPage<HistoryMessage>>> ListMessagesAsync(string connection, string chat, ListHistoryMessagesParameters? parameters = null, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<HistoryPage<HistoryMessage>>(Path(connection, chat) + "/messages", options, parameters); }
    public Task<ApiResponse<SuccessEnvelope<HistoryMessage>>> RetrieveMessageAsync(string connection, string chat, string message, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<HistoryMessage>>(Path(connection, chat) + "/messages/" + E(message), options); }
    public Task<MediaDownload> DownloadMessageMediaStreamAsync(string connection, string chat, string message, RequestOptions? options = null) { Http.Credential.RequireServer(); return MessagingMedia.OpenDownloadAsync(Http, Path(connection, chat) + "/messages/" + E(message) + "/media", options ?? new()); }
    public async Task<ApiResponse<byte[]>> DownloadMessageMediaAsync(string connection, string chat, string message, RequestOptions? options = null) { await using var download = await DownloadMessageMediaStreamAsync(connection, chat, message, options).ConfigureAwait(false); return new(await download.ReadAllAsync().ConfigureAwait(false), download.Metadata); }
    public Task<ApiResponse<SuccessResponse>> EditMessageAsync(string connection, string chat, string message, EditMessageRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, chat) + "/messages/" + E(message), body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessResponse>> DeleteMessageAsync(string connection, string chat, string message, string? transport = null, RequestOptions? options = null) => Http.RequestAsync<SuccessResponse>(HttpMethod.Delete, Path(connection, chat) + "/messages/" + E(message), null, (options ?? new()).WithIdempotency(), Query(new { transport }));
    public Task<ApiResponse<SuccessResponse>> ArchiveAsync(string connection, string chat, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, chat) + "/archive", null, options);
    public Task<ApiResponse<SuccessResponse>> UnarchiveAsync(string connection, string chat, RequestOptions? options = null) => Post<SuccessResponse>(Path(connection, chat) + "/unarchive", null, options);
    public Task<ApiResponse<SuccessResponse>> SetDisappearingTimerAsync(string connection, string chat, DisappearingTimerRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection, chat) + "/disappearing", body, options);
}
public sealed class Privacy : Resource
{
    internal Privacy(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/privacy";
    public Task<ApiResponse<SuccessEnvelope<PrivacySettings>>> GetAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<PrivacySettings>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<PrivacySettings>>> SetAsync(string connection, PrivacySettingRequest body, RequestOptions? options = null) => Put<SuccessEnvelope<PrivacySettings>>(Path(connection) + "/" + E(body.Setting), new { body.Value }, options);
    public Task<ApiResponse<SuccessResponse>> SetDefaultDisappearingTimerAsync(string connection, DisappearingTimerRequest body, RequestOptions? options = null) => Put<SuccessResponse>(Path(connection) + "/disappearing/default", body, options);
}
