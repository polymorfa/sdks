"""Organization and immutable project-bound Platform resource surfaces."""

from __future__ import annotations

import asyncio
import builtins
import time
from collections.abc import Callable, Mapping
from dataclasses import replace
from typing import TypeVar, cast
from urllib.parse import unquote

from . import developer_models as D
from .bansafe import (
    ProjectHealthPolicy,
    ProjectInsuranceEvidence,
    ProjectSafeMode,
    ProjectWarmupPlan,
    SessionSafeMode,
    UpdateProjectHealthPolicy,
    UpdateProjectInsuranceEvidence,
    UpdateProjectSafeMode,
    UpdateProjectWarmupPlan,
    UpdateSessionSafeMode,
)
from .errors import ConfigurationError, ServerError, TimeoutError, ValidationError
from .events import EventStream, StreamGap
from .indexed_events import IndexedEventPage, validate_after_offset
from .messaging import O, Resource, segment
from .models import (
    DataEnvelope,
    Envelope,
    PlatformSession,
    Session,
    SessionRemoved,
    SessionStarting,
    SessionStopping,
    SessionUpdate,
)
from .platform_core import (
    BatchRemoved,
    BatchStopped,
    CreatedProject,
    CreateProject,
    HybridMergeCandidate,
    NumberTierChange,
    ProductionEnrollment,
    ProductionEnrollmentCommand,
    ProductionEnrollmentResult,
    ProjectWithStats,
    SessionBatch,
    SessionCapabilities,
    TierConfirmation,
    TierQuoteRequest,
)
from .transport import ApiResponse, CursorPage, JsonObject, QueryValue, RequestOptions, Transport

T = TypeVar("T")


class Raw:
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        self._transport, self._project_id = transport, project_id

    async def request(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, QueryValue] | None = None,
        body: object = None,
        options: RequestOptions = O,
    ) -> ApiResponse[JsonObject | None]:
        if self._project_id is not None:
            decoded = unquote(path)
            if (
                not path.startswith("/")
                or path.startswith("//")
                or "\\" in decoded
                or ".." in decoded.split("/")
                or decoded.startswith("/platform/projects/")
            ):
                raise ValidationError("Raw path must be relative to the bound project.")
            path = f"/platform/projects/{segment(self._project_id)}" + path
        return await self._transport.request(method, path, query=query, body=body, options=options)


class PlatformResource(Resource):
    def __init__(self, transport: Transport, prefix: str) -> None:
        super().__init__(transport, "organization_api_key")
        self._prefix = prefix

    async def _unwrapped(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, QueryValue] | None = None,
        body: object = None,
        options: RequestOptions = O,
    ) -> ApiResponse[T]:
        response = await self._transport.request(
            method, path, query=query, body=body, options=options
        )
        if response.data is None or "data" not in response.data:
            raise ServerError(
                "Invalid response envelope.", code="invalid_response", metadata=response.metadata
            )
        return ApiResponse(cast(T, response.data["data"]), response.metadata)

    async def _page(
        self, path: str, query: Mapping[str, QueryValue], options: RequestOptions
    ) -> CursorPage[T]:
        response = await self._transport.request("GET", path, query=query, options=options)
        return CursorPage(self._transport, path, query, options, response)


class Projects(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[ProjectWithStats]]]:
        return await self._request("GET", "/platform/projects", options=options)

    async def create(
        self, body: CreateProject, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[CreatedProject]]:
        return await self._request("POST", "/platform/projects", body=body, options=options)

    async def get_safe_mode(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectSafeMode]]:
        return await self._request(
            "GET", f"/platform/projects/{segment(project_id)}/safe-mode", options=options
        )

    async def update_safe_mode(
        self, project_id: str, body: UpdateProjectSafeMode, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectSafeMode]]:
        return await self._request(
            "PUT", f"/platform/projects/{segment(project_id)}/safe-mode", body=body, options=options
        )

    async def get_warmup_plan(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectWarmupPlan]]:
        return await self._request(
            "GET", f"/platform/projects/{segment(project_id)}/warmup-plan", options=options
        )

    async def update_warmup_plan(
        self, project_id: str, body: UpdateProjectWarmupPlan, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectWarmupPlan]]:
        return await self._request(
            "PUT",
            f"/platform/projects/{segment(project_id)}/warmup-plan",
            body=body,
            options=options,
        )

    async def get_insurance_evidence(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectInsuranceEvidence]]:
        return await self._request(
            "GET", f"/platform/projects/{segment(project_id)}/insurance-evidence", options=options
        )

    async def update_insurance_evidence(
        self, project_id: str, body: UpdateProjectInsuranceEvidence, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectInsuranceEvidence]]:
        return await self._request(
            "PUT",
            f"/platform/projects/{segment(project_id)}/insurance-evidence",
            body=body,
            options=options,
        )

    async def get_health_policy(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectHealthPolicy]]:
        return await self._request(
            "GET", f"/platform/projects/{segment(project_id)}/health-policy", options=options
        )

    async def update_health_policy(
        self, project_id: str, body: UpdateProjectHealthPolicy, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProjectHealthPolicy]]:
        return await self._request(
            "PUT",
            f"/platform/projects/{segment(project_id)}/health-policy",
            body=body,
            options=options,
        )

    async def list_hybrid_merge_candidates(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[HybridMergeCandidate]]]:
        return await self._request(
            "GET",
            f"/platform/projects/{segment(project_id)}/hybrid-merge-candidates",
            options=options,
        )

    async def request_production_enrollment(
        self, project_id: str, body: ProductionEnrollment, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProductionEnrollmentResult]]:
        return await self._request(
            "POST", f"/platform/projects/{segment(project_id)}/promote", body=body, options=options
        )

    async def approve_production_enrollment(
        self, project_id: str, operation_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProductionEnrollmentCommand]]:
        return await self._request(
            "POST",
            f"/platform/projects/{segment(project_id)}/production-enrollments/{segment(operation_id)}/approve",
            options=options,
        )

    async def cancel_production_enrollment(
        self, project_id: str, operation_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ProductionEnrollmentCommand]]:
        return await self._request(
            "POST",
            f"/platform/projects/{segment(project_id)}/production-enrollments/{segment(operation_id)}/cancel",
            options=options,
        )


class PlatformSessions(Resource):
    async def list(
        self, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[PlatformSession]]]:
        return await self._request(
            "GET", "/platform/sessions", query={"projectId": project_id}, options=options
        )

    async def retrieve(
        self, session_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Session]]:
        return await self._request(
            "GET", f"/platform/sessions/{segment(session_id)}", options=options
        )

    async def update(
        self, session_id: str, body: SessionUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Session]]:
        return await self._request(
            "PUT", f"/platform/sessions/{segment(session_id)}", body=body, options=options
        )

    async def start(
        self, session_id: str, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionStarting]]:
        return await self._request(
            "POST",
            f"/platform/sessions/{segment(session_id)}/start",
            body={} if project_id is None else {"projectId": project_id},
            options=options,
        )

    async def stop(
        self, session_id: str, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionStopping]]:
        return await self._request(
            "POST",
            f"/platform/sessions/{segment(session_id)}/stop",
            body={} if project_id is None else {"projectId": project_id},
            options=options,
        )

    async def stop_many(
        self, body: SessionBatch, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[BatchStopped]]:
        return await self._request("POST", "/platform/sessions/stop", body=body, options=options)

    async def delete(
        self, session_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionRemoved]]:
        return await self._request(
            "DELETE", f"/platform/sessions/{segment(session_id)}", options=options
        )

    async def delete_many(
        self, body: SessionBatch, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[BatchRemoved]]:
        return await self._request("POST", "/platform/sessions/delete", body=body, options=options)

    async def quote_tier_change(
        self, session_id: str, body: TierQuoteRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[NumberTierChange]]:
        if "hybridResolution" in body and "hybridMerge" in body:
            raise ValidationError("Provide hybridResolution or hybridMerge, not both.")
        return await self._request(
            "POST",
            f"/platform/sessions/{segment(session_id)}/tier-quotes",
            body=body,
            options=options,
        )

    async def retrieve_tier_change(
        self, session_id: str, quote_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[NumberTierChange]]:
        return await self._request(
            "GET",
            f"/platform/sessions/{segment(session_id)}/tier-quotes/{segment(quote_id)}",
            options=options,
        )

    async def set_tier_override(
        self, session_id: str, body: TierConfirmation, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[NumberTierChange]]:
        if not isinstance(body.get("quoteId"), str) or not body["quoteId"].strip():
            raise ValidationError("Review a quote before confirming its quoteId.")
        return await self._request(
            "PATCH", f"/platform/sessions/{segment(session_id)}", body=body, options=options
        )

    async def get_capabilities(
        self, session_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionCapabilities]]:
        return await self._request(
            "GET", f"/platform/sessions/{segment(session_id)}/capabilities", options=options
        )

    async def get_safe_mode(
        self, session_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionSafeMode]]:
        return await self._request(
            "GET", f"/platform/sessions/{segment(session_id)}/safe-mode", options=options
        )

    async def update_safe_mode(
        self, session_id: str, body: UpdateSessionSafeMode, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionSafeMode]]:
        return await self._request(
            "PUT", f"/platform/sessions/{segment(session_id)}/safe-mode", body=body, options=options
        )


class Events(PlatformResource):
    async def list(
        self, params: D.ListEvents | None = None, *, options: RequestOptions = O
    ) -> CursorPage[D.Event] | IndexedEventPage[D.Event]:
        if params is not None and "afterOffset" in params:
            if any(key in params for key in ("cursor", "since", "until")):
                raise ValidationError("afterOffset cannot be combined with cursor, since or until.")
            return await self._offset_page(params, options)
        return await self._page(
            self._prefix + "/events", cast(Mapping[str, QueryValue], params or {}), options
        )

    async def _offset_page(
        self, params: D.ListEvents, options: RequestOptions
    ) -> IndexedEventPage[D.Event]:
        after = params["afterOffset"]
        validate_after_offset(after)
        response = await self._transport.request(
            "GET",
            self._prefix + "/events",
            query=cast(Mapping[str, QueryValue], params),
            options=options,
        )

        async def next_page(offset: str) -> IndexedEventPage[D.Event]:
            return await self._offset_page({**params, "afterOffset": offset}, options)

        return IndexedEventPage(response, after, next_page)

    async def list_indexed(
        self, params: D.IndexedEvents, *, options: RequestOptions = O
    ) -> IndexedEventPage[D.Event]:
        return await self._offset_page(
            {
                "afterOffset": params["afterOffset"],
                **({"type": params["type"]} if "type" in params else {}),
                **({"limit": params["limit"]} if "limit" in params else {}),
            },
            options,
        )

    async def retrieve(
        self,
        event_id: str,
        *,
        params: D.RetrieveEvent | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[D.Event]:
        return await self._unwrapped(
            "GET",
            self._prefix + "/events/" + segment(event_id),
            query=cast(Mapping[str, QueryValue], params or {}),
            options=options,
        )

    async def replay(
        self, event_id: str, body: D.ReplayEvent, *, options: RequestOptions = O
    ) -> ApiResponse[D.ReplayReceipt]:
        return await self._unwrapped(
            "POST",
            self._prefix + "/events/" + segment(event_id) + "/replays",
            body=body,
            options=options,
        )

    def stream(
        self,
        *,
        project_id: str | None = None,
        since: str | None = None,
        types: builtins.list[str] | None = None,
        manual_ack: bool = False,
        options: RequestOptions = O,
        on_gap: Callable[[StreamGap], None] | None = None,
        on_reconnect: Callable[[BaseException, float], None] | None = None,
        reconnect_initial: float = 1,
        reconnect_max: float = 30,
    ) -> EventStream:

        if self._prefix == "/platform":
            if not project_id:
                raise ConfigurationError("project_id")
            prefix = f"/platform/projects/{segment(project_id)}"
        else:
            if (
                project_id is not None
                and self._prefix != f"/platform/projects/{segment(project_id)}"
            ):
                raise ConfigurationError("project_id")
            prefix = self._prefix
        return EventStream(
            self._transport,
            prefix + "/events/stream",
            since=since,
            types=types,
            manual_ack=manual_ack,
            options=options,
            on_gap=on_gap,
            on_reconnect=on_reconnect,
            reconnect_initial=reconnect_initial,
            reconnect_max=reconnect_max,
        )

    async def acknowledge_stream(
        self,
        stream_id: str,
        cursor: str,
        sequence: int,
        *,
        project_id: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[D.StreamAcknowledged]:
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 0:
            raise ValidationError("sequence must be non-negative.")
        stream = self.stream(project_id=project_id)
        return await self._unwrapped(
            "POST",
            stream.path + "/" + segment(stream_id) + "/ack",
            body={"cursor": cursor, "sequence": sequence},
            options=options,
        )


class PlatformWebhooks(PlatformResource):
    async def list(
        self, params: D.ListWebhooks | None = None, *, options: RequestOptions = O
    ) -> CursorPage[D.Webhook]:
        return await self._page(
            self._prefix + "/webhooks", cast(Mapping[str, QueryValue], params or {}), options
        )

    async def create(
        self, body: D.CreateWebhook, *, options: RequestOptions = O
    ) -> ApiResponse[D.WebhookCreated]:
        return await self._unwrapped("POST", self._prefix + "/webhooks", body=body, options=options)

    async def retrieve(
        self, webhook_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[D.Webhook]:
        return await self._unwrapped(
            "GET", self._prefix + "/webhooks/" + segment(webhook_id), options=options
        )

    async def update(
        self, webhook_id: str, body: D.UpdateWebhook, *, options: RequestOptions = O
    ) -> ApiResponse[D.WebhookUpdated]:
        return await self._unwrapped(
            "PATCH", self._prefix + "/webhooks/" + segment(webhook_id), body=body, options=options
        )

    async def delete(
        self, webhook_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[D.WebhookDeleted]:
        return await self._unwrapped(
            "DELETE", self._prefix + "/webhooks/" + segment(webhook_id), options=options
        )

    async def test(
        self,
        webhook_id: str,
        body: D.TestWebhook | D.TestWebhookPayload | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[D.ReplayReceipt]:
        if self._prefix == "/platform" and body and ("body" in body or "sessionId" in body):
            raise ValidationError("Organization tests do not accept body or sessionId.")
        return await self._unwrapped(
            "POST",
            self._prefix + "/webhooks/" + segment(webhook_id) + "/tests",
            body=body or {},
            options=options,
        )

    async def rotate_secret(
        self, webhook_id: str, body: D.RotateSecret | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[D.SecretRotated]:
        return await self._unwrapped(
            "POST",
            self._prefix + "/webhooks/" + segment(webhook_id) + "/secret-rotations",
            body=body or {},
            options=options,
        )


class WebhookDeliveries(PlatformResource):
    async def list(
        self, params: D.ListDeliveries | None = None, *, options: RequestOptions = O
    ) -> CursorPage[D.Delivery]:
        return await self._page(
            self._prefix + "/webhook-deliveries",
            cast(Mapping[str, QueryValue], params or {}),
            options,
        )

    async def retrieve(
        self, delivery_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[D.Delivery]:
        return await self._unwrapped(
            "GET", self._prefix + "/webhook-deliveries/" + segment(delivery_id), options=options
        )

    async def list_attempts(
        self,
        delivery_id: str,
        params: D.ListAttempts | None = None,
        *,
        options: RequestOptions = O,
    ) -> CursorPage[D.Attempt]:
        return await self._page(
            self._prefix + "/webhook-deliveries/" + segment(delivery_id) + "/attempts",
            cast(Mapping[str, QueryValue], params or {}),
            options,
        )

    async def retrieve_attempt(
        self, delivery_id: str, attempt_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[D.Attempt]:
        return await self._unwrapped(
            "GET",
            self._prefix
            + "/webhook-deliveries/"
            + segment(delivery_id)
            + "/attempts/"
            + segment(attempt_id),
            options=options,
        )

    async def retry(
        self, delivery_id: str, body: D.EmptyInput | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[D.RetriedDelivery]:
        return await self._unwrapped(
            "POST",
            self._prefix + "/webhook-deliveries/" + segment(delivery_id) + "/retry",
            body=body or {},
            options=options,
        )


class Operations(PlatformResource):
    async def list(
        self, params: D.ListOperations | None = None, *, options: RequestOptions = O
    ) -> CursorPage[D.Operation]:
        return await self._page(
            self._prefix + "/operations", cast(Mapping[str, QueryValue], params or {}), options
        )

    async def get(
        self,
        operation_id: str,
        *,
        wait: int | None = None,
        params: D.RetrieveOperation | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[D.Operation]:
        if wait is not None and (
            isinstance(wait, bool) or not isinstance(wait, int) or not 0 <= wait <= 30
        ):
            raise ConfigurationError("wait")
        if wait and options.timeout is None:
            options = replace(options, timeout=wait + 15)
        return await self._unwrapped(
            "GET",
            self._prefix + "/operations/" + segment(operation_id),
            query={**cast(Mapping[str, QueryValue], params or {}), "wait": wait},
            options=options,
        )

    async def list_transitions(
        self,
        operation_id: str,
        params: D.TransitionsAfter | D.TransitionsCursor | None = None,
        *,
        options: RequestOptions = O,
    ) -> CursorPage[D.OperationTransition]:
        return await self._page(
            self._prefix + "/operations/" + segment(operation_id) + "/transitions",
            cast(Mapping[str, QueryValue], params or {}),
            options,
        )

    async def cancel(
        self, operation_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[D.CancelledOperation]:
        return await self._unwrapped(
            "POST",
            self._prefix + "/operations/" + segment(operation_id) + "/cancel",
            options=options.with_idempotency_key(),
        )

    async def wait(
        self,
        operation_id: str,
        *,
        max_wait: float = 300,
        after_sequence: int | None = None,
        project_id: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[D.Operation]:
        if isinstance(max_wait, bool) or not 0 <= max_wait < float("inf"):
            raise ConfigurationError("max_wait")
        if (
            project_id is not None
            and self._prefix != "/platform"
            and self._prefix != f"/platform/projects/{segment(project_id)}"
        ):
            raise ConfigurationError("project_id")
        params: D.RetrieveOperation = {}
        if after_sequence is not None:
            params["afterSequence"] = after_sequence
        if project_id is not None and self._prefix == "/platform":
            params["projectId"] = project_id
        deadline = time.monotonic() + max_wait
        latest: ApiResponse[D.Operation] | None = None
        while True:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                latest = await asyncio.wait_for(
                    self.get(
                        operation_id, wait=min(30, int(remaining)), params=params, options=options
                    ),
                    max(1, remaining),
                )
            except asyncio.TimeoutError:
                if latest is not None:
                    return latest
                raise TimeoutError(
                    "Operation wait budget elapsed.", code="request_timeout"
                ) from None
            if (
                latest.data.get("status") in ("succeeded", "failed", "cancelled")
                or (after_sequence is not None and latest.data["sequence"] > after_sequence)
                or int(remaining) == 0
                or time.monotonic() >= deadline
            ):
                return latest
