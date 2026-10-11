"""Official API catalog, marketing status and Flow public-key operations."""

from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .errors import ConfigurationError
from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, RequestOptions


class CatalogParams(TypedDict):
    version: str
    limit: NotRequired[int]
    after: NotRequired[str]


class Catalog(TypedDict):
    id: str
    name: NotRequired[str]


class CatalogProduct(TypedDict):
    id: str
    retailer_id: NotRequired[str]
    name: NotRequired[str]
    availability: NotRequired[str]


class Cursors(TypedDict, total=False):
    before: str
    after: str


class Paging(TypedDict):
    cursors: Cursors


class CatalogPage(TypedDict):
    data: list[Catalog]
    paging: NotRequired[Paging]


class ProductPage(TypedDict):
    data: list[CatalogProduct]
    paging: NotRequired[Paging]


class MarketingStatus(TypedDict):
    id: str
    marketing_messages_lite_api_status: NotRequired[str]
    marketing_messages_onboarding_status: NotRequired[str]


class FlowEncryptionKey(TypedDict):
    business_public_key: str
    business_public_key_signature_status: str


class RegisterFlowKey(TypedDict):
    businessPublicKey: str


class KeyRegistered(TypedDict):
    success: Literal[True]


class CloudCatalogs(Resource):
    async def list(
        self, waba_id: str, params: CatalogParams, *, options: RequestOptions = O
    ) -> ApiResponse[CatalogPage]:
        self._server()
        if not waba_id.strip() or not params["version"].strip():
            raise ConfigurationError("Provide a WABA ID and Graph version.")
        return await self._request(
            "GET",
            f"/graph/whatsapp/{segment(params['version'])}/{segment(waba_id)}/product_catalogs",
            query={"limit": params.get("limit"), "after": params.get("after")},
            options=options,
        )

    async def list_products(
        self, waba_id: str, catalog_id: str, params: CatalogParams, *, options: RequestOptions = O
    ) -> ApiResponse[ProductPage]:
        self._server()
        if (
            not waba_id.strip()
            or not catalog_id.isascii()
            or not catalog_id.isdigit()
            or not params["version"].strip()
        ):
            raise ConfigurationError("Provide a WABA ID, numeric catalog ID and Graph version.")
        return await self._request(
            "GET",
            f"/graph/whatsapp/{segment(params['version'])}/{segment(waba_id)}/product_catalogs/{segment(catalog_id)}/products",
            query={"limit": params.get("limit"), "after": params.get("after")},
            options=options,
        )


class CloudMarketing(Resource):
    async def status(
        self, waba_id: str, *, version: str, options: RequestOptions = O
    ) -> ApiResponse[MarketingStatus]:
        self._server()
        if not waba_id.strip() or not version.strip():
            raise ConfigurationError("Provide a WABA ID and Graph version.")
        return await self._request(
            "GET",
            f"/graph/whatsapp/{segment(version)}/{segment(waba_id)}/marketing_messages/status",
            options=options,
        )


class FlowEncryption(Resource):
    def _path(self, phone_number_id: str, version: str) -> str:
        self._server()
        if not phone_number_id.strip() or not version.strip():
            raise ConfigurationError("Provide a Meta phone number ID and Graph version.")
        return f"/graph/whatsapp/{segment(version)}/{segment(phone_number_id)}/whatsapp_business_encryption"

    async def retrieve(
        self, phone_number_id: str, *, version: str, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[list[FlowEncryptionKey]]]:
        return await self._request("GET", self._path(phone_number_id, version), options=options)

    async def register(
        self,
        phone_number_id: str,
        body: RegisterFlowKey,
        *,
        version: str,
        options: RequestOptions = O,
    ) -> ApiResponse[KeyRegistered]:
        return await self._request(
            "POST",
            self._path(phone_number_id, version),
            body={"business_public_key": body["businessPublicKey"]},
            options=replace(options, max_network_retries=0),
        )
