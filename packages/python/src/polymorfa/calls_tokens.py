"""Calls credential caching with independent cancellation and refresh generations."""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from .errors import PolymorfaError


class CallsError(PolymorfaError):
    pass


@dataclass(frozen=True)
class CallsToken:
    value: str = field(repr=False)
    expires_at: float | None = None

    def __post_init__(self) -> None:
        if (
            not isinstance(self.value, str)
            or not self.value
            or (
                self.expires_at is not None
                and (
                    isinstance(self.expires_at, bool)
                    or not isinstance(self.expires_at, (int, float))
                    or not math.isfinite(self.expires_at)
                )
            )
        ):
            raise CallsError("Invalid Calls credential.", code="invalid_token")


@dataclass(frozen=True)
class CallsTokenRequest:
    refresh: bool = False


TokenProvider = Callable[[CallsTokenRequest], Awaitable[str | CallsToken]]


@dataclass
class _Fetch:
    task: asyncio.Task[CallsToken]
    refresh: bool
    waiters: int = 0


class CallsTokenSource:
    """Expiry is Unix epoch seconds; one cancelled task cannot cancel another waiter."""

    def __init__(
        self,
        provider: str | TokenProvider,
        *,
        now: Callable[[], float] = time.time,
        expiry_skew: float = 30,
    ) -> None:
        if isinstance(provider, str):
            token = CallsToken(provider)

            async def static(request: CallsTokenRequest) -> CallsToken:
                return token

            self._provider: TokenProvider = static
        elif callable(provider):
            self._provider = provider
        else:
            raise CallsError("Pass a credential or token provider.", code="invalid_token")
        if expiry_skew < 0 or not math.isfinite(expiry_skew):
            raise CallsError("Invalid credential expiry skew.", code="invalid_token")
        self._now, self._skew = now, expiry_skew
        self._cached: CallsToken | None = None
        self._pending: _Fetch | None = None
        self._generation = 0

    async def get(self, *, refresh: bool = False) -> CallsToken:
        cached = self._cached
        if (
            not refresh
            and cached is not None
            and (cached.expires_at is None or cached.expires_at - self._skew > self._now())
        ):
            return cached
        if refresh:
            self._cached = None
        entry = self._pending
        if entry is None or entry.task.done() or (refresh and not entry.refresh):
            self._generation += 1
            generation = self._generation

            async def fetch() -> CallsToken:
                supplied = await self._provider(CallsTokenRequest(refresh))
                if isinstance(supplied, str):
                    token = CallsToken(supplied)
                elif isinstance(supplied, CallsToken):
                    token = supplied
                else:
                    raise CallsError("Invalid Calls credential.", code="invalid_token")
                if generation == self._generation:
                    self._cached = token
                return token

            entry = _Fetch(asyncio.create_task(fetch()), refresh)
            self._pending = entry
        entry.waiters += 1
        try:
            return await asyncio.shield(entry.task)
        finally:
            entry.waiters -= 1
            if entry.waiters == 0:
                if not entry.task.done():
                    entry.task.cancel()
                if self._pending is entry:
                    self._pending = None

    def invalidate(self) -> None:
        self._cached = None
        self._pending = None
        self._generation += 1
