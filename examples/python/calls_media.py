"""Attach to an already admitted server Call; no microphone or browser dependency."""

import asyncio
import os

from polymorfa import Credential
from polymorfa.calls import AudioFrame, MediaSocket


async def main() -> None:
    async with MediaSocket(
        Credential("organization_api_key", os.environ["POLYMORFA_API_KEY"]),
        os.environ["POLYMORFA_CALL_ID"],
        os.environ["POLYMORFA_CONNECTION_ID"],
        participant=os.environ["POLYMORFA_PARTICIPANT"],
    ) as socket:
        frame = await socket.receive()
        if isinstance(frame, AudioFrame):
            print(f"Received {len(frame.samples)} samples at {socket.sample_rate} Hz")
        await socket.leave()


if __name__ == "__main__":
    asyncio.run(main())
