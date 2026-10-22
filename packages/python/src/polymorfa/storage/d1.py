"""Signed storage-only D1 Worker bridge, exact producer 9ae35e671f7f4868a67c1562422c5af9284b95c1."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
from collections.abc import AsyncIterator, Sequence
from dataclasses import asdict
from typing import cast
from urllib.parse import urlsplit

import httpx

from ..errors import ConfigurationError, ConnectionError, ServerError, TimeoutError
from ..transport import Json
from .core import (
    STORAGE_SCHEMA_VERSION,
    CommitResult,
    EntityName,
    IndexQuery,
    RowPut,
    RowWrite,
    StorageCapabilities,
    StoredRow,
    entity_definition,
    filter_rows,
    finite,
    index_of,
    namespace,
    validate_commit,
)

D1_BRIDGE_CONTRACT = "polymorfa-d1-storage-v1"
D1_BRIDGE_PRODUCER_COMMIT = "9ae35e671f7f4868a67c1562422c5af9284b95c1"
_MAX_BODY = 8 * 1024 * 1024


async def _raw_chunks(response: httpx.Response) -> AsyncIterator[bytes]:
    # Application-owned transports may already have buffered the response. Both paths
    # retain the byte bound and authenticate exactly the unencoded HTTP body.
    if response.is_stream_consumed:
        yield response.content
    else:
        async for chunk in response.aiter_raw():
            yield chunk


class D1BridgeAdapter:
    name = "d1"

    def __init__(
        self,
        base_url: str,
        application_secret: str,
        *,
        authority: str,
        table_prefix: str = "polymorfa_",
        timeout: float = 30,
        http_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        parsed = urlsplit(base_url)
        if (
            parsed.scheme not in ("https", "http")
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
            or parsed.scheme == "http"
            and parsed.hostname not in ("localhost", "127.0.0.1", "::1")
        ):
            raise ConfigurationError("base_url")
        if (
            not isinstance(application_secret, str)
            or re.fullmatch(r"[!-~]{32,256}", application_secret) is None
            or application_secret.startswith("pmfa_")
        ):
            raise ConfigurationError("application_secret")
        namespace(authority)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table_prefix) is None:
            raise ConfigurationError("table_prefix")
        if timeout <= 0 or not timeout < float("inf"):
            raise ConfigurationError("timeout")
        self._url = base_url.rstrip("/")
        self._secret, self._authority, self._prefix = application_secret, authority, table_prefix
        self._client = httpx.AsyncClient(
            transport=http_transport, trust_env=False, timeout=timeout, follow_redirects=False
        )
        self._ready = False
        self._setup_allowed = False
        self._timeout = timeout

    def __repr__(self) -> str:
        return "D1BridgeAdapter()"

    @property
    def capabilities(self) -> StorageCapabilities:
        return StorageCapabilities(self._ready, 50 if self._ready else 0)

    async def handshake(self) -> D1BridgeAdapter:
        try:
            data = await self._request("GET", "/handshake", None, handshake=True)
            expected = {
                "atomicCommit": True,
                "maxCommitSize": 50,
                "maxGetSize": 1000,
                "maxQuerySize": 1000,
                "maxBodyBytes": _MAX_BODY,
                "conditionalDeletes": True,
            }
            if (
                not isinstance(data, dict)
                or any(
                    type(data.get(key)) is not type(value) or data[key] != value
                    for key, value in expected.items()
                )
                or not isinstance(data.get("setupAllowed"), bool)
            ):
                raise ServerError(
                    "D1 bridge capabilities do not match the signed contract.",
                    code="invalid_response",
                )
            self._setup_allowed = cast(bool, data["setupAllowed"])
            self._ready = True
            return self
        except BaseException:
            await self.close()
            raise

    async def _request(
        self, method: str, path: str, value: Json, *, handshake: bool = False
    ) -> Json:
        try:
            return await asyncio.wait_for(
                self._request_once(method, path, value, handshake=handshake), self._timeout
            )
        except asyncio.TimeoutError:
            raise TimeoutError(
                "D1 request timed out; a conditional commit may have completed.",
                code="request_timeout",
            ) from None

    async def _request_once(
        self, method: str, path: str, value: Json, *, handshake: bool = False
    ) -> Json:
        if not self._ready and not handshake:
            raise ConfigurationError("d1_handshake_required")
        _bounded_json(value)
        body = (
            b""
            if value is None
            else json.dumps(
                value, separators=(",", ":"), ensure_ascii=True, allow_nan=False
            ).encode()
        )
        if len(body) > _MAX_BODY:
            raise ConfigurationError("d1_body_bytes")
        nonce = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode()
        signature = hmac.new(
            self._secret.encode(),
            nonce.encode() + b"." + method.encode() + b"." + path.encode() + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        headers = {
            "Accept-Encoding": "identity",
            "Authorization": "Bearer " + self._secret,
            "Polymorfa-Storage-Authority": self._authority,
            "Polymorfa-Storage-Prefix": self._prefix,
            "Polymorfa-Storage-Nonce": nonce,
            "Polymorfa-Storage-Signature": "v1=" + signature,
        }
        if method == "POST":
            headers["content-type"] = "application/json"
        try:
            async with self._client.stream(
                method, self._url + path, headers=headers, content=body
            ) as response:
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise ServerError(
                        "D1 signed responses require identity encoding.", code="invalid_response"
                    )
                raw = bytearray()
                async for chunk in _raw_chunks(response):
                    if len(chunk) > _MAX_BODY - len(raw):
                        raise ServerError(
                            "D1 bridge response exceeded its byte limit.", code="invalid_response"
                        )
                    raw.extend(chunk)
                observed = response.headers.get("Polymorfa-Storage-Signature", "")
                expected = hmac.new(
                    self._secret.encode(),
                    nonce.encode() + b"." + str(response.status_code).encode() + b"." + raw,
                    hashlib.sha256,
                ).hexdigest()
                if (
                    response.headers.get("Polymorfa-Storage-Nonce") != nonce
                    or re.fullmatch(r"v1=[a-f0-9]{64}", observed) is None
                    or not hmac.compare_digest(observed, "v1=" + expected)
                ):
                    raise ServerError(
                        "D1 bridge response authentication failed.", code="invalid_response"
                    )
                try:
                    decoded = json.loads(raw, object_pairs_hook=_unique_object)
                    _bounded_json(cast(Json, decoded))
                except (ValueError, RecursionError, ConfigurationError):
                    raise ServerError(
                        "Invalid signed D1 response.", code="invalid_response"
                    ) from None
                if (
                    not isinstance(decoded, dict)
                    or decoded.get("contract") != D1_BRIDGE_CONTRACT
                    or type(decoded.get("schemaVersion")) is not int
                    or decoded["schemaVersion"] != STORAGE_SCHEMA_VERSION
                    or decoded.get("authority") != self._authority
                    or decoded.get("tablePrefix") != self._prefix
                    or set(decoded)
                    != {"contract", "schemaVersion", "authority", "tablePrefix", "data"}
                ):
                    raise ServerError(
                        "D1 bridge authority or schema mismatch.", code="invalid_response"
                    )
                if not response.is_success:
                    raise ServerError(
                        "Signed D1 storage operation failed.",
                        code="d1_operation_failed",
                        status=response.status_code,
                    )
                return cast(Json, decoded.get("data"))
        except httpx.TimeoutException:
            raise TimeoutError(
                "D1 request timed out; a conditional commit may have completed.",
                code="request_timeout",
            ) from None
        except httpx.TransportError:
            raise ConnectionError(
                "D1 bridge could not be reached; reconcile conditional writes before retrying.",
                code="connection_error",
            ) from None

    async def setup(self) -> None:
        if not self._setup_allowed:
            raise ConfigurationError("d1_setup_not_allowed")
        result = await self._request("POST", "/setup", {})
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise ServerError("Invalid signed D1 setup result.", code="invalid_response")

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        entity_definition(entity)
        if len(ids) > 1000 or any(
            not isinstance(identity, str) or not identity for identity in ids
        ):
            raise ConfigurationError("d1_get_bounds")
        value = await self._request("POST", "/get", {"entity": entity, "ids": list(ids)})
        rows = _rows(entity, value)
        if any(row.id not in ids for row in rows):
            raise ServerError("D1 returned an unrequested row.", code="invalid_response")
        return {row.id: row for row in rows}

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 50)
        encoded: list[Json] = []
        for write in writes:
            if isinstance(write, RowPut):
                encoded.append(
                    {
                        "kind": "put",
                        "entity": write.entity,
                        "row": write.row.wire(),
                        "expectedRev": write.expected_rev,
                    }
                )
            else:
                if write.expected_rev is None:
                    raise ConfigurationError("d1_delete_requires_revision")
                encoded.append(
                    {
                        "kind": "delete",
                        "entity": write.entity,
                        "id": write.id,
                        "expectedRev": write.expected_rev,
                    }
                )
        value = await self._request("POST", "/commit", {"writes": encoded})
        if not isinstance(value, dict) or not isinstance(value.get("ok"), bool):
            raise ServerError("Invalid signed D1 commit result.", code="invalid_response")
        if value["ok"] is True:
            return CommitResult(True)
        conflicts = value.get("conflicts")
        identities = {write.row.id if isinstance(write, RowPut) else write.id for write in writes}
        if (
            not isinstance(conflicts, list)
            or not conflicts
            or any(
                not isinstance(identity, str) or identity not in identities
                for identity in conflicts
            )
        ):
            raise ServerError("Invalid signed D1 conflict result.", code="invalid_response")
        return CommitResult(False, tuple(cast(list[str], conflicts)))

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        if query.limit > 1000:
            raise ConfigurationError("d1_query_bounds")
        record: dict[str, Json] = {
            "index": query.index,
            "equals": dict(query.equals),
            "limit": query.limit,
            "order": query.order,
        }
        ranges = {key: number for key, number in asdict(query.range).items() if number is not None}
        if ranges:
            record["range"] = cast(dict[str, Json], ranges)
        if query.after is not None:
            record["after"] = {"sort": query.after.sort, "id": query.after.id}
        rows = _rows(
            entity, await self._request("POST", "/query", {"entity": entity, "query": record})
        )
        if (
            len(rows) > query.limit
            or filter_rows(entity, rows, query) != rows
            or any(
                any(row.values.get(name) != query.equals[name] for name in index["equals"])
                for row in rows
            )
        ):
            raise ServerError(
                "D1 returned rows outside the requested scope.", code="invalid_response"
            )
        return rows

    async def close(self) -> None:
        self._ready = False
        await self._client.aclose()


def _rows(entity: EntityName, value: Json) -> list[StoredRow]:
    if not isinstance(value, list):
        raise ServerError("D1 returned an invalid row collection.", code="invalid_response")
    result = []
    seen = set()
    for raw in value:
        try:
            row = StoredRow.from_wire(entity, raw)
        except (ValueError, TypeError):
            raise ServerError(
                "D1 returned an invalid stored row.", code="invalid_response"
            ) from None
        if row.id in seen:
            raise ServerError("D1 returned duplicate rows.", code="invalid_response")
        seen.add(row.id)
        result.append(row)
    return result


def _bounded_json(value: Json) -> None:
    stack = [(value, 0)]
    count = 0
    while stack:
        item, depth = stack.pop()
        count += 1
        if depth > 64 or count > 200000:
            raise ConfigurationError("d1_json_bounds")
        if isinstance(item, (int, float)) and not isinstance(item, bool) and not finite(item):
            raise ConfigurationError("d1_json_nonfinite")
        if isinstance(item, dict):
            stack.extend((child, depth + 1) for child in item.values())
        elif isinstance(item, list):
            stack.extend((child, depth + 1) for child in item)


def _unique_object(pairs: list[tuple[str, Json]]) -> dict[str, Json]:
    result: dict[str, Json] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate signed JSON field")
        result[key] = value
    return result


async def d1_bridge_adapter(
    base_url: str,
    application_secret: str,
    *,
    authority: str,
    table_prefix: str = "polymorfa_",
    timeout: float = 30,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> D1BridgeAdapter:
    return await D1BridgeAdapter(
        base_url,
        application_secret,
        authority=authority,
        table_prefix=table_prefix,
        timeout=timeout,
        http_transport=http_transport,
    ).handshake()
