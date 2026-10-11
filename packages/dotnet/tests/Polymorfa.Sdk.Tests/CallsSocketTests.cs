using System.Net.WebSockets;
using System.Text;
using Polymorfa.Sdk;

internal static class CallsSocketTests
{
    public static async Task RunAsync()
    {
        var bytes = CallsProtocol.EncodeAudio([-32768, -1, 0, 32767]); ResourceTests.True(bytes.SequenceEqual(new byte[] { 1, 0, 128, 255, 255, 0, 0, 255, 127 })); ResourceTests.True(((CallAudioFrame)CallsProtocol.DecodeBinary(bytes)!).Pcm.SequenceEqual(new short[] { -32768, -1, 0, 32767 })); ResourceTests.Equal(CallsProtocol.DecodeBinary(new byte[] { 1, 1 }), null);
        var video = new CallVideoFrame(1, true, 0x01020304, 0x0102030405060708, [0, 0, 0, 1, 101]); var encoded = CallsProtocol.EncodeVideo(video); ResourceTests.True(encoded.SequenceEqual(new byte[] { 2, 1, 1, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 1, 101 })); ResourceTests.Equal(((CallVideoFrame)CallsProtocol.DecodeBinary(encoded)!).TimestampUs, video.TimestampUs);
        ResourceTests.Equal(CallsProtocol.ParseText(Encoding.UTF8.GetBytes("{\"type\":\"media_state\",\"requestId\":\"bad\",\"audioMuted\":false,\"videoEnabled\":false}"), true), null);
        foreach (var malformed in new[] {
            "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":true,\"callId\":null}",
            "{\"type\":\"reaction\",\"emoji\":\"👍\",\"participantId\":\"bad\"}",
            "{\"type\":\"participant_joined\",\"participant\":{\"id\":\"1\",\"state\":\"connected\"}}",
            "{\"type\":\"participant_left\",\"participantId\":\"1\",\"reason\":false}",
            "{\"type\":\"media_state\",\"requestId\":\"request_1\",\"audioMuted\":false,\"videoEnabled\":false,\"screenSharing\":null}",
            "{\"type\":\"video_source\",\"source\":1,\"connectionId\":\"connection_1\",\"participant\":null}"
        }) ResourceTests.Equal(CallsProtocol.ParseText(Encoding.UTF8.GetBytes(malformed), true), null);
        ResourceTests.Equal(CallsProtocol.ParseText(Encoding.UTF8.GetBytes("{\"type\":\"ready\",\"participant\":false}"), false), null);
        await TokenCancellation(); await Lifecycle(); await Media(); await Refresh();
        Console.WriteLine("PASS native Calls WebSockets: first-frame auth, fragmented lifecycle, credential-free URLs, PCM/H264, acknowledged controls and token refresh/cancellation");
    }
    private static async Task TokenCancellation()
    {
        var finish = new TaskCompletionSource<CallsToken>(TaskCreationOptions.RunContinuationsAsynchronously); var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var count = 0; var source = new CallsTokenSource(async request => { Interlocked.Increment(ref count); started.TrySetResult(); return await finish.Task.WaitAsync(request.CancellationToken); });
        using var cancellation = new CancellationTokenSource(); var first = source.GetAsync(cancellationToken: cancellation.Token); await started.Task; var second = source.GetAsync(); cancellation.Cancel(); try { await first; throw new Exception("Token caller was not cancelled"); } catch (OperationCanceledException) { }
        finish.TrySetResult(new("pmfa_ct_fixture", DateTimeOffset.UtcNow.AddHours(1))); ResourceTests.Equal((await second).Value, "pmfa_ct_fixture"); ResourceTests.Equal(count, 1); await source.GetAsync(); ResourceTests.Equal(count, 1);
        var ordinary = new TaskCompletionSource<CallsToken>(TaskCreationOptions.RunContinuationsAsynchronously); var fresh = new TaskCompletionSource<CallsToken>(TaskCreationOptions.RunContinuationsAsynchronously); var source2 = new CallsTokenSource(r => r.Refresh ? fresh.Task : ordinary.Task); var before = source2.GetAsync(); var refresh = source2.GetAsync(true); fresh.TrySetResult(new("fresh")); await refresh; ordinary.TrySetResult(new("old")); await before; ResourceTests.Equal((await source2.GetAsync()).Value, "fresh");
        ResourceTests.True(!new CallsToken("secret").ToString().Contains("secret"));
    }
    private static async Task Lifecycle()
    {
        using var fixture = new WebSocketFixture(); var credential = "pmfa_" + new string('a', 72); var opening = CallsSocket.OpenLifecycleAsync(new(credential), new() { BaseUrl = fixture.Url, Session = "support", Participant = "agent", Heartbeat = TimeSpan.Zero }); using var peer = await fixture.AcceptAsync("/voip/ws?session=support&participant=agent"); var auth = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.Equal(auth.GetProperty("type").GetString(), "auth"); ResourceTests.Equal(auth.GetProperty("token").GetString(), credential); ResourceTests.True(!auth.TryGetProperty("connectionId", out _)); await WebSocketFixture.TextAsync(peer, "{\"type\":\"ready\",\"session\":\"support\",\"participant\":\"server:agent\"}"); await using var socket = await opening;
        await WebSocketFixture.TextAsync(peer, "{\"type\":\"future\"}"); await WebSocketFixture.TextAsync(peer, "{\"type\":\"event\",\"event\":\"call.received\",\"callId\":\"c1\",\"payload\":{\"direction\":\"incoming\",\"amount\":9007199254740993},\"timestamp\":\"2026-09-22T00:00:00Z\"}", true); await using var events = socket.FramesAsync().GetAsyncEnumerator(); ResourceTests.True(await events.MoveNextAsync()); ResourceTests.Equal(((CallLifecycleEvent)events.Current).Payload.GetProperty("amount").GetInt64(), 9007199254740993L);
        await socket.SendCandidateAsync("c1", "connection_1", new("candidate:fixture")); var candidate = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.Equal(candidate.GetProperty("candidate").GetProperty("candidate").GetString(), "candidate:fixture");
        await peer.CloseOutputAsync((WebSocketCloseStatus)4401, "expired", CancellationToken.None); try { await events.MoveNextAsync(); throw new Exception("Unauthorized closure swallowed"); } catch (CallsSocketException e) { ResourceTests.Equal(e.CloseCode, 4401); }
    }
    private static async Task Media()
    {
        using var fixture = new WebSocketFixture(); var opening = CallsSocket.OpenMediaAsync(new("pmfa_ct_fixture"), "c1", "connection_1", new() { BaseUrl = fixture.Url, Participant = "ignored", Heartbeat = TimeSpan.Zero }); using var peer = await fixture.AcceptAsync("/voip/calls/c1/media", CallsProtocol.MediaSubprotocol); var auth = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.Equal(auth.GetProperty("connectionId").GetString(), "connection_1"); ResourceTests.True(!auth.TryGetProperty("participant", out _)); await WebSocketFixture.TextAsync(peer, "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":true}"); await using var socket = await opening;
        await socket.SendAudioAsync([-1, 1]); var audio = await WebSocketFixture.ReceiveAsync(peer); ResourceTests.Equal(audio.Type, WebSocketMessageType.Binary); ResourceTests.True(audio.Bytes.SequenceEqual(new byte[] { 1, 255, 255, 1, 0 }));
        var command = socket.SetMediaStateAsync(audioMuted: true, videoEnabled: false); var control = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.True(control.GetProperty("audioMuted").GetBoolean()); var id = control.GetProperty("requestId").GetString();
        await peer.SendAsync(new byte[] { 1, 1, 0 }.AsMemory(), WebSocketMessageType.Binary, true, CancellationToken.None); await WebSocketFixture.TextAsync(peer, "{\"type\":\"media_state\",\"requestId\":\"" + id + "\",\"audioMuted\":true,\"videoEnabled\":false}"); ResourceTests.True((await command).AudioMuted); await using var frames = socket.FramesAsync().GetAsyncEnumerator(); ResourceTests.True(await frames.MoveNextAsync()); ResourceTests.Equal(((CallAudioFrame)frames.Current).Pcm[0], (short)1); ResourceTests.True(await frames.MoveNextAsync()); ResourceTests.True(frames.Current is CallMediaStateReply);
    }
    private static async Task Refresh()
    {
        using var fixture = new WebSocketFixture(); var calls = 0; var source = new CallsTokenSource(r => { Interlocked.Increment(ref calls); return Task.FromResult(new CallsToken(r.Refresh ? "pmfa_ct_new" : "pmfa_ct_old", DateTimeOffset.UtcNow.AddSeconds(r.Refresh ? 3600 : 45))); }); var opening = CallsSocket.OpenMediaAsync(source, "c1", "connection_1", new() { BaseUrl = fixture.Url, Heartbeat = TimeSpan.FromMilliseconds(50) }); using var peer = await fixture.AcceptAsync("/voip/calls/c1/media", CallsProtocol.MediaSubprotocol); await WebSocketFixture.ReceiveJsonAsync(peer); await WebSocketFixture.TextAsync(peer, "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":false}"); await using var socket = await opening;
        ResourceTests.Equal((await WebSocketFixture.ReceiveJsonAsync(peer)).GetProperty("type").GetString(), "ping"); await WebSocketFixture.TextAsync(peer, "{\"type\":\"pong\"}"); var replacement = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.Equal(replacement.GetProperty("token").GetString(), "pmfa_ct_new"); ResourceTests.Equal(replacement.GetProperty("connectionId").GetString(), "connection_1"); ResourceTests.Equal(calls, 2);
    }
}
