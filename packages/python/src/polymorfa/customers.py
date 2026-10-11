"""Project-scoped customer ownership and pairing-link lifecycle."""

from __future__ import annotations

import builtins
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .messaging import O, segment
from .models import DataEnvelope
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, QueryValue, RequestOptions

Status = Literal["active", "archiving", "archived"]


class Customer(TypedDict):
    id: str
    orgId: str
    projectId: str
    name: str | None
    externalCustomerId: str | None
    status: Status
    isDefault: bool
    archivedAt: int | None
    createdAt: int
    updatedAt: int


class CustomerSummary(Customer):
    numberCount: int
    connectedNumberCount: int
    activePairingLinkState: str | None
    lastActivityAt: int | None
    needsAttention: bool


class CustomersStatus(TypedDict):
    enabled: bool
    enabledAt: int | None
    enabledBy: str | None
    defaultCustomer: Customer | None


class CustomersEnabled(CustomersStatus):
    migratedNumberCount: int


class CustomerProject(TypedDict, total=False):
    projectId: str


class CustomerInput(TypedDict, total=False):
    projectId: str
    name: str | None
    externalCustomerId: str | None


class ListCustomers(TypedDict):
    projectId: str
    cursor: NotRequired[str]
    limit: NotRequired[int]
    search: NotRequired[str]
    status: NotRequired[Status | Literal["all"]]
    isDefault: NotRequired[bool]
    hasNumbers: NotRequired[bool]
    needsAttention: NotRequired[bool]


class CustomerNumber(TypedDict):
    id: str
    customerId: str
    sessionId: str
    name: str | None
    phoneMasked: str | None
    status: str
    backend: str | None
    createdAt: int


class EventMetadata(TypedDict):
    fields: NotRequired[list[Literal["name", "phone", "externalCustomerId"]]]


class CustomerEvent(TypedDict):
    id: str
    action: str
    fromStatus: str | None
    toStatus: str | None
    sessionId: str | None
    pairingLinkId: str | None
    metadata: EventMetadata
    occurredAt: int


class PairingLink(TypedDict):
    id: str
    orgId: str
    projectId: str
    customerId: str
    expectedPhoneMasked: str | None
    methods: list[Literal["qr", "phone"]]
    locale: Literal["en", "pt-BR"] | None
    theme: Literal["light", "dark", "system"] | None
    expiresAt: int
    status: Literal["active", "opened", "connecting", "connected", "failed", "expired", "revoked"]
    attemptCount: int
    maxAttempts: int
    pendingSessionId: str | None
    createdBy: str | None
    reservedAt: int | None
    openedAt: int | None
    connectingAt: int | None
    connectedAt: int | None
    failedAt: int | None
    expiredAt: int | None
    revokedAt: int | None
    lastErrorCode: str | None
    failedExchangeCount: int
    phoneMismatchCount: int
    createdAt: int
    updatedAt: int


class CreatedPairingLink(PairingLink):
    url: str | None


class CreatePairingLink(TypedDict, total=False):
    projectId: str
    expectedPhone: str | None
    methods: list[Literal["qr", "phone"]]
    expiresInSeconds: int


class TransferNumber(TypedDict):
    projectId: str
    sourceCustomerId: str
    confirm: Literal[True]


class Customers(PlatformResource):
    async def status(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[CustomersStatus]]:
        return await self._request(
            "GET", f"/platform/projects/{segment(project_id)}/customers/status", options=options
        )

    async def enable(
        self, project_id: str, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[CustomersEnabled]]:
        return await self._request(
            "POST", f"/platform/projects/{segment(project_id)}/customers/enable", options=options
        )

    async def list(
        self, params: ListCustomers, *, options: RequestOptions = O
    ) -> CursorPage[CustomerSummary]:
        query: dict[str, QueryValue] = {
            "projectId": params["projectId"],
            "cursor": params.get("cursor"),
            "limit": params.get("limit"),
            "search": params.get("search"),
            "status": params.get("status"),
            "isDefault": params.get("isDefault"),
            "hasNumbers": params.get("hasNumbers"),
            "needsAttention": params.get("needsAttention"),
        }
        return await self._page("/platform/customers", query, options)

    async def create(
        self, body: CustomerInput | None = None, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[Customer]]:
        return await self._request(
            "POST", "/platform/customers", body={} if body is None else body, options=options
        )

    async def retrieve(
        self, customer_id: str, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Customer]]:
        return await self._request(
            "GET",
            f"/platform/customers/{segment(customer_id)}",
            query={"projectId": project_id},
            options=options,
        )

    async def update(
        self, customer_id: str, body: CustomerInput, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Customer]]:
        return await self._request(
            "PATCH", f"/platform/customers/{segment(customer_id)}", body=body, options=options
        )

    async def archive(
        self, customer_id: str, body: CustomerProject | None = None, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[Customer]]:
        return await self._request(
            "POST",
            f"/platform/customers/{segment(customer_id)}/archive",
            body={} if body is None else body,
            options=options,
        )

    async def restore(
        self, customer_id: str, body: CustomerProject | None = None, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[Customer]]:
        return await self._request(
            "POST",
            f"/platform/customers/{segment(customer_id)}/restore",
            body={} if body is None else body,
            options=options,
        )

    async def list_numbers(
        self, customer_id: str, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[CustomerNumber]]]:
        return await self._request(
            "GET",
            f"/platform/customers/{segment(customer_id)}/numbers",
            query={"projectId": project_id},
            options=options,
        )

    async def list_events(
        self,
        customer_id: str,
        project_id: str,
        *,
        limit: int | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[builtins.list[CustomerEvent]]]:
        return await self._request(
            "GET",
            f"/platform/customers/{segment(customer_id)}/events",
            query={"projectId": project_id, "limit": limit},
            options=options,
        )

    async def create_pairing_link(
        self, customer_id: str, body: CreatePairingLink | None = None, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[CreatedPairingLink]]:
        return await self._request(
            "POST",
            f"/platform/customers/{segment(customer_id)}/pairing-links",
            body={} if body is None else body,
            options=options,
        )

    async def list_pairing_links(
        self, customer_id: str, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[PairingLink]]]:
        return await self._request(
            "GET",
            f"/platform/customers/{segment(customer_id)}/pairing-links",
            query={"projectId": project_id},
            options=options,
        )

    async def revoke_pairing_link(
        self,
        customer_id: str,
        pairing_link_id: str,
        project_id: str,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[PairingLink]]:
        return await self._request(
            "DELETE",
            f"/platform/customers/{segment(customer_id)}/pairing-links/{segment(pairing_link_id)}",
            query={"projectId": project_id},
            options=options,
        )

    async def transfer_number(
        self, customer_id: str, session_id: str, body: TransferNumber, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[CustomerNumber]]:
        return await self._request(
            "POST",
            f"/platform/customers/{segment(customer_id)}/numbers/{segment(session_id)}/transfer",
            body=body,
            options=options,
        )
