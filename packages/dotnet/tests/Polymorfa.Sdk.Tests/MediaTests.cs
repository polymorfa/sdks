using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class MediaTests
{
    public static async Task RunAsync(string root)
    {
        using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "contracts/fixtures/whatsapp-media.json")));
        foreach (var fixture in fixtures.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            var kind = fixture.GetProperty("kind").GetString()!;
            byte[] Hex(string property) => Convert.FromHexString(fixture.GetProperty(property).GetString()!);
            var descriptor = WhatsAppMedia.Decode(fixture.GetProperty("descriptor").GetString()!, kind);
            Bytes(descriptor.MediaKey, Hex("mediaKey")); Bytes(descriptor.FileSha256!, Hex("fileSha256"));
            var keys = WhatsAppMedia.DeriveKeys(descriptor.MediaKey, kind);
            Bytes(keys.Iv, Hex("iv")); Bytes(keys.CipherKey, Hex("cipherKey")); Bytes(keys.MacKey, Hex("macKey"));
            var encrypted = Hex("encrypted");
            Bytes(WhatsAppMedia.Decrypt(encrypted, keys, descriptor.FileSha256, descriptor.FileEncSha256), Hex("plaintext"));
            var corrupt = encrypted.ToArray(); corrupt[^1] ^= 1;
            Expect("media_enc_hash_mismatch", () => WhatsAppMedia.Decrypt(corrupt, keys, descriptor.FileSha256, descriptor.FileEncSha256));
            Expect("media_mac_mismatch", () => WhatsAppMedia.Decrypt(corrupt, keys));
            Expect("media_hash_mismatch", () => WhatsAppMedia.Decrypt(encrypted, keys, new byte[32]));
            Expect("media_too_large", () => WhatsAppMedia.Decrypt(encrypted, keys, maxBytes: 1));
            Expect("media_too_short", () => WhatsAppMedia.Decrypt(new byte[10], keys));
            using var stream = new MemoryStream(encrypted);
            Bytes(await WhatsAppMedia.DecryptAsync(stream, keys, descriptor.FileSha256, descriptor.FileEncSha256), Hex("plaintext"));
            using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
            try { await WhatsAppMedia.DecryptAsync(new MemoryStream(encrypted), keys, options: new() { CancellationToken = cancelled.Token }); throw new Exception("Cancellation was ignored."); } catch (PolymorfaCancelledException) { }
            if (descriptor.ToString().Contains(descriptor.Url!) || keys.ToString().Contains(Convert.ToHexString(keys.CipherKey))) throw new Exception("Media descriptor string leaked a secret.");
            Console.WriteLine($"PASS media vector and integrity {kind}");
        }
        foreach (var value in new[] { "", "=", "AA==", "Cg==", "AAAAAAAAAA==", "!notbase64" }) Expect("media_invalid_descriptor", () => WhatsAppMedia.Decode(value, "image"));
        foreach (var value in new[] { "https://evil.example/file", "http://mmg.whatsapp.net/file", "https://mmg.whatsapp.net:444/file", "https://user:password@mmg.whatsapp.net/file", "https://whatsapp.net.evil.example/file" })
            if (WhatsAppMedia.IsMediaUrl(value)) throw new Exception("Unsafe WhatsApp media URL accepted.");
        if (!WhatsAppMedia.IsMediaUrl("https://mmg.whatsapp.net/file?capability=fixture")) throw new Exception("Signed CDN URL refused.");
        Console.WriteLine("PASS malformed media descriptors and host confinement");
    }
    private static void Bytes(byte[] actual, byte[] expected) { if (!actual.AsSpan().SequenceEqual(expected)) throw new Exception("Independent media vector differs."); }
    private static void Expect(string code, Action action) { try { action(); throw new Exception($"Expected {code}."); } catch (PolymorfaMediaIntegrityException error) when (error.Code == code) { } }
}
