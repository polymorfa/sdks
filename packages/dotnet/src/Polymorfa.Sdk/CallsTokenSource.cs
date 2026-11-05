namespace Polymorfa.Sdk;

public sealed record CallsToken(string Value, DateTimeOffset? ExpiresAt = null) { public override string ToString() => "CallsToken(redacted)"; }
public sealed record CallsTokenRequest(bool Refresh, CancellationToken CancellationToken);
public delegate Task<CallsToken> CallsTokenProvider(CallsTokenRequest request);
public sealed class CallsTokenSource
{
    private sealed class Pending(bool refresh, long generation)
    {
        internal bool Refresh { get; } = refresh;
        internal long Generation { get; } = generation;
        internal CancellationTokenSource Cancellation { get; } = new();
        internal Task<CallsToken> Task { get; set; } = null!;
        internal int Waiters;
    }
    private readonly object gate = new();
    private readonly CallsTokenProvider provider;
    private readonly TimeSpan skew;
    private CallsToken? cached;
    private Pending? pending;
    private long generation;
    public CallsTokenSource(string token, TimeSpan? expirySkew = null) : this(_ => Task.FromResult(new CallsToken(token)), expirySkew) { Validate(new(token)); }
    public CallsTokenSource(CallsTokenProvider provider, TimeSpan? expirySkew = null) { this.provider = provider ?? throw new ArgumentNullException(nameof(provider)); skew = expirySkew ?? TimeSpan.FromSeconds(30); if (skew < TimeSpan.Zero) throw new PolymorfaConfigurationException("Expiry skew cannot be negative."); }
    public async Task<CallsToken> GetAsync(bool refresh = false, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested(); Pending entry;
        lock (gate)
        {
            if (!refresh && cached is { } token && (token.ExpiresAt is null || token.ExpiresAt - skew > DateTimeOffset.UtcNow)) return token;
            if (refresh) cached = null;
            if (pending is null || refresh && !pending.Refresh) { entry = new(refresh, ++generation); pending = entry; entry.Task = FetchAsync(entry); } else entry = pending;
            entry.Waiters++;
        }
        try { return await entry.Task.WaitAsync(cancellationToken).ConfigureAwait(false); }
        finally { lock (gate) { entry.Waiters--; if (entry.Waiters == 0 && !entry.Task.IsCompleted) { if (pending == entry) { pending = null; generation++; } entry.Cancellation.Cancel(); } } }
    }
    private async Task<CallsToken> FetchAsync(Pending entry)
    {
        await Task.Yield();
        try { var token = await provider(new(entry.Refresh, entry.Cancellation.Token)).ConfigureAwait(false); Validate(token); lock (gate) { if (entry.Generation == generation) cached = token; } return token; }
        finally { lock (gate) { if (pending == entry) pending = null; } }
    }
    public void Invalidate() { lock (gate) { cached = null; pending = null; generation++; } }
    private static void Validate(CallsToken token) { if (token is null || string.IsNullOrWhiteSpace(token.Value) || token.Value.Contains('\r') || token.Value.Contains('\n')) throw new PolymorfaConfigurationException("The Calls token provider returned an invalid token."); }
}
