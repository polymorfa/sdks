using System.Text.Json;
using System.Threading.Channels;

namespace Polymorfa.Sdk;

public sealed class Call
{
    private readonly CallsClient owner;
    private readonly object gate = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly Channel<CallSocketFrame> mediaFrames = System.Threading.Channels.Channel.CreateBounded<CallSocketFrame>(new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.Wait });
    private readonly Dictionary<string, CallParticipant> roster = [];
    private readonly Dictionary<uint, CallVideoSource> sources = [];
    private readonly Dictionary<string, long> rosterRevisions = [];
    private readonly Queue<DateTimeOffset> errors = new();
    private readonly SemaphoreSlim diagnostics = new(1, 1);
    private long rosterRevision;
    private CallsSocket? media;
    private Task? mediaRunner;
    private Task? answer;
    private Task<AcceptedCall>? acceptRequest;
    private volatile string state;
    private bool accepted;
    private bool claimedByUs;
    private int reconnects;
    private DateTimeOffset? lastQuality;
    private bool reportsStopped;
    private int reportsQueued;
    public string Id { get; }
    public string Session => owner.Options.Session;
    public string Direction { get; }
    public string Peer { get; }
    private readonly bool offeredVideo;
    public bool HasVideo => offeredVideo && Capabilities.Video;
    public CallCapabilities Capabilities { get; internal set; } = new();
    public string ConnectionId { get; } = CallsProtocol.CreateConnectionId();
    public string State => state;
    public bool Ended => state == "ended";
    public string? EndReason { get; private set; }
    public bool Answered { get; private set; }
    public string? AnsweredBy { get; private set; }
    public bool Exclusive { get; private set; }
    public bool ClaimedByOther { get; private set; }
    public bool CanJoin => state == "incoming" && Answered && !Exclusive && !ClaimedByOther;
    public bool? RemoteAudioMuted { get; private set; }
    public int? SampleRate { get; private set; }
    public bool HandRaised { get; private set; }
    public bool SocialSupported { get; private set; }
    public CallMediaState MediaState { get; private set; } = new(false, false);
    public IReadOnlyList<CallParticipant> Participants { get { lock (gate) return roster.Values.ToArray(); } }
    public IReadOnlyList<CallVideoSource> VideoSources { get { lock (gate) return sources.Values.ToArray(); } }
    internal Call(CallsClient owner, string id, string direction, string peer, bool video, bool exclusive) { this.owner = owner; Id = id; Direction = direction; Peer = peer; offeredVideo = video; claimedByUs = exclusive; Exclusive = exclusive; accepted = direction == "outbound"; state = direction == "inbound" ? "incoming" : "ringing"; }
    public IAsyncEnumerable<CallSocketFrame> MediaFramesAsync(CancellationToken cancellationToken = default) => mediaFrames.Reader.ReadAllAsync(cancellationToken);
    public Task AnswerAsync(bool exclusive = false, bool? video = null, CancellationToken cancellationToken = default)
    {
        lock (gate) { if (answer is not null) return answer; if (state != "incoming" || ClaimedByOther) throw new CallsSocketException("This call cannot be answered by this participant.", ClaimedByOther ? "call_claimed" : "invalid_state"); answer = AnswerCoreAsync(exclusive, video ?? HasVideo, cancellationToken); return answer; }
    }
    public Task JoinAsync(bool? video = null, CancellationToken cancellationToken = default) { if (!Answered && state == "incoming") throw new CallsSocketException("Nobody has answered this call yet.", "call_not_answered"); return AnswerAsync(false, video, cancellationToken); }
    private async Task AnswerCoreAsync(bool exclusive, bool video, CancellationToken cancellation)
    {
        await Task.Yield(); var changed = false;
        try
        {
            Transition("connecting"); acceptRequest = owner.RequestAsync(async (c, participant, options) => (await c.Calls.AcceptAsync(Id, new(exclusive, video, participant), options).ConfigureAwait(false)).Data.Data, new() { CancellationToken = cancellation });
            var result = await acceptRequest.ConfigureAwait(false); accepted = changed = true; claimedByUs = result.Exclusive; Answered = result.Answered; AnsweredBy = result.AnsweredBy; Exclusive = result.Exclusive; MediaState = MediaState with { VideoEnabled = video };
            if (Ended) { await ReleaseAsync().ConfigureAwait(false); return; }
            await AttachAsync(false, cancellation).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            if (changed) { ReportFailure(error); await ReleaseAsync().ConfigureAwait(false); Finish(error is CallsSocketException { CloseCode: 4409 } ? "claimed" : "connection_failed"); }
            else if (!Ended) { if (error is PolymorfaException { Code: "call_claimed" }) ClaimedByOther = true; Transition("incoming"); }
            throw;
        }
        finally { lock (gate) answer = null; }
    }
    internal void Apply(CallLifecycleEvent e)
    {
        if (Ended) return;
        if (e.Event == "call.accepted")
        {
            Capabilities = CallsClient.Capabilities(e.Payload, Capabilities); Answered = true; AnsweredBy = CallsClient.Field(e.Payload, "answeredBy"); Exclusive = CallsClient.Flag(e.Payload, "exclusive") || claimedByUs;
            if (Direction == "outbound" && state == "ringing") { Transition("connecting"); Observe(AttachOutboundAsync()); }
            else if (Exclusive && !accepted && answer is null && AnsweredBy != owner.SelfParticipant) ClaimedByOther = true;
            owner.Publish(new CallChanged(this));
        }
        else if (e.Event is "call.ended" or "call.missed" or "call.rejected") Finish(e.Event == "call.ended" ? CallsClient.Field(e.Payload, "reason") ?? "unknown" : e.Event[5..]);
        else if (e.Event is "call.participant_joined" or "call.participant_state" && e.Payload.ValueKind == JsonValueKind.Object && e.Payload.TryGetProperty("participant", out var p)) { try { var value = p.Deserialize<CallParticipant>(HttpTransport.Json); if (value is not null) UpdateParticipant(value); } catch (JsonException) { } }
        else if (e.Event == "call.participant_left" && CallsClient.Field(e.Payload, "participantId") is { } id) ParticipantLeft(id);
    }
    private async Task AttachOutboundAsync() { try { await AttachAsync(false, lifetime.Token).ConfigureAwait(false); } catch (Exception error) { if (!Ended) { ReportFailure(error); await ReleaseAsync().ConfigureAwait(false); Finish("connection_failed"); } } }
    private async Task AttachAsync(bool refresh, CancellationToken cancellation)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token); var connection = await CallsSocket.OpenMediaAsync(owner.Tokens, Id, ConnectionId, owner.SocketOptions, refresh, linked.Token).ConfigureAwait(false);
        try
        {
            if (Ended) { await connection.DisposeAsync().ConfigureAwait(false); return; }
            RemoteAudioMuted = null;
            if (reconnects > 0 && MediaState != new CallMediaState(false, false)) MediaState = await connection.SetMediaStateAsync(MediaState.AudioMuted, MediaState.VideoEnabled, MediaState.ScreenSharing, linked.Token).ConfigureAwait(false);
            if (Ended) { await connection.DisposeAsync().ConfigureAwait(false); return; }
            SampleRate = connection.Ready.SampleRate; media = connection; Transition("connected"); mediaRunner = ReadMediaAsync(connection);
        }
        catch { await connection.DisposeAsync().ConfigureAwait(false); throw; }
    }
    private async Task ReadMediaAsync(CallsSocket connection)
    {
        Exception? failure = null;
        try
        {
            await foreach (var frame in connection.FramesAsync(lifetime.Token).ConfigureAwait(false))
            {
                if (frame is CallRemoteMedia mute) RemoteAudioMuted = mute.AudioMuted;
                else if (frame is CallHandState hand) { HandRaised = hand.Raised; SocialSupported = hand.Supported; }
                else if (frame is CallParticipantFrame participant) UpdateParticipant(participant.Participant);
                else if (frame is CallParticipantLeft left) ParticipantLeft(left.ParticipantId);
                else if (frame is CallVideoSource source) { lock (gate) sources[source.Source] = source; }
                else if (frame is CallVideoSourceRemoved removed) { lock (gate) sources.Remove(removed.Source); }
                else if (frame is CallSocketError error && error.Code is "call_claimed" or "calls_disabled") { failure = new CallsSocketException("Media was refused by the platform.", error.Code, error.Code == "call_claimed" ? 4409 : 4403); }
                await mediaFrames.Writer.WriteAsync(frame, lifetime.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error) { failure ??= error; }
        finally { await connection.DisposeAsync().ConfigureAwait(false); }
        if (Ended || lifetime.IsCancellationRequested) return;
        failure ??= new CallsSocketException("Media connection ended.", "socket_closed", connection.CloseCode);
        if (failure is CallsSocketException { CloseCode: 1000 or 4409 }) { Finish(failure is CallsSocketException { Code: "call_claimed" } ? "claimed" : "remote_hangup"); return; }
        if (failure is CallsSocketException { CloseCode: 4400 or 4403 or 1008 }) { ReportFailure(failure); await ReleaseAsync().ConfigureAwait(false); Finish("connection_failed"); return; }
        Transition("reconnecting"); var refresh = failure is CallsSocketException { CloseCode: 4401 }; if (refresh) owner.Tokens.Invalidate();
        for (var attempt = 0; attempt < owner.Options.ReconnectAttempts && !Ended; attempt++)
        {
            try { await Task.Delay(TimeSpan.FromMilliseconds(Math.Min(owner.Options.MaxBackoff.TotalMilliseconds, owner.Options.MinBackoff.TotalMilliseconds * Math.Pow(2, attempt))), lifetime.Token).ConfigureAwait(false); reconnects++; await AttachAsync(refresh, lifetime.Token).ConfigureAwait(false); return; }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { return; }
            catch (Exception error) { failure = error; if (error is CallsSocketException { CloseCode: 4400 or 4403 or 4409 or 1008 }) break; refresh |= error is CallsSocketException { CloseCode: 4401 }; }
        }
        if (!Ended) { ReportError("reconnect_exhausted"); await ReleaseAsync().ConfigureAwait(false); Finish("connection_failed"); }
    }
    public Task SendAudioAsync(short[] pcm, CancellationToken cancellationToken = default) => ConnectedMedia().SendAudioAsync(pcm, cancellationToken);
    public Task SendVideoAsync(CallVideoFrame frame, CancellationToken cancellationToken = default) => ConnectedMedia().SendVideoAsync(frame, cancellationToken);
    public async Task<CallMediaState> SetMediaStateAsync(bool? audioMuted = null, bool? videoEnabled = null, bool? screenSharing = null, CancellationToken cancellationToken = default) { var result = await ConnectedMedia().SetMediaStateAsync(audioMuted, videoEnabled, screenSharing, cancellationToken).ConfigureAwait(false); if (!Ended) MediaState = result; return result; }
    private CallsSocket ConnectedMedia() => state == "connected" && media is { Connected: true } connection ? connection : throw new CallsSocketException("Media is not connected.", "invalid_state");
    public async Task RejectAsync(CancellationToken cancellationToken = default) { if (state != "incoming" || Answered) throw new CallsSocketException("Only a ringing unanswered call can be rejected.", "invalid_state"); await owner.RequestAsync(async (c, participant, o) => await c.Calls.RejectAsync(Id, new(participant), o).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); Finish("rejected"); }
    public async Task EndAsync(CancellationToken cancellationToken = default) { if (Ended) return; await owner.RequestAsync(async (c, _, o) => await c.Calls.EndAsync(Id, o with { IdempotencyKey = "voip-end:" + Id }).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); Finish("hangup"); }
    public async Task LeaveAsync(CancellationToken cancellationToken = default)
    {
        if (Ended) return; if (Direction == "outbound" && state == "ringing") { await EndAsync(cancellationToken).ConfigureAwait(false); return; }
        if (acceptRequest is { } pending) { try { await pending.ConfigureAwait(false); } catch (PolymorfaException) { } }
        if (Ended) return;
        if (accepted) { if (media is { Connected: true } connection) await connection.LeaveAsync(cancellationToken).ConfigureAwait(false); else await owner.RequestAsync(async (c, participant, o) => await c.Calls.LeaveAsync(Id, new(ConnectionId, participant), o).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); }
        Finish("left");
    }
    public async Task<CallParticipant> AddParticipantAsync(string to, CancellationToken cancellationToken = default)
    {
        if (Ended || !Capabilities.Invite) throw new CallsSocketException("Participant invitations are unavailable.", "invalid_state"); long revision; lock (gate) revision = rosterRevision;
        var value = await owner.RequestAsync(async (c, _, o) => (await c.Calls.AddParticipantAsync(Id, new(to), o).ConfigureAwait(false)).Data.Data, new() { CancellationToken = cancellationToken }).ConfigureAwait(false); lock (gate) { if (rosterRevisions.GetValueOrDefault(value.Id) <= revision) UpdateParticipant(value); }
        return value;
    }
    public async Task RingParticipantAsync(string to, CancellationToken cancellationToken = default) { if (Ended || !Capabilities.Invite) throw new CallsSocketException("Participant ringing is unavailable.", "invalid_state"); await owner.RequestAsync(async (c, _, o) => await c.Calls.RingParticipantAsync(Id, new(to), o).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); }
    public async Task SendReactionAsync(string emoji, CancellationToken cancellationToken = default) { if (state != "connected" || !SocialSupported) throw new CallsSocketException("Call reactions are unavailable.", "invalid_state"); await owner.RequestAsync(async (c, participant, o) => await c.Calls.SendReactionAsync(Id, new(ConnectionId, emoji, participant), o).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); }
    public async Task SetHandRaisedAsync(bool raised, CancellationToken cancellationToken = default) { if (state != "connected" || !SocialSupported) throw new CallsSocketException("Call hand controls are unavailable.", "invalid_state"); await owner.RequestAsync(async (c, participant, o) => await c.Calls.SetHandRaisedAsync(Id, new(ConnectionId, raised, participant), o).ConfigureAwait(false), new() { CancellationToken = cancellationToken }).ConfigureAwait(false); }
    private void UpdateParticipant(CallParticipant participant) { if (string.IsNullOrEmpty(participant.Id) || participant.State is not ("invited" or "ringing" or "connected" or "left")) return; lock (gate) { rosterRevisions[participant.Id] = ++rosterRevision; if (roster.TryGetValue(participant.Id, out var old) && Rank(old.State) > Rank(participant.State)) return; roster[participant.Id] = participant; } owner.Publish(new CallChanged(this)); }
    private void ParticipantLeft(string id) { lock (gate) { rosterRevisions[id] = ++rosterRevision; if (roster.TryGetValue(id, out var old)) roster[id] = old with { State = "left" }; } owner.Publish(new CallChanged(this)); }
    private static int Rank(string value) => value switch { "left" => 3, "connected" => 2, "ringing" => 1, _ => 0 };
    private void Transition(string next) { lock (gate) { if (Ended) return; state = next; } owner.Publish(new CallChanged(this)); }
    private void Finish(string reason) { lock (gate) { if (Ended) return; state = "ended"; EndReason = reason; lifetime.Cancel(); } ReportQuality(new(Reconnects: reconnects)); mediaFrames.Writer.TryComplete(); if (media is { } connection) Observe(connection.DisposeAsync().AsTask()); owner.Completed(this, reason); }
    internal async Task DisconnectAsync() { if (!Ended && accepted) { using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5)); try { await LeaveAsync(deadline.Token).ConfigureAwait(false); } catch (Exception e) when (e is PolymorfaException or OperationCanceledException) { } } Finish("left"); if (media is { } connection) await connection.DisposeAsync().ConfigureAwait(false); if (mediaRunner is not null) await mediaRunner.ConfigureAwait(false); }
    private async Task ReleaseAsync()
    {
        if (!accepted || ClaimedByOther) return; using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5)); try { if (claimedByUs) await owner.RequestAsync(async (c, _, o) => await c.Calls.EndAsync(Id, o with { IdempotencyKey = "voip-end:" + Id }).ConfigureAwait(false), new() { CancellationToken = deadline.Token }).ConfigureAwait(false); else await owner.RequestAsync(async (c, participant, o) => await c.Calls.LeaveAsync(Id, new(ConnectionId, participant), o).ConfigureAwait(false), new() { CancellationToken = deadline.Token }).ConfigureAwait(false); } catch (PolymorfaException) { } catch (OperationCanceledException) { }
    }
    private void ReportFailure(Exception e) { ReportError(e is CallsSocketException { Code: "media_timeout" } ? "media_timeout" : e is CallsSocketException { CloseCode: 4401 } ? "token_refresh_failed" : "other"); owner.Publish(new CallsFailure(e)); }
    public void ReportQuality(CallQuality quality) { lock (gate) { if (lastQuality is { } previous && DateTimeOffset.UtcNow - previous < TimeSpan.FromSeconds(5)) return; lastQuality = DateTimeOffset.UtcNow; } Report(new("quality", ConnectionId, new("polymorfa-dotnet", SdkVersion.Version, "other"), Quality: quality)); }
    public void ReportError(string code) { lock (gate) { var now = DateTimeOffset.UtcNow; while (errors.TryPeek(out var old) && now - old >= TimeSpan.FromMinutes(1)) errors.Dequeue(); if (errors.Count >= 20) return; errors.Enqueue(now); } Report(new("error", ConnectionId, new("polymorfa-dotnet", SdkVersion.Version, "other"), Error: new(code))); }
    private void Report(CallReportRequest report) { if (!owner.Options.Diagnostics || reportsStopped) return; if (Interlocked.Increment(ref reportsQueued) > 32) { Interlocked.Decrement(ref reportsQueued); return; } Observe(SendReportAsync(report)); }
    private async Task SendReportAsync(CallReportRequest report)
    {
        await diagnostics.WaitAsync().ConfigureAwait(false); try { if (reportsStopped) return; using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await owner.RequestAsync(async (c, participant, o) => await c.Calls.ReportAsync(Id, report with { Participant = participant }, o).ConfigureAwait(false), new() { MaxNetworkRetries = 0, CancellationToken = timeout.Token }).ConfigureAwait(false); } catch (PolymorfaException error) { if (error.Status is >= 400 and < 500 and not 429) reportsStopped = true; } catch (OperationCanceledException) { } finally { diagnostics.Release(); Interlocked.Decrement(ref reportsQueued); }
    }
    private void Observe(Task task) { _ = ObserveAsync(task); }
    private async Task ObserveAsync(Task task) { try { await task.ConfigureAwait(false); } catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { } catch (Exception error) { owner.Publish(new CallsFailure(error)); } }
}
