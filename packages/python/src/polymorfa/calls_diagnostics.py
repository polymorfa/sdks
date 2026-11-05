"""Bounded technical call reports; reporting never changes call success or failure."""

from __future__ import annotations

import asyncio
import math
import re
import time
from collections.abc import Awaitable, Callable
from typing import cast

from .voip_models import CallErrorCode, CallQuality, CallReport, ReportClient


class CallReporter:
    def __init__(
        self,
        connection_id: str,
        client: ReportClient,
        send: Callable[[CallReport], Awaitable[object]],
        *,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._connection_id, self._client, self._send, self._now = connection_id, client, send, now
        self.stopped = False
        self._last_quality: float | None = None
        self._error_times: list[float] = []
        self._tasks: set[asyncio.Task[None]] = set()

    def error(self, code: CallErrorCode) -> None:
        if self.stopped:
            return
        now = self._now()
        self._error_times = [point for point in self._error_times if now - point < 60]
        if len(self._error_times) >= 20:
            return
        self._error_times.append(now)
        self._schedule(
            {
                "kind": "error",
                "connectionId": self._connection_id,
                "client": self._client,
                "error": {"code": code},
            }
        )

    def quality(self, figures: CallQuality) -> None:
        if self.stopped:
            return
        quality: dict[str, object] = {}
        for key, maximum in {
            "rttMs": 60000,
            "jitterMs": 60000,
            "packetsLost": 2147483647,
            "packetsReceived": 2147483647,
            "reconnects": 1000,
        }.items():
            value = cast(dict[str, object], figures).get(key)
            if (
                not isinstance(value, bool)
                and isinstance(value, (int, float))
                and math.isfinite(value)
            ):
                quality[key] = min(maximum, max(0, math.floor(value + 0.5)))
        for key in ("audioCodec", "videoCodec"):
            value = cast(dict[str, object], figures).get(key)
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9/.-]{1,32}", value):
                quality[key] = value
        candidate = figures.get("candidateType")
        if candidate in ("host", "srflx", "prflx", "relay"):
            quality["candidateType"] = candidate
        now = self._now()
        if not quality or self._last_quality is not None and now - self._last_quality < 5:
            return
        self._last_quality = now
        self._schedule(
            {
                "kind": "quality",
                "connectionId": self._connection_id,
                "client": self._client,
                "quality": cast(CallQuality, quality),
            }
        )

    def _schedule(self, report: CallReport) -> None:
        async def send() -> None:
            try:
                await self._send(report)
            except Exception as cause:  # noqa: BLE001 - diagnostics never fail a call.
                status = getattr(cause, "status", None)
                if isinstance(status, int) and 400 <= status < 500 and status != 429:
                    self.stopped = True

        task = asyncio.create_task(send())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def stop(self) -> None:
        self.stopped = True

    async def drain(self) -> None:
        await asyncio.gather(*self._tasks, return_exceptions=True)
