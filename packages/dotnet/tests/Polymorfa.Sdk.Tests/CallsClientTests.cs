using System.Net.WebSockets;
using Polymorfa.Sdk;

internal static class CallsClientTests
{
    private static string Event(string name, string id, string payload = "{}") => "{\"type\":\"event\",\"event\":\"" + name + "\",\"callId\":\"" + id + "\",\"payload\":" + payload + ",\"timestamp\":\"2026-09-22T00:00:00Z\"}";
    private static CallsClientOptions Options(WebSocketFixture socket, WireFixture http) => new() { Session = "support", Participant = "agent", Http = new() { BaseUrl = http.Url, MaxNetworkRetries = 0 }, Socket = new() { BaseUrl = socket.Url, Heartbeat = TimeSpan.Zero }, Diagnostics = false, MinBackoff = TimeSpan.FromMilliseconds(20), MaxBackoff = TimeSpan.FromMilliseconds(40) };
    private static async Task<CallsClientEvent> Next(IAsyncEnumerator<CallsClientEvent> events, Func<CallsClientEvent, bool> predicate) { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); while (await events.MoveNextAsync().AsTask().WaitAsync(timeout.Token)) { if (predicate(events.Current)) return events.Current; } throw new Exception("Calls event stream ended."); }
    public static async Task RunAsync()
    {
        await InboundMediaReconnect(); await EarlyTerminalAndClaims(); await LifecycleRefresh(); await OutboundTerminalBeforeResponse();
        Console.WriteLine("PASS high-level Calls: incoming/answer, preserved connection/media preferences on reconnect, terminal de-duplication, claims and lifecycle token refresh");
    }
    private static async Task OutboundTerminalBeforeResponse()
    {
        var received = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var ws = new WebSocketFixture(); using var http = new WireFixture { BeforeResponse = () => { received.TrySetResult(); return release.Task; }, RequiredHeaders = ["idempotency-key"] };
        await using var client = new CallsClient("pmfa_ct_fixture", Options(ws, http)); var opening = client.ConnectAsync();
        using var lifecycle = await ws.AcceptAsync("/voip/ws"); await WebSocketFixture.ReceiveJsonAsync(lifecycle); await WebSocketFixture.TextAsync(lifecycle, "{\"type\":\"ready\"}"); await opening;
        await using var events = client.EventsAsync().GetAsyncEnumerator(); await Next(events, e => e is CallsReady);
        var serving = http.ServeAsync("POST", "/messaging/voip/calls", "{\"groupId\":\"group\",\"video\":false}", "{\"success\":true,\"data\":{\"callId\":\"out1\",\"session\":\"support\",\"video\":false}}");
        var placing = client.PlaceGroupAsync("group"); await received.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await WebSocketFixture.TextAsync(lifecycle, Event("call.ended", "out1", "{\"reason\":\"remote_hangup\"}"));
        // The subsequent event establishes that the lifecycle reader processed the earlier terminal event.
        await WebSocketFixture.TextAsync(lifecycle, Event("call.received", "barrier", "{\"direction\":\"incoming\"}")); await Next(events, e => e is CallIncoming);
        release.TrySetResult(); var call = await placing; await serving; ResourceTests.True(call.Ended); ResourceTests.Equal(call.EndReason, "remote_hangup"); ResourceTests.Equal(call.Peer, "group");
    }
    private static async Task InboundMediaReconnect()
    {
        using var ws = new WebSocketFixture(); using var http = new WireFixture(); await using var client = new CallsClient("pmfa_ct_fixture", Options(ws, http)); var connect = client.ConnectAsync(); using var lifecycle = await ws.AcceptAsync("/voip/ws"); await WebSocketFixture.ReceiveJsonAsync(lifecycle); await WebSocketFixture.TextAsync(lifecycle, "{\"type\":\"ready\",\"participant\":\"client:one\"}"); await connect; await using var events = client.EventsAsync().GetAsyncEnumerator(); await Next(events, e => e is CallsReady);
        await WebSocketFixture.TextAsync(lifecycle, Event("call.received", "in1", "{\"direction\":\"incoming\",\"from\":{\"phoneNumber\":\"+15550001111\"},\"hasVideo\":false}")); var call = ((CallIncoming)await Next(events, e => e is CallIncoming)).Call; ResourceTests.Equal(call.Peer, "+15550001111");
        var serving = http.ServeAsync("POST", "/messaging/voip/calls/in1/accept", "{\"exclusive\":false,\"video\":false}", "{\"success\":true,\"data\":{\"answered\":true,\"answeredBy\":\"client:one\",\"exclusive\":false}}"); var answer = call.AnswerAsync(); using var media = await ws.AcceptAsync("/voip/calls/in1/media", CallsProtocol.MediaSubprotocol); var auth = await WebSocketFixture.ReceiveJsonAsync(media); ResourceTests.Equal(auth.GetProperty("connectionId").GetString(), call.ConnectionId); await WebSocketFixture.TextAsync(media, "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":false}"); await answer; await serving; ResourceTests.Equal(call.State, "connected");
        var change = call.SetMediaStateAsync(audioMuted: true); var command = await WebSocketFixture.ReceiveJsonAsync(media); await WebSocketFixture.TextAsync(media, "{\"type\":\"media_state\",\"requestId\":\"" + command.GetProperty("requestId").GetString() + "\",\"audioMuted\":true,\"videoEnabled\":false}"); ResourceTests.True((await change).AudioMuted);
        await media.CloseOutputAsync((WebSocketCloseStatus)1012, "restart", CancellationToken.None); using var reattached = await ws.AcceptAsync("/voip/calls/in1/media", CallsProtocol.MediaSubprotocol); var newAuth = await WebSocketFixture.ReceiveJsonAsync(reattached); ResourceTests.Equal(newAuth.GetProperty("connectionId").GetString(), call.ConnectionId); await WebSocketFixture.TextAsync(reattached, "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":false}"); var restore = await WebSocketFixture.ReceiveJsonAsync(reattached); ResourceTests.Equal(restore.GetProperty("type").GetString(), "media_state"); ResourceTests.True(restore.GetProperty("audioMuted").GetBoolean()); await WebSocketFixture.TextAsync(reattached, "{\"type\":\"media_state\",\"requestId\":\"" + restore.GetProperty("requestId").GetString() + "\",\"audioMuted\":true,\"videoEnabled\":false}"); await Next(events, e => e is CallChanged && call.State == "connected");
        await WebSocketFixture.TextAsync(lifecycle, Event("call.ended", "in1", "{\"reason\":\"remote_hangup\"}")); ResourceTests.Equal(((CallEnded)await Next(events, e => e is CallEnded)).Reason, "remote_hangup"); ResourceTests.True(call.Ended); ResourceTests.Equal(client.ActiveCalls.Count, 0);
    }
    private static async Task EarlyTerminalAndClaims()
    {
        using var ws = new WebSocketFixture(); using var http = new WireFixture(); await using var client = new CallsClient("pmfa_ct_fixture", Options(ws, http)); var connect = client.ConnectAsync(); using var lifecycle = await ws.AcceptAsync("/voip/ws"); await WebSocketFixture.ReceiveJsonAsync(lifecycle); await WebSocketFixture.TextAsync(lifecycle, "{\"type\":\"ready\",\"participant\":\"client:one\"}"); await connect; await using var events = client.EventsAsync().GetAsyncEnumerator(); await Next(events, e => e is CallsReady);
        await WebSocketFixture.TextAsync(lifecycle, Event("call.missed", "early")); await WebSocketFixture.TextAsync(lifecycle, Event("call.received", "early", "{\"direction\":\"incoming\"}")); var early = ((CallEnded)await Next(events, e => e is CallEnded)).Call; ResourceTests.True(early.Ended); ResourceTests.Equal(early.EndReason, "missed");
        await WebSocketFixture.TextAsync(lifecycle, Event("call.received", "early", "{\"direction\":\"incoming\"}")); await WebSocketFixture.TextAsync(lifecycle, Event("call.received", "claim", "{\"direction\":\"incoming\"}")); var claim = ((CallIncoming)await Next(events, e => e is CallIncoming)).Call; ResourceTests.Equal(claim.Id, "claim");
        await WebSocketFixture.TextAsync(lifecycle, Event("call.accepted", "claim", "{\"answeredBy\":\"client:other\",\"exclusive\":true,\"capabilities\":{\"video\":false,\"invite\":false}}")); await Next(events, e => e is CallChanged && claim.ClaimedByOther); ResourceTests.True(!claim.CanJoin && !claim.Capabilities.Video && !claim.Capabilities.Invite); try { await claim.AnswerAsync(); throw new Exception("Claimed call answered"); } catch (CallsSocketException e) { ResourceTests.Equal(e.Code, "call_claimed"); }
        var serving = http.ServeAsync("DELETE", "/messaging/voip/calls/claim", null, "{\"error\":{\"code\":\"call_claimed\",\"message\":\"Claimed\"}}", 409); try { await claim.EndAsync(); throw new Exception("Refused hangup accepted"); } catch (PolymorfaConflictException) { }
        await serving; ResourceTests.True(!claim.Ended); await WebSocketFixture.TextAsync(lifecycle, Event("call.ended", "claim")); await Next(events, e => e is CallEnded ended && ended.Call.Id == "claim");
    }
    private static async Task LifecycleRefresh()
    {
        using var ws = new WebSocketFixture(); using var http = new WireFixture(); var refreshCalls = 0; var tokens = new CallsTokenSource(r => { if (r.Refresh) Interlocked.Increment(ref refreshCalls); return Task.FromResult(new CallsToken(r.Refresh ? "pmfa_ct_new" : "pmfa_ct_old")); }); await using var client = new CallsClient(tokens, Options(ws, http)); var connect = client.ConnectAsync(); using var peer = await ws.AcceptAsync("/voip/ws"); ResourceTests.Equal((await WebSocketFixture.ReceiveJsonAsync(peer)).GetProperty("token").GetString(), "pmfa_ct_old"); await WebSocketFixture.TextAsync(peer, "{\"type\":\"ready\"}"); await connect;
        await peer.CloseOutputAsync((WebSocketCloseStatus)4401, "expired", CancellationToken.None); using var retry = await ws.AcceptAsync("/voip/ws"); ResourceTests.Equal((await WebSocketFixture.ReceiveJsonAsync(retry)).GetProperty("token").GetString(), "pmfa_ct_new"); await WebSocketFixture.TextAsync(retry, "{\"type\":\"ready\"}"); ResourceTests.Equal(refreshCalls, 1);
    }
}
