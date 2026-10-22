"""Install polymorfa-sdk[calls]; receive programmatic PCM without recording it."""

import asyncio
import os

from polymorfa import CallsClient


async def main() -> None:
    async with CallsClient(
        os.environ["POLYMORFA_API_KEY"],
        os.environ["POLYMORFA_SESSION"],
        participant="voice-worker",
    ) as client:
        async for call in client.incoming_calls():
            await call.answer(exclusive=True)
            print("Connected", call.id, "PCM rate", call.sample_rate)
            try:
                async for frame in call.audio.frames():
                    # Feed frame.samples to your transcriber. No audio is retained here.
                    print("Received samples", len(frame.samples))
            finally:
                await call.leave()


if __name__ == "__main__":
    asyncio.run(main())
