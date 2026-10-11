using System.Security.Cryptography;

namespace Polymorfa.Sdk;

public sealed record VerifiedMediaFile(string Path, long BytesWritten) { public override string ToString() => $"VerifiedMediaFile(bytes={BytesWritten}, path=redacted)"; }
internal static class AtomicMediaFile
{
    internal static string Scratch(string destination, string suffix) => System.IO.Path.Combine(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(destination))!, ".pmfa-" + Guid.NewGuid().ToString("N") + suffix);
    internal static FileStream Create(string path) { var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.ReadWrite, Share = FileShare.None, Options = FileOptions.Asynchronous | FileOptions.SequentialScan }; if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite; return new(path, options); }
    internal static void Remove(string path) { try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
    internal static async Task<VerifiedMediaFile> CopyAsync(Stream source, string destination, long maxBytes, bool overwrite, CancellationToken cancellation)
    {
        if (maxBytes <= 0) throw new PolymorfaConfigurationException("maxBytes must be positive."); var scratch = Scratch(destination, ".partial");
        try { long size = 0; await using (var output = Create(scratch)) { var buffer = new byte[65536]; while (true) { var count = await source.ReadAsync(buffer, cancellation).ConfigureAwait(false); if (count == 0) break; if (size + count > maxBytes) throw new PolymorfaMediaIntegrityException("Media exceeds its permitted size.", "media_too_large"); await output.WriteAsync(buffer.AsMemory(0, count), cancellation).ConfigureAwait(false); size += count; } await output.FlushAsync(cancellation).ConfigureAwait(false); } cancellation.ThrowIfCancellationRequested(); File.Move(scratch, destination, overwrite); return new(System.IO.Path.GetFullPath(destination), size); }
        finally { Remove(scratch); }
    }
}
public static partial class WhatsAppMedia
{
    /// <summary>Spools encrypted bytes in the destination directory, authenticates them, then decrypts and atomically commits the verified file.</summary>
    public static async Task<VerifiedMediaFile> DecryptToFileAsync(Stream encrypted, WhatsAppMediaKeys keys, string destination, byte[]? fileSha256 = null, byte[]? fileEncSha256 = null, WhatsAppMediaOptions? options = null, long? fileLength = null, bool overwrite = false)
    {
        options ??= new(); var limit = EncryptedLimit(options.MaxBytes, fileLength);
        if (keys.Iv.Length != 16 || keys.CipherKey.Length != 32 || keys.MacKey.Length != 32) throw Invalid("Invalid derived media keys."); if (fileSha256 is not null) _ = Hash(fileSha256, "fileSha256"); if (fileEncSha256 is not null) _ = Hash(fileEncSha256, "fileEncSha256");
        var sealedPath = AtomicMediaFile.Scratch(destination, ".encrypted"); var plainPath = AtomicMediaFile.Scratch(destination, ".partial"); using var deadline = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); deadline.CancelAfter(options.Timeout); var cancellation = deadline.Token;
        try
        {
            long encryptedBytes = 0; long plainBytes = 0; var tail = Array.Empty<byte>(); using var encryptedHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256); using var mac = IncrementalHash.CreateHMAC(HashAlgorithmName.SHA256, keys.MacKey); mac.AppendData(keys.Iv);
            await using (var spool = AtomicMediaFile.Create(sealedPath))
            {
                var buffer = new byte[65536];
                while (true)
                {
                    var count = await encrypted.ReadAsync(buffer, cancellation).ConfigureAwait(false); if (count == 0) break; encryptedBytes += count; if (encryptedBytes > limit) throw TooLarge(); encryptedHash.AppendData(buffer, 0, count); await spool.WriteAsync(buffer.AsMemory(0, count), cancellation).ConfigureAwait(false);
                    var combined = new byte[tail.Length + count]; tail.CopyTo(combined, 0); buffer.AsSpan(0, count).CopyTo(combined.AsSpan(tail.Length)); var signed = Math.Max(0, combined.Length - 10); if (signed > 0) mac.AppendData(combined.AsSpan(0, signed)); tail = combined[signed..];
                }
                if (encryptedBytes <= 10) throw Integrity("Encrypted media is too short.", "media_too_short"); if ((encryptedBytes - 10) % 16 != 0) throw Integrity("Ciphertext must contain complete AES blocks.", "media_invalid_ciphertext");
                if (fileEncSha256 is not null && !CryptographicOperations.FixedTimeEquals(encryptedHash.GetHashAndReset(), fileEncSha256)) throw Integrity("Encrypted media hash mismatch.", "media_enc_hash_mismatch");
                if (!CryptographicOperations.FixedTimeEquals(mac.GetHashAndReset().AsSpan(0, 10), tail)) throw Integrity("Media MAC mismatch.", "media_mac_mismatch");
                await spool.FlushAsync(cancellation).ConfigureAwait(false); spool.SetLength(encryptedBytes - 10); spool.Position = 0;
                using var aes = Aes.Create(); aes.Key = keys.CipherKey; aes.IV = keys.Iv; using var decipher = aes.CreateDecryptor(); await using var decrypted = new CryptoStream(spool, decipher, CryptoStreamMode.Read, leaveOpen: true); using var plainHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                await using (var output = AtomicMediaFile.Create(plainPath))
                {
                    while (true) { var count = await decrypted.ReadAsync(buffer, cancellation).ConfigureAwait(false); if (count == 0) break; plainBytes += count; if (plainBytes > options.MaxBytes) throw TooLarge(); plainHash.AppendData(buffer, 0, count); await output.WriteAsync(buffer.AsMemory(0, count), cancellation).ConfigureAwait(false); }
                    if (fileSha256 is not null && !CryptographicOperations.FixedTimeEquals(plainHash.GetHashAndReset(), fileSha256)) throw Integrity("Plaintext media hash mismatch.", "media_hash_mismatch"); await output.FlushAsync(cancellation).ConfigureAwait(false);
                }
            }
            cancellation.ThrowIfCancellationRequested(); File.Move(plainPath, destination, overwrite); return new(System.IO.Path.GetFullPath(destination), plainBytes);
        }
        catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Media verification timed out."); }
        catch (CryptographicException) { throw Integrity("Invalid media padding.", "media_invalid_padding"); }
        finally { AtomicMediaFile.Remove(sealedPath); AtomicMediaFile.Remove(plainPath); }
    }
    public static async Task<VerifiedMediaFile> DownloadToFileAsync(WhatsAppMediaDescriptor descriptor, string destination, WhatsAppMediaOptions? options = null, bool overwrite = false)
    {
        options ??= new(); return await ReadDownloadAsync(descriptor, options, body => DecryptToFileAsync(body, DeriveKeys(descriptor.MediaKey, descriptor.MediaKind), destination, descriptor.FileSha256, descriptor.FileEncSha256, options, descriptor.FileLength, overwrite)).ConfigureAwait(false);
    }
}
public static class MediaFileExtensions
{
    public static async Task<VerifiedMediaFile> DownloadToFileAsync(this MessagingMedia media, string id, string destination, long maxBytes = 256 * 1024 * 1024, bool overwrite = false, RequestOptions? options = null)
    {
        options ??= new(); await using var download = await media.DownloadStreamAsync(id, options).ConfigureAwait(false); if (download.ContentLength > maxBytes) throw new PolymorfaMediaIntegrityException("Media exceeds its permitted size.", "media_too_large"); return await AtomicMediaFile.CopyAsync(download.Body, destination, maxBytes, overwrite, options.CancellationToken).ConfigureAwait(false);
    }
}
