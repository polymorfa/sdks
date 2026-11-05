using Polymorfa.Sdk;

public static class OfficialCatalogExample
{
    public static async Task<string?> NextCatalogCursorAsync(MessagingClient client, CancellationToken cancellationToken)
    {
        var page = await client.Catalogs.ListProductsAsync("number-id", "123", new(100, "opaque_-"), new() { CancellationToken = cancellationToken });
        return page.Data.Data.NextCursor;
    }
}
