using System.Globalization;
using System.Text.Json;

namespace Polymorfa.Sdk.Storage;

/// <summary>Resolves native JIDs and message keys into Polymorfa IDs or stable wa:-prefixed keys.</summary>
public sealed class StorageHistoryKeys
{
    private readonly Dictionary<string, string> conversations = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> contacts = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<StorageHistoryMessageIdentity>> messages = new(StringComparer.Ordinal);
    public StorageHistoryKeys(StorageHistoryIdentityIndex? index = null, StorageHistoryChunk? chunk = null)
    {
        foreach (var pair in index?.Conversations ?? new Dictionary<string, string>()) conversations[StorageReducers.NormalizeJid(pair.Key)] = pair.Value;
        foreach (var pair in index?.Contacts ?? new Dictionary<string, string>()) contacts[StorageReducers.NormalizeJid(pair.Key)] = pair.Value;
        foreach (var message in index?.Messages ?? []) { if (!messages.TryGetValue(message.NativeId, out var list)) messages[message.NativeId] = list = []; list.Add(message); }
        foreach (var conversation in chunk?.Conversations ?? [])
        {
            if (conversation.Id is not { Length: > 0 } jid || conversations.ContainsKey(StorageReducers.NormalizeJid(jid))) continue; var found = new HashSet<string>(StringComparer.Ordinal);
            foreach (var entry in conversation.Messages ?? []) if (entry.Message?.Key is { Id: { Length: > 0 } id } key && messages.TryGetValue(id, out var candidates)) foreach (var candidate in candidates) if (candidate.FromMe is null || key.FromMe is null || candidate.FromMe == key.FromMe) found.Add(candidate.ChatId);
            if (found.Count == 1) conversations[StorageReducers.NormalizeJid(jid)] = found.Single();
        }
    }
    public string ChatId(string jid) { var bare = StorageReducers.NormalizeJid(jid); return conversations.GetValueOrDefault(bare) ?? "wa:" + bare; }
    public string ContactId(string jid) { var bare = StorageReducers.NormalizeJid(jid); return contacts.GetValueOrDefault(bare) ?? (StorageReducers.HistoryChatKind(bare) == "direct" ? conversations.GetValueOrDefault(bare) : null) ?? "wa:" + bare; }
    public string? MessageId(StorageHistoryMessageKey key, string chatJid)
    {
        if (key.Id is not { Length: > 0 } nativeId) return null; var jid = StorageReducers.NormalizeJid(key.RemoteJid is { Length: > 0 } remote ? remote : chatJid); var fromMe = key.FromMe == true; var chat = ChatId(jid);
        var candidates = messages.GetValueOrDefault(nativeId)?.Where(candidate => candidate.ChatId == chat && (candidate.FromMe is null || candidate.FromMe == fromMe)).ToArray() ?? [];
        if (candidates.Length == 1) return candidates[0].Id; var sender = !fromMe && StorageReducers.HistoryChatKind(jid) == "group" && key.Participant is { Length: > 0 } participant ? StorageReducers.NormalizeJid(participant) : ""; return $"wa:{jid}:{(fromMe ? 1 : 0)}:{sender}:{nativeId}";
    }
}

public static partial class StorageReducers
{
    private static readonly string[] SyncTypes = ["INITIAL_BOOTSTRAP", "INITIAL_STATUS_V3", "FULL", "RECENT", "PUSH_NAME", "NON_BLOCKING_DATA", "ON_DEMAND"];
    private static readonly string[] StatusNames = ["ERROR", "PENDING", "SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED"];
    private static readonly string[] StatusValues = ["failed", "pending", "sent", "delivered", "read", "played"];
    internal static string? HistoryChatKind(string jid) => ChatKind(jid);
    private static string? NonEmpty(string? value) => value is { Length: > 0 } ? value : null;
    private static double? Number(StorageHistoryNumber? value) => value?.ToNumber();
    private static double? EnumNumber(StorageHistoryEnum? value, params (string Name, int Number)[] names)
    {
        if (value is not { } found) return null; if (Finite(found.Value) is { } number) return number; var name = Text(found.Value)?.ToUpperInvariant(); foreach (var entry in names) if (entry.Name == name) return entry.Number; return null;
    }
    public static string HistorySyncTypeName(StorageHistoryEnum? value) => HistorySyncTypeName(value?.Value ?? default);
    private static string HistorySyncTypeName(JsonElement value)
    {
        if (Finite(value) is { } number) return number >= 0 && number < SyncTypes.Length && number == Math.Truncate(number) ? SyncTypes[(int)number] : StorageMerge.CanonicalJson(Json(number));
        if (NonEmpty(value) is { } text) return SyncTypes.Contains(text.ToUpperInvariant(), StringComparer.Ordinal) ? text.ToUpperInvariant() : text; return "UNKNOWN";
    }
    public static string NormalizeJid(string jid)
    {
        ArgumentNullException.ThrowIfNull(jid); var at = jid.IndexOf('@'); if (at < 0) return jid.ToLowerInvariant(); var user = jid[..at].Split(':')[0].Split('_')[0]; return (user + jid[at..]).ToLowerInvariant();
    }
    public static IReadOnlyList<StorageOperation> HistoryProgress(string sessionId, string syncType, double? chunkOrder, double? progress, double? conversationCount = null, double? messageCount = null, double? pushnameCount = null)
    {
        var operations = new List<StorageOperation>(); if (chunkOrder is { } order) { var fields = Fields(); PutNumber(fields, "progress", progress, 0); PutNumber(fields, "conversationCount", conversationCount, 0); PutNumber(fields, "messageCount", messageCount, 0); PutNumber(fields, "pushnameCount", pushnameCount, 0); operations.Add(Upsert(StorageEntity.HistoryChunks, Key(sessionId, ("syncType", syncType), ("chunkOrder", StorageMerge.CanonicalJson(Json(order)))), fields)); }
        var state = Fields(); PutNumber(state, "progress", progress, progress ?? 0); PutNumber(state, "lastChunkOrder", chunkOrder, chunkOrder ?? 0); operations.Add(Upsert(StorageEntity.HistoryProgress, Key(sessionId, ("syncType", syncType)), state)); return operations;
    }
    public static StorageHistoryIdentityIndex HistoryIdentityIndex(JsonElement payload)
    {
        var messages = new List<StorageHistoryMessageIdentity>(); foreach (var message in Items(Prop(payload, "messages"))) if (NonEmpty(Prop(Prop(message, "whatsapp_ids"), "linked_devices")) is { } native && NonEmpty(Prop(Prop(message, "conversation"), "id")) is { } chat && NonEmpty(Prop(message, "id")) is { } id) messages.Add(new(native, id, chat, Bool(Prop(message, "fromMe")))); return new(Messages: messages);
    }
    private static StorageHistoryContent? Unwrap(StorageHistoryContent? value)
    {
        for (var depth = 0; value is not null && depth < 5; depth++) { var inner = value.EphemeralMessage?.Message ?? value.ViewOnceMessage?.Message ?? value.ViewOnceMessageV2?.Message ?? value.DocumentWithCaptionMessage?.Message ?? value.EditedMessage?.Message; if (inner is null) break; value = inner; }
        return value;
    }
    private sealed record MappedHistoryContent(string Type, Dictionary<string, StorageFieldWrite> Fields, string? QuotedId = null, StorageHistoryMedia? Media = null);
    private static MappedHistoryContent? MapContent(StorageHistoryContent value, double version)
    {
        var fields = Fields(); string type; string? quote = null; StorageHistoryMedia? media = null;
        if (NonEmpty(value.Conversation) is { } conversation) { type = "text"; PutValue(fields, "text", conversation, version); }
        else if (value.ExtendedTextMessage is { } extended) { type = "text"; PutValue(fields, "text", NonEmpty(extended.Text), version); quote = NonEmpty(extended.ContextInfo?.StanzaId); }
        else if ((value.ImageMessage ?? value.VideoMessage ?? value.PtvMessage ?? value.AudioMessage ?? value.DocumentMessage ?? value.StickerMessage) is { } found)
        {
            media = found; type = value.ImageMessage is not null ? "image" : value.VideoMessage is not null || value.PtvMessage is not null ? "video" : value.AudioMessage is not null ? "audio" : value.DocumentMessage is not null ? "document" : "sticker";
            PutValue(fields, "caption", NonEmpty(media.Caption), version); PutValue(fields, "mimeType", NonEmpty(media.Mimetype), version); PutValue(fields, "fileName", NonEmpty(media.FileName), version); PutValue(fields, "title", NonEmpty(media.Title), version); PutValue(fields, "extra", media.Ptt == true ? new Dictionary<string, bool> { ["ptt"] = true } : null, version); quote = NonEmpty(media.ContextInfo?.StanzaId);
        }
        else if (value.LocationMessage is { } location) { type = "location"; PutValue(fields, "latitude", location.DegreesLatitude, version); PutValue(fields, "longitude", location.DegreesLongitude, version); PutValue(fields, "title", NonEmpty(location.Name), version); quote = NonEmpty(location.ContextInfo?.StanzaId); }
        else if (value.ContactMessage is { } contact) { type = "contact"; PutValue(fields, "displayName", NonEmpty(contact.DisplayName), version); }
        else if ((value.PollCreationMessage ?? value.PollCreationMessageV2 ?? value.PollCreationMessageV3) is { } poll) { type = "poll"; PutValue(fields, "title", NonEmpty(poll.Name), version); PutValue(fields, "pollOptions", (poll.Options ?? []).Select(option => NonEmpty(option.OptionName)).OfType<string>().Select(name => new { name }).ToArray(), version); quote = NonEmpty(poll.ContextInfo?.StanzaId); }
        else return null;
        foreach (var name in ContentNames) if (!fields.ContainsKey(name)) PutValue<string?>(fields, name, null, version); return new(type, fields, quote, media);
    }
    private static Dictionary<string, StorageFieldWrite> HistoryMedia(StorageHistoryMedia media, string kind, string chat, double version)
    {
        var fields = Fields(); PutValue(fields, "chatId", chat, 0); PutValue(fields, "kind", kind, 0); PutText(fields, "mimeType", NonEmpty(media.Mimetype), version); PutText(fields, "fileName", NonEmpty(media.FileName), version); PutNumber(fields, "fileLength", Number(media.FileLength), version); PutText(fields, "fileSha256", NonEmpty(media.FileSha256?.Base64), version); PutText(fields, "fileEncSha256", NonEmpty(media.FileEncSha256?.Base64), version); PutText(fields, "directPath", NonEmpty(media.DirectPath), version); PutText(fields, "mediaKey", NonEmpty(media.MediaKey?.Base64), version); PutNumber(fields, "mediaKeyTimestamp", Millis(Number(media.MediaKeyTimestamp)), version); return fields;
    }
    public static IReadOnlyList<StorageOperation> ReduceWebMessageInfo(StorageWebMessageInfo info, string sessionId, StorageHistoryKeys keys, string? chatJid = null)
    {
        var key = info.Key ?? new(); var jid = NonEmpty(key.RemoteJid) ?? chatJid; if (jid is null || keys.MessageId(key, jid) is not { } messageId) return []; var chat = keys.ChatId(jid); var fromMe = key.FromMe == true; var group = ChatKind(NormalizeJid(jid)) == "group"; var senderJid = fromMe ? null : NonEmpty(key.Participant) ?? NonEmpty(info.Participant) ?? (group ? null : jid); var sender = fromMe ? "self" : senderJid is not null ? keys.ContactId(senderJid) : null; var timestamp = Millis(Number(info.MessageTimestamp)); var guard = timestamp is { } time ? new StorageGuard(sessionId, chat, time) : null; var content = Unwrap(info.Message); var operations = new List<StorageOperation>();
        if (content?.ProtocolMessage is { } protocol)
        {
            if (protocol.Key is null || keys.MessageId(protocol.Key, jid) is not { } target) return []; var kind = EnumNumber(protocol.Type, ("REVOKE", 0), ("MESSAGE_EDIT", 14));
            if (kind == 0) { var revoked = Cleared(ContentNames); PutValue(revoked, "chatId", chat, 0); PutValue(revoked, "revokedAt", timestamp ?? 0, StorageMerge.FinalVersion); return [Upsert(StorageEntity.Messages, Key(sessionId, ("messageId", target)), revoked), Upsert(StorageEntity.Media, Key(sessionId, ("messageId", target)), Cleared(MediaSecretNames))]; }
            if (kind == 14 && protocol.EditedMessage is not null) { var version = Millis(Number(protocol.TimestampMs)) ?? timestamp ?? 0; var mapped = MapContent(Unwrap(protocol.EditedMessage) ?? new(), version); if (mapped is null) return []; PutValue(mapped.Fields, "chatId", chat, 0); PutValue(mapped.Fields, "editedAt", version, version); return [Upsert(StorageEntity.Messages, Key(sessionId, ("messageId", target)), mapped.Fields, guard)]; }
            return [];
        }
        if (content?.ReactionMessage is { } reaction)
        {
            if (reaction.Key is null || keys.MessageId(reaction.Key, jid) is not { } target || sender is null) return []; var version = Millis(Number(reaction.SenderTimestampMs)) ?? timestamp ?? 0; var reactionFields = Fields(); PutValue(reactionFields, "chatId", chat, 0); PutValue(reactionFields, "emoji", reaction.Text ?? "", version); PutValue(reactionFields, "timestamp", version, version); return [Upsert(StorageEntity.Reactions, Key(sessionId, ("messageId", target), ("senderId", sender)), reactionFields)];
        }
        var fields = Fields(); PutValue(fields, "chatId", chat, 0); PutValue(fields, "fromMe", fromMe, 0); PutText(fields, "senderId", sender, 0); PutText(fields, "senderJid", senderJid is null ? null : NormalizeJid(senderJid), 0); PutValue(fields, "timestamp", timestamp ?? 0, 0); PutText(fields, "waMessageId", NonEmpty(key.Id), 0); if (!fromMe) PutText(fields, "pushName", NonEmpty(info.PushName), 0); if (info.Starred is { } starred) PutValue(fields, "starred", starred, 0);
        var stateNumber = EnumNumber(info.Status, StatusNames.Select((name, number) => (name, number)).ToArray()); if (fromMe && stateNumber is >= 0 and < 6 && stateNumber == Math.Truncate(stateNumber.Value)) Status(fields, StatusValues[(int)stateNumber.Value], null);
        MappedHistoryContent? mappedContent = null; if (EnumNumber(info.MessageStubType, ("REVOKE", 1)) == 1) { foreach (var field in Cleared(ContentNames)) fields[field.Key] = field.Value; PutValue(fields, "revokedAt", Millis(Number(info.RevokeMessageTimestamp)) ?? timestamp ?? 0, StorageMerge.FinalVersion); operations.Add(Upsert(StorageEntity.Media, Key(sessionId, ("messageId", messageId)), Cleared(MediaSecretNames))); }
        else if (content is not null) { mappedContent = MapContent(content, 0); if (mappedContent is not null) { PutValue(fields, "type", mappedContent.Type, 0); PutText(fields, "quotedId", mappedContent.QuotedId, 0); foreach (var field in mappedContent.Fields) fields[field.Key] = field.Value; } else PutValue(fields, "type", "unknown", 0); }
        operations.Add(Upsert(StorageEntity.Messages, Key(sessionId, ("messageId", messageId)), fields, guard)); if (mappedContent?.Media is { } media) operations.Add(Upsert(StorageEntity.Media, Key(sessionId, ("messageId", messageId)), HistoryMedia(media, mappedContent.Type, chat, 0), guard));
        foreach (var receipt in info.UserReceipt ?? [])
        {
            if (NonEmpty(receipt.UserJid) is not { } user) continue; var played = Millis(Number(receipt.PlayedTimestamp)); var read = Millis(Number(receipt.ReadTimestamp)); var delivered = Millis(Number(receipt.ReceiptTimestamp)); var receiptAt = played ?? read ?? delivered; if (receiptAt is null) continue; var receiptFields = Fields(); PutValue(receiptFields, "chatId", chat, 0); Status(receiptFields, played is not null ? "played" : read is not null ? "read" : "delivered", receiptAt, "timestamp"); operations.Add(Upsert(StorageEntity.Receipts, Key(sessionId, ("messageId", messageId), ("recipientId", keys.ContactId(user))), receiptFields, guard));
        }
        foreach (var attached in info.Reactions ?? [])
        {
            var reactorKey = attached.Key ?? new(); var reactor = reactorKey.FromMe == true ? "self" : NonEmpty(reactorKey.Participant) ?? (group ? null : jid); if (reactor is null) continue; var version = Millis(Number(attached.SenderTimestampMs)) ?? timestamp ?? 0; var reactionFields = Fields(); PutValue(reactionFields, "chatId", chat, 0); PutValue(reactionFields, "emoji", attached.Text ?? "", version); PutValue(reactionFields, "timestamp", version, version); operations.Add(Upsert(StorageEntity.Reactions, Key(sessionId, ("messageId", messageId), ("senderId", reactor == "self" ? "self" : keys.ContactId(reactor))), reactionFields, guard));
        }
        if (!fromMe && senderJid is not null && NonEmpty(info.PushName) is { } pushName && timestamp is { } contactAt) { var contact = Fields(); PutValue(contact, "jid", NormalizeJid(senderJid), 0); PutValue(contact, "pushName", pushName, contactAt); operations.Add(Upsert(StorageEntity.Contacts, Key(sessionId, ("contactId", keys.ContactId(senderJid))), contact)); }
        return operations;
    }
    private static IReadOnlyList<StorageOperation> Conversation(string session, StorageHistoryConversation conversation, StorageHistoryKeys keys)
    {
        if (NonEmpty(conversation.Id) is not { } jid) return []; var bare = NormalizeJid(jid); var chat = keys.ChatId(bare); var kind = ChatKind(bare); var last = Millis(Number(conversation.LastMsgTimestamp)); var snapshot = Math.Max(Millis(Number(conversation.ConversationTimestamp)) ?? 0, last ?? 0); var fields = Fields(); PutValue(fields, "jid", bare, 0); PutText(fields, "kind", kind, 0); PutText(fields, "name", NonEmpty(conversation.Name) ?? NonEmpty(conversation.DisplayName), snapshot); PutText(fields, "username", NonEmpty(conversation.Username), snapshot); if (kind == "direct" && conversation.PnJid is { Length: > 0 } pn) PutValue(fields, "phoneNumber", "+" + NormalizeJid(pn).Split('@')[0], snapshot);
        if (conversation.Archived is { } archived) PutValue(fields, "archived", archived, snapshot); if (conversation.MarkedAsUnread is { } unread) PutValue(fields, "markedUnread", unread, snapshot); PutNumber(fields, "unreadCount", conversation.UnreadCount, snapshot); if (conversation.ReadOnly is { } readOnly) PutValue(fields, "readOnly", readOnly, snapshot); PutNumber(fields, "ephemeralExpiration", conversation.EphemeralExpiration, snapshot); if (Number(conversation.Pinned) is { } pinned) PutValue(fields, "pinned", pinned > 0, snapshot); if (Number(conversation.MuteEndTime) is { } mute) { PutValue(fields, "muted", mute != 0, snapshot); PutValue(fields, "muteEndAt", mute > 0 ? Millis(mute) : null, snapshot); }
        PutNumber(fields, "lastMessageAt", last, last ?? 0);
        var operations = new List<StorageOperation> { Upsert(StorageEntity.Chats, Key(session, ("chatId", chat)), fields) }; if (kind == "group")
        {
            var group = Fields(); PutValue(group, "jid", bare, 0); PutText(group, "subject", NonEmpty(conversation.Name), snapshot); PutText(group, "description", NonEmpty(conversation.Description), snapshot); PutNumber(group, "createdAt", Millis(Number(conversation.CreatedAt)), 0); PutText(group, "createdBy", NonEmpty(conversation.CreatedBy) is { } creator ? NormalizeJid(creator) : null, 0); operations.Add(Upsert(StorageEntity.Groups, Key(session, ("groupId", chat)), group));
            foreach (var participant in conversation.Participant ?? []) { if (NonEmpty(participant.UserJid) is not { } user) continue; var rank = EnumNumber(participant.Rank, ("REGULAR", 0), ("ADMIN", 1), ("SUPERADMIN", 2)); var member = Fields(); PutValue(member, "jid", NormalizeJid(user), 0); PutValue(member, "role", rank == 1 ? "admin" : rank == 2 ? "superadmin" : "member", snapshot); PutValue(member, "active", true, snapshot); PutValue(member, "changedAt", snapshot, snapshot); operations.Add(Upsert(StorageEntity.GroupParticipants, Key(session, ("groupId", chat), ("participantId", keys.ContactId(user))), member)); }
        }
        foreach (var entry in conversation.Messages ?? []) if (entry.Message is { } info) operations.AddRange(ReduceWebMessageInfo(info, session, keys, bare)); return operations;
    }
    public static StorageBatch ReduceHistoryChunk(StorageHistoryInput input)
    {
        ArgumentNullException.ThrowIfNull(input); var session = input.SessionId; var chunk = input.Chunk; var keys = new StorageHistoryKeys(input.Identities, chunk); var operations = new List<StorageOperation>(); foreach (var conversation in chunk.Conversations ?? []) operations.AddRange(Conversation(session, conversation, keys));
        foreach (var pushname in chunk.Pushnames ?? []) { if (NonEmpty(pushname.Id) is not { } jid || NonEmpty(pushname.Pushname) is not { } name || ChatKind(NormalizeJid(jid)) != "direct") continue; var fields = Fields(); PutValue(fields, "jid", NormalizeJid(jid), 0); PutValue(fields, "pushName", name, 0); operations.Add(Upsert(StorageEntity.Contacts, Key(session, ("contactId", keys.ContactId(jid))), fields)); }
        foreach (var mapping in chunk.PhoneNumberToLidMappings ?? []) { if (NonEmpty(mapping.PnJid) is not { } pn || NonEmpty(mapping.LidJid) is not { } lid) continue; var phone = "+" + NormalizeJid(pn).Split('@')[0]; foreach (var jid in new[] { pn, lid }) { var fields = Fields(); PutValue(fields, "phoneNumber", phone, 0); PutValue(fields, "lidJid", NormalizeJid(lid), 0); operations.Add(Upsert(StorageEntity.Contacts, Key(session, ("contactId", keys.ContactId(jid))), fields)); } }
        foreach (var past in chunk.PastParticipants ?? []) { if (NonEmpty(past.GroupJid) is not { } group) continue; foreach (var participant in past.PastParticipants ?? []) { if (NonEmpty(participant.UserJid) is not { } user) continue; var left = Millis(Number(participant.LeaveTs)) ?? 0; var fields = Fields(); PutValue(fields, "jid", NormalizeJid(user), 0); PutValue(fields, "active", false, left); PutValue(fields, "leaveReason", EnumNumber(participant.LeaveReason, ("LEFT", 0), ("REMOVED", 1)) == 1 ? "removed" : "left", left); PutValue(fields, "changedAt", left, left); operations.Add(Upsert(StorageEntity.GroupParticipants, Key(session, ("groupId", keys.ChatId(group)), ("participantId", keys.ContactId(user))), fields)); } }
        operations.AddRange(HistoryProgress(session, HistorySyncTypeName(chunk.SyncType), Number(chunk.ChunkOrder), Number(chunk.Progress), chunk.Conversations?.Count ?? 0, (chunk.Conversations ?? []).Sum(conversation => conversation.Messages?.Count ?? 0), chunk.Pushnames?.Count ?? 0)); return new(session, operations, input.ChunkId is null ? null : "history:" + input.ChunkId, "history.chunk");
    }
}
