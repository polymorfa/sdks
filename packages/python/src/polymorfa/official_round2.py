"""Beta Number catalog cache and readiness, distinct from raw Graph resources."""

from __future__ import annotations

import re
from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import Envelope
from .transport import ApiResponse, RequestOptions


class CloudCatalogAttempt(TypedDict):
    startedAt: str
    finishedAt: str | None
    outcome: str
    metaErrorCode: NotRequired[int]


class CloudCatalogSync(TypedDict):
    catalogId: str
    syncedAt: str | None
    stale: bool
    productCount: int
    lastAttempt: CloudCatalogAttempt


class CloudCatalogProduct(TypedDict):
    id: str
    retailerId: NotRequired[str]
    name: NotRequired[str]
    description: NotRequired[str]
    price: NotRequired[str]
    currency: NotRequired[str]
    availability: NotRequired[str]
    reviewStatus: NotRequired[str]
    visibility: NotRequired[str]
    imageUrl: NotRequired[str]
    url: NotRequired[str]


class CloudCatalogList(TypedDict):
    catalogs: list[CloudCatalogSync]


class CloudCatalogProductPage(TypedDict):
    catalog: CloudCatalogSync
    products: list[CloudCatalogProduct]
    nextCursor: NotRequired[str]


class Catalogs(Resource):
    def _path(self, session: str, catalog_id: str | None = None) -> str:
        self._server()
        if not session.strip():
            raise ValidationError("Provide a Number ID.")
        if catalog_id is not None and re.fullmatch(r"[0-9]{1,32}", catalog_id) is None:
            raise ValidationError("catalogId must contain 1 to 32 digits.")
        return f"/messaging/{segment(session)}/catalogs" + (
            "" if catalog_id is None else "/" + segment(catalog_id)
        )

    async def list(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudCatalogList]]:
        return await self._request("GET", self._path(session), options=options)

    async def retrieve(
        self, session: str, catalog_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudCatalogSync]]:
        return await self._request("GET", self._path(session, catalog_id), options=options)

    async def list_products(
        self,
        session: str,
        catalog_id: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[CloudCatalogProductPage]]:
        if (
            limit is not None
            and (type(limit) is not int or not 1 <= limit <= 100)
            or cursor is not None
            and re.fullmatch(r"[A-Za-z0-9_-]{1,256}", cursor) is None
        ):
            raise ValidationError("Invalid catalog pagination.")
        return await self._request(
            "GET",
            self._path(session, catalog_id) + "/products",
            query={"limit": limit, "cursor": cursor},
            options=options,
        )

    async def sync(
        self, session: str, catalog_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudCatalogSync]]:
        """Submit once; preserve cooldown errors and never poll automatically."""
        return await self._request(
            "POST",
            self._path(session, catalog_id) + "/sync",
            options=replace(options, max_network_retries=0, timeout=options.timeout or 60),
        )


class MarketingOnboarding(TypedDict):
    status: Literal["onboarded", "eligible", "unknown"]
    metaStatus: str | None


class MarketingTerms(TypedDict):
    status: Literal["signed", "requested", "not_started", "unknown"]
    metaStatus: str | None
    date: str | None


class MarketingMessagesStatus(TypedDict):
    wabaId: str
    onboarding: MarketingOnboarding
    terms: MarketingTerms
    cloudApiMarketingDisabled: bool | None
    nextAction: Literal["none", "accept_terms", "review_in_whatsapp_manager"]
    guideUrl: str
    observedAt: str


# Informational QuickLink values. errorCode remains an open nullable string.
CLOUD_READINESS_FAILURE_CODES = frozenset(
    {
        "meta_credentials_invalid",
        "meta_phone_not_registered",
        "meta_webhook_not_subscribed",
        "meta_payment_method_missing",
        "meta_quality_flagged",
        "meta_readiness_unknown",
    }
)
