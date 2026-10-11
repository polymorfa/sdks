"""Async HTTP transport. Cancelling the caller task cancels the active request."""

from __future__ import annotations

import asyncio
import json
import platform
import random
import re
import sys
import time
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field, replace
from email.utils import parsedate_to_datetime
from types import MappingProxyType
from typing import Generic, Literal, TypeVar, cast
from urllib.parse import unquote, urlencode, urlsplit

import httpx

from .errors import (
    AuthenticationError,
    AuthorizationError,
    ConfigurationError,
    ConflictError,
    ConnectionError,
    NotFoundError,
    PaymentRequiredError,
    PolymorfaError,
    RateLimitError,
    ServerError,
    TimeoutError,
    ValidationError,
)

SDK_VERSION = "0.1.0.dev0"
API_VERSION = "2026-09-22"
Json = None | bool | int | float | str | list["Json"] | dict[str, "Json"]
JsonObject = dict[str, Json]
QueryValue = str | int | float | bool | list[str | int | float | bool] | None
T = TypeVar("T")


@dataclass(frozen=True)
class Credential:
    kind: Literal["organization_api_key", "project_token", "client_token"]
    value: str = field(repr=False)

    def __post_init__(self) -> None:
        if self.kind == "organization_api_key" and self.value.startswith(
            ("pmfa_pt_", "pmfa_ct_", "pmfa_ls_", "pmfa_at_", "pmfa_wst_", "pmfa_sd_")
        ):
            raise ConfigurationError("credential")
        pattern = {
            "organization_api_key": r"pmfa_[A-Za-z0-9_-]{72}",
            "project_token": r"pmfa_pt_[A-Za-z0-9_-]{93}[AQgw]",
            "client_token": r"pmfa_ct_.+",
        }.get(self.kind)
        if pattern is None or re.fullmatch(pattern, self.value) is None:
            raise ConfigurationError("credential")
        if sys.platform in ("emscripten", "wasi") and self.kind != "client_token":
            raise ConfigurationError("runtime")


@dataclass(frozen=True)
class RequestOptions:
    timeout: float | None = None
    max_network_retries: int | None = None
    api_version: str | None = None
    idempotency_key: str | None = None
    headers: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "headers", MappingProxyType(dict(self.headers)))
        if self.timeout is not None and (self.timeout <= 0 or not self.timeout < float("inf")):
            raise ConfigurationError("timeout")
        if self.max_network_retries is not None and (
            isinstance(self.max_network_retries, bool)
            or self.max_network_retries < 0
            or not isinstance(self.max_network_retries, int)
        ):
            raise ConfigurationError("max_network_retries")
        if self.api_version is not None and not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}", self.api_version
        ):
            raise ConfigurationError("api_version")
        if self.idempotency_key is not None and (
            not self.idempotency_key or "\r" in self.idempotency_key or "\n" in self.idempotency_key
        ):
            raise ConfigurationError("idempotency_key")

    def with_idempotency_key(self) -> RequestOptions:
        import uuid

        return self if self.idempotency_key else replace(self, idempotency_key=str(uuid.uuid4()))


DEFAULT_OPTIONS = RequestOptions()


@dataclass(frozen=True)
class ResponseMetadata:
    status: int
    attempts: int
    headers: Mapping[str, str]
    request_id: str | None = None
    api_version: str | None = None
    transport: str | None = None
    routing_reason: str | None = None
    operation_id: str | None = None

    @classmethod
    def from_response(cls, response: httpx.Response, attempts: int) -> ResponseMetadata:
        safe = {
            "content-type",
            "x-polymorfa-transport",
            "x-polymorfa-routing-reason",
            "x-polymorfa-operation-id",
            "x-request-id",
            "polymorfa-version",
            "retry-after",
            "polymorfa-data-region",
            "x-ratelimit-limit",
            "x-ratelimit-remaining",
            "x-ratelimit-reset",
            "polymorfa-ratelimit-reason",
            "polymorfa-next-cursor",
        }
        return cls(
            response.status_code,
            attempts,
            MappingProxyType({k: v for k, v in response.headers.items() if k in safe}),
            response.headers.get("x-request-id") or response.headers.get("request-id"),
            response.headers.get("polymorfa-version"),
            response.headers.get("x-polymorfa-transport"),
            response.headers.get("x-polymorfa-routing-reason"),
            response.headers.get("x-polymorfa-operation-id"),
        )


@dataclass(frozen=True)
class ApiResponse(Generic[T]):
    data: T
    metadata: ResponseMetadata


def _query(values: Mapping[str, QueryValue]) -> str:
    pairs: list[tuple[str, str]] = []
    for name, value in values.items():
        if value is None:
            continue
        for item in value if isinstance(value, list) else [value]:
            pairs.append((name, str(item).lower() if isinstance(item, bool) else str(item)))
    return urlencode(pairs)


def retry_delay(headers: Mapping[str, str], attempt: int) -> float:
    value = headers.get("retry-after")
    if value is not None:
        try:
            return min(60.0, max(0.0, float(value)))
        except ValueError:
            try:
                return min(60.0, max(0.0, parsedate_to_datetime(value).timestamp() - time.time()))
            except (ValueError, TypeError, OverflowError):
                pass
    return float(min(0.5 * 2 ** min(attempt - 1, 20), 5.0)) * (0.5 + random.random() * 0.5)


class Transport:
    def __init__(
        self,
        credential: Credential,
        *,
        base_url: str = "https://api.polymorfa.com",
        api_version: str = API_VERSION,
        timeout: float = 30,
        max_network_retries: int = 2,
        proxy: str | None = None,
        http_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        url = urlsplit(base_url)
        if (
            url.scheme not in ("https", "http")
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in ("", "/")
            or (url.scheme == "http" and url.hostname not in ("localhost", "127.0.0.1", "::1"))
        ):
            raise ConfigurationError("base_url")
        self._base_url = base_url.rstrip("/")
        self._credential = credential
        self._defaults = RequestOptions(
            timeout=timeout, api_version=api_version, max_network_retries=max_network_retries
        )
        self._http = httpx.AsyncClient(
            transport=http_transport, proxy=proxy, trust_env=False, follow_redirects=False
        )

    async def close(self) -> None:
        await self._http.aclose()

    def _request(
        self,
        method: str,
        path: str,
        query: Mapping[str, QueryValue],
        body: object,
        options: RequestOptions,
        accept: str,
    ) -> httpx.Request:
        if (
            not path.startswith("/")
            or path.startswith("//")
            or "\\" in path
            or "#" in path
            or "?" in path
            or ".." in unquote(path).split("/")
            or "\\" in unquote(path)
        ):
            raise ConfigurationError("path")
        headers = dict(options.headers)
        reserved = {
            "authorization",
            "host",
            "cookie",
            "user-agent",
            "polymorfa-version",
            "idempotency-key",
            "content-length",
        }
        if any(name.lower() in reserved for name in headers):
            raise ConfigurationError("headers")
        headers.update(
            {
                "Authorization": f"Bearer {self._credential.value}",
                "Accept": accept,
                "Polymorfa-Version": options.api_version
                or self._defaults.api_version
                or API_VERSION,
                "User-Agent": f"polymorfa-python/{SDK_VERSION} Python/{platform.python_version()}",
            }
        )
        if options.idempotency_key:
            headers["Idempotency-Key"] = options.idempotency_key
        if body is not None:
            headers["Content-Type"] = "application/json"
        suffix = _query(query)
        url = self._base_url + path + ("?" + suffix if suffix else "")
        return self._http.build_request(
            method,
            url,
            headers=headers,
            content=None if body is None else json.dumps(body, allow_nan=False),
            timeout=options.timeout or self._defaults.timeout,
        )

    async def open_stream(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, QueryValue] | None = None,
        body: object = None,
        options: RequestOptions = DEFAULT_OPTIONS,
        accept: str = "application/json",
    ) -> tuple[httpx.Response, ResponseMetadata]:
        safe = method in ("GET", "HEAD", "OPTIONS") or bool(options.idempotency_key)
        retries = options.max_network_retries
        if retries is None:
            retries = self._defaults.max_network_retries or 0
        for attempt in range(1, retries + 2):
            request = self._request(method, path, query or {}, body, options, accept)
            try:
                response = await self._http.send(request, stream=True, follow_redirects=False)
            except httpx.TimeoutException:
                if safe and attempt <= retries:
                    await asyncio.sleep(retry_delay({}, attempt))
                    continue
                raise TimeoutError("Request timed out.", code="request_timeout") from None
            except httpx.TransportError:
                if safe and attempt <= retries:
                    await asyncio.sleep(retry_delay({}, attempt))
                    continue
                raise ConnectionError(
                    "Could not reach Polymorfa.", code="connection_error"
                ) from None
            meta = ResponseMetadata.from_response(response, attempt)
            if (
                safe
                and attempt <= retries
                and response.headers.get("idempotent-replayed") != "true"
                and (response.status_code in (408, 409, 429) or response.status_code >= 500)
            ):
                await response.aclose()
                await asyncio.sleep(retry_delay(response.headers, attempt))
                continue
            if response.status_code >= 400:
                await response.aread()
                await response.aclose()
                self._raise_error(response, meta)
            return response, meta
        raise AssertionError("unreachable")

    def _raise_error(self, response: httpx.Response, meta: ResponseMetadata) -> None:
        data: dict[str, object] = {}
        if "json" in response.headers.get("content-type", ""):
            try:
                parsed = response.json()
                if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
                    data = parsed["error"]
            except ValueError:
                pass
        error_type = {
            400: ValidationError,
            401: AuthenticationError,
            402: PaymentRequiredError,
            403: AuthorizationError,
            404: NotFoundError,
            409: ConflictError,
            422: ValidationError,
            429: RateLimitError,
        }.get(meta.status)
        if error_type is None:
            error_type = ServerError if meta.status >= 500 else PolymorfaError

        def text(name: str) -> str | None:
            value = data.get(name)
            return value if isinstance(value, str) else None

        raise error_type(
            text("message") or f"Polymorfa request failed (HTTP {meta.status}).",
            status=meta.status,
            code=text("code"),
            request_id=text("request_id") or meta.request_id,
            request_log_url=text("request_log_url"),
            doc_url=text("docs"),
            rate_limit_reason=meta.headers.get("polymorfa-ratelimit-reason"),
            details=data.get("details"),
            metadata=meta,
        )

    async def request(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, QueryValue] | None = None,
        body: object = None,
        options: RequestOptions = DEFAULT_OPTIONS,
    ) -> ApiResponse[JsonObject | None]:
        response, meta = await self.open_stream(
            method, path, query=query, body=body, options=options
        )
        try:
            await response.aread()
            if response.status_code == 204 or not response.content:
                return ApiResponse(None, meta)
            if "json" not in response.headers.get("content-type", ""):
                raise ServerError(
                    "Unexpected response content type.", code="invalid_response", metadata=meta
                )
            try:
                value = response.json()
            except ValueError:
                raise ServerError(
                    "Invalid JSON response.", code="invalid_response", metadata=meta
                ) from None
            if not isinstance(value, dict):
                raise ServerError(
                    "Expected an object response.", code="invalid_response", metadata=meta
                )
            return ApiResponse(cast(JsonObject, value), meta)
        finally:
            await response.aclose()

    async def binary(
        self, path: str, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> ApiResponse[bytes]:
        response, meta = await self.open_stream(
            "GET", path, options=options, accept="application/octet-stream"
        )
        try:
            if response.is_redirect:
                location = response.headers.get("location", "")
                await response.aclose()
                if not location.startswith("https://") or urlsplit(location).username:
                    raise ServerError(
                        "Invalid media redirect.", code="invalid_response", metadata=meta
                    )
                # Signed storage URLs are bearer capabilities: no API headers, no retries or redirects.
                try:
                    async with self._http.stream(
                        "GET",
                        location,
                        follow_redirects=False,
                        timeout=options.timeout or self._defaults.timeout,
                    ) as storage:
                        if storage.status_code >= 300:
                            raise ServerError(
                                "Storage download failed.", status=storage.status_code
                            )
                        return ApiResponse(await storage.aread(), meta)
                except httpx.TransportError:
                    raise ConnectionError(
                        "Storage download failed.", code="connection_error"
                    ) from None
            return ApiResponse(await response.aread(), meta)
        finally:
            await response.aclose()


class CursorPage(Generic[T]):
    def __init__(
        self,
        transport: Transport,
        path: str,
        query: Mapping[str, QueryValue],
        options: RequestOptions,
        response: ApiResponse[JsonObject | None],
    ) -> None:
        self._transport, self._path = transport, path
        self._query, self._options = dict(query), options
        self.response = response
        if response.data is None:
            raise ServerError("Expected cursor page data.", code="invalid_response")
        value = response.data.get("data")
        page = response.data.get("page")
        if not isinstance(value, list) or not isinstance(page, dict):
            raise ServerError(
                "Invalid cursor page.", code="invalid_response", metadata=response.metadata
            )
        cursor = page.get("nextCursor")
        has_more = page.get("hasMore", bool(cursor))
        if not isinstance(has_more, bool) or (cursor is not None and not isinstance(cursor, str)):
            raise ServerError("Invalid cursor metadata.", code="invalid_response")
        if has_more and (not cursor or cursor == query.get("cursor")):
            raise ServerError("Cursor did not advance.", code="invalid_response")
        self.items = tuple(cast(list[T], value))
        self.has_more, self.next_cursor = has_more, cursor

    async def next_page(self) -> CursorPage[T] | None:
        if not self.has_more:
            return None
        query = {**self._query, "cursor": self.next_cursor}
        response = await self._transport.request(
            "GET", self._path, query=query, options=self._options
        )
        return CursorPage(self._transport, self._path, query, self._options, response)

    async def auto_paging_iter(self) -> AsyncIterator[T]:
        current: CursorPage[T] | None = self
        seen: set[str] = set()
        if isinstance(self._query.get("cursor"), str):
            seen.add(cast(str, self._query["cursor"]))
        while current is not None:
            if current.has_more and current.next_cursor in seen:
                raise ServerError("Repeated cursor.", code="invalid_response")
            for item in current.items:
                yield item
            if current.next_cursor:
                seen.add(current.next_cursor)
            current = await current.next_page()

    def __aiter__(self) -> AsyncIterator[T]:
        return self.auto_paging_iter()
