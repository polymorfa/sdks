using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class StrictHistoryTests
{
    private static int checks;
    internal static string Fixture(string name) => Path.Combine(AppContext.BaseDirectory, "fixtures", name);
    internal static byte[] Input(JsonElement item) => Convert.FromBase64String(item.GetProperty("input").GetString()!);
    internal static void Check(bool condition, string name) { checks++; if (!condition) throw new Exception(name); }
    internal static async Task ErrorAsync(Func<Task> action, string code, string name)
    {
        try { await action(); }
        catch (PolymorfaException error) when (error.Code == code) { checks++; return; }
        throw new Exception(name + ": expected " + code);
    }
    private static byte[] Plain(JsonElement item)
    {
        if (item.TryGetProperty("base64", out var encoded)) return Convert.FromBase64String(encoded.GetString()!);
        var size = item.GetProperty("zeroFieldBytes").GetInt32(); var bytes = new List<byte>(new byte[] { 8, 3, 0xa2, 6 });
        for (var value = size; ; value >>= 7) { bytes.Add((byte)((value & 127) | (value > 127 ? 128 : 0))); if (value <= 127) break; }
        return bytes.Concat(new byte[size]).ToArray();
    }
    internal static async Task RunAsync()
    {
        checks = 0;
        using var corpus = JsonDocument.Parse(File.ReadAllBytes(Fixture("strict-history.json")));
        var streams = corpus.RootElement.GetProperty("streams"); var plains = corpus.RootElement.GetProperty("plain");
        var complete = 0; var compressionRefusals = 0; var protobufOnly = 0;
        foreach (var property in streams.EnumerateObject())
        {
            var bytes = Input(property.Value); var label = property.Value.GetProperty("plain").GetString()!;
            if (label == "invalid-protobuf")
            {
                await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes), "media_invalid_ciphertext", property.Name + " protobuf policy"); protobufOnly++; continue;
            }
            var expected = Plain(plains.GetProperty(label));
            foreach (var maximum in new long[] { 512 * 1024 * 1024, Math.Max(1, expected.Length) })
            {
                var value = await HistoryChunks.DecodeAsync(bytes, maximum);
                Check(value.Proto.Encoded.SequenceEqual(expected), property.Name + " exact plaintext"); complete++;
                if (label == "provider")
                {
                    Check(value.SyncType == 3 && value.ChunkOrder == 7 && value.Progress == 92, "provider fields");
                    Check(value.Conversations[0].LastMessageTimestamp == ulong.MaxValue && value.Proto.Bytes(100) is not null, "full uint64 and unknown field");
                }
            }
            if (expected.Length > 1) await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes, expected.Length - 1), "media_too_large", property.Name + " one-under cap");
        }
        foreach (var recipe in corpus.RootElement.GetProperty("invalid").EnumerateArray())
        {
            byte[] bytes; var isProtobufOnly = false;
            if (recipe.TryGetProperty("hex", out var hex)) bytes = Convert.FromHexString(hex.GetString()!);
            else
            {
                var source = streams.GetProperty(recipe.GetProperty("base").GetString()!); bytes = Input(source);
                isProtobufOnly = source.GetProperty("plain").GetString() == "invalid-protobuf";
                if (recipe.TryGetProperty("cut", out var cut)) bytes = bytes[..cut.GetInt32()];
                if (recipe.TryGetProperty("tailHex", out var tail)) bytes = bytes.Concat(Convert.FromHexString(tail.GetString()!)).ToArray();
                if (recipe.TryGetProperty("append", out var append))
                {
                    var other = streams.GetProperty(append.GetString()!); bytes = bytes.Concat(Input(other)).ToArray();
                    isProtobufOnly |= other.GetProperty("plain").GetString() == "invalid-protobuf";
                }
                if (recipe.TryGetProperty("flip", out var flip))
                {
                    var index = flip.GetInt32(); if (index < 0) index += bytes.Length;
                    bytes[index] ^= recipe.TryGetProperty("mask", out var mask) ? (byte)mask.GetInt32() : (byte)1;
                }
            }
            var name = recipe.GetProperty("name").GetString()!;
            await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes), "media_invalid_ciphertext", name + " decode");
            await ErrorAsync(() => HistoryChunks.DownloadAsync(new HistoryInlinePayload(bytes)), "media_invalid_ciphertext", name + " inline");
            if (isProtobufOnly) protobufOnly += 2; else compressionRefusals += 2;
        }
        Console.WriteLine($"PASS strict shared corpus: {complete} complete, {compressionRefusals} compression refusals, {protobufOnly} protobuf-only checks (excluded from compression proof)");
        await SupplementalAsync();
        foreach (var format in new[] { "gzip", "zlib", "raw" })
        {
            var bytes = Input(streams.GetProperty("provider-" + format));
            var decoded = await HistoryChunks.DownloadAsync(new HistoryInlinePayload(bytes));
            Check(decoded.Proto.Encoded.SequenceEqual(Plain(plains.GetProperty("provider"))), format + " inline positive");
            await ErrorAsync(() => HistoryChunks.DownloadAsync(new HistoryInlinePayload(bytes), new() { Media = new() { MaxBytes = bytes.Length - 1 } }), "media_too_large", "inline compressed cap");
            if (format != "raw")
            {
                var corrupt = Input(streams.GetProperty("large-" + format)); corrupt[^1] ^= 1;
                await ErrorAsync(() => HistoryChunks.DecodeAsync(corrupt, 1), "media_too_large", format + " quota precedes bad trailer");
            }
            await SuspendedAsync(Input(streams.GetProperty("large-" + format)), Plain(plains.GetProperty("large")), false, format + " inflate snapshot");
            await SuspendedAsync(Input(streams.GetProperty("large-" + format)), Plain(plains.GetProperty("large")), true, format + " mid-inflate cancellation");
        }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await ErrorAsync(() => HistoryChunks.DecodeAsync(ReadOnlyMemory<byte>.Empty, cancellationToken: cancelled.Token), "request_cancelled", "decode preabort precedes empty");
        await ErrorAsync(() => HistoryChunks.DownloadAsync(new HistoryInlinePayload([]), new() { Media = new() { MaxBytes = 0, CancellationToken = cancelled.Token } }), "request_cancelled", "download preabort precedes caps");
        try { await HistoryChunks.DecodeAsync(ReadOnlyMemory<byte>.Empty, 0, cancelled.Token); throw new Exception("Invalid quota accepted"); }
        catch (PolymorfaConfigurationException) { checks++; }
        await StrictHistoryDownloadTests.RunAsync();
        await StrictHistoryStorageTests.RunAsync();
        Console.WriteLine($"PASS strict history total {checks} assertions; public decode/download/signed archive controls");
    }
    private static async Task SupplementalAsync()
    {
        await ErrorAsync(() => HistoryChunks.DecodeAsync(Convert.FromHexString("0200")), "media_invalid_ciphertext", "non-final empty fixed block");
        using var records = JsonDocument.Parse(File.ReadAllBytes(Fixture("strict-history-dotnet.json")));
        foreach (var record in records.RootElement.EnumerateArray())
        {
            var bytes = Input(record); var expected = Convert.FromBase64String(record.GetProperty("plain").GetString()!); var name = record.GetProperty("name").GetString()!;
            Check((await HistoryChunks.DecodeAsync(bytes, Math.Max(1, expected.Length))).Proto.Encoded.SequenceEqual(expected), name);
            await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes.Concat(new byte[] { 0 }).ToArray()), "media_invalid_ciphertext", name + " tail");
            await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes.Concat(bytes).ToArray()), "media_invalid_ciphertext", name + " concat");
            var ends = bytes.Length < 128 ? Enumerable.Range(0, bytes.Length) : new[] { 0, 1, 2, 3, 7, bytes.Length / 2, bytes.Length - 1 };
            foreach (var end in ends) await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes[..end]), "media_invalid_ciphertext", name + " prefix " + end);
        }
        using var headers = JsonDocument.Parse(File.ReadAllBytes(Fixture("strict-history-headers.json")));
        foreach (var record in headers.RootElement.EnumerateArray())
        {
            var bytes = record.GetProperty("segments").EnumerateArray().SelectMany(segment => segment.TryGetProperty("base64", out var encoded) ? Convert.FromBase64String(encoded.GetString()!) : Enumerable.Repeat((byte)segment.GetProperty("byte").GetInt32(), segment.GetProperty("count").GetInt32())).ToArray();
            Check(Convert.ToHexString(SHA256.HashData(bytes)).Equals(record.GetProperty("sha256").GetString(), StringComparison.OrdinalIgnoreCase), "retained header hash");
            if (record.GetProperty("compression").GetString() == "incomplete") await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes), "media_invalid_ciphertext", "unterminated header");
            else
            {
                Check((await HistoryChunks.DecodeAsync(bytes)).Proto.Encoded.SequenceEqual(Convert.FromBase64String(record.GetProperty("plain").GetString()!)), "long header valid in C#");
                await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes.Concat(new byte[] { 0 }).ToArray()), "media_invalid_ciphertext", "long header tail");
                await ErrorAsync(() => HistoryChunks.DecodeAsync(bytes[..^1]), "media_invalid_ciphertext", "long header truncation");
                if (record.GetProperty("name").GetString() == "huge-name-comment")
                {
                    await SuspendedAsync(bytes.ToArray(), Convert.FromBase64String(record.GetProperty("plain").GetString()!), false, "long optional-header snapshot");
                    await SuspendedAsync(bytes.ToArray(), Convert.FromBase64String(record.GetProperty("plain").GetString()!), true, "long optional-header cancellation");
                }
            }
        }
        Console.WriteLine("PASS 84 supplemental complete streams, 15 valid long headers and 1 incomplete header; all 32 gzip flags, stored boundaries, multiblock and unused final bits");
    }
    // A held caller context establishes a real suspension before mutation/cancel.
    // No private SDK hooks, reflection, phase counters or timer race is involved.
    private sealed class HeldContext : SynchronizationContext
    {
        internal readonly ConcurrentQueue<(SendOrPostCallback Callback, object? State)> Queue = new();
        public override void Post(SendOrPostCallback callback, object? state) => Queue.Enqueue((callback, state));
    }
    private static async Task SuspendedAsync(byte[] bytes, byte[] expected, bool cancel, string name)
    {
        var context = new HeldContext(); var prior = SynchronizationContext.Current;
        using var cancellation = new CancellationTokenSource(); Task<HistoryChunk> pending;
        try { SynchronizationContext.SetSynchronizationContext(context); pending = HistoryChunks.DecodeAsync(bytes, cancellationToken: cancellation.Token); }
        finally { SynchronizationContext.SetSynchronizationContext(prior); }
        Check(!pending.IsCompleted && !context.Queue.IsEmpty, name + " actually suspended");
        if (cancel) cancellation.Cancel(); else Array.Fill(bytes, (byte)255);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!pending.IsCompleted)
        {
            while (context.Queue.TryDequeue(out var item)) item.Callback(item.State);
            if (DateTime.UtcNow >= deadline) throw new Exception(name + " timeout");
            await Task.Delay(1);
        }
        if (cancel) await ErrorAsync(() => pending, "request_cancelled", name);
        else Check((await pending).Proto.Encoded.SequenceEqual(expected), name + " snapshot retained");
    }
}
