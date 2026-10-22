using System.Buffers;
using System.Net;

namespace Polymorfa.Sdk;

/// <summary>Streams exactly the declared bytes. Leaves the caller's stream open and never retries storage writes.</summary>
internal sealed class ExactLengthAudioContent(Stream source, long size) : HttpContent
{
    internal PolymorfaValidationException? Failure { get; private set; }
    protected override bool TryComputeLength(out long length) { length = size; return true; }
    protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => SerializeToStreamAsync(stream, context, CancellationToken.None);
    protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context, CancellationToken cancellationToken)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(65536);
        try
        {
            long sent = 0;
            while (sent < size)
            {
                var count = await source.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, size - sent)), cancellationToken).ConfigureAwait(false);
                if (count == 0) throw Mismatch();
                await stream.WriteAsync(buffer.AsMemory(0, count), cancellationToken).ConfigureAwait(false);
                sent += count;
            }
            if (await source.ReadAsync(buffer.AsMemory(0, 1), cancellationToken).ConfigureAwait(false) != 0) throw Mismatch();
        }
        finally { ArrayPool<byte>.Shared.Return(buffer, clearArray: true); }
    }
    private PolymorfaValidationException Mismatch() => Failure = new("The upload size does not match the audio bytes.", "invalid_parameter");
}
