"""Follow retained events by ingestion offset with validated watermarks."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Generic, TypeVar, cast

from .errors import ServerError, ValidationError
from .transport import ApiResponse, JsonObject, ResponseMetadata

T = TypeVar("T")


def validate_after_offset(value: str) -> None:
    if (
        not isinstance(value, str)
        or not re.fullmatch(r"0|[1-9][0-9]*", value)
        or int(value) > 9223372036854775807
    ):
        raise ValidationError(
            "afterOffset must be a nonnegative decimal stream position.",
            code="invalid_after_offset",
        )


@dataclass(frozen=True)
class IndexedPageMetadata:
    has_more: bool
    next_offset: str | None
    high_watermark: str


class IndexedEventPage(Generic[T]):
    def __init__(
        self,
        response: ApiResponse[JsonObject | None],
        after_offset: str,
        load_next: Callable[[str], Awaitable[IndexedEventPage[T]]],
    ) -> None:
        self.response = response
        self.metadata: ResponseMetadata = response.metadata
        self._load_next = load_next
        body = response.data
        page = body.get("page") if isinstance(body, dict) else None
        rows = body.get("data") if isinstance(body, dict) else None
        has_more = page.get("hasMore") if isinstance(page, dict) else None
        high = page.get("highWatermark") if isinstance(page, dict) else None
        next_offset = page.get("nextOffset") if isinstance(page, dict) else None
        valid = (
            isinstance(rows, list)
            and isinstance(has_more, bool)
            and isinstance(high, str)
            and bool(re.fullmatch(r"0|[1-9][0-9]*", high))
        )
        if next_offset is not None:
            valid = (
                valid
                and isinstance(next_offset, str)
                and bool(re.fullmatch(r"0|[1-9][0-9]*", next_offset))
            )
        if valid:
            assert isinstance(high, str)
            if has_more:
                valid = isinstance(next_offset, str) and int(after_offset) < int(
                    next_offset
                ) <= int(high)
            else:
                valid = next_offset is None
        if not valid:
            raise ServerError(
                "Invalid indexed event metadata.",
                code="invalid_response",
                status=response.metadata.status,
                metadata=response.metadata,
                details=body,
            )
        self.items = tuple(cast(list[T], rows))
        self.has_more = cast(bool, has_more)
        self.next_offset = cast(str | None, next_offset)
        self.high_watermark = cast(str, high)
        self.page = IndexedPageMetadata(self.has_more, self.next_offset, self.high_watermark)

    async def next_page(self) -> IndexedEventPage[T] | None:
        if not self.has_more or self.next_offset is None:
            return None
        return await self._load_next(self.next_offset)

    async def auto_paging_iter(self) -> AsyncIterator[T]:
        page: IndexedEventPage[T] | None = self
        while page is not None:
            for event in page.items:
                yield event
            page = await page.next_page()

    def __aiter__(self) -> AsyncIterator[T]:
        return self.auto_paging_iter()
