using System.Security.Cryptography;
using Polymorfa.Sdk;

internal static class CustomUploadTransportTests
{
    private sealed class DelegateTransport(string name, Func<string, WhatsAppEncryptedUploadBody, CancellationToken, Task<WhatsAppUploadLocation>> send) : IWhatsAppMediaUploadTransport
    {
        public string Name => name;
        public Task<WhatsAppUploadLocation> UploadAsync(string session, WhatsAppEncryptedUploadBody body, CancellationToken cancellation = default) => send(session, body, cancellation);
    }
    internal static async Task RunAsync()
    {
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
        var plaintext = "private customer media"u8.ToArray();
        var prepared = await WhatsAppMedia.PrepareUploadAsync(plaintext, new(WhatsAppUploadMediaType.Document));
        var originalKey = prepared.Info.MediaKey.ToArray();
        var calls = 0;
        var name = "customer-" + Guid.NewGuid().ToString("N");
        var transport = new DelegateTransport(name, async (session, body, cancellation) =>
        {
            calls++;
            ResourceTests.Equal(session, "session");
            ResourceTests.Equal(body.MediaType, WhatsAppUploadMediaType.Document);
            var publicProperties = typeof(WhatsAppEncryptedUploadBody).GetProperties().Select(p => p.Name).ToHashSet();
            ResourceTests.True(publicProperties.SetEquals(new[] { "MediaType", "FileEncSha256", "EncryptedLength" }));
            await using var source = await body.OpenAsync();
            using var encrypted = new MemoryStream();
            await source.CopyToAsync(encrypted, cancellation);
            var ciphertext = encrypted.ToArray();
            ResourceTests.Equal((long)ciphertext.Length, body.EncryptedLength);
            ResourceTests.True(!ciphertext.SequenceEqual(plaintext));
            ResourceTests.True(SHA256.HashData(ciphertext).SequenceEqual(body.FileEncSha256));
            body.FileEncSha256[0] ^= 255;
            ResourceTests.True(SHA256.HashData(ciphertext).SequenceEqual(body.FileEncSha256));
            await using var suffix = await body.OpenAsync(7);
            using var tail = new MemoryStream();
            await suffix.CopyToAsync(tail, cancellation);
            ResourceTests.True(tail.ToArray().SequenceEqual(ciphertext.Skip(7)));
            ResourceTests.True(!body.ToString().Contains(Convert.ToBase64String(originalKey), StringComparison.Ordinal));
            prepared.Info.MediaKey[0] ^= 255;
            return new("/custom.enc", "https://mmg.whatsapp.net/custom.enc");
        });
        var result = await client.WhatsAppMedia.UploadAsync("session", prepared, transport);
        ResourceTests.Equal(result.Egress, name);
        ResourceTests.True(result.Info.MediaKey.SequenceEqual(originalKey));
        ResourceTests.Equal(calls, 1);
        var failure = new InvalidOperationException("Caller transport refused the upload.");
        var refused = new DelegateTransport("failure", (_, _, _) => Task.FromException<WhatsAppUploadLocation>(failure));
        try { await client.WhatsAppMedia.UploadAsync("session", prepared, refused); throw new Exception("Custom error was lost."); }
        catch (InvalidOperationException error) { ResourceTests.True(ReferenceEquals(error, failure)); }
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        try { await client.WhatsAppMedia.UploadAsync("session", prepared, transport, cancelled.Token); throw new Exception("Precancelled transport was invoked."); }
        catch (PolymorfaCancelledException) { }
        ResourceTests.Equal(calls, 1);
        try { await client.WhatsAppMedia.UploadAsync("", prepared, transport); throw new Exception("Empty session accepted."); }
        catch (PolymorfaConfigurationException) { }
        ResourceTests.Equal(calls, 1);

        var reads = 0;
        Task<Stream> Changed(CancellationToken _) => Task.FromResult<Stream>(new MemoryStream(Enumerable.Repeat((byte)(Interlocked.Increment(ref reads) == 1 ? 1 : 2), 80).ToArray()));
        var changed = await WhatsAppMedia.PrepareUploadAsync(Changed, new(WhatsAppUploadMediaType.Document));
        var committed = false;
        long emitted = 0;
        var changedTransport = new DelegateTransport("changed", async (_, body, cancellation) =>
        {
            await using var source = await body.OpenAsync();
            var buffer = new byte[7];
            while (true) { var count = await source.ReadAsync(buffer, cancellation); if (count == 0) break; emitted += count; }
            committed = true;
            return new("/must-not-finalize", "https://mmg.whatsapp.net/must-not-finalize");
        });
        try { await client.WhatsAppMedia.UploadAsync("session", changed, changedTransport); throw new Exception("Changed source finalized."); }
        catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_enc_hash_mismatch"); }
        ResourceTests.True(!committed && emitted < changed.Info.EncryptedLength);

        using var stop = new CancellationTokenSource();
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = new DelegateTransport("pending", async (_, _, cancellation) => { started.TrySetResult(); await Task.Delay(Timeout.Infinite, cancellation); throw new Exception("Pending upload resumed without cancellation."); });
        var work = client.WhatsAppMedia.UploadAsync("session", prepared, pending, stop.Token);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        stop.Cancel();
        try { await work; throw new Exception("Inflight custom upload ignored cancellation."); }
        catch (PolymorfaCancelledException) { }
        Console.WriteLine("PASS custom encrypted upload: restricted metadata, verified offsets, immutable result, changed-source final gate, caller errors and cancellation");
    }
}
