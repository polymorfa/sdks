using System.Buffers.Binary;
using System.IO.Compression;

namespace Polymorfa.Sdk;

// BCL-only exact single-stream validation. Keep runtime regressions: DeflateStream
// must request more input when a final block is incomplete. Ordinary EOF is unsafe.
internal static class StrictHistoryCompression
{
    private const int Window = 65536;
    private enum Format { Raw, Gzip, Zlib }
    private readonly record struct Envelope(int Offset, int Length, Format Format, uint Checksum = 0, uint Size = 0);
    private static readonly uint[] CrcTable = Enumerable.Range(0, 256).Select(value =>
    {
        var crc = (uint)value;
        for (var bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? 0xedb88320U ^ (crc >> 1) : crc >> 1;
        return crc;
    }).ToArray();

    internal static async Task<byte[]> DecodeAsync(byte[] snapshot, long maximum, CancellationToken cancellation)
    {
        var frame = await ParseAsync(snapshot, cancellation).ConfigureAwait(false);
        var chunks = new List<byte[]>();
        var full = await InflateAsync(snapshot, frame, frame.Length, maximum, chunks, cancellation).ConfigureAwait(false);
        if (!full.Complete) throw HistoryChunks.Invalid();
        // Read-ahead positions cannot prove consumption. A complete first stream
        // must require its final byte, even when that byte contains unused bits.
        var prefix = await InflateAsync(snapshot, frame, frame.Length - 1, maximum, null, cancellation).ConfigureAwait(false);
        if (prefix.Complete) throw HistoryChunks.Invalid();
        if (frame.Format == Format.Gzip && (full.Checksum != frame.Checksum || (uint)full.Length != frame.Size) ||
            frame.Format == Format.Zlib && full.Checksum != frame.Checksum) throw HistoryChunks.Invalid();

        cancellation.ThrowIfCancellationRequested();
        var result = new byte[full.Length]; var offset = 0; var work = 0;
        foreach (var chunk in chunks)
        {
            cancellation.ThrowIfCancellationRequested();
            chunk.CopyTo(result, offset); offset += chunk.Length;
            if (++work % 32 == 0) await YieldAsync(cancellation);
        }
        cancellation.ThrowIfCancellationRequested();
        return result;
    }

    private static async Task<Envelope> ParseAsync(byte[] input, CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        if (input.Length >= 2 && input[0] == 31 && input[1] == 139)
        {
            if (input.Length < 18 || input[2] != 8 || (input[3] & 224) != 0) throw HistoryChunks.Invalid();
            var limit = input.Length - 8; var offset = 10; var flags = input[3];
            if ((flags & 4) != 0)
            {
                if (limit - offset < 2) throw HistoryChunks.Invalid();
                var size = BinaryPrimitives.ReadUInt16LittleEndian(input.AsSpan(offset)); offset += 2;
                if (size > limit - offset) throw HistoryChunks.Invalid();
                offset += size;
            }
            for (var flag = 8; flag <= 16; flag *= 2)
            {
                if ((flags & flag) == 0) continue;
                while (true)
                {
                    if (offset >= limit) throw HistoryChunks.Invalid();
                    if (input[offset++] == 0) break;
                    if (offset % Window == 0) await YieldAsync(cancellation);
                }
            }
            cancellation.ThrowIfCancellationRequested();
            if ((flags & 2) != 0)
            {
                if (limit - offset < 2) throw HistoryChunks.Invalid();
                uint crc = 0;
                for (var start = 0; start < offset;)
                {
                    cancellation.ThrowIfCancellationRequested();
                    var count = Math.Min(Window, offset - start);
                    crc = Crc32(input.AsSpan(start, count), crc); start += count;
                    await YieldAsync(cancellation);
                }
                if ((crc & 65535) != BinaryPrimitives.ReadUInt16LittleEndian(input.AsSpan(offset))) throw HistoryChunks.Invalid();
                offset += 2;
            }
            if (offset >= limit) throw HistoryChunks.Invalid();
            return new(offset, limit - offset, Format.Gzip, BinaryPrimitives.ReadUInt32LittleEndian(input.AsSpan(limit)), BinaryPrimitives.ReadUInt32LittleEndian(input.AsSpan(limit + 4)));
        }
        // Retain the public decoder's existing gzip/zlib/raw detection.
        if (input.Length >= 2 && (input[0] & 15) == 8 && ((input[0] << 8) | input[1]) % 31 == 0)
        {
            if (input.Length < 7 || (input[0] >> 4) > 7 || (input[1] & 32) != 0) throw HistoryChunks.Invalid();
            return new(2, input.Length - 6, Format.Zlib, BinaryPrimitives.ReadUInt32BigEndian(input.AsSpan(input.Length - 4)));
        }
        if (input.Length == 0) throw HistoryChunks.Invalid();
        return new(0, input.Length, Format.Raw);
    }

    private readonly record struct Inflation(bool Complete, int Length, uint Checksum);
    private static async Task<Inflation> InflateAsync(byte[] input, Envelope frame, int length, long maximum, List<byte[]>? chunks, CancellationToken cancellation)
    {
        var buffer = new byte[Window]; long total = 0; uint crc = 0, adler = 1; var work = 0;
        var complete = true; Exception? primary = null;
        using var source = new ThrowAtBoundStream(input, frame.Offset, length, cancellation);
        var inflater = new DeflateStream(source, CompressionMode.Decompress, leaveOpen: true);
        try
        {
            while (true)
            {
                cancellation.ThrowIfCancellationRequested();
                var window = (int)Math.Min(Window, maximum - total + 1);
                var count = await inflater.ReadAsync(buffer.AsMemory(0, window), cancellation).ConfigureAwait(false);
                if (count == 0) break;
                if (count > maximum - total) throw WhatsAppMedia.TooLarge();
                total += count;
                if (chunks is not null)
                {
                    if (frame.Format == Format.Gzip) crc = Crc32(buffer.AsSpan(0, count), crc);
                    if (frame.Format == Format.Zlib) adler = Adler32(buffer.AsSpan(0, count), adler);
                    cancellation.ThrowIfCancellationRequested();
                    chunks.Add(buffer.AsSpan(0, count).ToArray());
                }
                if (++work % 32 == 0) await YieldAsync(cancellation);
            }
        }
        catch (IOException error) when (ReferenceEquals(error, source.Exhaustion)) { complete = false; }
        catch (Exception error) { primary = error; throw; }
        finally
        {
            // Disposal failure is fatal after expected bound exhaustion or success.
            // It must not replace an already established primary error.
            try { inflater.Dispose(); } catch when (primary is not null) { }
        }
        cancellation.ThrowIfCancellationRequested();
        return new(complete, (int)total, frame.Format == Format.Gzip ? crc : adler);
    }

    private static uint Crc32(ReadOnlySpan<byte> input, uint previous)
    {
        var crc = ~previous;
        foreach (var value in input) crc = CrcTable[(crc ^ value) & 255] ^ (crc >> 8);
        return ~crc;
    }
    private static uint Adler32(ReadOnlySpan<byte> input, uint previous)
    {
        var a = previous & 65535; var b = previous >> 16;
        for (var offset = 0; offset < input.Length; offset += 5552)
        {
            foreach (var value in input.Slice(offset, Math.Min(5552, input.Length - offset))) { a += value; b += a; }
            a %= 65521; b %= 65521;
        }
        return (b << 16) | a;
    }
    private static async Task YieldAsync(CancellationToken cancellation)
    {
        await Task.Yield();
        cancellation.ThrowIfCancellationRequested();
    }

    private sealed class ThrowAtBoundStream(byte[] input, int offset, int length, CancellationToken cancellation) : Stream
    {
        private int position, work;
        internal IOException Exhaustion { get; } = new("Inflater requested input beyond the private compressed bound.");
        public override bool CanRead => true;
        public override bool CanWrite => false;
        public override bool CanSeek => false;
        public override long Length => length;
        public override long Position { get => position; set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));
        public override int Read(Span<byte> buffer)
        {
            cancellation.ThrowIfCancellationRequested();
            if (buffer.IsEmpty) return 0;
            if (position == length) throw Exhaustion;
            var count = Math.Min(Math.Min(buffer.Length, Window), length - position);
            input.AsSpan(offset + position, count).CopyTo(buffer); position += count;
            cancellation.ThrowIfCancellationRequested();
            return count;
        }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!buffer.IsEmpty && ++work % 32 == 0) await YieldAsync(cancellation);
            cancellationToken.ThrowIfCancellationRequested();
            return Read(buffer.Span);
        }
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
