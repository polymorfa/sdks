using System.Net;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace Polymorfa.Sdk;

public sealed class CallsSocketException(string message, string code, int? closeCode = null) : PolymorfaException(message, code) { public int? CloseCode { get; } = closeCode; }
public sealed record CallsSocketOptions
{
    public Uri BaseUrl { get; init; } = new("https://api.polymorfa.com");
    public IWebProxy? Proxy { get; init; }
    public string? Session { get; init; }
    public string? Participant { get; init; }
    public TimeSpan ReadyTimeout { get; init; } = TimeSpan.FromSeconds(10);
    public TimeSpan Heartbeat { get; init; } = TimeSpan.FromSeconds(5);
    public int MaxFrameBytes { get; init; } = 4 * 1024 * 1024;
}
/// <summary>One authenticated connection. Consume FramesAsync from one reader; writes are serialized independently.</summary>
public sealed class CallsSocket : IAsyncDisposable
{
    private readonly ClientWebSocket socket = new();
    private readonly CallsTokenSource tokens;
    private readonly CallsSocketOptions options;
    private readonly bool media;
    private readonly string? connectionId;
    private readonly Channel<CallSocketFrame> frames = System.Threading.Channels.Channel.CreateBounded<CallSocketFrame>(new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true, SingleWriter = true });
    private readonly CancellationTokenSource lifetime = new();
    private readonly SemaphoreSlim writes = new(1, 1);
    private readonly SemaphoreSlim controls = new(1, 1);
    private readonly object controlGate = new();
    private TaskCompletionSource<CallMediaState>? pendingControl;
    private string? pendingId;
    private int queuedControls;
    private int awaitingPong;
    private Task? reader;
    private Task? heartbeat;
    private CallsToken token = null!;
    private int disposed;
    public CallReady Ready { get; private set; } = null!;
    public string? ConnectionId => connectionId;
    public int? CloseCode => socket.CloseStatus is { } code ? (int)code : null;
    public bool Connected => socket.State == WebSocketState.Open && !lifetime.IsCancellationRequested;
    private CallsSocket(CallsTokenSource tokens, CallsSocketOptions options, bool media, string? connectionId)
    {
        this.tokens = tokens; this.options = options; this.media = media; this.connectionId = connectionId;
        HttpTransport.ValidateUrl(options.BaseUrl); if (options.ReadyTimeout <= TimeSpan.Zero || options.Heartbeat < TimeSpan.Zero || options.MaxFrameBytes < 1024) throw new PolymorfaConfigurationException("Invalid Calls socket limits.");
        if (options.Participant is not null && !CallsProtocol.Participant(options.Participant)) throw new PolymorfaConfigurationException("Invalid participant.");
        if (media && !CallsProtocol.Connection(connectionId)) throw new PolymorfaConfigurationException("Invalid connectionId.");
    }
    public static Task<CallsSocket> OpenLifecycleAsync(CallsTokenSource tokens, CallsSocketOptions? options = null, bool refresh = false, CancellationToken cancellationToken = default) => OpenAsync(tokens, options ?? new(), null, null, refresh, cancellationToken);
    public static Task<CallsSocket> OpenMediaAsync(CallsTokenSource tokens, string callId, string connectionId, CallsSocketOptions? options = null, bool refresh = false, CancellationToken cancellationToken = default) => OpenAsync(tokens, options ?? new(), callId, connectionId, refresh, cancellationToken);
    private static async Task<CallsSocket> OpenAsync(CallsTokenSource tokens, CallsSocketOptions options, string? callId, string? connectionId, bool refresh, CancellationToken cancellation)
    {
        var result = new CallsSocket(tokens, options, callId is not null, connectionId);
        using var bound = CancellationTokenSource.CreateLinkedTokenSource(cancellation); bound.CancelAfter(options.ReadyTimeout);
        try
        {
            result.token = await tokens.GetAsync(refresh, bound.Token).ConfigureAwait(false);
            var clientToken = result.token.Value.StartsWith("pmfa_ct_", StringComparison.Ordinal);
            if (!clientToken) { if (OperatingSystem.IsBrowser()) throw new PolymorfaConfigurationException("Server Calls credentials cannot be used in a browser."); if (callId is null && (string.IsNullOrWhiteSpace(options.Session) || options.Session.Length > 128)) throw new PolymorfaConfigurationException("Server lifecycle sockets require a session."); }
            var path = callId is null ? "/voip/ws" : "/voip/calls/" + Uri.EscapeDataString(callId) + "/media";
            var uri = new UriBuilder(new Uri(options.BaseUrl, path)) { Scheme = options.BaseUrl.Scheme == "https" ? "wss" : "ws" };
            if (callId is null && !clientToken) uri.Query = "session=" + Uri.EscapeDataString(options.Session!) + (options.Participant is null ? "" : "&participant=" + Uri.EscapeDataString(options.Participant));
            if (callId is not null) result.socket.Options.AddSubProtocol(CallsProtocol.MediaSubprotocol);
            result.socket.Options.KeepAliveInterval = TimeSpan.Zero;
            if (options.Proxy is not null) result.socket.Options.Proxy = options.Proxy;
            await result.socket.ConnectAsync(uri.Uri, bound.Token).ConfigureAwait(false);
            await result.AuthenticateAsync(bound.Token).ConfigureAwait(false);
            while (true)
            {
                var frame = await result.ReceiveAsync(bound.Token).ConfigureAwait(false);
                if (frame is CallReady ready) { result.Ready = ready; break; }
                if (frame is CallSocketError error) throw new CallsSocketException("Calls socket authentication was refused.", error.Code, error.Code switch { "call_claimed" => 4409, "calls_disabled" => 4403, "unauthorized" => 4401, _ => null });
                if (frame is not null) await result.frames.Writer.WriteAsync(frame, bound.Token).ConfigureAwait(false);
            }
            result.reader = result.ReadLoopAsync(); result.heartbeat = result.HeartbeatAsync(); return result;
        }
        catch (OperationCanceledException) { await result.DisposeAsync().ConfigureAwait(false); if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new CallsSocketException("Calls authentication timed out.", "media_timeout"); }
        catch { await result.DisposeAsync().ConfigureAwait(false); throw; }
    }
    private Task AuthenticateAsync(CancellationToken cancellation) => SendObjectAsync(new { type = "auth", token = token.Value, connectionId, participant = media && !token.Value.StartsWith("pmfa_ct_", StringComparison.Ordinal) ? options.Participant : null }, cancellation);
    public IAsyncEnumerable<CallSocketFrame> FramesAsync(CancellationToken cancellationToken = default) => frames.Reader.ReadAllAsync(cancellationToken);
    private async Task<CallSocketFrame?> ReceiveAsync(CancellationToken cancellation)
    {
        var buffer = new byte[8192]; using var output = new MemoryStream(); ValueWebSocketReceiveResult part; WebSocketMessageType? kind = null;
        do { part = await socket.ReceiveAsync(buffer.AsMemory(), cancellation).ConfigureAwait(false); if (part.MessageType == WebSocketMessageType.Close) throw new CallsSocketException("Calls socket closed.", CloseCode == 4401 ? "token_refresh_failed" : "socket_closed", CloseCode); if (kind is not null && kind != part.MessageType) throw new CallsSocketException("Invalid fragmented Calls frame.", "invalid_media_frame"); kind = part.MessageType; if (output.Length + part.Count > options.MaxFrameBytes) throw new CallsSocketException("Calls frame exceeds the configured limit.", "invalid_media_frame"); output.Write(buffer, 0, part.Count); } while (!part.EndOfMessage);
        return kind == WebSocketMessageType.Binary ? media ? CallsProtocol.DecodeBinary(output.ToArray()) : null : CallsProtocol.ParseText(output.ToArray(), media);
    }
    private async Task ReadLoopAsync()
    {
        Exception? failure = null;
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var frame = await ReceiveAsync(lifetime.Token).ConfigureAwait(false); if (frame is null) continue;
                if (frame is CallPong) { Interlocked.Exchange(ref awaitingPong, 0); continue; }
                lock (controlGate)
                {
                    if (frame is CallMediaStateReply reply && reply.RequestId == pendingId) pendingControl?.TrySetResult(new(reply.AudioMuted, reply.VideoEnabled, reply.ScreenSharing));
                    else if (frame is CallMediaStateError error && error.RequestId == pendingId) pendingControl?.TrySetException(new CallsSocketException("Media state change was refused.", error.Code));
                }
                await frames.Writer.WriteAsync(frame, lifetime.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception e) { failure = e; }
        finally { lifetime.Cancel(); lock (controlGate) pendingControl?.TrySetException(failure ?? new CallsSocketException("Media connection closed.", "media_control_unavailable")); frames.Writer.TryComplete(failure); }
    }
    private async Task HeartbeatAsync()
    {
        try
        {
            var interval = options.Heartbeat == TimeSpan.Zero ? TimeSpan.FromSeconds(5) : options.Heartbeat;
            while (!lifetime.IsCancellationRequested)
            {
                await Task.Delay(interval, lifetime.Token).ConfigureAwait(false);
                if (options.Heartbeat > TimeSpan.Zero) { if (Interlocked.Exchange(ref awaitingPong, 1) != 0) throw new CallsSocketException("Calls heartbeat timed out.", "media_timeout"); await SendObjectAsync(new { type = "ping" }, lifetime.Token).ConfigureAwait(false); }
                if (token.ExpiresAt is { } expiry && expiry - TimeSpan.FromSeconds(60) <= DateTimeOffset.UtcNow) { token = await tokens.GetAsync(true, lifetime.Token).ConfigureAwait(false); await AuthenticateAsync(lifetime.Token).ConfigureAwait(false); }
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error) { frames.Writer.TryComplete(error); lifetime.Cancel(); socket.Abort(); }
    }
    private async Task SendAsync(byte[] data, WebSocketMessageType type, CancellationToken cancellation)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token); await writes.WaitAsync(linked.Token).ConfigureAwait(false);
        try { await socket.SendAsync(data.AsMemory(), type, true, linked.Token).ConfigureAwait(false); }
        finally { writes.Release(); }
    }
    private Task SendObjectAsync(object frame, CancellationToken cancellation = default) => SendAsync(JsonSerializer.SerializeToUtf8Bytes(frame, HttpTransport.Json), WebSocketMessageType.Text, cancellation);
    public Task SendAudioAsync(short[] pcm, CancellationToken cancellationToken = default) { if (!media) throw new PolymorfaConfigurationException("Audio requires a media connection."); return SendAsync(CallsProtocol.EncodeAudio(pcm), WebSocketMessageType.Binary, cancellationToken); }
    public Task SendVideoAsync(CallVideoFrame frame, CancellationToken cancellationToken = default) { if (!media) throw new PolymorfaConfigurationException("Video requires a media connection."); return SendAsync(CallsProtocol.EncodeVideo(frame), WebSocketMessageType.Binary, cancellationToken); }
    public Task SendCandidateAsync(string callId, string connectionId, CallTrickleCandidate candidate, CancellationToken cancellationToken = default) { if (media || !CallsProtocol.Connection(connectionId)) throw new PolymorfaConfigurationException("Candidates require a lifecycle connection and valid connectionId."); return SendObjectAsync(new { type = "candidate", callId, connectionId, candidate }, cancellationToken); }
    public async Task<CallMediaState> SetMediaStateAsync(bool? audioMuted = null, bool? videoEnabled = null, bool? screenSharing = null, CancellationToken cancellationToken = default)
    {
        if (!media || audioMuted is null && videoEnabled is null && screenSharing is null) throw new PolymorfaValidationException("Specify a media preference.", "invalid_parameter");
        if (Interlocked.Increment(ref queuedControls) > 16) { Interlocked.Decrement(ref queuedControls); throw new CallsSocketException("Too many pending media commands.", "media_control_unavailable"); }
        var entered = false;
        try
        {
            await controls.WaitAsync(cancellationToken).ConfigureAwait(false); entered = true; var id = CallsProtocol.CreateConnectionId(); var completion = new TaskCompletionSource<CallMediaState>(TaskCreationOptions.RunContinuationsAsynchronously); lock (controlGate) { pendingId = id; pendingControl = completion; }
            await SendObjectAsync(new { type = "media_state", requestId = id, audioMuted, videoEnabled, screenSharing }, cancellationToken).ConfigureAwait(false);
            var reply = await completion.Task.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken).ConfigureAwait(false);
            if (audioMuted is not null && audioMuted != reply.AudioMuted || videoEnabled is not null && videoEnabled != reply.VideoEnabled || screenSharing is not null && screenSharing != reply.ScreenSharing) throw new CallsSocketException("Media state acknowledgement differs from the request.", "media_control_unknown"); return reply;
        }
        catch (TimeoutException) { throw new CallsSocketException("Media command timed out; its effect is unknown.", "media_control_unknown"); }
        finally { if (entered) { lock (controlGate) { pendingId = null; pendingControl = null; } controls.Release(); } Interlocked.Decrement(ref queuedControls); }
    }
    public Task LeaveAsync(CancellationToken cancellationToken = default) => SendObjectAsync(new { type = "leave" }, cancellationToken);
    public Task EndCallAsync(CancellationToken cancellationToken = default) => SendObjectAsync(new { type = "end_call" }, cancellationToken);
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        lifetime.Cancel(); socket.Abort(); frames.Writer.TryComplete();
        if (reader is not null) await reader.ConfigureAwait(false); if (heartbeat is not null) await heartbeat.ConfigureAwait(false); socket.Dispose(); lifetime.Dispose();
    }
}
