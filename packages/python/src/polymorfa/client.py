"""Explicit immutable organization and project clients."""

from __future__ import annotations

from dataclasses import dataclass

from typing_extensions import Self, Unpack

from . import messaging, platform
from .bansafe import BanSafe
from .bansafe_observations import BanSafeObservations
from .billing import Billing
from .business import Business
from .call_policy import CallOptOuts, CallPolicies, CallRetentions
from .campaigns import Audiences, Campaigns, MessagingCampaigns
from .channels import Channels
from .client_tokens import ClientTokens
from .cloud_graph import CloudCatalogs, CloudMarketing, FlowEncryption
from .customers import Customers
from .errors import ConfigurationError
from .flows import Flows
from .functions import Functions
from .groups import Groups
from .observations import Identities, Labels, Privacy
from .official_groups import OfficialGroups
from .onboarding import CloudOnboarding, Testing
from .organization import (
    ApiKeys,
    AuditLogs,
    Members,
    Organizations,
    ProjectTokens,
    SecurityIncidents,
    SessionBans,
)
from .platform_media import Media as PlatformMedia
from .policies import HybridLink, ObservationPolicies, SessionConfigurations
from .quick_replies import QuickReplies, Users
from .settings import OptOuts, QuickLinkConfiguration
from .sip import SipTrunks
from .templates import CloudTemplates, Templates
from .transport import ClientOptions, Credential, Transport
from .usage import Usage
from .voice import Voice


@dataclass(frozen=True, init=False)
class AsyncMessagingClient:
    _transport: Transport
    campaigns: MessagingCampaigns
    official_groups: OfficialGroups
    cloud_onboarding: CloudOnboarding
    testing: Testing
    observation_policies: ObservationPolicies
    hybrid_link: HybridLink
    templates: Templates
    cloud_templates: CloudTemplates
    cloud_catalogs: CloudCatalogs
    cloud_marketing: CloudMarketing
    flow_encryption: FlowEncryption
    ban_safe: BanSafe
    channels: Channels
    quick_replies: QuickReplies
    users: Users
    business: Business
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
    calls: messaging.SessionCalls
    voip: messaging.Voip
    raw: platform.Raw

    def __init__(self, credential: Credential, **options: Unpack[ClientOptions]) -> None:
        transport = Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        for name, resource in (
            ("campaigns", MessagingCampaigns),
            ("official_groups", OfficialGroups),
            ("cloud_onboarding", CloudOnboarding),
            ("testing", Testing),
            ("observation_policies", ObservationPolicies),
            ("hybrid_link", HybridLink),
            ("templates", Templates),
            ("cloud_templates", CloudTemplates),
            ("cloud_catalogs", CloudCatalogs),
            ("cloud_marketing", CloudMarketing),
            ("flow_encryption", FlowEncryption),
            ("ban_safe", BanSafe),
            ("channels", Channels),
            ("quick_replies", QuickReplies),
            ("users", Users),
            ("business", Business),
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
            ("calls", messaging.SessionCalls),
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
    usage: Usage
    voice: Voice
    functions: Functions
    flows: Flows
    sip_trunks: SipTrunks
    quick_link_settings: QuickLinkConfiguration
    session_configuration: SessionConfigurations
    call_retention: CallRetentions
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
        **options: Unpack[ClientOptions],
    ) -> None:
        if credential.kind == "client_token" or not project_id.strip():
            raise ConfigurationError("project_id")
        transport = _transport or Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        object.__setattr__(self, "_credential", credential)
        object.__setattr__(self, "project_id", project_id)
        object.__setattr__(self, "usage", Usage(transport, project_id))
        object.__setattr__(self, "voice", Voice(transport, project_id))
        object.__setattr__(self, "functions", Functions(transport, project_id))
        object.__setattr__(self, "flows", Flows(transport, project_id))
        prefix = f"/platform/projects/{messaging.segment(project_id)}"
        for name, resource in (
            ("events", platform.Events),
            ("webhooks", platform.PlatformWebhooks),
            ("webhook_deliveries", platform.WebhookDeliveries),
            ("operations", platform.Operations),
        ):
            object.__setattr__(self, name, resource(transport, prefix))
        object.__setattr__(self, "sip_trunks", SipTrunks(transport, prefix))
        object.__setattr__(self, "quick_link_settings", QuickLinkConfiguration(transport, prefix))
        object.__setattr__(self, "session_configuration", SessionConfigurations(transport, prefix))
        object.__setattr__(self, "call_retention", CallRetentions(transport, prefix))
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
    sip_trunks: SipTrunks
    quick_link_settings: QuickLinkConfiguration
    session_configuration: SessionConfigurations
    call_retention: CallRetentions
    call_policy: CallPolicies
    call_opt_outs: CallOptOuts
    opt_outs: OptOuts
    customers: Customers
    organizations: Organizations
    members: Members
    api_keys: ApiKeys
    project_tokens: ProjectTokens
    audit_logs: AuditLogs
    session_bans: SessionBans
    security_incidents: SecurityIncidents
    ban_safe: BanSafeObservations
    media: PlatformMedia
    usage: Usage
    voice: Voice
    campaigns: Campaigns
    audiences: Audiences
    billing: Billing
    projects: platform.Projects
    sessions: platform.PlatformSessions
    events: platform.Events
    webhooks: platform.PlatformWebhooks
    webhook_deliveries: platform.WebhookDeliveries
    operations: platform.Operations
    raw: platform.Raw

    def __init__(self, credential: Credential, **options: Unpack[ClientOptions]) -> None:
        if credential.kind != "organization_api_key":
            raise ConfigurationError("credential")
        transport = Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        object.__setattr__(self, "_credential", credential)
        object.__setattr__(self, "usage", Usage(transport))
        object.__setattr__(self, "voice", Voice(transport))
        object.__setattr__(self, "ban_safe", BanSafeObservations(transport))
        for name, resource in (
            ("opt_outs", OptOuts),
            ("organizations", Organizations),
            ("members", Members),
            ("api_keys", ApiKeys),
            ("project_tokens", ProjectTokens),
            ("audit_logs", AuditLogs),
            ("session_bans", SessionBans),
            ("security_incidents", SecurityIncidents),
            ("media", PlatformMedia),
            ("campaigns", Campaigns),
            ("billing", Billing),
            ("projects", platform.Projects),
            ("sessions", platform.PlatformSessions),
        ):
            object.__setattr__(self, name, resource(transport, credential.kind))
        for name, scoped in (
            ("sip_trunks", SipTrunks),
            ("quick_link_settings", QuickLinkConfiguration),
            ("session_configuration", SessionConfigurations),
            ("audiences", Audiences),
            ("customers", Customers),
            ("call_retention", CallRetentions),
            ("call_policy", CallPolicies),
            ("call_opt_outs", CallOptOuts),
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
