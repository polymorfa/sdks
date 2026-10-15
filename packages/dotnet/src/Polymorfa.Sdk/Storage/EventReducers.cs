using System.Globalization;
using System.Text.Json;

namespace Polymorfa.Sdk.Storage;

/// <summary>Pure, deterministic mappings from verified webhook bodies to customer-owned storage operations.</summary>
public static partial class StorageReducers
{
    public static IReadOnlyList<string> StoredEventTypes { get; } = Array.AsReadOnly(new[]
    {
        "blocklist.update", "chat.archive", "chat.clear", "chat.delete", "chat.mute", "chat.read", "contact.update", "group.participant", "group.update", "history.sync", "labels.update", "message.ack", "message.delete", "message.edited", "message.reaction", "message.received", "message.revoked", "message.sent", "message.update", "message.vote", "newsletter.update", "session.connected", "session.logged_out", "session.status"
    });
    private static readonly string[] ContentNames = ["text", "caption", "mimeType", "fileName", "latitude", "longitude", "displayName", "title", "pollOptions", "extra"];
    private static readonly string[] MediaSecretNames = ["mediaKey", "descriptor", "directPath", "downloadUrl", "fileSha256", "fileEncSha256"];
    private static readonly IReadOnlyDictionary<string, int> StatusRanks = new Dictionary<string, int>(StringComparer.Ordinal) { ["pending"] = 1, ["failed"] = 2, ["sent"] = 3, ["delivered"] = 4, ["read"] = 5, ["played"] = 6 };
    private static JsonElement Prop(JsonElement value, string name) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var found) ? found : default;
    private static IEnumerable<JsonElement> Items(JsonElement value) => value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
    private static string? Text(JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static string? NonEmpty(JsonElement value) => Text(value) is { Length: > 0 } result ? result : null;
    private static double? Finite(JsonElement value) => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var result) && double.IsFinite(result) ? result : null;
    private static bool? Bool(JsonElement value) => value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    private static JsonElement Json<T>(T value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement OrNull(JsonElement value) => value.ValueKind == JsonValueKind.Undefined ? StorageMerge.Null : value;
    private static Dictionary<string, StorageFieldWrite> Fields() => new(StringComparer.Ordinal);
    private static Dictionary<string, string> Key(string session, params (string Name, string Value)[] parts)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal) { ["sessionId"] = session }; foreach (var (name, value) in parts) result.Add(name, value); return result;
    }
    private static void Put(Dictionary<string, StorageFieldWrite> fields, string name, JsonElement value, double version) { if (value.ValueKind != JsonValueKind.Undefined) fields[name] = new(value.Clone(), version); }
    private static void PutValue<T>(Dictionary<string, StorageFieldWrite> fields, string name, T value, double version) => Put(fields, name, Json(value), version);
    private static void PutText(Dictionary<string, StorageFieldWrite> fields, string name, string? value, double version) { if (value is not null) PutValue(fields, name, value, version); }
    private static void PutNumber(Dictionary<string, StorageFieldWrite> fields, string name, double? value, double version) { if (value is not null) PutValue(fields, name, value.Value, version); }
    private static StorageUpsert Upsert(StorageEntity entity, Dictionary<string, string> key, Dictionary<string, StorageFieldWrite> fields, StorageGuard? guard = null) => new(entity, key, fields, guard);
    private static double? Millis(double? value) => value is > 0 && double.IsFinite(value.Value) ? Math.Round(value < 100_000_000_000 ? value.Value * 1000 : value.Value, MidpointRounding.AwayFromZero) : null;
    private static double IsoMillis(string value) => DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed.ToUnixTimeMilliseconds() : 0;
    private static string? ChatKind(string? jid, bool? isGroup = null) => isGroup == true ? "group" : jid switch
    {
        null or "" => isGroup == false ? "direct" : null,
        _ when jid.EndsWith("@g.us", StringComparison.Ordinal) => "group",
        _ when jid.EndsWith("@newsletter", StringComparison.Ordinal) => "channel",
        _ when jid.EndsWith("@broadcast", StringComparison.Ordinal) => "broadcast",
        _ when jid.EndsWith("@s.whatsapp.net", StringComparison.Ordinal) || jid.EndsWith("@lid", StringComparison.Ordinal) || jid.EndsWith("@c.us", StringComparison.Ordinal) => "direct",
        _ => isGroup == false ? "direct" : null
    };
    private static Dictionary<string, StorageFieldWrite> Cleared(IEnumerable<string> names) => names.ToDictionary(name => name, _ => new StorageFieldWrite(StorageMerge.Null, StorageMerge.FinalVersion), StringComparer.Ordinal);
    private static void Status(Dictionary<string, StorageFieldWrite> fields, string status, double? at, string timeField = "statusAt")
    {
        var rank = StatusRanks[status]; PutValue(fields, "status", status, rank); PutNumber(fields, timeField, at, rank);
    }
    /// <summary>Maps receipt names to monotonic storage statuses.</summary>
    public static string? AcknowledgementStatus(string? type) => type?.ToLowerInvariant() switch
    {
        "pending" => "pending",
        "error" or "failed" => "failed",
        "sent" or "server" or "server_ack" => "sent",
        "delivered" or "delivery" or "delivery_ack" => "delivered",
        "read" or "read-self" or "read_self" => "read",
        "played" or "played-self" => "played",
        _ => null
    };
    public static StorageBatch ReduceEvent(WebhookEvent value) => ReduceEvent(value.Envelope);
    public static StorageBatch ReduceEvent(WebhookEnvelope value)
    {
        ArgumentNullException.ThrowIfNull(value); return new(value.Session, EventOperations(value.Session, value.Event, value.Payload, IsoMillis(value.Timestamp)), value.Id, value.Event);
    }
    private static IReadOnlyList<StorageOperation> EventOperations(string session, string type, JsonElement p, double at)
    {
        var fields = Fields(); var from = Prop(p, "from"); var chatId = NonEmpty(Prop(from, "id"));
        switch (type)
        {
            case "message.received": case "message.update": return Message(session, p, at, Bool(Prop(p, "edited")) == true);
            case "message.edited": return Message(session, p, at, true);
            case "message.sent": return Sent(session, p);
            case "message.reaction": return Reaction(session, p, at);
            case "message.revoked": return Revoke(session, p, at);
            case "message.delete": return DeleteForMe(session, p, at);
            case "message.ack": return Ack(session, p, at);
            case "message.vote": return Vote(session, p, at);
            case "chat.archive": Put(fields, "archived", Prop(p, "archive"), at); Put(fields, "pinned", Prop(p, "pinned"), at); return ChatPatch(session, chatId, fields, at);
            case "chat.mute": Put(fields, "muted", Prop(p, "muted"), at); PutValue(fields, "muteEndAt", Bool(Prop(p, "muted")) == true ? Millis(Finite(Prop(p, "muteEndTimestamp"))) : null, at); return ChatPatch(session, chatId, fields, at);
            case "chat.read": PutValue(fields, "markedUnread", Bool(Prop(p, "read")) != true, at); if (Bool(Prop(p, "read")) == true) PutValue(fields, "unreadCount", 0, at); return ChatPatch(session, chatId, fields, at);
            case "chat.clear":
            case "chat.delete":
                if (chatId is null || at == 0) return []; PutValue(fields, type == "chat.clear" ? "clearedAt" : "deletedAt", at, at); return [Upsert(StorageEntity.Chats, Key(session, ("chatId", chatId)), fields), new StorageClearChat(session, chatId, at)];
            case "contact.update": return Contact(session, p, at);
            case "blocklist.update": return Blocklist(session, p, at);
            case "group.update": return Group(session, p, at);
            case "group.participant": return Participants(session, p, at);
            case "labels.update": return Labels(session, p, at);
            case "newsletter.update":
                if (NonEmpty(Prop(p, "id")) is not { } channel) return []; PutValue(fields, "kind", "channel", 0); Put(fields, "muted", Prop(p, "muted"), at); return [Upsert(StorageEntity.Chats, Key(session, ("chatId", channel)), fields)];
            case "session.connected":
                PutValue(fields, "connected", true, at); foreach (var name in new[] { "phoneNumber", "pushName", "phonePlatform", "accountType", "businessName" }) PutText(fields, name, NonEmpty(Prop(p, name)), at); PutText(fields, "waId", NonEmpty(Prop(p, "id")), at); return [Upsert(StorageEntity.Sessions, Key(session), fields)];
            case "session.status":
                if (Text(Prop(p, "status")) is not { } status) return []; PutValue(fields, "status", status, at); Put(fields, "statusReason", OrNull(Prop(p, "statusReason")), at); return [Upsert(StorageEntity.Sessions, Key(session), fields)];
            case "session.logged_out":
                PutValue(fields, "connected", false, at); PutText(fields, "loggedOutReason", NonEmpty(Prop(p, "reason")), at); PutNumber(fields, "loggedOutCode", Finite(Prop(p, "code")), at); return [Upsert(StorageEntity.Sessions, Key(session), fields)];
            case "history.sync":
                return Text(Prop(p, "kind")) == "history" ? [] : HistoryProgress(session, HistorySyncTypeName(Prop(p, "syncType")), Finite(Prop(p, "chunkOrder")), Finite(Prop(p, "progress")), Finite(Prop(p, "conversationCount")), Finite(Prop(p, "messageCount")), Finite(Prop(p, "pushNameCount")));
            default: return [];
        }
    }
    private sealed record MessageIdentity(string MessageId, string ChatId, double? Timestamp, bool FromMe, string? SenderId);
    private static MessageIdentity? Identity(JsonElement p, bool forceFromMe = false)
    {
        var conversation = Prop(p, "conversation"); if (NonEmpty(Prop(p, "id")) is not { } id || NonEmpty(Prop(conversation, "id")) is not { } chat) return null;
        var raw = Prop(p, "timestamp"); var number = raw.ValueKind == JsonValueKind.String && double.TryParse(raw.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : Finite(raw); var fromMe = forceFromMe || Bool(Prop(p, "fromMe")) == true;
        return new(id, chat, Millis(number), fromMe, fromMe ? "self" : NonEmpty(Prop(Prop(conversation, "sender"), "id")) ?? (Bool(Prop(p, "isGroup")) == true ? null : chat));
    }
    private static StorageGuard? Guard(string session, MessageIdentity id) => id.Timestamp is { } at ? new(session, id.ChatId, at) : null;
    private static void WhatsAppIds(Dictionary<string, StorageFieldWrite> fields, JsonElement p)
    {
        var ids = Prop(p, "whatsapp_ids"); PutText(fields, "waMessageId", NonEmpty(Prop(ids, "linked_devices")), 0); PutText(fields, "cloudMessageId", NonEmpty(Prop(ids, "official_api")), 0);
    }
    private static Dictionary<string, StorageFieldWrite> Content(JsonElement p, double version)
    {
        var fields = Fields(); PutValue(fields, "text", NonEmpty(Prop(p, "text")) ?? NonEmpty(Prop(Prop(p, "text"), "body")), version);
        foreach (var (target, source) in new[] { ("caption", "caption"), ("mimeType", "mimeType"), ("fileName", "filename"), ("displayName", "displayName"), ("title", "title") }) PutValue(fields, target, NonEmpty(Prop(p, source)), version);
        foreach (var name in new[] { "latitude", "longitude" }) PutValue(fields, name, Finite(Prop(p, name)), version);
        Put(fields, "pollOptions", OrNull(Prop(p, "pollOptions")), version); var extra = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var name in new[] { "ptt", "nativeFlowResponse", "replyChoice", "unavailable", "unavailableReason", "interactive", "referral" }) if (Prop(p, name) is { ValueKind: not JsonValueKind.Undefined } field) extra.Add(name, field.Clone());
        PutValue(fields, "extra", extra.Count == 0 ? null : extra, version); return fields;
    }
    private static List<StorageOperation> ChatFromConversation(string session, JsonElement conversation, bool? isGroup, double? timestamp)
    {
        if (NonEmpty(Prop(conversation, "id")) is not { } chat) return []; var fields = Fields(); var version = timestamp ?? 0; PutText(fields, "kind", ChatKind(null, isGroup), 0);
        if (isGroup != true) foreach (var name in new[] { "phoneNumber", "bsuid", "username" }) PutText(fields, name, NonEmpty(Prop(conversation, name)), version);
        PutNumber(fields, "lastMessageAt", timestamp, version); return [Upsert(StorageEntity.Chats, Key(session, ("chatId", chat)), fields)];
    }
    private static IReadOnlyList<StorageOperation> Message(string session, JsonElement p, double at, bool edit)
    {
        if (Identity(p) is not { } id) return []; var type = NonEmpty(Prop(p, "type")); if (type == "reaction") return Reaction(session, p, at); if (type == "revoke") return Revoke(session, p, at);
        var version = id.Timestamp ?? at; var fields = Fields(); PutValue(fields, "chatId", id.ChatId, 0); PutValue(fields, "fromMe", id.FromMe, 0); PutText(fields, "senderId", id.SenderId, 0); if (!edit) PutValue(fields, "timestamp", id.Timestamp ?? 0, 0);
        WhatsAppIds(fields, p); PutText(fields, "quotedId", NonEmpty(Prop(p, "parentMessageId")), 0); if (!id.FromMe) PutText(fields, "pushName", NonEmpty(Prop(p, "pushName")) ?? NonEmpty(Prop(p, "senderName")), 0);
        foreach (var field in Content(p, edit ? version : 0)) fields[field.Key] = field.Value; if (edit) PutValue(fields, "editedAt", version, version); else PutText(fields, "type", type, 0);
        var conversation = Prop(p, "conversation"); var isGroup = Bool(Prop(p, "isGroup")); var operations = ChatFromConversation(session, conversation, isGroup, edit ? null : id.Timestamp); operations.Add(Upsert(StorageEntity.Messages, Key(session, ("messageId", id.MessageId)), fields, Guard(session, id)));
        if (EventMedia(p, id.ChatId, edit ? version : 0) is { } media) operations.Add(Upsert(StorageEntity.Media, Key(session, ("messageId", id.MessageId)), media, Guard(session, id)));
        var pushName = NonEmpty(Prop(p, "pushName")) ?? NonEmpty(Prop(p, "senderName")); if (!id.FromMe && id.SenderId is { } contact && pushName is not null && id.Timestamp is { } timestamp)
        {
            var contactFields = Fields(); PutValue(contactFields, "pushName", pushName, timestamp); PutText(contactFields, "phoneNumber", NonEmpty(Prop(isGroup == true ? Prop(conversation, "sender") : conversation, "phoneNumber")), timestamp); operations.Add(Upsert(StorageEntity.Contacts, Key(session, ("contactId", contact)), contactFields));
        }
        return operations;
    }
    private static Dictionary<string, StorageFieldWrite>? EventMedia(JsonElement p, string chatId, double version)
    {
        var descriptor = NonEmpty(Prop(p, "media")); var url = NonEmpty(Prop(p, "mediaUrl")); var type = NonEmpty(Prop(p, "type")); if (descriptor is null && url is null && type is not ("image" or "video" or "audio" or "document" or "sticker")) return null;
        var fields = Fields(); PutValue(fields, "chatId", chatId, 0); PutText(fields, "kind", type, 0); PutText(fields, "mimeType", NonEmpty(Prop(p, "mimeType")), version); PutText(fields, "fileName", NonEmpty(Prop(p, "filename")), version); PutText(fields, "descriptor", descriptor, version); PutText(fields, "downloadUrl", url, version); return fields;
    }
    private static IReadOnlyList<StorageOperation> Sent(string session, JsonElement p)
    {
        if (Identity(p, true) is not { } id) return []; var fields = Fields(); PutValue(fields, "chatId", id.ChatId, 0); PutValue(fields, "fromMe", true, 0); PutValue(fields, "senderId", "self", 0); PutValue(fields, "timestamp", id.Timestamp ?? 0, 0); PutText(fields, "type", NonEmpty(Prop(p, "type")), 0); WhatsAppIds(fields, p); Status(fields, "sent", id.Timestamp);
        var operations = ChatFromConversation(session, Prop(p, "conversation"), null, id.Timestamp); operations.Add(Upsert(StorageEntity.Messages, Key(session, ("messageId", id.MessageId)), fields, Guard(session, id))); return operations;
    }
    private static IReadOnlyList<StorageOperation> Reaction(string session, JsonElement p, double at)
    {
        if (Identity(p) is not { SenderId: { } sender } id || NonEmpty(Prop(p, "reactionTo")) is not { } target) return []; var version = id.Timestamp ?? at; var fields = Fields(); PutValue(fields, "chatId", id.ChatId, 0); PutValue(fields, "emoji", Text(Prop(p, "reaction")) ?? "", version); PutValue(fields, "timestamp", version, version); return [Upsert(StorageEntity.Reactions, Key(session, ("messageId", target), ("senderId", sender)), fields)];
    }
    private static IReadOnlyList<StorageOperation> Revoke(string session, JsonElement p, double at)
    {
        if (Identity(p) is not { } id || NonEmpty(Prop(p, "revokedId")) is not { } target) return []; var fields = Cleared(ContentNames); PutValue(fields, "chatId", id.ChatId, 0); PutValue(fields, "revokedAt", id.Timestamp ?? at, StorageMerge.FinalVersion); return [Upsert(StorageEntity.Messages, Key(session, ("messageId", target)), fields), Upsert(StorageEntity.Media, Key(session, ("messageId", target)), Cleared(MediaSecretNames))];
    }
    private static IReadOnlyList<StorageOperation> DeleteForMe(string session, JsonElement p, double at)
    {
        if (NonEmpty(Prop(p, "id")) is not { } id || NonEmpty(Prop(Prop(p, "conversation"), "id")) is not { } chat) return []; var fields = Cleared(ContentNames); PutValue(fields, "chatId", chat, 0); PutValue(fields, "deletedAt", at, StorageMerge.FinalVersion); return [Upsert(StorageEntity.Messages, Key(session, ("messageId", id)), fields), Upsert(StorageEntity.Media, Key(session, ("messageId", id)), Cleared(MediaSecretNames))];
    }
    private static IReadOnlyList<StorageOperation> Ack(string session, JsonElement p, double at)
    {
        if (AcknowledgementStatus(Text(Prop(p, "type"))) is not { } status || NonEmpty(Prop(Prop(p, "conversation"), "id")) is not { } chat) return []; var timestamp = Millis(Finite(Prop(p, "timestamp"))) ?? at; var recipient = NonEmpty(Prop(Prop(p, "from"), "id")) ?? NonEmpty(Prop(Prop(p, "sender"), "id")) ?? chat; var operations = new List<StorageOperation>();
        foreach (var message in Items(Prop(p, "messages"))) { if (NonEmpty(Prop(message, "id")) is not { } id) continue; var fields = Fields(); PutValue(fields, "chatId", chat, 0); Status(fields, status, timestamp); operations.Add(Upsert(StorageEntity.Messages, Key(session, ("messageId", id)), fields)); var receipt = Fields(); PutValue(receipt, "chatId", chat, 0); Status(receipt, status, timestamp, "timestamp"); operations.Add(Upsert(StorageEntity.Receipts, Key(session, ("messageId", id), ("recipientId", recipient)), receipt)); }
        return operations;
    }
    private static IReadOnlyList<StorageOperation> Vote(string session, JsonElement p, double at)
    {
        if (NonEmpty(Prop(p, "pollMessageId")) is not { } id || NonEmpty(Prop(Prop(p, "voter"), "id")) is not { } voter || NonEmpty(Prop(Prop(p, "conversation"), "id")) is not { } chat) return []; var version = Millis(Finite(Prop(p, "timestamp"))) ?? at; var fields = Fields(); PutValue(fields, "chatId", chat, 0); Put(fields, "selectedHashes", Prop(p, "selectedHashes").ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? Json(Array.Empty<string>()) : Prop(p, "selectedHashes"), version); PutValue(fields, "timestamp", version, version); return [Upsert(StorageEntity.PollVotes, Key(session, ("messageId", id), ("voterId", voter)), fields)];
    }
    private static IReadOnlyList<StorageOperation> ChatPatch(string session, string? chat, Dictionary<string, StorageFieldWrite> fields, double at) => chat is null || fields.Count == 0 || at == 0 ? [] : [Upsert(StorageEntity.Chats, Key(session, ("chatId", chat)), fields)];
    private static IReadOnlyList<StorageOperation> Contact(string session, JsonElement p, double at)
    {
        if (NonEmpty(Prop(p, "id")) is not { } id) return []; var fields = Fields(); foreach (var name in new[] { "phoneNumber", "bsuid", "username", "fullName", "firstName", "pushName", "businessName" }) PutText(fields, name, NonEmpty(Prop(p, name)), at); if (Bool(Prop(p, "pictureRemoved")) == true) PutValue<string?>(fields, "pictureId", null, at); else PutText(fields, "pictureId", NonEmpty(Prop(p, "pictureId")), at); return fields.Count == 0 ? [] : [Upsert(StorageEntity.Contacts, Key(session, ("contactId", id)), fields)];
    }
    private static IReadOnlyList<StorageOperation> Blocklist(string session, JsonElement p, double at)
    {
        var operations = new List<StorageOperation>(); foreach (var change in Items(Prop(p, "changes"))) { var action = Text(Prop(change, "action"))?.ToLowerInvariant(); if (NonEmpty(Prop(change, "id")) is not { } id || action is not ("block" or "unblock")) continue; var fields = Fields(); PutValue(fields, "blocked", action == "block", at); PutText(fields, "phoneNumber", NonEmpty(Prop(change, "phoneNumber")), at); operations.Add(Upsert(StorageEntity.Contacts, Key(session, ("contactId", id)), fields)); }
        return operations;
    }
    private static IReadOnlyList<StorageOperation> Group(string session, JsonElement p, double at)
    {
        if (NonEmpty(Prop(p, "id")) is not { } id) return []; var fields = Fields(); PutText(fields, "subject", NonEmpty(Prop(p, "newSubject")), at); Put(fields, "description", Prop(p, "newDescription"), at); PutText(fields, "lastAction", NonEmpty(Prop(p, "action")), at); PutText(fields, "inviteLink", NonEmpty(Prop(p, "inviteLink")), at); Put(fields, "joinApprovalRequired", Prop(p, "joinApprovalRequired"), at); var chat = Fields(); PutValue(chat, "kind", "group", 0); PutText(chat, "name", NonEmpty(Prop(p, "newSubject")), at); return [Upsert(StorageEntity.Groups, Key(session, ("groupId", id)), fields), Upsert(StorageEntity.Chats, Key(session, ("chatId", id)), chat)];
    }
    private static IReadOnlyList<StorageOperation> Participants(string session, JsonElement p, double at)
    {
        if (NonEmpty(Prop(p, "id")) is not { } id) return []; var operations = new List<StorageOperation> { Upsert(StorageEntity.Groups, Key(session, ("groupId", id)), Fields()) };
        foreach (var kind in new[] { "joined", "left", "promoted", "demoted" })
        {
            foreach (var person in Items(Prop(p, kind)))
            {
                if (NonEmpty(Prop(person, "id")) is not { } participant) continue; var fields = Fields(); if (kind == "joined") { PutValue(fields, "active", true, at); PutValue(fields, "role", "member", at); PutValue<string?>(fields, "leaveReason", null, at); } else if (kind == "left") { PutValue(fields, "active", false, at); PutValue(fields, "leaveReason", NonEmpty(Prop(p, "reason")) ?? "left", at); } else PutValue(fields, "role", kind == "promoted" ? "admin" : "member", at); PutText(fields, "phoneNumber", NonEmpty(Prop(person, "phoneNumber")), at); PutValue(fields, "changedAt", at, at); operations.Add(Upsert(StorageEntity.GroupParticipants, Key(session, ("groupId", id), ("participantId", participant)), fields));
            }
        }
        return operations;
    }
    private static IReadOnlyList<StorageOperation> Labels(string session, JsonElement p, double at)
    {
        var version = Millis(Finite(Prop(p, "observedAt"))) ?? at; var label = NonEmpty(Prop(p, "labelId")); var action = Text(Prop(p, "action")); var fields = Fields();
        if (action == "label_edit") { if (label is null) return []; PutText(fields, "name", NonEmpty(Prop(p, "name")) ?? NonEmpty(Prop(p, "label")), version); PutNumber(fields, "color", Finite(Prop(p, "color")), version); PutNumber(fields, "orderIndex", Finite(Prop(p, "orderIndex")), version); PutValue(fields, "deleted", Bool(Prop(p, "deleted")) ?? false, version); return [Upsert(StorageEntity.Labels, Key(session, ("labelId", label)), fields)]; }
        if (action is "label_association_chat" or "label_association_message") { var target = NonEmpty(action == "label_association_chat" ? Prop(Prop(p, "from"), "id") : Prop(p, "messageId")); if (label is null || target is null || Bool(Prop(p, "labeled")) is not { } labeled) return []; PutValue(fields, "labeled", labeled, version); PutValue(fields, "changedAt", version, version); return [Upsert(StorageEntity.LabelAssociations, Key(session, ("labelId", label), ("targetKind", action == "label_association_chat" ? "chat" : "message"), ("targetId", target)), fields)]; }
        if (action == "star" && NonEmpty(Prop(p, "messageId")) is { } message && Bool(Prop(p, "starred")) is { } starred) { PutValue(fields, "starred", starred, version); PutText(fields, "chatId", NonEmpty(Prop(Prop(p, "from"), "id")), 0); return [Upsert(StorageEntity.Messages, Key(session, ("messageId", message)), fields)]; }
        return [];
    }
}
