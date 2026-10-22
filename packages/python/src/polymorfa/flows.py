"""Immutable project-bound Flow drafts and Number provider operations."""

from __future__ import annotations

import builtins
import math
import re
from collections.abc import Mapping
from dataclasses import replace
from typing import TypeVar, cast
from urllib.parse import urlsplit

from . import flow_models as F
from .errors import ConfigurationError, ValidationError
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, QueryValue, RequestOptions, Transport

T = TypeVar("T")


def _path(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigurationError("flow_id")
    return "/" + segment(value)


def _number(params: F.NumberInput) -> F.NumberInput:
    if not isinstance(params.get("sessionId"), str) or not params["sessionId"].strip():
        raise ValidationError("sessionId is required.")
    return {"sessionId": params["sessionId"]}


class Flows(PlatformResource):
    def __init__(self, transport: Transport, project_id: str) -> None:
        super().__init__(transport, "/platform/flows")
        self._project_id = project_id

    async def _call(
        self,
        method: str,
        path: str,
        input: Mapping[str, object] | None,
        options: RequestOptions,
        base: str = "/platform/flows",
    ) -> ApiResponse[T]:
        if input and ("projectId" in input or "flowId" in input):
            raise ConfigurationError("input")
        value = {**(input or {}), "projectId": self._project_id}
        query = (
            {key: cast(QueryValue, value) for key, value in value.items()}
            if method in {"GET", "DELETE"}
            else None
        )
        return await self._unwrapped(
            method,
            base + path,
            query=query,
            body=None if query is not None else value,
            options=options if method == "GET" else replace(options, max_network_retries=0),
        )

    async def list(self, *, options: RequestOptions = O) -> ApiResponse[builtins.list[F.Summary]]:
        return await self._call("GET", "", None, options)

    async def create(
        self, body: F.CreateFlow, *, options: RequestOptions = O
    ) -> ApiResponse[F.Draft]:
        return await self._call("POST", "", body, options)

    async def retrieve(
        self, flow_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[F.Draft | None]:
        if (
            not isinstance(flow_id, str)
            or re.fullmatch(
                r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                flow_id,
                re.IGNORECASE,
            )
            is None
        ):
            raise ValidationError("flow_id must be a valid UUID.")
        return await self._call("GET", _path(flow_id), None, options)

    async def update(
        self, flow_id: str, body: F.UpdateFlow, *, options: RequestOptions = O
    ) -> ApiResponse[F.Draft]:
        stamp = body.get("expectedUpdatedAt")
        if (
            isinstance(stamp, bool)
            or not isinstance(stamp, (int, float))
            or not math.isfinite(stamp)
        ):
            raise ValidationError("expectedUpdatedAt must be a finite number.")
        return await self._call("PATCH", _path(flow_id), body, options)

    async def delete(self, flow_id: str, *, options: RequestOptions = O) -> ApiResponse[F.Deleted]:
        return await self._call("DELETE", _path(flow_id), None, options)

    async def upload(
        self, flow_id: str, body: F.ProviderInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.ProviderResult]:
        return await self._call("POST", _path(flow_id) + "/upload", body, options)

    async def publish(
        self, flow_id: str, body: F.ProviderInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.ProviderResult]:
        return await self._call("POST", _path(flow_id) + "/publish", body, options)

    async def deprecate(
        self, flow_id: str, body: F.ProviderInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.ProviderResult]:
        return await self._call("POST", _path(flow_id) + "/deprecate", body, options)

    async def discard(
        self, flow_id: str, body: F.ProviderInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.ProviderResult]:
        return await self._call("POST", _path(flow_id) + "/discard", body, options)

    async def sync(
        self, flow_id: str, body: F.ProviderInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.ProviderResult]:
        return await self._call("POST", _path(flow_id) + "/sync", body, options)

    async def receipts(
        self, flow_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[builtins.list[F.ProviderOperation]]:
        return await self._call("GET", _path(flow_id) + "/receipts", None, options)

    async def endpoint(
        self, flow_id: str, params: F.NumberInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.EndpointState]:
        return await self._call("GET", _path(flow_id) + "/endpoint", _number(params), options)

    async def set_endpoint(
        self, flow_id: str, body: F.SetEndpoint, *, options: RequestOptions = O
    ) -> ApiResponse[F.EndpointSet]:
        _number(body)
        if body["mode"] in {"forward", "direct"}:
            url = body.get("url")
            try:
                parsed = urlsplit(url) if isinstance(url, str) else None
                if (
                    parsed is None
                    or len(str(url)) > 2048
                    or parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username is not None
                    or parsed.password is not None
                    or parsed.fragment
                ):
                    raise ValueError
            except ValueError as error:
                raise ValidationError(
                    "url must be HTTPS without credentials or a fragment."
                ) from error
        elif body["mode"] == "function":
            if not isinstance(body.get("functionId"), str) or not body["functionId"]:
                raise ValidationError("functionId is required.")
        else:
            raise ValidationError("mode must be forward, function or direct.")
        if "expectedRevision" in body:
            revision = body["expectedRevision"]
            if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
                raise ValidationError("expectedRevision must be a positive integer.")
        return await self._call("PUT", _path(flow_id) + "/endpoint", body, options)

    async def delete_endpoint(
        self, flow_id: str, params: F.NumberInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.Deleted]:
        return await self._call("DELETE", _path(flow_id) + "/endpoint", _number(params), options)

    async def endpoint_receipts(
        self,
        flow_id: str,
        params: F.ListEndpointReceipts | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[builtins.list[F.EndpointReceipt]]:
        params = {} if params is None else params
        if "limit" in params and (
            isinstance(params["limit"], bool)
            or not isinstance(params["limit"], int)
            or not 1 <= params["limit"] <= 100
        ):
            raise ValidationError("limit must be an integer from1 to100.")
        return await self._call("GET", _path(flow_id) + "/endpoint/receipts", params, options)

    async def encryption_key(
        self, params: F.NumberInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.Custody]:
        return await self._call(
            "GET", "", _number(params), options, "/platform/flow-encryption-keys"
        )

    async def rotate_encryption_key(
        self, body: F.NumberInput, *, options: RequestOptions = O
    ) -> ApiResponse[F.Rotation]:
        return await self._call(
            "POST", "", _number(body), options, "/platform/flow-encryption-keys/rotate"
        )
