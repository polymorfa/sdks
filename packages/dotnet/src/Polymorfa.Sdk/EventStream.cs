using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record EventStreamGap(string Reason, long MissedEvents, string? RequestedCursor);
public sealed record EventStreamItem(EventRecord Event, string StreamId, long Sequence, WebhookEnvelope? Webhook, string Cursor);
public sealed record EventStreamOptions
{
    public string? ProjectId { get; init; }
    public IReadOnlyList<string>? Types { get; init; }
    public string? Since { get; init; }
    public bool ManualAcknowledgement { get; init; }
    public TimeSpan InitialReconnectDelay { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan MaximumReconnectDelay { get; init; } = TimeSpan.FromSeconds(30);
    public TimeSpan? Timeout { get; init; }
    public CancellationToken CancellationToken { get; init; }
    public Action<EventStreamGap>? OnGap { get; init; }
    public Action<Exception?, TimeSpan>? OnReconnect { get; init; }
}

/// <summary>Resumable project events. Authentication and revoked cursors terminate the stream.</summary>
public sealed class EventStream : IAsyncEnumerable<EventStreamItem>
{
    private readonly HttpTransport http;
    private readonly string path;
    private readonly EventStreamOptions options;
    public string? Cursor { get; private set; }
    internal EventStream(HttpTransport http, string path, EventStreamOptions options)
    {
        if (options.InitialReconnectDelay <= TimeSpan.Zero || options.MaximumReconnectDelay < options.InitialReconnectDelay)
            throw new PolymorfaConfigurationException("Invalid event stream reconnect delays.");
        this.http = http; this.path = path; this.options = options; Cursor = options.Since;
    }
    public async IAsyncEnumerator<EventStreamItem> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, options.CancellationToken);
        var attempt = 0;
        while (!stop.IsCancellationRequested)
        {
            Exception? failure = null;
            await using (var source = ConnectAsync(stop.Token).GetAsyncEnumerator(stop.Token))
            {
                while (true)
                {
                    EventStreamItem? item = null;
                    try
                    {
                        if (!await source.MoveNextAsync().ConfigureAwait(false)) break;
                        item = source.Current; attempt = 0;
                    }
                    catch (Exception error) when (stop.IsCancellationRequested && error is OperationCanceledException or PolymorfaCancelledException) { break; }
                    catch (Exception error) when (!Terminal(error)) { failure = error; if (error is StreamReconnect { ResetBackoff: true }) attempt = 0; break; }
                    yield return item;
                }
            }
            if (stop.IsCancellationRequested) yield break;
            var ceiling = Math.Min(options.MaximumReconnectDelay.TotalMilliseconds, options.InitialReconnectDelay.TotalMilliseconds * Math.Pow(2, Math.Min(attempt++, 20)));
            var delay = TimeSpan.FromMilliseconds(ceiling * (0.5 + Random.Shared.NextDouble() * 0.5));
            if (failure is PolymorfaException { Metadata: { } metadata } && metadata.Headers.TryGetValue("retry-after", out var retry) && double.TryParse(retry, System.Globalization.CultureInfo.InvariantCulture, out var seconds) && seconds >= 0 && double.IsFinite(seconds))
                delay = TimeSpan.FromSeconds(Math.Min(seconds, options.MaximumReconnectDelay.TotalSeconds));
            else if (failure is PolymorfaException { Metadata: { } dated } && dated.Headers.TryGetValue("retry-after", out var date) && DateTimeOffset.TryParse(date, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var retryAt))
                delay = TimeSpan.FromMilliseconds(Math.Clamp((retryAt - DateTimeOffset.UtcNow).TotalMilliseconds, 0, options.MaximumReconnectDelay.TotalMilliseconds));
            options.OnReconnect?.Invoke(failure, delay);
            try { await Task.Delay(delay, stop.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { yield break; }
        }
    }
    private static bool Terminal(Exception error) => error is PolymorfaAuthenticationException or PolymorfaAuthorizationException or PolymorfaNotFoundException or PolymorfaValidationException || error is PolymorfaException { Status: 410 };
    private async IAsyncEnumerable<EventStreamItem> ConnectAsync([EnumeratorCancellation] CancellationToken cancellation)
    {
        var query = new List<KeyValuePair<string, string>>();
        if (options.Types is { Count: > 0 }) query.Add(new("types", string.Join(',', options.Types)));
        if (options.ManualAcknowledgement) query.Add(new("ack", "manual"));
        var headers = new Dictionary<string, string>();
        if (Cursor is not null) headers["last-event-id"] = Cursor;
        using var opened = await http.OpenAsync(HttpMethod.Get, path, null, new RequestOptions { Headers = headers, Timeout = options.Timeout, MaxNetworkRetries = 0, CancellationToken = cancellation }, "text/event-stream", query).ConfigureAwait(false);
        if (opened.Response.Content.Headers.ContentType?.MediaType != "text/event-stream") throw new PolymorfaServerException("Expected an event stream.", "invalid_stream", opened.Metadata);
        await using var stream = await opened.Response.Content.ReadAsStreamAsync(cancellation).ConfigureAwait(false);
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true));
        var lines = new BoundedSseLines(reader);
        var data = new StringBuilder();
        var heartbeat = TimeSpan.FromSeconds(30);
        using var watchdog = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        while (true)
        {
            watchdog.CancelAfter(heartbeat);
            var line = await lines.ReadAsync(watchdog.Token).ConfigureAwait(false);
            if (line is null) yield break;
            if (line.Length != 0)
            {
                if (line.StartsWith("data:", StringComparison.Ordinal)) { if (data.Length != 0) data.Append('\n'); data.Append(line[5..].TrimStart(' ')); }
                if (data.Length > 4 * 1024 * 1024) throw new PolymorfaServerException("Event stream frame exceeds its size limit.", "invalid_stream");
                continue;
            }
            if (data.Length == 0) continue;
            using var document = JsonDocument.Parse(data.ToString()); data.Clear();
            var frame = document.RootElement;
            if (!frame.TryGetProperty("type", out var type)) continue;
            switch (type.GetString())
            {
                case "ready":
                    if (frame.TryGetProperty("heartbeatIntervalMs", out var interval) && interval.TryGetInt64(out var ms) && ms > 0 && ms < uint.MaxValue / 2) heartbeat = TimeSpan.FromMilliseconds(ms * 2);
                    break;
                case "event":
                    var record = frame.GetProperty("event").Deserialize<EventRecord>(HttpTransport.Json) ?? throw new PolymorfaServerException("Invalid event stream envelope.", "invalid_stream");
                    Cursor = frame.GetProperty("cursor").GetString() ?? throw new PolymorfaServerException("Missing stream cursor.", "invalid_stream");
                    WebhookEnvelope? webhook = null;
                    if (record.Payload is { } payload)
                    {
                        if (payload.Encoding != "base64") throw new PolymorfaServerException("Unsupported event payload encoding.", "invalid_stream");
                        webhook = JsonSerializer.Deserialize<WebhookEnvelope>(Convert.FromBase64String(payload.Data), HttpTransport.Json);
                    }
                    yield return new(record, frame.GetProperty("streamId").GetString()!, frame.GetProperty("sequence").GetInt64(), webhook, Cursor);
                    break;
                case "checkpoint": if (frame.TryGetProperty("cursor", out var checkpoint) && checkpoint.ValueKind == JsonValueKind.String) Cursor = checkpoint.GetString(); break;
                case "gap":
                    if (frame.GetProperty("reason").GetString() != "retention_exceeded") throw new PolymorfaConnectionException("Event stream reported a recoverable gap.");
                    options.OnGap?.Invoke(new("retention_exceeded", frame.TryGetProperty("missedEvents", out var missed) ? missed.GetInt64() : 0, frame.TryGetProperty("requestedCursor", out var requested) ? requested.GetString() : null));
                    break;
                case "revoked": throw new PolymorfaAuthorizationException("Event stream access was revoked.", "stream_revoked");
                case "expiry": throw new StreamReconnect(true);
                case "dropped": throw new StreamReconnect(false);
            }
        }
    }
}

internal sealed class StreamReconnect(bool resetBackoff) : PolymorfaException("Event stream connection ended; resume at the saved cursor.", "stream_reconnect")
{
    internal bool ResetBackoff { get; } = resetBackoff;
}
internal sealed class BoundedSseLines(StreamReader reader)
{
    private readonly char[] buffer = new char[4096];
    private int position;
    private int length;
    private readonly StringBuilder line = new();
    internal async ValueTask<string?> ReadAsync(CancellationToken cancellation)
    {
        while (true)
        {
            if (position == length)
            {
                length = await reader.ReadAsync(buffer.AsMemory(), cancellation).ConfigureAwait(false); position = 0;
                if (length == 0) { if (line.Length == 0) return null; var tail = line.ToString(); line.Clear(); return tail; }
            }
            var character = buffer[position++];
            if (character == '\n') { if (line.Length > 0 && line[^1] == '\r') line.Length--; var value = line.ToString(); line.Clear(); return value; }
            if (line.Length == 4 * 1024 * 1024) throw new PolymorfaServerException("Event stream line exceeds its size limit.", "invalid_stream");
            line.Append(character);
        }
    }
}
