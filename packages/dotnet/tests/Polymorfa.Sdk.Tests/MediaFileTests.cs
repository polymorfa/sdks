using System.Text.Json;
using Polymorfa.Sdk;

internal static class MediaFileTests
{
    public static async Task RunAsync(string root)
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".polymorfa-agent-work", "sdk-media-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            using var vectors = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "contracts/fixtures/whatsapp-media.json")));
            foreach (var vector in vectors.RootElement.GetProperty("fixtures").EnumerateArray())
            {
                byte[] Hex(string field) => Convert.FromHexString(vector.GetProperty(field).GetString()!);
                var keys = WhatsAppMedia.DeriveKeys(Hex("mediaKey"), vector.GetProperty("kind").GetString()!);
                var encrypted = Hex("encrypted"); var target = Path.Combine(directory, "verified");
                using var input = new Fragmented(encrypted);
                var result = await WhatsAppMedia.DecryptToFileAsync(input, keys, target, Hex("fileSha256"));
                if (!File.ReadAllBytes(target).AsSpan().SequenceEqual(Hex("plaintext")) || result.BytesWritten != Hex("plaintext").Length) throw new Exception("Streamed media vector differed.");
                try { await WhatsAppMedia.DecryptToFileAsync(new Fragmented(encrypted), keys, target, Hex("fileSha256")); throw new Exception("Existing file overwritten."); } catch (IOException) { }
                var before = File.ReadAllBytes(target); var corrupt = encrypted.ToArray(); corrupt[^1] ^= 1;
                try { await WhatsAppMedia.DecryptToFileAsync(new Fragmented(corrupt), keys, target, overwrite: true); throw new Exception("Bad MAC accepted."); } catch (PolymorfaMediaIntegrityException e) when (e.Code == "media_mac_mismatch") { }
                try { await WhatsAppMedia.DecryptToFileAsync(new Fragmented(encrypted), keys, target, new byte[32], overwrite: true); throw new Exception("Bad plaintext hash accepted."); } catch (PolymorfaMediaIntegrityException e) when (e.Code == "media_hash_mismatch") { }
                if (!File.ReadAllBytes(target).AsSpan().SequenceEqual(before) || Directory.GetFiles(directory).Length != 1) throw new Exception("Failed verification modified the destination or retained scratch files.");
                using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
                try { await WhatsAppMedia.DecryptToFileAsync(new Fragmented(encrypted), keys, target, options: new() { CancellationToken = cancelled.Token }, overwrite: true); throw new Exception("Cancelled file committed."); } catch (PolymorfaCancelledException) { }
                using var stalled = new Stalled();
                try { await WhatsAppMedia.DecryptToFileAsync(stalled, keys, target, options: new() { Timeout = TimeSpan.FromMilliseconds(20) }, overwrite: true); throw new Exception("Body timeout ignored."); } catch (PolymorfaTimeoutException) { }
                if (Directory.GetFiles(directory).Length != 1) throw new Exception("Cancellation left scratch files.");
                File.Delete(target);
            }
            Console.WriteLine("PASS independently verified streamed media files, atomic replacement, integrity failure, cancellation and timeout");
        }
        finally { Directory.Delete(directory, true); }
    }
    private sealed class Fragmented(byte[] bytes) : MemoryStream(bytes, false)
    {
        private int reads;
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => base.ReadAsync(buffer[..Math.Min(buffer.Length, 1 + reads++ % 7)], cancellationToken);
    }
    private sealed class Stalled : MemoryStream
    {
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { await Task.Delay(Timeout.Infinite, cancellationToken); return 0; }
    }
}
