from polymorfa import AsyncMessagingClient

async def next_catalog_cursor(client: AsyncMessagingClient) -> str | None:
    page = await client.catalogs.list_products("number-id", "123", limit=100, cursor="opaque_-")
    return page.data["data"].get("nextCursor")
