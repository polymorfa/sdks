using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk.Storage;

/// <summary>A protobuf integer represented as a JSON number or numeric string.</summary>
[JsonConverter(typeof(StorageHistoryNumberConverter))]
public readonly record struct StorageHistoryNumber
{
    private readonly string? text;
    private readonly double? number;
    public StorageHistoryNumber(double value) { number = value; text = null; }
    public StorageHistoryNumber(string value) { text = value; number = null; }
    public double? ToNumber()
    {
        if (number is { } native) return double.IsFinite(native) ? native : null;
        if (text is null) return null;
        var source = text.Trim('\u0009', '\u000a', '\u000b', '\u000c', '\u000d', '\u0020', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'); if (source.Length == 0) return 0;
        if (source.Length > 2 && source[0] == '0' && source[1] is 'x' or 'X' or 'b' or 'B' or 'o' or 'O')
        {
            var radix = source[1] is 'x' or 'X' ? 16 : source[1] is 'b' or 'B' ? 2 : 8; var integer = BigInteger.Zero;
            foreach (var character in source.AsSpan(2)) { var digit = character is >= '0' and <= '9' ? character - '0' : character is >= 'a' and <= 'f' ? character - 'a' + 10 : character is >= 'A' and <= 'F' ? character - 'A' + 10 : -1; if (digit < 0 || digit >= radix) return null; integer = integer * radix + digit; }
            return double.TryParse(integer.ToString(CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out var converted) && double.IsFinite(converted) ? converted : null;
        }
        if (!System.Text.RegularExpressions.Regex.IsMatch(source, @"\A[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\z", System.Text.RegularExpressions.RegexOptions.CultureInvariant)) return null;
        return double.TryParse(source, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) && double.IsFinite(parsed) ? parsed : null;
    }
    internal object? WireValue => text is not null ? text : number;
    public static implicit operator StorageHistoryNumber(int value) => new(value);
    public static implicit operator StorageHistoryNumber(uint value) => new(value);
    public static implicit operator StorageHistoryNumber(double value) => new(value);
    public static implicit operator StorageHistoryNumber(long value) => new(value);
    public static implicit operator StorageHistoryNumber(ulong value) => new(value);
    public static implicit operator StorageHistoryNumber(string value) => new(value);
    public static implicit operator StorageHistoryNumber(BigInteger value) => new(value.ToString(CultureInfo.InvariantCulture));
}
internal sealed class StorageHistoryNumberConverter : JsonConverter<StorageHistoryNumber>
{
    public override StorageHistoryNumber Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) => reader.TokenType switch { JsonTokenType.Number => new(reader.GetDouble()), JsonTokenType.String => new(reader.GetString()!), _ => throw new JsonException("A history integer must be a number or decimal string.") };
    public override void Write(Utf8JsonWriter writer, StorageHistoryNumber value, JsonSerializerOptions options) => JsonSerializer.Serialize(writer, value.WireValue, options);
}
/// <summary>A protobuf enum's numeric value or symbolic name.</summary>
[JsonConverter(typeof(StorageHistoryEnumConverter))]
public readonly record struct StorageHistoryEnum
{
    internal JsonElement Value { get; }
    public StorageHistoryEnum(int number) => Value = JsonSerializer.SerializeToElement(number);
    public StorageHistoryEnum(string name) => Value = JsonSerializer.SerializeToElement(name);
    internal StorageHistoryEnum(JsonElement value) => Value = value.Clone();
    public static implicit operator StorageHistoryEnum(int value) => new(value);
    public static implicit operator StorageHistoryEnum(string value) => new(value);
}
internal sealed class StorageHistoryEnumConverter : JsonConverter<StorageHistoryEnum>
{
    public override StorageHistoryEnum Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) { using var doc = JsonDocument.ParseValue(ref reader); if (doc.RootElement.ValueKind is not (JsonValueKind.Number or JsonValueKind.String)) throw new JsonException("A history enum must be a number or name."); return new(doc.RootElement); }
    public override void Write(Utf8JsonWriter writer, StorageHistoryEnum value, JsonSerializerOptions options) { if (value.Value.ValueKind == JsonValueKind.Undefined) writer.WriteNullValue(); else value.Value.WriteTo(writer); }
}
/// <summary>Protobuf bytes. A supplied base64 string is preserved; byte input is copied.</summary>
[JsonConverter(typeof(StorageHistoryBytesConverter))]
public sealed record StorageHistoryBytes
{
    public string Base64 { get; }
    public StorageHistoryBytes(string base64) => Base64 = base64;
    public StorageHistoryBytes(ReadOnlySpan<byte> bytes) => Base64 = Convert.ToBase64String(bytes);
    public static implicit operator StorageHistoryBytes(string value) => new(value);
    public static implicit operator StorageHistoryBytes(byte[] value) => new(value.AsSpan());
    public override string ToString() => "StorageHistoryBytes(redacted)";
}
internal sealed class StorageHistoryBytesConverter : JsonConverter<StorageHistoryBytes>
{
    public override StorageHistoryBytes Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String) return new(reader.GetString()!);
        if (reader.TokenType != JsonTokenType.StartArray) throw new JsonException("History bytes must be base64 text or a byte array.");
        var bytes = new List<byte>(); while (reader.Read()) { if (reader.TokenType == JsonTokenType.EndArray) return new(bytes.ToArray().AsSpan()); if (reader.TokenType != JsonTokenType.Number || !reader.TryGetByte(out var value)) throw new JsonException("Invalid history byte array."); bytes.Add(value); }
        throw new JsonException("Incomplete history byte array.");
    }
    public override void Write(Utf8JsonWriter writer, StorageHistoryBytes value, JsonSerializerOptions options) => writer.WriteStringValue(value.Base64);
}
public sealed record StorageHistoryMessageKey(string? RemoteJid = null, bool? FromMe = null, string? Id = null, string? Participant = null);
public sealed record StorageHistoryContext(string? StanzaId = null, string? Participant = null);
public sealed record StorageHistoryMedia
{
    public string? Url { get; init; }
    public string? Mimetype { get; init; }
    public string? Caption { get; init; }
    public StorageHistoryBytes? FileSha256 { get; init; }
    public StorageHistoryNumber? FileLength { get; init; }
    public StorageHistoryBytes? MediaKey { get; init; }
    public StorageHistoryBytes? FileEncSha256 { get; init; }
    public string? DirectPath { get; init; }
    public StorageHistoryNumber? MediaKeyTimestamp { get; init; }
    public string? FileName { get; init; }
    public string? Title { get; init; }
    public bool? Ptt { get; init; }
    public StorageHistoryContext? ContextInfo { get; init; }
    public override string ToString() => "StorageHistoryMedia(redacted)";
}
public sealed record StorageHistoryExtendedText(string? Text = null, StorageHistoryContext? ContextInfo = null);
public sealed record StorageHistoryLocation(double? DegreesLatitude = null, double? DegreesLongitude = null, string? Name = null, StorageHistoryContext? ContextInfo = null);
public sealed record StorageHistoryContact(string? DisplayName = null, StorageHistoryContext? ContextInfo = null);
public sealed record StorageHistoryPollOption(string? OptionName = null);
public sealed record StorageHistoryPoll(string? Name = null, IReadOnlyList<StorageHistoryPollOption>? Options = null, StorageHistoryContext? ContextInfo = null);
public sealed record StorageHistoryReaction(StorageHistoryMessageKey? Key = null, string? Text = null, StorageHistoryNumber? SenderTimestampMs = null);
public sealed record StorageHistoryProtocol(StorageHistoryMessageKey? Key = null, StorageHistoryEnum? Type = null, StorageHistoryContent? EditedMessage = null, StorageHistoryNumber? TimestampMs = null);
public sealed record StorageHistoryWrapper(StorageHistoryContent? Message = null);
/// <summary>Fields consumed by the storage reducer from a fully decoded waE2E.Message.</summary>
public sealed record StorageHistoryContent
{
    public string? Conversation { get; init; }
    public StorageHistoryExtendedText? ExtendedTextMessage { get; init; }
    public StorageHistoryMedia? ImageMessage { get; init; }
    public StorageHistoryMedia? VideoMessage { get; init; }
    public StorageHistoryMedia? PtvMessage { get; init; }
    public StorageHistoryMedia? AudioMessage { get; init; }
    public StorageHistoryMedia? DocumentMessage { get; init; }
    public StorageHistoryMedia? StickerMessage { get; init; }
    public StorageHistoryLocation? LocationMessage { get; init; }
    public StorageHistoryContact? ContactMessage { get; init; }
    public StorageHistoryPoll? PollCreationMessage { get; init; }
    public StorageHistoryPoll? PollCreationMessageV2 { get; init; }
    public StorageHistoryPoll? PollCreationMessageV3 { get; init; }
    public StorageHistoryReaction? ReactionMessage { get; init; }
    public StorageHistoryProtocol? ProtocolMessage { get; init; }
    public StorageHistoryWrapper? EphemeralMessage { get; init; }
    public StorageHistoryWrapper? ViewOnceMessage { get; init; }
    public StorageHistoryWrapper? ViewOnceMessageV2 { get; init; }
    public StorageHistoryWrapper? DocumentWithCaptionMessage { get; init; }
    public StorageHistoryWrapper? EditedMessage { get; init; }
    public override string ToString() => "StorageHistoryContent(redacted)";
}
public sealed record StorageHistoryReceipt(string? UserJid = null, StorageHistoryNumber? ReceiptTimestamp = null, StorageHistoryNumber? ReadTimestamp = null, StorageHistoryNumber? PlayedTimestamp = null);
/// <summary>Fields consumed by the reducer from a fully decoded waWeb.WebMessageInfo.</summary>
public sealed record StorageWebMessageInfo
{
    public StorageHistoryMessageKey? Key { get; init; }
    public StorageHistoryContent? Message { get; init; }
    public StorageHistoryNumber? MessageTimestamp { get; init; }
    public StorageHistoryEnum? Status { get; init; }
    public string? Participant { get; init; }
    public string? PushName { get; init; }
    public bool? Starred { get; init; }
    public StorageHistoryEnum? MessageStubType { get; init; }
    public StorageHistoryNumber? RevokeMessageTimestamp { get; init; }
    public IReadOnlyList<StorageHistoryReceipt>? UserReceipt { get; init; }
    public IReadOnlyList<StorageHistoryReaction>? Reactions { get; init; }
    public override string ToString() => "StorageWebMessageInfo(redacted)";
}
public sealed record StorageHistoryMessageEntry(StorageWebMessageInfo? Message = null, StorageHistoryNumber? MsgOrderId = null);
public sealed record StorageHistoryParticipant(string? UserJid = null, StorageHistoryEnum? Rank = null);
public sealed record StorageHistoryConversation
{
    public string? Id { get; init; }
    public IReadOnlyList<StorageHistoryMessageEntry>? Messages { get; init; }
    public string? NewJid { get; init; }
    public StorageHistoryNumber? LastMsgTimestamp { get; init; }
    public double? UnreadCount { get; init; }
    public bool? ReadOnly { get; init; }
    public double? EphemeralExpiration { get; init; }
    public StorageHistoryNumber? ConversationTimestamp { get; init; }
    public string? Name { get; init; }
    public string? DisplayName { get; init; }
    public bool? Archived { get; init; }
    public bool? MarkedAsUnread { get; init; }
    public IReadOnlyList<StorageHistoryParticipant>? Participant { get; init; }
    public StorageHistoryNumber? Pinned { get; init; }
    public StorageHistoryNumber? MuteEndTime { get; init; }
    public StorageHistoryNumber? CreatedAt { get; init; }
    public string? CreatedBy { get; init; }
    public string? Description { get; init; }
    public string? PnJid { get; init; }
    public string? LidJid { get; init; }
    public string? Username { get; init; }
    public override string ToString() => "StorageHistoryConversation(redacted)";
}
public sealed record StorageHistoryPushname(string? Id = null, string? Pushname = null);
public sealed record StorageHistoryPastParticipant(string? UserJid = null, StorageHistoryEnum? LeaveReason = null, StorageHistoryNumber? LeaveTs = null);
public sealed record StorageHistoryPastParticipants(string? GroupJid = null, IReadOnlyList<StorageHistoryPastParticipant>? PastParticipants = null);
public sealed record StorageHistoryPhoneMapping(string? PnJid = null, string? LidJid = null);
/// <summary>A fully decoded history chunk. Supply a full-schema decoder; the HTTP history reader preserves raw protobuf but decodes only its documented subset.</summary>
public sealed record StorageHistoryChunk
{
    public StorageHistoryEnum? SyncType { get; init; }
    public IReadOnlyList<StorageHistoryConversation>? Conversations { get; init; }
    public IReadOnlyList<StorageWebMessageInfo>? StatusV3Messages { get; init; }
    public StorageHistoryNumber? ChunkOrder { get; init; }
    public StorageHistoryNumber? Progress { get; init; }
    public IReadOnlyList<StorageHistoryPushname>? Pushnames { get; init; }
    public IReadOnlyList<StorageHistoryPastParticipants>? PastParticipants { get; init; }
    public IReadOnlyList<StorageHistoryPhoneMapping>? PhoneNumberToLidMappings { get; init; }
    public static StorageHistoryChunk FromJson(JsonElement value) => value.Deserialize<StorageHistoryChunk>(HttpTransport.Json) ?? throw new JsonException("Invalid history chunk.");
    public override string ToString() => "StorageHistoryChunk(redacted)";
}
public sealed record StorageHistoryMessageIdentity(string NativeId, string Id, string ChatId, bool? FromMe = null);
public sealed record StorageHistoryIdentityIndex(IReadOnlyDictionary<string, string>? Conversations = null, IReadOnlyDictionary<string, string>? Contacts = null, IReadOnlyList<StorageHistoryMessageIdentity>? Messages = null);
public sealed record StorageHistoryInput(string SessionId, StorageHistoryChunk Chunk, StorageHistoryIdentityIndex? Identities = null, string? ChunkId = null);
