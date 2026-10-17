using System.Security.Cryptography;
using System.Text;

namespace Polymorfa.Sdk;

/// <summary>Exact wire fields remain available, including unknown fields and full-width unsigned integers.</summary>
public sealed record HistoryProtoField(uint Number, int WireType, byte[] Encoded, ulong? Varint, byte[]? Bytes)
{
    public override string ToString() => "HistoryProtoField(redacted)";
}
public sealed record HistoryProtoMessage(byte[] Encoded, IReadOnlyList<HistoryProtoField> Fields)
{
    public override string ToString() => "HistoryProtoMessage(redacted)";
    public ulong? UInt64(uint number) => Fields.LastOrDefault(f => f.Number == number && f.WireType == 0)?.Varint;
    public byte[]? Bytes(uint number) => Fields.LastOrDefault(f => f.Number == number && f.WireType == 2)?.Bytes;
    public string? Text(uint number)
    {
        var bytes = Bytes(number); if (bytes is null) return null;
        try { return new UTF8Encoding(false, true).GetString(bytes); } catch (DecoderFallbackException) { throw HistoryChunks.Invalid(); }
    }
    public IReadOnlyList<HistoryProtoMessage> Messages(uint number) => Fields.Where(f => f.Number == number && f.WireType == 2).Select(f => Decode(f.Bytes!)).ToArray();
    public static HistoryProtoMessage Decode(ReadOnlySpan<byte> encoded)
    {
        var source = encoded.ToArray(); var offset = 0; var fields = new List<HistoryProtoField>();
        ulong Varint()
        {
            ulong value = 0;
            for (var shift = 0; shift < 70; shift += 7) { if (offset == source.Length) throw HistoryChunks.Invalid(); var b = source[offset++]; if (shift == 63 && b > 1) throw HistoryChunks.Invalid(); value |= (ulong)(b & 127) << shift; if ((b & 128) == 0) return value; }
            throw HistoryChunks.Invalid();
        }
        byte[] Take(ulong size) { if (size > (ulong)(source.Length - offset)) throw HistoryChunks.Invalid(); var value = source.AsSpan(offset, (int)size).ToArray(); offset += (int)size; return value; }
        void SkipGroup(ulong number, int depth)
        {
            if (depth >= 64) throw HistoryChunks.Invalid();
            while (true) { var tag = Varint(); var field = tag >> 3; if (field == 0 || field >= 1 << 29) throw HistoryChunks.Invalid(); switch (tag & 7) { case 0: _ = Varint(); break; case 1: _ = Take(8); break; case 2: _ = Take(Varint()); break; case 3: SkipGroup(field, depth + 1); break; case 4: if (field != number) throw HistoryChunks.Invalid(); return; case 5: _ = Take(4); break; default: throw HistoryChunks.Invalid(); } }
        }
        while (offset < source.Length)
        {
            var start = offset; var tag = Varint(); var number = tag >> 3; var wire = (int)(tag & 7);
            if (number == 0 || number >= 1 << 29) throw HistoryChunks.Invalid();
            ulong? value = null; byte[]? bytes = null;
            switch (wire) { case 0: value = Varint(); break; case 1: bytes = Take(8); break; case 2: bytes = Take(Varint()); break; case 5: bytes = Take(4); break; case 3: SkipGroup(number, 0); break; default: throw HistoryChunks.Invalid(); }
            fields.Add(new((uint)number, wire, source.AsSpan(start, offset - start).ToArray(), value, bytes));
        }
        return new(source, fields);
    }
}
public sealed record HistoryChunkConversation(string Id, string? Name, ulong? LastMessageTimestamp, ulong? UnreadCount, IReadOnlyList<HistoryProtoMessage> Messages, HistoryProtoMessage Proto)
{
    public override string ToString() => "HistoryChunkConversation(redacted)";
}
public sealed record HistoryPushname(string? Id, string? Pushname, HistoryProtoMessage Proto)
{
    public override string ToString() => "HistoryPushname(redacted)";
}
/// <summary>Common typed fields and the original full protobuf. Use DecodeWith for your application's complete schema.</summary>
public sealed record HistoryChunk(ulong SyncType, ulong? ChunkOrder, ulong? Progress, IReadOnlyList<HistoryChunkConversation> Conversations, IReadOnlyList<HistoryProtoMessage> StatusV3Messages, IReadOnlyList<HistoryPushname> Pushnames, HistoryProtoMessage Proto)
{
    public T DecodeWith<T>(Func<ReadOnlyMemory<byte>, T> decoder) => decoder(Proto.Encoded);
    public override string ToString() => "HistoryChunk(redacted)";
    internal static HistoryChunk FromProto(HistoryProtoMessage proto) => new(proto.UInt64(1) ?? 0, proto.UInt64(5), proto.UInt64(6), proto.Messages(2).Select(p => new HistoryChunkConversation(p.Text(1) ?? "", p.Text(13), p.UInt64(5), p.UInt64(6), p.Messages(2), p)).ToArray(), proto.Messages(3), proto.Messages(7).Select(p => new HistoryPushname(p.Text(1), p.Text(2), p)).ToArray(), proto);
}
public abstract record HistoryChunkInput;
public sealed record HistoryInlinePayload(byte[] InlinePayload) : HistoryChunkInput
{
    public override string ToString() => "HistoryInlinePayload(redacted)";
}
public sealed record HistoryChunkDescriptor(string DirectPath, byte[] MediaKey, byte[] FileSha256, byte[] FileEncSha256, long? FileLength = null) : HistoryChunkInput
{
    public override string ToString() => "HistoryChunkDescriptor(redacted)";
}
public sealed record HistoryChunkOptions
{
    public WhatsAppMediaOptions Media { get; init; } = new();
    public long MaxInflatedBytes { get; init; } = 512 * 1024 * 1024;
}
/// <summary>History is verified before inflation and protobuf parsing. No Polymorfa credential enters CDN requests.</summary>
public static class HistoryChunks
{
    internal static PolymorfaMediaIntegrityException Invalid() => WhatsAppMedia.Integrity("Invalid compressed history or protobuf payload.", "media_invalid_ciphertext");
    public static async Task<HistoryChunk> DecodeAsync(ReadOnlyMemory<byte> compressed, long maxInflatedBytes = 512 * 1024 * 1024, CancellationToken cancellationToken = default)
    {
        if (maxInflatedBytes <= 0 || maxInflatedBytes > int.MaxValue) throw new PolymorfaConfigurationException("maxInflatedBytes must be a positive supported size.");
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (compressed.IsEmpty) throw Invalid();
            // Own one snapshot before the first await. Neither pass reads caller memory again.
            var snapshot = compressed.ToArray();
            var plaintext = await StrictHistoryCompression.DecodeAsync(snapshot, maxInflatedBytes, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested(); return HistoryChunk.FromProto(HistoryProtoMessage.Decode(plaintext));
        }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
        catch (InvalidDataException) { throw Invalid(); }
        catch (IOException) { throw Invalid(); }
    }
    public static async Task<HistoryChunk> DownloadAsync(HistoryChunkInput input, HistoryChunkOptions? options = null)
    {
        options ??= new(); if (options.Media.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); if (options.Media.MaxBytes <= 0) throw new PolymorfaConfigurationException("maxBytes must be positive.");
        byte[] compressed;
        if (input is HistoryInlinePayload inline) { if (inline.InlinePayload.LongLength > options.Media.MaxBytes) throw WhatsAppMedia.TooLarge(); compressed = inline.InlinePayload; }
        else if (input is HistoryChunkDescriptor descriptor)
        {
            var media = new WhatsAppMediaDescriptor("document", WhatsAppMedia.Hash(descriptor.MediaKey, "mediaKey"), DirectPath: descriptor.DirectPath, FileSha256: WhatsAppMedia.Hash(descriptor.FileSha256, "fileSha256"), FileEncSha256: WhatsAppMedia.Hash(descriptor.FileEncSha256, "fileEncSha256"), FileLength: descriptor.FileLength);
            var expanded = HKDF.DeriveKey(HashAlgorithmName.SHA256, media.MediaKey, 112, info: "WhatsApp History Keys"u8.ToArray()); var keys = new WhatsAppMediaKeys(expanded[..16], expanded[16..48], expanded[48..80]); var config = options.Media with { Verify = MediaVerifyMode.BeforeRelease };
            compressed = await WhatsAppMedia.ReadDownloadAsync(media, config, body => WhatsAppMedia.DecryptAsync(body, keys, media.FileSha256, media.FileEncSha256, config, media.FileLength), "md-msg-hist").ConfigureAwait(false);
        }
        else throw WhatsAppMedia.Invalid("Invalid history input.");
        return await DecodeAsync(compressed, options.MaxInflatedBytes, options.Media.CancellationToken).ConfigureAwait(false);
    }
}
