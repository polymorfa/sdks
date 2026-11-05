"""Voice library assets and write-only provider credential contracts."""

from __future__ import annotations

import asyncio
import builtins
import time
from collections.abc import AsyncIterable
from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .errors import (
    AuthorizationError,
    ConfigurationError,
    NotFoundError,
    TimeoutError,
    ValidationError,
)
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, QueryValue, RequestOptions, Transport

VOICE_AUDIO_MAX_UPLOAD_BYTES = 16777216
UploadContentType = Literal[
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/x-m4a"
]
OpenAiVoice = Literal[
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"
]


class Tts(TypedDict):
    provider: str
    voiceId: str
    model: str
    text: str
    characters: int
    keySource: str
    credentialId: str | None


class Asset(TypedDict):
    id: str
    projectId: str
    name: str
    source: str
    status: str
    failureReason: str | None
    originalFormat: str | None
    originalContentType: str | None
    sizeBytes: int | None
    durationMs: float | None
    contentSha256: str | None
    tts: Tts | None
    retentionDays: int | None
    expiresAt: str | None
    inUseCount: int
    revision: int
    createdAt: str
    updatedAt: str
    readyAt: str | None


class Upload(TypedDict):
    url: str
    method: Literal["POST"]
    headers: dict[str, str]
    maxBytes: int
    expiresAt: str


class UploadCreated(TypedDict):
    asset: Asset
    upload: Upload


class Preview(TypedDict):
    url: str
    contentType: Literal["audio/ogg"]
    expiresAt: str


class ProviderCredential(TypedDict):
    id: str
    projectId: str | None
    provider: str
    label: str
    keyFingerprint: str
    status: str
    verifiedAt: str | None
    lastError: str | None
    revision: int
    createdAt: str
    updatedAt: str


class Deleted(TypedDict):
    id: str
    deleted: Literal[True]


class ListAudio(TypedDict, total=False):
    status: Literal["pending_upload", "uploaded", "transcoding", "ready", "failed"]
    cursor: str
    limit: int


class CreateUpload(TypedDict):
    name: str
    contentType: UploadContentType
    sizeBytes: int
    retentionDays: NotRequired[int]


class SynthesisBase(TypedDict):
    name: str
    text: str
    credentialId: NotRequired[str]
    retentionDays: NotRequired[int]


class ElevenLabsSynthesis(SynthesisBase):
    provider: Literal["elevenlabs"]
    voiceId: str
    model: NotRequired[Literal["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"]]


class OpenAiSynthesis(SynthesisBase):
    provider: Literal["openai"]
    voiceId: OpenAiVoice
    model: NotRequired[Literal["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]]


Synthesize = ElevenLabsSynthesis | OpenAiSynthesis


class UpdateAudio(TypedDict, total=False):
    expectedRevision: int
    name: str
    retentionDays: int | None


class CreateCredential(TypedDict):
    provider: Literal["elevenlabs", "openai"]
    label: str
    apiKey: str


def _path(resource: str, identifier: str) -> str:
    if not isinstance(identifier, str) or not identifier.strip():
        raise ConfigurationError("id")
    return f"/platform/voice/{resource}/{segment(identifier)}"


class _VoiceScoped(PlatformResource):
    def __init__(self, transport: Transport, project_id: str | None) -> None:
        super().__init__(transport, "/platform/voice")
        self._project_id = project_id

    def _project(self, project_id: str | None) -> str:
        if self._project_id is not None:
            if project_id is not None and project_id.lower() != self._project_id.lower():
                raise ConfigurationError("project_id")
            return self._project_id
        if not isinstance(project_id, str) or not project_id.strip():
            raise ConfigurationError("project_id")
        return project_id

    @property
    def _confine_by_id(self) -> bool:
        return self._project_id is not None and (
            self._transport._credential is None
            or self._transport._credential.kind != "project_token"
        )


class Audio(_VoiceScoped):
    def _assert(self, asset_id: str, asset: Asset) -> None:
        if self._project_id is not None and asset["projectId"].lower() != self._project_id.lower():
            raise NotFoundError(
                "Audio asset not found.",
                code="resource_not_found",
                status=404,
                details={"assetId": asset_id},
            )

    async def _confine(self, asset_id: str, options: RequestOptions) -> None:
        if self._confine_by_id:
            await self.retrieve(asset_id, options=replace(options, idempotency_key=None))

    async def list(
        self,
        params: ListAudio | None = None,
        *,
        project_id: str | None = None,
        options: RequestOptions = O,
    ) -> CursorPage[Asset]:
        query: dict[str, QueryValue] = {"projectId": self._project(project_id)}
        params = {} if params is None else params
        if "status" in params:
            query["status"] = params["status"]
        if "cursor" in params:
            query["cursor"] = params["cursor"]
        if "limit" in params:
            query["limit"] = params["limit"]
        return await self._page("/platform/voice/audio", query, options)

    async def create_upload(
        self, body: CreateUpload, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[UploadCreated]:
        return await self._unwrapped(
            "POST",
            "/platform/voice/audio",
            body={**body, "projectId": self._project(project_id)},
            options=options,
        )

    async def synthesize(
        self, body: Synthesize, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[Asset]:
        return await self._unwrapped(
            "POST",
            "/platform/voice/audio/tts",
            body={**body, "projectId": self._project(project_id)},
            options=options,
        )

    async def retrieve(self, asset_id: str, *, options: RequestOptions = O) -> ApiResponse[Asset]:
        response: ApiResponse[Asset] = await self._unwrapped(
            "GET", _path("audio", asset_id), options=options
        )
        self._assert(asset_id, response.data)
        return response

    async def complete(self, asset_id: str, *, options: RequestOptions = O) -> ApiResponse[Asset]:
        await self._confine(asset_id, options)
        return await self._unwrapped(
            "POST", _path("audio", asset_id) + "/complete", options=options
        )

    async def update(
        self, asset_id: str, body: UpdateAudio, *, options: RequestOptions = O
    ) -> ApiResponse[Asset]:
        await self._confine(asset_id, options)
        return await self._unwrapped("PATCH", _path("audio", asset_id), body=body, options=options)

    async def delete(self, asset_id: str, *, options: RequestOptions = O) -> ApiResponse[Deleted]:
        await self._confine(asset_id, options)
        return await self._unwrapped("DELETE", _path("audio", asset_id), options=options)

    async def preview_url(
        self, asset_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Preview]:
        await self._confine(asset_id, options)
        return await self._unwrapped("GET", _path("audio", asset_id) + "/preview", options=options)

    async def wait_until_ready(
        self,
        asset_id: str,
        *,
        timeout: float = 120,
        interval: float = 2,
        options: RequestOptions = O,
    ) -> ApiResponse[Asset]:
        if (
            not timeout > 0
            or not interval > 0
            or timeout == float("inf")
            or interval == float("inf")
        ):
            raise ConfigurationError("wait")
        deadline = time.monotonic() + timeout
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                raise TimeoutError(
                    "The audio asset was not processed in time.",
                    code="request_timeout",
                    details={"assetId": asset_id},
                )
            try:
                response = await asyncio.wait_for(self.retrieve(asset_id, options=options), left)
            except asyncio.TimeoutError as error:
                raise TimeoutError(
                    "The audio asset was not processed in time.",
                    code="request_timeout",
                    details={"assetId": asset_id},
                ) from error
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    "The audio asset was not processed in time.",
                    code="request_timeout",
                    details={"assetId": asset_id},
                )
            if response.data["status"] in {"ready", "failed"}:
                return response
            await asyncio.sleep(min(interval, max(0, deadline - time.monotonic())))

    async def upload(
        self,
        name: str,
        body: bytes | AsyncIterable[bytes],
        content_type: UploadContentType,
        *,
        size_bytes: int | None = None,
        retention_days: int | None = None,
        project_id: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Asset]:
        if content_type not in {
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/ogg",
            "audio/mp4",
            "audio/x-m4a",
        }:
            raise ValidationError("Upload an MP3, WAV, OGG or M4A audio file.")
        if isinstance(body, bytes):
            if size_bytes is not None and size_bytes != len(body):
                raise ValidationError(
                    "size_bytes does not match the body.", code="invalid_parameter"
                )
            size_bytes = len(body)
        elif size_bytes is None:
            raise ConfigurationError("size_bytes")
        if (
            isinstance(size_bytes, bool)
            or not isinstance(size_bytes, int)
            or not 1 <= size_bytes <= VOICE_AUDIO_MAX_UPLOAD_BYTES
        ):
            raise ValidationError("Audio size must be1 to16777216 bytes.")
        input: CreateUpload = {"name": name, "contentType": content_type, "sizeBytes": size_bytes}
        if retention_days is not None:
            input["retentionDays"] = retention_days
        created = await self.create_upload(input, project_id=project_id, options=options)
        upload = created.data["upload"]
        await self._transport.send_to_upload_url(
            upload["url"], upload["method"], upload["headers"], body, options=options
        )
        # Follow-up completion has its own effect; the create key never leaks to it.
        return await self._unwrapped(
            "POST",
            _path("audio", created.data["asset"]["id"]) + "/complete",
            options=replace(options, idempotency_key=None),
        )


class ProviderCredentials(_VoiceScoped):
    def _assert(self, credential_id: str, credential: ProviderCredential) -> None:
        if (
            self._project_id is not None
            and credential["projectId"] is not None
            and credential["projectId"].lower() != self._project_id.lower()
        ):
            raise NotFoundError(
                "Provider credential not found.",
                code="resource_not_found",
                status=404,
                details={"credentialId": credential_id},
            )

    async def _confine(self, credential_id: str, options: RequestOptions) -> None:
        if self._confine_by_id:
            response = await self.retrieve(
                credential_id, options=replace(options, idempotency_key=None)
            )
            if response.data["projectId"] is None:
                raise AuthorizationError(
                    "Manage team-wide credentials from the team client.",
                    code="permission_denied",
                    status=403,
                    details={"credentialId": credential_id},
                )

    async def list(
        self, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[builtins.list[ProviderCredential]]:
        if self._project_id is not None:
            project_id = self._project(project_id)
        return await self._unwrapped(
            "GET",
            "/platform/voice/provider-credentials",
            query={} if project_id is None else {"projectId": project_id},
            options=options,
        )

    async def create(
        self, body: CreateCredential, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[ProviderCredential]:
        if not isinstance(body.get("apiKey"), str) or not body["apiKey"]:
            raise ConfigurationError("apiKey")
        value = dict(body)
        if self._project_id is not None or project_id is not None:
            value["projectId"] = self._project(project_id)
        return await self._unwrapped(
            "POST", "/platform/voice/provider-credentials", body=value, options=options
        )

    async def retrieve(
        self, credential_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[ProviderCredential]:
        response: ApiResponse[ProviderCredential] = await self._unwrapped(
            "GET", _path("provider-credentials", credential_id), options=options
        )
        self._assert(credential_id, response.data)
        return response

    async def verify(
        self, credential_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[ProviderCredential]:
        await self._confine(credential_id, options)
        return await self._unwrapped(
            "POST", _path("provider-credentials", credential_id) + "/verify", options=options
        )

    async def delete(
        self, credential_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Deleted]:
        await self._confine(credential_id, options)
        return await self._unwrapped(
            "DELETE", _path("provider-credentials", credential_id), options=options
        )


class Voice:
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        self.audio = Audio(transport, project_id)
        self.provider_credentials = ProviderCredentials(transport, project_id)
