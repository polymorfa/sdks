namespace Polymorfa.Sdk;

public sealed record EventSourceMetadata(string Cursor);
public sealed record EventSourceSubscriptionOptions
{
    public string? Cursor { get; init; }
    public CancellationToken CancellationToken { get; init; }
    public Action<Exception>? OnError { get; init; }
}

/// <summary>Feeds decoded webhook bodies to an application-owned event store.</summary>
public sealed class EventStreamSource(Func<EventStreamOptions, IAsyncEnumerable<EventStreamItem>> open, EventStreamOptions? options = null)
{
    public EventSourceSubscription Subscribe(Action<IReadOnlyList<WebhookEvent>, EventSourceMetadata> listener, EventSourceSubscriptionOptions? subscriptionOptions = null)
    {
        ArgumentNullException.ThrowIfNull(listener);
        return new(open, options ?? new(), listener, subscriptionOptions ?? new());
    }
}

/// <summary>Dispose to unsubscribe; await Completion or DisposeAsync to await stream cleanup.</summary>
public sealed class EventSourceSubscription : IDisposable, IAsyncDisposable
{
    private readonly CancellationTokenSource stop;
    private readonly object gate = new();
    private bool finished;
    public Task Completion { get; }
    internal EventSourceSubscription(Func<EventStreamOptions, IAsyncEnumerable<EventStreamItem>> open, EventStreamOptions options, Action<IReadOnlyList<WebhookEvent>, EventSourceMetadata> listener, EventSourceSubscriptionOptions subscription)
    {
        stop = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, subscription.CancellationToken);
        Completion = PumpAsync(open, options with { Since = subscription.Cursor, CancellationToken = stop.Token }, listener, subscription.OnError);
    }
    private async Task PumpAsync(Func<EventStreamOptions, IAsyncEnumerable<EventStreamItem>> open, EventStreamOptions options, Action<IReadOnlyList<WebhookEvent>, EventSourceMetadata> listener, Action<Exception>? onError)
    {
        try
        {
            await foreach (var item in open(options).WithCancellation(stop.Token).ConfigureAwait(false))
            {
                if (stop.IsCancellationRequested) break;
                if (item.Webhook is not null) listener(Array.AsReadOnly(new[] { item.Webhook }), new(item.Cursor));
            }
        }
        catch (Exception error)
        {
            if (!stop.IsCancellationRequested) onError?.Invoke(error);
        }
        finally
        {
            lock (gate) { finished = true; stop.Dispose(); }
        }
    }
    public void Dispose()
    {
        lock (gate) { if (!finished) stop.Cancel(); }
    }
    public async ValueTask DisposeAsync()
    {
        Dispose();
        await Completion.ConfigureAwait(false);
    }
}
