"""Caller-decoded raw JSON pages, independent of the API's envelope shape."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

from .transport import ApiResponse, Json

T = TypeVar("T")


@dataclass(frozen=True)
class PageResult(Generic[T]):
    items: Sequence[T]
    next_cursor: str | None = None


class RawCursorPage(Generic[T]):
    def __init__(
        self,
        response: ApiResponse[Json],
        decoded: PageResult[T],
        load_next: Callable[[str], Awaitable[RawCursorPage[T]]],
    ) -> None:
        self.response = response
        self.items = tuple(decoded.items)
        self.next_cursor = decoded.next_cursor
        self.has_more = self.next_cursor is not None
        self._load_next = load_next

    async def next_page(self) -> RawCursorPage[T] | None:
        if self.next_cursor is None:
            return None
        return await self._load_next(self.next_cursor)

    async def auto_paging_iter(self) -> AsyncIterator[T]:
        page: RawCursorPage[T] | None = self
        while page is not None:
            for item in page.items:
                yield item
            page = await page.next_page()

    def __aiter__(self) -> AsyncIterator[T]:
        return self.auto_paging_iter()
