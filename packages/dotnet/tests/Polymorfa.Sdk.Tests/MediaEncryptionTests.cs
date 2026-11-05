using System.Text.Json;
using Polymorfa.Sdk;

internal static class MediaEncryptionTests
{
    internal static async Task RunAsync(string root)
    {
        using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "contracts/fixtures/whatsapp-media.json")));
        foreach (var fixture in fixtures.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            var kind = Enum.Parse<WhatsAppUploadMediaType>(fixture.GetProperty("kind").GetString()!, ignoreCase: true);
            byte[] Bytes(string field) => Convert.FromHexString(fixture.GetProperty(field).GetString()!);
            var options = new WhatsAppMediaEncryptionOptions(kind) { MediaKey = Bytes("mediaKey") };
            var result = await WhatsAppMedia.EncryptAsync(Bytes("plaintext"), options);
            ResourceTests.True(result.Ciphertext.SequenceEqual(Bytes("encrypted"))); ResourceTests.True(result.Info.FileSha256.SequenceEqual(Bytes("fileSha256"))); ResourceTests.True(result.Info.FileEncSha256.SequenceEqual(Bytes("fileEncSha256")));
            using var source = new ChunkedSource(Bytes("plaintext")); using var target = new MemoryStream(); var info = await WhatsAppMedia.EncryptAsync(source, target, options); ResourceTests.True(target.ToArray().SequenceEqual(result.Ciphertext)); ResourceTests.Equal(info.FileLength, (long)Bytes("plaintext").Length); ResourceTests.True(source.CanRead && target.CanWrite);
            ResourceTests.True(!info.ToString().Contains(Convert.ToHexString(info.MediaKey), StringComparison.Ordinal));
        }
        using var stalled = new PausedSource(); using var output = new MemoryStream();
        var running = WhatsAppMedia.EncryptAsync(stalled, output, new(WhatsAppUploadMediaType.Ptt));
        await stalled.FirstRead.Task.WaitAsync(TimeSpan.FromSeconds(2)); await Task.Delay(30); ResourceTests.True(output.Length > 0); ResourceTests.True(!running.IsCompleted); stalled.Release.TrySetResult(); ResourceTests.Equal((await running).FileLength, 65536L);
        try { await WhatsAppMedia.EncryptAsync(new byte[2], new(WhatsAppUploadMediaType.Image) { MaxBytes = 1 }); throw new Exception("Size limit ignored"); } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_too_large"); }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { await WhatsAppMedia.EncryptAsync(new byte[1], new(WhatsAppUploadMediaType.Image) { CancellationToken = cancelled.Token }); throw new Exception("Cancellation ignored"); } catch (PolymorfaCancelledException) { }
        ResourceTests.True(!WhatsAppMedia.GenerateMediaKey().SequenceEqual(WhatsAppMedia.GenerateMediaKey())); ResourceTests.Equal(WhatsAppMedia.EncryptedLength(16), 42L);
        Console.WriteLine("PASS independent encryption vectors, incremental stream before EOF, ownership, bounds, cancellation and redaction");
    }
    private class ChunkedSource(byte[] input) : Stream
    {
        protected int Offset;
        public override bool CanRead => true; public override bool CanWrite => false; public override bool CanSeek => false; public override long Length => input.Length; public override long Position { get => Offset; set => throw new NotSupportedException(); }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { cancellationToken.ThrowIfCancellationRequested(); var count = Math.Min(3, Math.Min(buffer.Length, input.Length - Offset)); input.AsMemory(Offset, count).CopyTo(buffer); Offset += count; return ValueTask.FromResult(count); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException(); public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    private sealed class PausedSource() : ChunkedSource([])
    {
        internal TaskCompletionSource FirstRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private bool first = true;
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (first) { first = false; buffer.Span.Fill(7); FirstRead.TrySetResult(); return buffer.Length; }
            await Release.Task.WaitAsync(cancellationToken); return 0;
        }
    }
}
