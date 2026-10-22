"""Framework request adapters that authenticate the exact body bytes."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Mapping
from typing import Protocol

from .errors import ConfigurationError, ValidationError
from .webhooks import WebhookEvent, construct_webhook_event

DEFAULT_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024


class AsyncRequest(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...
    def stream(self) -> AsyncIterator[bytes]: ...


class DjangoRequest(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...
    @property
    def body(self) -> bytes: ...


async def fastapi_webhook_event(
    request: AsyncRequest,
    secret: str,
    *,
    max_body_bytes: int = DEFAULT_WEBHOOK_MAX_BODY_BYTES,
) -> WebhookEvent:
    if (
        isinstance(max_body_bytes, bool)
        or not isinstance(max_body_bytes, int)
        or max_body_bytes < 1
    ):
        raise ConfigurationError("max_body_bytes")
    content_length = request.headers.get("content-length")
    if content_length is not None:
        if re.fullmatch(r"[0-9]+", content_length) is None:
            raise ValidationError(
                "Invalid webhook Content-Length.", code="invalid_content_length", status=400
            )
        # Compare decimal strings before converting: an untrusted length need not fit an integer.
        normalized = content_length.lstrip("0") or "0"
        maximum = str(max_body_bytes)
        if len(normalized) > len(maximum) or (
            len(normalized) == len(maximum) and normalized > maximum
        ):
            raise ValidationError(
                "Webhook body exceeds the byte limit.", code="webhook_body_too_large", status=413
            )
    body = bytearray()
    async for chunk in request.stream():
        if len(chunk) > max_body_bytes - len(body):
            raise ValidationError(
                "Webhook body exceeds the byte limit.", code="webhook_body_too_large", status=413
            )
        body.extend(chunk)
    return construct_webhook_event(
        bytes(body), request.headers.get("x-webhook-signature", ""), secret
    )


def django_webhook_event(request: DjangoRequest, secret: str) -> WebhookEvent:
    return construct_webhook_event(
        request.body, request.headers.get("X-Webhook-Signature", ""), secret
    )
