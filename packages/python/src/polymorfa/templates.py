"""Project template drafts and Official API provider template resources."""

from __future__ import annotations

import builtins
from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import Envelope, Success
from .transport import ApiResponse, JsonObject, RequestOptions

Category = Literal["MARKETING", "UTILITY", "AUTHENTICATION"]


class Variable(TypedDict):
    name: str
    type: Literal["text", "number", "currency", "date_time"]
    example: str


class NoHeader(TypedDict):
    format: Literal["none"]


class TextHeader(TypedDict):
    format: Literal["text"]
    text: str


class MediaHeader(TypedDict):
    format: Literal["image", "video", "document"]
    example: NotRequired[str]
    filename: NotRequired[str]


class LocationExample(TypedDict):
    latitude: float
    longitude: float
    name: NotRequired[str]
    address: NotRequired[str]


class LocationHeader(TypedDict):
    format: Literal["location"]
    example: NotRequired[LocationExample]


class ReplyButton(TypedDict):
    type: Literal["quick_reply"]
    text: str


class UrlButton(TypedDict):
    type: Literal["url"]
    text: str
    url: str


class PhoneButton(TypedDict):
    type: Literal["phone"]
    text: str
    phone: str


class CodeButton(TypedDict):
    type: Literal["copy_code"]
    text: NotRequired[str]
    example: NotRequired[str]


Button = ReplyButton | UrlButton | PhoneButton | CodeButton


class CarouselCard(TypedDict):
    header: MediaHeader
    body: str
    buttons: NotRequired[list[Button]]


class Carousel(TypedDict):
    cards: list[CarouselCard]


class Authentication(TypedDict):
    otpType: Literal["copy_code", "one_tap"]
    codeExample: NotRequired[str]
    addSecurityRecommendation: NotRequired[bool]
    codeExpirationMinutes: NotRequired[int]


class LimitedTimeOffer(TypedDict):
    text: str
    hasExpiration: bool


class TemplateDefinition(TypedDict):
    version: Literal[1]
    kind: Literal["standard", "carousel", "authentication", "limited_time_offer"]
    category: Category
    language: str
    header: NotRequired[NoHeader | TextHeader | MediaHeader | LocationHeader]
    body: str
    footer: NotRequired[str]
    buttons: NotRequired[list[Button]]
    carousel: NotRequired[Carousel]
    authentication: NotRequired[Authentication]
    limitedTimeOffer: NotRequired[LimitedTimeOffer]
    variables: list[Variable]


class ProjectTemplate(TypedDict):
    id: str
    name: str
    category: str
    language: str
    status: str
    kind: str
    definition: NotRequired[TemplateDefinition | None]
    sampleValues: NotRequired[dict[str, str] | None]
    cloudLinks: list[object]
    createdAt: int
    updatedAt: int


class CreateTemplate(TypedDict):
    name: str
    definition: TemplateDefinition
    sampleValues: NotRequired[dict[str, str]]


class UpdateTemplate(TypedDict, total=False):
    name: str
    status: str
    definition: TemplateDefinition
    sampleValues: dict[str, str]


class PreviewTemplate(TypedDict, total=False):
    values: dict[str, str]
    surface: Literal["cloud", "whatsmeow", "sandbox"]


class SubmitTemplate(TypedDict):
    session: str


class Templates(Resource):
    async def list(
        self, project_slug: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[ProjectTemplate]]]:
        return await self._request(
            "GET", f"/messaging/projects/{segment(project_slug)}/templates", options=options
        )

    async def create(
        self, project_slug: str, body: CreateTemplate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectTemplate]]:
        return await self._request(
            "POST",
            f"/messaging/projects/{segment(project_slug)}/templates",
            body=body,
            options=options,
        )

    async def retrieve(
        self, project_slug: str, template_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectTemplate]]:
        return await self._request(
            "GET",
            f"/messaging/projects/{segment(project_slug)}/templates/{segment(template_id)}",
            options=options,
        )

    async def update(
        self,
        project_slug: str,
        template_id: str,
        body: UpdateTemplate,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[ProjectTemplate]]:
        return await self._request(
            "PATCH",
            f"/messaging/projects/{segment(project_slug)}/templates/{segment(template_id)}",
            body=body,
            options=options,
        )

    async def delete(
        self, project_slug: str, template_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "DELETE",
            f"/messaging/projects/{segment(project_slug)}/templates/{segment(template_id)}",
            options=options,
        )

    async def preview(
        self,
        project_slug: str,
        template_id: str,
        body: PreviewTemplate | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/messaging/projects/{segment(project_slug)}/templates/{segment(template_id)}/preview",
            body={} if body is None else body,
            options=options,
        )

    async def submit(
        self,
        project_slug: str,
        template_id: str,
        body: SubmitTemplate,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/messaging/projects/{segment(project_slug)}/templates/{segment(template_id)}/submit",
            body=body,
            options=replace(options, max_network_retries=0),
        )


class CloudTemplate(TypedDict):
    id: str
    tenantId: str
    session: str
    wabaId: str
    name: str
    language: str
    category: Category
    status: Literal[
        "PENDING",
        "APPROVED",
        "REJECTED",
        "PAUSED",
        "DISABLED",
        "DELETED",
        "ARCHIVED",
        "IN_APPEAL",
        "LIMIT_EXCEEDED",
        "PENDING_DELETION",
    ]
    components: list[object]
    metaTemplateId: NotRequired[str]
    rejectionReason: NotRequired[str]
    qualityScore: NotRequired[str]
    createdAt: str
    updatedAt: str


class CreateCloudTemplate(TypedDict):
    name: str
    language: str
    category: Category
    components: list[object]


class EditCloudTemplate(TypedDict):
    components: list[object]


class AcceptedCloudTemplate(TypedDict):
    accepted: Literal[True]
    name: str
    language: str


class CloudTemplates(Resource):
    async def list(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[CloudTemplate]]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/templates", options=options
        )

    async def retrieve(
        self, session: str, name: str, *, language: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudTemplate]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/templates/{segment(name)}",
            query={"language": language},
            options=options,
        )

    async def create(
        self, session: str, body: CreateCloudTemplate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudTemplate]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/templates",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def update(
        self,
        session: str,
        name: str,
        body: EditCloudTemplate,
        *,
        language: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[AcceptedCloudTemplate]]:
        self._server()
        return await self._request(
            "PATCH",
            f"/messaging/{segment(session)}/templates/{segment(name)}",
            query={"language": language},
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def delete(
        self, session: str, name: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._server()
        return await self._request(
            "DELETE",
            f"/messaging/{segment(session)}/templates/{segment(name)}",
            options=replace(options, max_network_retries=0),
        )
