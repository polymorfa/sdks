using System.Collections.ObjectModel;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk.Storage;

[JsonConverter(typeof(StorageEntityConverter))]
public enum StorageEntity { Connections, Chats, Messages, Reactions, Receipts, PollVotes, Contacts, Groups, GroupParticipants, Media, Labels, LabelAssociations, HistoryChunks, HistoryProgress, Checkpoints, Events, Leases }
public enum StorageFieldType { String, Number, Boolean, Json }
public sealed record StorageIndex(string Name, IReadOnlyList<string> EqualFields, string Sort);
public sealed record StorageEntityDefinition(StorageEntity Entity, string Name, IReadOnlyList<string> Key, IReadOnlyDictionary<string, StorageFieldType> Fields, IReadOnlyList<StorageIndex> Indexes);
public static class StorageSchema
{
    public const int Version = 3;
    public const string SourceCommit = "d80b581c9df122411e9149a7e39a33700a51571c";
    private static IReadOnlyDictionary<StorageEntity, StorageEntityDefinition> Definitions { get; } = Create();
    public static StorageEntityDefinition Definition(StorageEntity entity) => Definitions.TryGetValue(entity, out var definition) ? definition : throw new StorageValidationException("Unknown storage entity.");
    private static IReadOnlyDictionary<StorageEntity, StorageEntityDefinition> Create()
    {
        var result = new Dictionary<StorageEntity, StorageEntityDefinition>();
        void Add(StorageEntity entity, string name, string keys, string strings = "", string numbers = "", string booleans = "", string json = "", StorageIndex? index = null)
        {
            var fields = new Dictionary<string, StorageFieldType>(StringComparer.Ordinal);
            foreach (var (names, type) in new[] { (strings, StorageFieldType.String), (numbers, StorageFieldType.Number), (booleans, StorageFieldType.Boolean), (json, StorageFieldType.Json) }) foreach (var field in names.Split(' ', StringSplitOptions.RemoveEmptyEntries)) fields.Add(field, type);
            result.Add(entity, new(entity, name, Array.AsReadOnly(keys.Split(' ')), new ReadOnlyDictionary<string, StorageFieldType>(fields), Array.AsReadOnly(index is null ? Array.Empty<StorageIndex>() : new[] { index })));
        }
        static StorageIndex Index(string name, string equal, string sort) => new(name, Array.AsReadOnly(equal.Split(' ')), sort);
        Add(StorageEntity.Connections, "connections", "connectionId", strings: "phoneNumber waId pushName phonePlatform accountType businessName status statusReason loggedOutReason", numbers: "loggedOutCode", booleans: "connected");
        Add(StorageEntity.Chats, "chats", "connectionId chatId", strings: "jid kind phoneNumber bsuid username name", numbers: "muteEndAt unreadCount ephemeralExpiration lastMessageAt clearedAt deletedAt", booleans: "archived pinned muted markedUnread readOnly", index: Index("by_activity", "connectionId", "lastMessageAt"));
        Add(StorageEntity.Messages, "messages", "connectionId messageId", strings: "chatId waMessageId cloudMessageId senderId senderJid pushName type text caption mimeType fileName displayName title quotedId status", numbers: "timestamp latitude longitude editedAt revokedAt deletedAt statusAt", booleans: "fromMe starred", json: "pollOptions extra", index: Index("by_chat", "connectionId chatId", "timestamp"));
        Add(StorageEntity.Reactions, "reactions", "connectionId messageId senderId", strings: "chatId emoji", numbers: "timestamp", index: Index("by_message", "connectionId messageId", "timestamp"));
        Add(StorageEntity.Receipts, "receipts", "connectionId messageId recipientId", strings: "chatId status", numbers: "timestamp", index: Index("by_message", "connectionId messageId", "timestamp"));
        Add(StorageEntity.PollVotes, "poll_votes", "connectionId messageId voterId", strings: "chatId", numbers: "timestamp", json: "selectedHashes", index: Index("by_message", "connectionId messageId", "timestamp"));
        Add(StorageEntity.Contacts, "contacts", "connectionId contactId", strings: "jid lidJid phoneNumber bsuid username fullName firstName pushName businessName pictureId", booleans: "blocked");
        Add(StorageEntity.Groups, "groups", "connectionId groupId", strings: "jid subject description createdBy inviteLink lastAction", numbers: "createdAt", booleans: "joinApprovalRequired");
        Add(StorageEntity.GroupParticipants, "group_participants", "connectionId groupId participantId", strings: "jid phoneNumber role leaveReason", numbers: "changedAt", booleans: "active", index: Index("by_group", "connectionId groupId", "changedAt"));
        Add(StorageEntity.Media, "media", "connectionId messageId", strings: "chatId kind mimeType fileName fileSha256 fileEncSha256 directPath mediaKey descriptor downloadUrl archiveLocation archiveContentType archiveSha256", numbers: "fileLength mediaKeyTimestamp archiveSize archivedAt");
        Add(StorageEntity.Labels, "labels", "connectionId labelId", strings: "name", numbers: "color orderIndex", booleans: "deleted");
        Add(StorageEntity.LabelAssociations, "label_associations", "connectionId labelId targetKind targetId", numbers: "changedAt", booleans: "labeled");
        Add(StorageEntity.HistoryChunks, "history_chunks", "connectionId syncType chunkOrder", numbers: "progress conversationCount messageCount pushnameCount");
        Add(StorageEntity.HistoryProgress, "history_progress", "connectionId syncType", numbers: "progress lastChunkOrder");
        Add(StorageEntity.Checkpoints, "checkpoints", "connectionId stream", strings: "cursor", numbers: "updatedAt", json: "position");
        Add(StorageEntity.Events, "events", "connectionId eventId", strings: "type");
        Add(StorageEntity.Leases, "leases", "connectionId", strings: "owner", numbers: "expiresAt");
        return new ReadOnlyDictionary<StorageEntity, StorageEntityDefinition>(result);
    }
    public static string EncodeKey(StorageEntity entity, IReadOnlyDictionary<string, string> key) => "k" + string.Join(':', Definition(entity).Key.Select(name => key.TryGetValue(name, out var value) && !string.IsNullOrEmpty(value) ? EncodeComponent(value) : throw new StorageValidationException("Missing storage key.")));
    private static string EncodeComponent(string value)
    {
        var output = new StringBuilder();
        foreach (var b in new UTF8Encoding(false, true).GetBytes(value)) { if (b is >= (byte)'a' and <= (byte)'z' or >= (byte)'A' and <= (byte)'Z' or >= (byte)'0' and <= (byte)'9' || "-_!~*'()".Contains((char)b)) output.Append((char)b); else output.Append('%').Append(b.ToString("X2", System.Globalization.CultureInfo.InvariantCulture)); }
        return output.ToString();
    }
    public static string ValidateNamespace(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 64 || !char.IsAsciiLetter(value[0]) || value.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('_' or '-'))) throw new StorageValidationException("Invalid customer-owned storage namespace."); return value;
    }
}
internal sealed class StorageEntityConverter : JsonConverter<StorageEntity>
{
    public override StorageEntity Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        var name = reader.GetString(); foreach (var entity in Enum.GetValues<StorageEntity>()) if (StorageSchema.Definition(entity).Name == name) return entity; throw new JsonException("Unknown storage entity.");
    }
    public override void Write(Utf8JsonWriter writer, StorageEntity value, JsonSerializerOptions options) => writer.WriteStringValue(StorageSchema.Definition(value).Name);
}
