using System.Security.Cryptography;
using System.Text;

namespace Polymorfa.Sdk;

public sealed class PolymorfaMediaIntegrityException(string message, string code) : PolymorfaException(message, code);
public sealed record WhatsAppMediaDescriptor(string MediaKind, byte[] MediaKey, string? Url = null, string? DirectPath = null, byte[]? FileSha256 = null, byte[]? FileEncSha256 = null, long? FileLength = null, string? Mimetype = null, string? FileName = null)
{
    public override string ToString() => $"WhatsAppMediaDescriptor(kind={MediaKind}, length={FileLength}, descriptor=redacted)";
}
public sealed record WhatsAppMediaKeys(byte[] Iv, byte[] CipherKey, byte[] MacKey) { public override string ToString() => "WhatsAppMediaKeys(redacted)"; }
public sealed record WhatsAppMediaOptions
{
    public long MaxBytes { get; init; } = 256 * 1024 * 1024;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    public CancellationToken CancellationToken { get; init; }
}
public sealed record WhatsAppMediaDownload(byte[] Bytes, string MediaKind, string Mimetype, string? FileName, long? FileLength)
{
    public Stream OpenRead() => new MemoryStream(Bytes, writable: false);
    public override string ToString() => $"WhatsAppMediaDownload(kind={MediaKind}, bytes={Bytes.Length})";
}

/// <summary>Existing Linked Devices media format. Verifies all available integrity checks before releasing plaintext.</summary>
public static class WhatsAppMedia
{
    private sealed record Fields(int Url, int Mime, int Hash, int Length, int Key, int EncryptedHash, int Path, int Name = -1);
    private static Fields FieldMap(string kind) => kind switch
    {
        "image" => new(1, 2, 4, 5, 8, 9, 11),
        "video" => new(1, 2, 3, 4, 6, 11, 13),
        "audio" => new(1, 2, 3, 4, 7, 8, 9),
        "document" => new(1, 2, 4, 5, 7, 9, 10, 8),
        "sticker" => new(1, 5, 2, 9, 4, 3, 8),
        _ => throw Invalid("This message kind carries no supported attachment.")
    };
    private static string Info(string kind) => kind switch { "image" or "sticker" => "WhatsApp Image Keys", "video" => "WhatsApp Video Keys", "audio" => "WhatsApp Audio Keys", "document" => "WhatsApp Document Keys", _ => throw Invalid("Invalid media kind.") };
    public static WhatsAppMediaDescriptor Decode(string base64, string messageType)
    {
        var fields = FieldMap(messageType);
        if (string.IsNullOrEmpty(base64) || base64.Length > 1024 * 1024 || base64.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('+' or '/' or '-' or '_' or '='))) throw Invalid("Invalid base64 media descriptor.");
        byte[] bytes;
        try { var normalized = base64.Replace('-', '+').Replace('_', '/'); bytes = Convert.FromBase64String(normalized.PadRight((normalized.Length + 3) / 4 * 4, '=')); }
        catch (FormatException) { throw Invalid("Invalid base64 media descriptor."); }
        var reader = new ProtoReader(bytes);
        string? url = null, path = null, mime = null, name = null;
        byte[]? key = null, hash = null, encHash = null;
        long? length = null;
        while (!reader.Done)
        {
            var tag = reader.Varint(); var field = tag / 8; var wire = (int)(tag % 8);
            if (field == 0) throw Invalid("Descriptor field number cannot be zero.");
            if (field == (ulong)fields.Length && wire == 0) { var value = reader.Varint(); if (value > 9_007_199_254_740_991) throw Invalid("Media length is out of range."); length = (long)value; continue; }
            if (wire != 2) { reader.Skip(wire); continue; }
            var valueBytes = reader.Bytes();
            if (field == (ulong)fields.Url) url = Text(valueBytes, 8192);
            else if (field == (ulong)fields.Path) path = Text(valueBytes, 8192);
            else if (field == (ulong)fields.Mime) mime = Text(valueBytes, 255);
            else if (fields.Name >= 0 && field == (ulong)fields.Name) name = Text(valueBytes, 4096);
            else if (field == (ulong)fields.Key) key = Hash(valueBytes, "mediaKey");
            else if (field == (ulong)fields.Hash) hash = Hash(valueBytes, "fileSha256");
            else if (field == (ulong)fields.EncryptedHash) encHash = Hash(valueBytes, "fileEncSha256");
        }
        return new(messageType, key ?? throw Invalid("Descriptor has no mediaKey."), url, path, hash, encHash, length, mime, name);
    }
    public static WhatsAppMediaKeys DeriveKeys(ReadOnlySpan<byte> mediaKey, string mediaKind)
    {
        if (mediaKey.Length != 32) throw Invalid("mediaKey must contain 32 bytes.");
        var expanded = HKDF.DeriveKey(HashAlgorithmName.SHA256, mediaKey.ToArray(), 112, info: Encoding.UTF8.GetBytes(Info(mediaKind)));
        try { return new(expanded[..16], expanded[16..48], expanded[48..80]); }
        finally { CryptographicOperations.ZeroMemory(expanded); }
    }
    public static byte[] Decrypt(ReadOnlySpan<byte> encrypted, WhatsAppMediaKeys keys, byte[]? fileSha256 = null, byte[]? fileEncSha256 = null, long maxBytes = 256 * 1024 * 1024, long? fileLength = null)
    {
        var limit = EncryptedLimit(maxBytes, fileLength);
        if (encrypted.Length > limit) throw TooLarge();
        if (encrypted.Length <= 10) throw Integrity("Encrypted media is too short.", "media_too_short");
        if (keys.Iv.Length != 16 || keys.CipherKey.Length != 32 || keys.MacKey.Length != 32) throw Invalid("Invalid derived media keys.");
        if (fileEncSha256 is not null && !CryptographicOperations.FixedTimeEquals(SHA256.HashData(encrypted), Hash(fileEncSha256, "fileEncSha256"))) throw Integrity("Encrypted media hash mismatch.", "media_enc_hash_mismatch");
        var ciphertext = encrypted[..^10];
        var signed = new byte[keys.Iv.Length + ciphertext.Length]; keys.Iv.CopyTo(signed, 0); ciphertext.CopyTo(signed.AsSpan(16));
        var actual = HMACSHA256.HashData(keys.MacKey, signed);
        CryptographicOperations.ZeroMemory(signed);
        if (!CryptographicOperations.FixedTimeEquals(actual.AsSpan(0, 10), encrypted[^10..])) throw Integrity("Media MAC mismatch.", "media_mac_mismatch");
        if (ciphertext.Length == 0 || ciphertext.Length % 16 != 0) throw Integrity("Ciphertext must contain complete AES blocks.", "media_invalid_ciphertext");
        byte[] plaintext;
        using var aes = Aes.Create(); aes.Key = keys.CipherKey;
        try { plaintext = aes.DecryptCbc(ciphertext, keys.Iv, PaddingMode.PKCS7); }
        catch (CryptographicException) { throw Integrity("Invalid media padding.", "media_invalid_padding"); }
        if (plaintext.Length > maxBytes) { CryptographicOperations.ZeroMemory(plaintext); throw TooLarge(); }
        if (fileSha256 is not null && !CryptographicOperations.FixedTimeEquals(SHA256.HashData(plaintext), Hash(fileSha256, "fileSha256"))) { CryptographicOperations.ZeroMemory(plaintext); throw Integrity("Plaintext media hash mismatch.", "media_hash_mismatch"); }
        return plaintext;
    }
    public static async Task<byte[]> DecryptAsync(Stream encrypted, WhatsAppMediaKeys keys, byte[]? fileSha256 = null, byte[]? fileEncSha256 = null, WhatsAppMediaOptions? options = null, long? fileLength = null)
    {
        options ??= new(); var bytes = await ReadBoundedAsync(encrypted, EncryptedLimit(options.MaxBytes, fileLength), options.CancellationToken).ConfigureAwait(false);
        return Decrypt(bytes, keys, fileSha256, fileEncSha256, options.MaxBytes, fileLength);
    }
    public static bool IsMediaUrl(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo.Length == 0 && (uri.Host.Equals("whatsapp.net", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".whatsapp.net", StringComparison.OrdinalIgnoreCase));
    public static async Task<WhatsAppMediaDownload> DownloadAsync(string descriptor, string messageType, WhatsAppMediaOptions? options = null) => await DownloadAsync(Decode(descriptor, messageType), options).ConfigureAwait(false);
    public static async Task<WhatsAppMediaDownload> DownloadAsync(WhatsAppMediaDescriptor descriptor, WhatsAppMediaOptions? options = null)
    {
        options ??= new(); var limit = EncryptedLimit(options.MaxBytes, descriptor.FileLength);
        if (descriptor.FileSha256 is null) throw Invalid("Descriptor requires a plaintext SHA-256 hash.");
        var urls = CandidateUrls(descriptor);
        using var client = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = Timeout.InfiniteTimeSpan };
        PolymorfaException? lastFailure = null;
        foreach (var candidate in urls)
        {
            var url = candidate;
            for (var hop = 0; hop <= 3; hop++)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.TryAddWithoutValidation("origin", "https://web.whatsapp.com"); request.Headers.Referrer = new("https://web.whatsapp.com/");
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); linked.CancelAfter(options.Timeout);
                HttpResponseMessage response;
                try { response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("WhatsApp media headers timed out."); }
                catch (HttpRequestException) { lastFailure = new PolymorfaConnectionException("Cannot reach the WhatsApp media host."); break; }
                using (response)
                {
                    if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308)
                    {
                        var location = response.Headers.Location; var next = location is null ? null : location.IsAbsoluteUri ? location : new Uri(url, location);
                        if (next is null || !IsMediaUrl(next.AbsoluteUri)) throw Invalid("Media redirect left WhatsApp media hosts.");
                        if (hop == 3) throw new PolymorfaConnectionException("Too many media redirects."); url = next; continue;
                    }
                    if (!response.IsSuccessStatusCode) { lastFailure = new PolymorfaException($"WhatsApp media returned HTTP {(int)response.StatusCode}.", "media_download_failed"); break; }
                    if (response.Content.Headers.ContentLength > limit) throw TooLarge();
                    await using var body = await response.Content.ReadAsStreamAsync(options.CancellationToken).ConfigureAwait(false);
                    var plaintext = await DecryptAsync(body, DeriveKeys(descriptor.MediaKey, descriptor.MediaKind), descriptor.FileSha256, descriptor.FileEncSha256, options, descriptor.FileLength).ConfigureAwait(false);
                    var mime = descriptor.Mimetype ?? descriptor.MediaKind switch { "image" => "image/jpeg", "video" => "video/mp4", "audio" => "audio/ogg", "sticker" => "image/webp", _ => "application/octet-stream" };
                    return new(plaintext, descriptor.MediaKind, mime, descriptor.FileName, descriptor.FileLength);
                }
            }
        }
        throw lastFailure ?? new PolymorfaConnectionException("Media download failed.");
    }
    private static IReadOnlyList<Uri> CandidateUrls(WhatsAppMediaDescriptor descriptor)
    {
        _ = FieldMap(descriptor.MediaKind); var urls = new List<Uri>();
        if (!string.IsNullOrEmpty(descriptor.Url)) { if (!IsMediaUrl(descriptor.Url)) throw Invalid("Media URL must name an HTTPS WhatsApp media host."); urls.Add(new(descriptor.Url)); }
        if (!string.IsNullOrEmpty(descriptor.DirectPath))
        {
            var path = descriptor.DirectPath;
            if (!path.StartsWith('/') || path.StartsWith("//", StringComparison.Ordinal)) throw Invalid("directPath must start with one slash.");
            var hash = descriptor.FileEncSha256 is null ? "" : Convert.ToBase64String(descriptor.FileEncSha256).Replace('+', '-').Replace('/', '_');
            var fallback = $"https://mmg.whatsapp.net{path}{(path.Contains('?') ? '&' : '?')}hash={Uri.EscapeDataString(hash)}&mms-type={(descriptor.MediaKind == "sticker" ? "image" : descriptor.MediaKind)}&__wa-mms=";
            if (!IsMediaUrl(fallback)) throw Invalid("Invalid media directPath."); var uri = new Uri(fallback); if (!urls.Contains(uri)) urls.Add(uri);
        }
        if (urls.Count == 0) throw Invalid("Descriptor requires url or directPath."); return urls;
    }
    private static long EncryptedLimit(long maxBytes, long? length)
    {
        if (maxBytes <= 0 || maxBytes > 9_007_199_254_740_991) throw new PolymorfaConfigurationException("maxBytes must be a positive safe integer.");
        if (length < 0) throw Invalid("Invalid media length."); if (length > maxBytes) throw TooLarge();
        return ((Math.Min(maxBytes, length ?? maxBytes) / 16) + 1) * 16 + 10;
    }
    private static async Task<byte[]> ReadBoundedAsync(Stream source, long limit, CancellationToken cancellation)
    {
        using var target = new MemoryStream(); var buffer = new byte[65536];
        try
        {
            while (true) { var count = await source.ReadAsync(buffer, cancellation).ConfigureAwait(false); if (count == 0) return target.ToArray(); if (target.Length + count > limit) throw TooLarge(); await target.WriteAsync(buffer.AsMemory(0, count), cancellation).ConfigureAwait(false); }
        }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
        catch (IOException) { throw new PolymorfaConnectionException("Cannot read the media body."); }
    }
    private static byte[] Hash(byte[] value, string field) { if (value.Length != 32) throw Invalid($"{field} must contain 32 bytes."); return value.ToArray(); }
    private static string Text(byte[] value, int max) { if (value.Length > max) throw Invalid("Media descriptor text exceeds its limit."); try { return new UTF8Encoding(false, true).GetString(value); } catch (DecoderFallbackException) { throw Invalid("Invalid descriptor UTF-8."); } }
    private static PolymorfaMediaIntegrityException Invalid(string message) => Integrity(message, "media_invalid_descriptor");
    private static PolymorfaMediaIntegrityException TooLarge() => Integrity("Media exceeds its permitted size.", "media_too_large");
    private static PolymorfaMediaIntegrityException Integrity(string message, string code) => new(message, code);
    private sealed class ProtoReader(byte[] bytes)
    {
        private int offset;
        public bool Done => offset >= bytes.Length;
        public ulong Varint()
        {
            ulong result = 0;
            for (var index = 0; index < 10; index++) { if (Done) throw Invalid("Truncated media descriptor."); var value = bytes[offset++]; if (index == 9 && value > 1) throw Invalid("Invalid descriptor varint."); result |= (ulong)(value & 127) << (index * 7); if ((value & 128) == 0) return result; }
            throw Invalid("Invalid descriptor varint.");
        }
        public byte[] Bytes() { var length = Varint(); if (length > (ulong)(bytes.Length - offset)) throw Invalid("Truncated media field."); var value = bytes.AsSpan(offset, (int)length).ToArray(); offset += (int)length; return value; }
        public void Skip(int wire)
        {
            if (wire == 0) { _ = Varint(); return; }
            if (wire == 2) { _ = Bytes(); return; }
            var length = wire switch { 1 => 8, 5 => 4, _ => throw Invalid("Unsupported descriptor wire type.") }; if (bytes.Length - offset < length) throw Invalid("Truncated media field."); offset += length;
        }
    }
}
