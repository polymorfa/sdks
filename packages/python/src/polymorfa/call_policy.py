"""Team call retention, destination policy and do-not-call list."""

import re
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .errors import ConfigurationError, ValidationError
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, RequestOptions


class CallRetention(TypedDict):
    policy: Literal["short", "standard", "extended", "compliance", "custom"]
    retentionDays: int
    appliesTo: list[str]
    revision: int
    updatedAt: str | None


class CustomRetention(TypedDict):
    policy: Literal["custom"]
    retentionDays: int
    expectedRevision: NotRequired[int]


class NamedRetention(TypedDict):
    policy: Literal["short", "standard", "extended", "compliance"]
    retentionDays: NotRequired[int]
    expectedRevision: NotRequired[int]


class CallRetentions(PlatformResource):
    async def retrieve(self, *, options: RequestOptions = O) -> ApiResponse[CallRetention]:
        return await self._unwrapped("GET", "/platform/call-retention", options=options)

    async def update(
        self, body: CustomRetention | NamedRetention, *, options: RequestOptions = O
    ) -> ApiResponse[CallRetention]:
        return await self._unwrapped("PUT", "/platform/call-retention", body=body, options=options)


class CallPolicy(TypedDict):
    blockedCountryCodes: list[str]
    optOutCount: int
    revision: int
    updatedAt: str | None


class UpdateCallPolicy(TypedDict):
    blockedCountryCodes: list[str]
    expectedRevision: NotRequired[int]


class CallPolicies(PlatformResource):
    async def retrieve(self, *, options: RequestOptions = O) -> ApiResponse[CallPolicy]:
        return await self._unwrapped("GET", "/platform/call-policy", options=options)

    async def update(
        self, body: UpdateCallPolicy, *, options: RequestOptions = O
    ) -> ApiResponse[CallPolicy]:
        codes = body.get("blockedCountryCodes")
        if (
            not isinstance(codes, list)
            or len(codes) > 300
            or any(not isinstance(c, str) or not re.fullmatch(r"[1-9][0-9]{0,3}", c) for c in codes)
        ):
            raise ValidationError(
                "blockedCountryCodes accepts at most 300 codes of 1 to 4 digits without +."
            )
        revision = body.get("expectedRevision")
        if revision is not None and (
            isinstance(revision, bool)
            or not isinstance(revision, int)
            or not 0 <= revision <= 2**53 - 1
        ):
            raise ValidationError("expectedRevision must be a nonnegative safe integer.")
        return await self._unwrapped("PUT", "/platform/call-policy", body=body, options=options)


class CallOptOut(TypedDict):
    id: str
    phoneNumber: str | None
    bsuid: str | None
    note: str | None
    source: Literal["api", "console", "import"]
    createdAt: str


class PhoneOptOut(TypedDict):
    phoneNumber: str
    note: NotRequired[str]


class BsuidOptOut(TypedDict):
    bsuid: str
    note: NotRequired[str]


class OptOutImportEntry(TypedDict, total=False):
    phoneNumber: str
    bsuid: str
    note: str


class OptOutImport(TypedDict):
    entries: list[OptOutImportEntry]


class RejectedOptOut(TypedDict):
    index: int
    reason: Literal[
        "invalid_phone_number",
        "invalid_bsuid",
        "missing_identifier",
        "multiple_identifiers",
        "invalid_note",
    ]


class OptOutImportResult(TypedDict):
    added: int
    existing: int
    rejected: list[RejectedOptOut]


class DeletedOptOut(TypedDict):
    id: str
    deleted: Literal[True]


class CallOptOuts(PlatformResource):
    async def list(
        self,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        phone_number: str | None = None,
        bsuid: str | None = None,
        options: RequestOptions = O,
    ) -> CursorPage[CallOptOut]:
        if phone_number is not None and bsuid is not None:
            raise ValidationError("Filter by phone_number or bsuid, not both.")
        return await self._page(
            "/platform/call-opt-outs",
            {"limit": limit, "cursor": cursor, "phoneNumber": phone_number, "bsuid": bsuid},
            options,
        )

    async def create(
        self, body: PhoneOptOut | BsuidOptOut, *, options: RequestOptions = O
    ) -> ApiResponse[CallOptOut]:
        phone, bsuid = body.get("phoneNumber"), body.get("bsuid")
        if (isinstance(phone, str) and len(phone) > 0) == (
            isinstance(bsuid, str) and len(bsuid) > 0
        ):
            raise ValidationError("Supply exactly one of phoneNumber or bsuid.")
        return await self._unwrapped("POST", "/platform/call-opt-outs", body=body, options=options)

    async def import_entries(
        self, body: OptOutImport, *, options: RequestOptions = O
    ) -> ApiResponse[OptOutImportResult]:
        entries = body.get("entries")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 5000:
            raise ValidationError("entries must hold 1 to 5000 entries.")
        return await self._unwrapped(
            "POST", "/platform/call-opt-outs/import", body=body, options=options
        )

    async def delete(
        self, opt_out_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DeletedOptOut]:
        if not opt_out_id.strip():
            raise ConfigurationError("opt_out_id")
        return await self._unwrapped(
            "DELETE", f"/platform/call-opt-outs/{segment(opt_out_id)}", options=options
        )
