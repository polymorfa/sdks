"""Framework request adapters that authenticate the exact body bytes."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from .webhooks import WebhookEvent, construct_webhook_event


class AsyncRequest(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...
    async def body(self) -> bytes: ...


class DjangoRequest(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...
    @property
    def body(self) -> bytes: ...


async def fastapi_webhook_event(request: AsyncRequest, secret: str) -> WebhookEvent:
    return construct_webhook_event(
        await request.body(), request.headers.get("x-webhook-signature", ""), secret
    )


def django_webhook_event(request: DjangoRequest, secret: str) -> WebhookEvent:
    return construct_webhook_event(
        request.body, request.headers.get("X-Webhook-Signature", ""), secret
    )
