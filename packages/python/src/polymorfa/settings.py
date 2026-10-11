"""Owner-bound QuickLink settings and team keyword opt-out settings."""

from __future__ import annotations

from typing import Literal
from urllib.parse import unquote

from typing_extensions import TypedDict

from .messaging import O, Resource, segment
from .models import DataEnvelope
from .platform import PlatformResource
from .transport import ApiResponse, JsonObject, RequestOptions

Theme = Literal["light", "dark", "system"]
Shape = Literal["square", "rounded", "pill"]
LogoMode = Literal["none", "custom", "organization", "project"]
HistorySync = Literal["ask", "force_on", "force_off"]
Method = Literal["qr", "pairing"]


class QuickLinkSettings(TypedDict):
    id: str
    projectId: str | None
    enabled: bool
    successCallbackUrl: str | None
    failureCallbackUrl: str | None
    businessName: str | None
    headline: str | None
    description: str | None
    successMessage: str | None
    supportUrl: str | None
    privacyUrl: str | None
    termsUrl: str | None
    accent: str | None
    theme: Theme
    hideWatermark: bool
    allowPhoneChange: bool
    shape: Shape | None
    radiusPx: int | None
    logoMode: LogoMode
    logoStorageId: str | None
    logoSourceStorageId: str | None
    logoUrl: str | None
    historySync: HistorySync
    methods: list[Method] | None
    defaultMethod: Method | None
    createdAt: int
    updatedAt: int


class UpdateQuickLinkSettings(TypedDict, total=False):
    enabled: bool
    successCallbackUrl: str | None
    failureCallbackUrl: str | None
    businessName: str | None
    headline: str | None
    description: str | None
    successMessage: str | None
    supportUrl: str | None
    privacyUrl: str | None
    termsUrl: str | None
    accent: str | None
    theme: Theme
    hideWatermark: bool
    allowPhoneChange: bool
    shape: Shape | None
    radiusPx: int | None
    logoMode: LogoMode
    logoStorageId: str | None
    logoSourceStorageId: str | None
    historySync: HistorySync
    methods: list[Method] | None
    defaultMethod: Method | None


class QuickLinkConfiguration(PlatformResource):
    @property
    def _project_id(self) -> str | None:
        return (
            unquote(self._prefix.rsplit("/", 1)[1])
            if self._prefix.startswith("/platform/projects/")
            else None
        )

    async def retrieve(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[QuickLinkSettings | None]:
        return await self._unwrapped(
            "GET", "/platform/quicklink", query={"projectId": self._project_id}, options=options
        )

    async def update(
        self, body: UpdateQuickLinkSettings | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[QuickLinkSettings]:
        wire: dict[str, object] = dict(body or {})
        if self._project_id is not None:
            wire["projectId"] = self._project_id
        return await self._unwrapped("PUT", "/platform/quicklink", body=wire, options=options)


class OptOutSettings(TypedDict):
    enabled: bool
    optOutKeywords: list[str]
    optInKeywords: list[str]
    updatedAt: int | None


class UpdateOptOutSettings(TypedDict):
    enabled: bool
    optOutKeywords: list[str]
    optInKeywords: list[str]


class OptOuts(Resource):
    async def list(self, *, options: RequestOptions = O) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("GET", "/platform/optouts", options=options)

    async def create(
        self, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("POST", "/platform/optouts", body=body, options=options)

    async def create_batch(
        self, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("POST", "/platform/optouts/batch", body=body, options=options)

    async def delete(
        self, phone: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("DELETE", f"/platform/optouts/{segment(phone)}", options=options)

    async def get_settings(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[OptOutSettings]]:
        return await self._request("GET", "/platform/optouts/settings", options=options)

    async def update_settings(
        self, body: UpdateOptOutSettings, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[OptOutSettings]]:
        return await self._request("PUT", "/platform/optouts/settings", body=body, options=options)
