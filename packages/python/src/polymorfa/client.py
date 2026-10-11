"""Explicit immutable organization and project clients."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from typing_extensions import Self

from . import messaging, platform
from .client_tokens import ClientTokens
from .errors import ConfigurationError
from .groups import Groups
from .observations import Identities, Labels, Privacy
from .transport import Credential, Transport


@dataclass(frozen=True, init=False)
class AsyncMessagingClient:
    _transport: Transport
    client_tokens: ClientTokens
    identities: Identities
    labels: Labels
    privacy: Privacy
    groups: Groups
    messages: messaging.Messages
    sessions: messaging.Sessions
    quick_links: messaging.QuickLinks
    webhooks: messaging.Webhooks
    chats: messaging.Chats
    media: messaging.Media
    contacts: messaging.Contacts
    profile: messaging.Profiles
    presence: messaging.Presence
    voip: messaging.Voip
    raw: platform.Raw

    def __init__(self, credential: Credential, **options: Any) -> None:
        transport = Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        for name, resource in (
            ("client_tokens", ClientTokens),
            ("identities", Identities),
            ("labels", Labels),
            ("privacy", Privacy),
            ("groups", Groups),
            ("messages", messaging.Messages),
            ("sessions", messaging.Sessions),
            ("quick_links", messaging.QuickLinks),
            ("webhooks", messaging.Webhooks),
            ("chats", messaging.Chats),
            ("media", messaging.Media),
            ("contacts", messaging.Contacts),
            ("profile", messaging.Profiles),
            ("presence", messaging.Presence),
            ("voip", messaging.Voip),
        ):
            object.__setattr__(self, name, resource(transport, credential.kind))
        object.__setattr__(self, "raw", platform.Raw(transport))

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()


@dataclass(frozen=True, init=False)
class AsyncProjectClient:
    _transport: Transport
    _credential: Credential
    project_id: str
    events: platform.Events
    webhooks: platform.PlatformWebhooks
    webhook_deliveries: platform.WebhookDeliveries
    operations: platform.Operations
    raw: platform.Raw

    def __init__(
        self,
        credential: Credential,
        project_id: str,
        *,
        _transport: Transport | None = None,
        **options: Any,
    ) -> None:
        if credential.kind == "client_token" or not project_id.strip():
            raise ConfigurationError("project_id")
        transport = _transport or Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        object.__setattr__(self, "_credential", credential)
        object.__setattr__(self, "project_id", project_id)
        prefix = f"/platform/projects/{messaging.segment(project_id)}"
        for name, resource in (
            ("events", platform.Events),
            ("webhooks", platform.PlatformWebhooks),
            ("webhook_deliveries", platform.WebhookDeliveries),
            ("operations", platform.Operations),
        ):
            object.__setattr__(self, name, resource(transport, prefix))
        object.__setattr__(self, "raw", platform.Raw(transport, project_id))

    def project(self, project_id: str) -> AsyncProjectClient:
        if project_id != self.project_id:
            raise ConfigurationError("project_id")
        return self

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()


@dataclass(frozen=True, init=False)
class AsyncClient:
    _transport: Transport
    _credential: Credential
    projects: platform.Projects
    sessions: platform.PlatformSessions
    events: platform.Events
    webhooks: platform.PlatformWebhooks
    webhook_deliveries: platform.WebhookDeliveries
    operations: platform.Operations
    raw: platform.Raw

    def __init__(self, credential: Credential, **options: Any) -> None:
        if credential.kind != "organization_api_key":
            raise ConfigurationError("credential")
        transport = Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        object.__setattr__(self, "_credential", credential)
        for name, resource in (
            ("projects", platform.Projects),
            ("sessions", platform.PlatformSessions),
        ):
            object.__setattr__(self, name, resource(transport, credential.kind))
        for name, scoped in (
            ("events", platform.Events),
            ("webhooks", platform.PlatformWebhooks),
            ("webhook_deliveries", platform.WebhookDeliveries),
            ("operations", platform.Operations),
        ):
            object.__setattr__(self, name, scoped(transport, "/platform"))
        object.__setattr__(self, "raw", platform.Raw(transport))

    def project(self, project_id: str) -> AsyncProjectClient:
        return AsyncProjectClient(self._credential, project_id, _transport=self._transport)

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
