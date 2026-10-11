"""Run with POLYMORFA_API_KEY and POLYMORFA_SESSION from your server environment."""

import asyncio
import os

from polymorfa import AsyncMessagingClient, Credential, RequestOptions


async def main() -> None:
    async with AsyncMessagingClient(
        Credential("organization_api_key", os.environ["POLYMORFA_API_KEY"])
    ) as client:
        response = await client.messages.send(
            os.environ["POLYMORFA_SESSION"],
            {"conversation": {"phoneNumber": os.environ["POLYMORFA_RECIPIENT"]},
             "content": {"text": "Hello from Python"}},
            options=RequestOptions(idempotency_key=os.environ["POLYMORFA_IDEMPOTENCY_KEY"]),
        )
        print(response.data["data"]["id"], response.metadata.request_id)


if __name__ == "__main__":
    asyncio.run(main())
