"""Project-bound Functions. Uncertain invocations and writes never retry."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import replace
from typing import Generic, Literal, TypeVar, cast

from typing_extensions import NotRequired, TypedDict

from .errors import ValidationError
from .messaging import O, Resource
from .platform import PlatformResource
from .transport import ApiResponse, QueryValue, RequestOptions, Transport

T = TypeVar("T")


class Function(TypedDict):
    id: str
    projectId: str
    name: str
    enabled: bool
    revision: int
    activeDeploymentId: str | None
    createdAt: str
    updatedAt: str


class FunctionPage(TypedDict, Generic[T]):
    items: list[T]
    nextCursor: str | None


class ListFunctions(TypedDict, total=False):
    limit: int
    before: str


class CreateFunction(TypedDict):
    name: str
    functionId: NotRequired[str]


class UpdateFunction(TypedDict):
    expectedRevision: int
    name: NotRequired[str]
    enabled: NotRequired[bool]


class CreateDeployment(TypedDict):
    deploymentId: str
    source: str
    language: Literal["javascript", "typescript", "visual"]
    region: str
    compatibilityDate: str
    secretVersionIds: NotRequired[list[str]]
    egressOrigins: NotRequired[list[str]]


class DeploymentSummary(TypedDict):
    id: str
    functionId: str
    language: Literal["javascript", "typescript", "visual"]
    region: str
    compatibilityDate: str
    sha256: str
    secretVersionIds: list[str]
    egressOrigins: list[str]
    createdAt: str


class Deployment(DeploymentSummary):
    source: str


class Promotion(TypedDict):
    deploymentId: str
    expectedRevision: int


class Secret(TypedDict):
    id: str
    name: str
    createdAt: str
    revokedAt: str | None


class CreateSecret(TypedDict):
    name: str
    value: str


class FunctionRequest(TypedDict):
    method: Literal["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    url: str
    headers: dict[str, str]
    bodyBase64: str


class FunctionResponse(TypedDict):
    status: int
    headers: dict[str, str]
    bodyBase64: str


class Invocation(TypedDict):
    id: str
    functionId: str
    deploymentId: str
    outcome: Literal["running", "succeeded", "failed", "unknown", "unavailable"]
    trigger: Literal["http", "flow", "test"]
    errorCode: str | None
    durationMs: float | None
    responseBytes: int | None
    attempt: int
    createdAt: str
    completedAt: str | None


class CreateInvocation(TypedDict):
    request: FunctionRequest
    deploymentId: NotRequired[str]
    trigger: NotRequired[Literal["http", "test"]]


class InvocationResult(TypedDict):
    receipt: Invocation
    replayed: bool
    response: NotRequired[FunctionResponse]
    responseRetained: Literal[False]
    retryable: bool


class MutationResult(TypedDict):
    ok: Literal[True]


def _identifier(value: str) -> str:
    if (
        not isinstance(value, str)
        or re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", value)
        is None
    ):
        raise ValidationError(
            "A canonical Functions UUID is required.", code="invalid_function_input"
        )
    return value


def _revision(value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 9007199254740991:
        raise ValidationError(
            "A positive Function revision is required.", code="invalid_function_input"
        )


class _FunctionTransport(PlatformResource):
    def __init__(self, transport: Transport, project_id: str) -> None:
        super().__init__(transport, "/platform/functions")
        self._project_id = project_id

    async def call(
        self, method: str, path: str, input: Mapping[str, object] | None, options: RequestOptions
    ) -> ApiResponse[T]:
        if input and ("projectId" in input or (path and "functionId" in input)):
            raise ValidationError(
                "Function input cannot override its project or path identity.",
                code="invalid_function_input",
            )
        _identifier(self._project_id)
        value = {**(input or {}), "projectId": self._project_id}
        options = options if method == "GET" else replace(options, max_network_retries=0)
        query = (
            {key: cast(QueryValue, value) for key, value in value.items()}
            if method in {"GET", "DELETE"}
            else None
        )
        return await self._unwrapped(
            method,
            self._prefix + path,
            query=query,
            body=None if query is not None else value,
            options=options,
        )


class Functions(Resource):
    def __init__(self, transport: Transport, project_id: str) -> None:
        super().__init__(transport, "project_token")
        self._api = _FunctionTransport(transport, project_id)
        self.deployments = Deployments(self._api)
        self.secrets = Secrets(self._api)
        self.invocations = Invocations(self._api)

    async def list(
        self, params: ListFunctions | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[FunctionPage[Function]]:
        return await self._api.call("GET", "", params, options)

    async def create(
        self, input: CreateFunction, *, options: RequestOptions = O
    ) -> ApiResponse[Function]:
        if "functionId" in input:
            _identifier(input["functionId"])
        return await self._api.call("POST", "", input, options)

    async def retrieve(
        self, function_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Function]:
        return await self._api.call("GET", "/" + _identifier(function_id), None, options)

    async def update(
        self, function_id: str, input: UpdateFunction, *, options: RequestOptions = O
    ) -> ApiResponse[Function]:
        _revision(input["expectedRevision"])
        return await self._api.call("PATCH", "/" + _identifier(function_id), input, options)

    async def delete(
        self, function_id: str, expected_revision: int, *, options: RequestOptions = O
    ) -> ApiResponse[MutationResult]:
        _revision(expected_revision)
        return await self._api.call(
            "DELETE",
            "/" + _identifier(function_id),
            {"expectedRevision": expected_revision},
            options,
        )


class Deployments:
    def __init__(self, api: _FunctionTransport) -> None:
        self._api = api

    async def list(
        self, function_id: str, params: ListFunctions | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[FunctionPage[DeploymentSummary]]:
        return await self._api.call(
            "GET", "/" + _identifier(function_id) + "/deployments", params, options
        )

    async def create(
        self, function_id: str, input: CreateDeployment, *, options: RequestOptions = O
    ) -> ApiResponse[Deployment]:
        _identifier(input["deploymentId"])
        return await self._api.call(
            "POST", "/" + _identifier(function_id) + "/deployments", input, options
        )

    async def retrieve(
        self, function_id: str, deployment_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Deployment]:
        return await self._api.call(
            "GET",
            "/" + _identifier(function_id) + "/deployments/" + _identifier(deployment_id),
            None,
            options,
        )

    async def promote(
        self, function_id: str, input: Promotion, *, options: RequestOptions = O
    ) -> ApiResponse[Function]:
        _identifier(input["deploymentId"])
        _revision(input["expectedRevision"])
        return await self._api.call(
            "PUT", "/" + _identifier(function_id) + "/promotion", input, options
        )


class Secrets:
    def __init__(self, api: _FunctionTransport) -> None:
        self._api = api

    async def list(
        self, function_id: str, params: ListFunctions | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[FunctionPage[Secret]]:
        return await self._api.call(
            "GET", "/" + _identifier(function_id) + "/secrets", params, options
        )

    async def create(
        self, function_id: str, input: CreateSecret, *, options: RequestOptions = O
    ) -> ApiResponse[Secret]:
        return await self._api.call(
            "POST", "/" + _identifier(function_id) + "/secrets", input, options
        )

    async def revoke(
        self, function_id: str, version_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[MutationResult]:
        return await self._api.call(
            "DELETE",
            "/" + _identifier(function_id) + "/secrets/" + _identifier(version_id),
            None,
            options,
        )


class Invocations:
    def __init__(self, api: _FunctionTransport) -> None:
        self._api = api

    async def list(
        self, function_id: str, params: ListFunctions | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[FunctionPage[Invocation]]:
        return await self._api.call(
            "GET", "/" + _identifier(function_id) + "/invocations", params, options
        )

    async def retrieve(
        self, function_id: str, invocation_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Invocation]:
        return await self._api.call(
            "GET",
            "/" + _identifier(function_id) + "/invocations/" + _identifier(invocation_id),
            None,
            options,
        )

    async def create(
        self, function_id: str, input: CreateInvocation, *, options: RequestOptions
    ) -> ApiResponse[InvocationResult]:
        key = options.idempotency_key
        if not isinstance(key, str) or re.fullmatch(r"[\x21-\x7e]{1,128}", key) is None:
            raise ValidationError(
                "A valid invocation idempotency key is required.", code="invalid_function_input"
            )
        if "deploymentId" in input:
            _identifier(input["deploymentId"])
        return await self._api.call(
            "POST", "/" + _identifier(function_id) + "/invocations", input, options
        )
