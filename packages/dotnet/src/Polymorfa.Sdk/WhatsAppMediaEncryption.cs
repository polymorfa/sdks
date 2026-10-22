using System.Security.Cryptography;

namespace Polymorfa.Sdk;

public enum WhatsAppUploadMediaType { Image, Video, Audio, Ptt, Document, Sticker }
public sealed record WhatsAppMediaEncryptionOptions(WhatsAppUploadMediaType MediaType)
{
    public byte[]? MediaKey { get; init; }
    public string? Mimetype { get; init; }
    public long MaxBytes { get; init; } = 256 * 1024 * 1024;
    public CancellationToken CancellationToken { get; init; }
    public override string ToString() => "WhatsAppMediaEncryptionOptions(redacted)";
}
public sealed record EncryptedWhatsAppMediaInfo(WhatsAppUploadMediaType MediaType, byte[] MediaKey, byte[] FileSha256, byte[] FileEncSha256, long FileLength, long EncryptedLength, string? Mimetype)
{
    public override string ToString() => "EncryptedWhatsAppMediaInfo(redacted)";
}
public sealed record EncryptedWhatsAppMedia(EncryptedWhatsAppMediaInfo Info, byte[] Ciphertext)
{
    public override string ToString() => "EncryptedWhatsAppMedia(redacted)";
}
public static partial class WhatsAppMedia
{
    public static byte[] GenerateMediaKey() => RandomNumberGenerator.GetBytes(32);
    public static long EncryptedLength(long fileLength)
    {
        if (fileLength < 0 || fileLength > long.MaxValue - 26) throw new PolymorfaConfigurationException("Invalid media length.");
        return checked((fileLength / 16 + 1) * 16 + 10);
    }
    internal static string UploadKind(WhatsAppUploadMediaType kind) => kind switch { WhatsAppUploadMediaType.Image => "image", WhatsAppUploadMediaType.Video => "video", WhatsAppUploadMediaType.Audio => "audio", WhatsAppUploadMediaType.Ptt => "ptt", WhatsAppUploadMediaType.Document => "document", WhatsAppUploadMediaType.Sticker => "sticker", _ => throw new PolymorfaConfigurationException("Invalid upload media type.") };
    /// <summary>Encrypts incrementally into the caller's output; neither stream is closed. Keys and plaintext never enter an API request.</summary>
    public static async Task<EncryptedWhatsAppMediaInfo> EncryptAsync(Stream plaintext, Stream output, WhatsAppMediaEncryptionOptions options)
    {
        _ = UploadKind(options.MediaType);
        if (!plaintext.CanRead || !output.CanWrite || options.MaxBytes <= 0) throw new PolymorfaConfigurationException("Invalid media stream or maxBytes.");
        if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException();
        var key = options.MediaKey?.ToArray() ?? GenerateMediaKey();
        if (key.Length != 32) throw Invalid("mediaKey must contain 32 bytes.");
        var kind = options.MediaType == WhatsAppUploadMediaType.Ptt ? "audio" : UploadKind(options.MediaType);
        var keys = DeriveKeys(key, kind); using var plainHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256); using var cipherHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256); using var mac = IncrementalHash.CreateHMAC(HashAlgorithmName.SHA256, keys.MacKey);
        mac.AppendData(keys.Iv); using var aes = Aes.Create(); aes.Key = keys.CipherKey; aes.IV = keys.Iv; aes.Padding = PaddingMode.PKCS7; aes.Mode = CipherMode.CBC;
        using var digestOutput = new MediaDigestOutput(output, cipherHash, mac);
        await using var encrypted = new CryptoStream(digestOutput, aes.CreateEncryptor(), CryptoStreamMode.Write, leaveOpen: true);
        var buffer = new byte[65536]; long length = 0;
        try
        {
            while (true)
            {
                var count = await plaintext.ReadAsync(buffer, options.CancellationToken).ConfigureAwait(false); if (count == 0) break;
                if (length > options.MaxBytes - count) throw TooLarge(); length += count; plainHash.AppendData(buffer.AsSpan(0, count)); await encrypted.WriteAsync(buffer.AsMemory(0, count), options.CancellationToken).ConfigureAwait(false);
            }
            await encrypted.FlushFinalBlockAsync(options.CancellationToken).ConfigureAwait(false);
            var trailer = mac.GetHashAndReset()[..10]; cipherHash.AppendData(trailer); await output.WriteAsync(trailer, options.CancellationToken).ConfigureAwait(false);
            return new(options.MediaType, key, plainHash.GetHashAndReset(), cipherHash.GetHashAndReset(), length, EncryptedLength(length), options.Mimetype);
        }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
        catch (IOException) { throw new PolymorfaConnectionException("Cannot read or write encrypted media."); }
        finally { CryptographicOperations.ZeroMemory(buffer); CryptographicOperations.ZeroMemory(keys.CipherKey); CryptographicOperations.ZeroMemory(keys.MacKey); }
    }
    public static async Task<EncryptedWhatsAppMedia> EncryptAsync(ReadOnlyMemory<byte> plaintext, WhatsAppMediaEncryptionOptions options)
    {
        if (plaintext.Length > options.MaxBytes) throw TooLarge();
        using var source = new MemoryStream(plaintext.ToArray(), writable: false); using var output = new MemoryStream(); var info = await EncryptAsync(source, output, options).ConfigureAwait(false); return new(info, output.ToArray());
    }
    private sealed class MediaDigestOutput(Stream output, IncrementalHash digest, IncrementalHash mac) : Stream
    {
        public override bool CanRead => false; public override bool CanSeek => false; public override bool CanWrite => true; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => output.Flush(); public override Task FlushAsync(CancellationToken cancellationToken) => output.FlushAsync(cancellationToken);
        public override void Write(byte[] buffer, int offset, int count) => Write(buffer.AsSpan(offset, count));
        public override void Write(ReadOnlySpan<byte> buffer) { digest.AppendData(buffer); mac.AppendData(buffer); output.Write(buffer); }
        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) { digest.AppendData(buffer.Span); mac.AppendData(buffer.Span); await output.WriteAsync(buffer, cancellationToken).ConfigureAwait(false); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException();
    }
}
