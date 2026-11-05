using Polymorfa.Sdk;

using var stop = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
var token = Environment.GetEnvironmentVariable("POLYMORFA_API_KEY") ?? throw new InvalidOperationException("POLYMORFA_API_KEY is required.");
var session = Environment.GetEnvironmentVariable("POLYMORFA_SESSION") ?? throw new InvalidOperationException("POLYMORFA_SESSION is required.");
await using var calls = new CallsClient(token, new() { Session = session, Participant = "agent" });
await calls.ConnectAsync(stop.Token);
try
{
    await foreach (var item in calls.EventsAsync(stop.Token))
    {
        if (item is CallIncoming incoming)
        {
            // Consent and application policy belong before AnswerAsync.
            await incoming.Call.AnswerAsync(cancellationToken: stop.Token);
            _ = ObserveAudio(incoming.Call, stop.Token);
        }
    }
}
catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
static async Task ObserveAudio(Call call, CancellationToken cancellation)
{
    try { await foreach (var frame in call.MediaFramesAsync(cancellation)) { if (frame is CallAudioFrame audio) { /* Process signed 16-bit mono PCM at call.SampleRate; never log audio. */ _ = audio.Pcm.Length; } } }
    catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
    catch (PolymorfaException) { /* Application-specific failure handling without logging tokens or media. */ }
}
