"""Typed team billing reads and revision-guarded resource controls."""

from __future__ import annotations

import builtins
import math
import re
from typing import Literal

from typing_extensions import TypedDict

from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, RequestOptions

Scope = Literal["project", "customer", "number"]


class Balance(TypedDict):
    balanceCents: float
    preferredCurrency: Literal["USD", "BRL", "INR"]


class Usage(TypedDict):
    activeNumbers: int
    totalChargedCents: float


class Transaction(TypedDict):
    id: str
    amountCents: float
    balanceAfterCents: float
    type: str
    description: str
    sessionId: str | None
    projectId: str | None
    tier: str | None
    currency: str | None
    paymentStatus: Literal["paid", "refunded"]
    createdAt: int


class Pricing(TypedDict):
    id: str
    tier: str
    dailyRateCents: float
    label: str
    description: str
    features: list[str]


class Priority(TypedDict):
    id: str
    name: str
    priority: int


class ProjectPriority(Priority):
    projectId: str


class Priorities(TypedDict):
    revision: int
    projects: list[Priority]
    customers: list[ProjectPriority]
    numbers: list[ProjectPriority]


class Budget(TypedDict):
    scope: Scope
    resourceId: str
    projectId: str
    name: str
    limitCredits: float | None
    spentCredits: float
    reservedCredits: float
    revision: int


class DailyCredits(TypedDict):
    date: str
    credits: float


class Limits(TypedDict):
    checkedAt: str
    periodStart: str
    periodEnd: str
    todayCredits: float
    monthCredits: float
    daily: list[DailyCredits]
    budgets: list[Budget]


class ResourceControls(TypedDict):
    budget: Budget
    priority: int
    priorityRevision: int


class SetControls(TypedDict):
    limitCredits: float | None
    priority: int
    expectedBudgetRevision: int
    expectedPriorityRevision: int


class SetLimit(TypedDict):
    limitCredits: float | None
    expectedRevision: int


class SetPriority(TypedDict):
    priority: int
    expectedRevision: int


class Saved(TypedDict):
    saved: bool


class ResourceOrder(TypedDict):
    scope: Literal["customer", "number"]
    resourceId: str


class ReorderResources(TypedDict):
    scope: Literal["resource"]
    projectId: str
    resources: list[ResourceOrder]
    expectedRevision: int


class ReorderProjects(TypedDict):
    scope: Literal["project"]
    resourceIds: list[str]
    expectedRevision: int


class ReorderChildren(TypedDict):
    scope: Literal["customer", "number"]
    projectId: str
    resourceIds: list[str]
    expectedRevision: int


class BillingReadParams(TypedDict, total=False):
    projectId: str
    scope: Literal["project"]


def _invalid(message: str) -> None:
    raise ValidationError(message, code="invalid_billing_control")


def _id(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value
    ):
        _invalid("resource must be a UUID")
    return value.lower()


def _revision(value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 2147483646:
        _invalid("expectedRevision must be a nonnegative integer")


def _scope(value: Scope) -> None:
    if value not in ("project", "customer", "number"):
        _invalid("scope must be project, customer or number")


def _priority(value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1000000:
        _invalid("priority must be an integer from 0 to 1000000")


def _limit(value: float | None) -> None:
    if value is None:
        return
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not 0 <= value <= 1000000
    ):
        _invalid("limitCredits must be null or 0–1000000 credits with at most six decimal places")
    # Decimal scale is a wire-number property; normalize Python's optional .0.
    text = "0" if value == 0 else str(value)
    if "e" in text.lower():
        text = format(value, ".15f").rstrip("0").rstrip(".")
    if not re.fullmatch(r"\d+(?:\.\d{1,6})?", text):
        _invalid("limitCredits must be null or 0–1000000 credits with at most six decimal places")


class Billing(Resource):
    async def retrieve(self, *, options: RequestOptions = O) -> ApiResponse[DataEnvelope[Balance]]:
        return await self._request("GET", "/platform/billing", options=options)

    async def usage(self, *, options: RequestOptions = O) -> ApiResponse[DataEnvelope[Usage]]:
        return await self._request("GET", "/platform/billing/usage", options=options)

    async def list_transactions(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[Transaction]]]:
        return await self._request("GET", "/platform/billing/transactions", options=options)

    async def list_pricing(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[Pricing]]]:
        return await self._request("GET", "/platform/billing/pricing", options=options)

    async def get_resource_controls(
        self, scope: Scope, resource_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ResourceControls]]:
        _scope(scope)
        return await self._request(
            "GET",
            f"/platform/billing/controls/{scope}/{segment(_id(resource_id))}",
            options=options,
        )

    async def set_resource_controls(
        self, scope: Scope, resource_id: str, body: SetControls, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[ResourceControls]]:
        _scope(scope)
        _limit(body["limitCredits"])
        _priority(body["priority"])
        _revision(body["expectedBudgetRevision"])
        _revision(body["expectedPriorityRevision"])
        return await self._request(
            "PUT",
            f"/platform/billing/controls/{scope}/{segment(_id(resource_id))}",
            body={
                "limitCredits": body["limitCredits"],
                "priority": body["priority"],
                "expectedBudgetRevision": body["expectedBudgetRevision"],
                "expectedPriorityRevision": body["expectedPriorityRevision"],
            },
            options=options,
        )

    async def get_limits(
        self, params: BillingReadParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Limits]]:
        params = params or {}
        if params.get("scope", "project") != "project":
            raise ValidationError("Read scope must be project.")
        return await self._request(
            "GET",
            "/platform/billing/limits",
            query={
                "projectId": _id(params["projectId"]) if "projectId" in params else None,
                "scope": params.get("scope"),
            },
            options=options,
        )

    async def set_limit(
        self, scope: Scope, resource_id: str, body: SetLimit, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Saved]]:
        _scope(scope)
        _revision(body["expectedRevision"])
        _limit(body["limitCredits"])
        return await self._request(
            "PUT",
            f"/platform/billing/limits/{scope}/{segment(_id(resource_id))}",
            body={
                "limitCredits": body["limitCredits"],
                "expectedRevision": body["expectedRevision"],
            },
            options=options,
        )

    async def get_priorities(
        self, params: BillingReadParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Priorities]]:
        params = params or {}
        if params.get("scope", "project") != "project":
            raise ValidationError("Read scope must be project.")
        return await self._request(
            "GET",
            "/platform/billing/priorities",
            query={
                "projectId": _id(params["projectId"]) if "projectId" in params else None,
                "scope": params.get("scope"),
            },
            options=options,
        )

    async def set_priority(
        self, scope: Scope, resource_id: str, body: SetPriority, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Priorities]]:
        _scope(scope)
        _revision(body["expectedRevision"])
        _priority(body["priority"])
        return await self._request(
            "PUT",
            f"/platform/billing/priorities/{scope}/{segment(_id(resource_id))}",
            body={"priority": body["priority"], "expectedRevision": body["expectedRevision"]},
            options=options,
        )

    async def reorder_priorities(
        self,
        body: ReorderResources | ReorderProjects | ReorderChildren,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[Priorities]]:
        _revision(body["expectedRevision"])
        if body["scope"] == "resource":
            resources = body["resources"]
            if len(resources) > 1000000 or any(
                row["scope"] not in ("customer", "number") for row in resources
            ):
                raise ValidationError("resources must be a unique complete list.")
            normalized = [
                {"scope": row["scope"], "resourceId": _id(row["resourceId"])} for row in resources
            ]
            if len({(row["scope"], row["resourceId"]) for row in normalized}) != len(normalized):
                raise ValidationError("resources must be a unique complete list.")
            wire = {
                "scope": "resource",
                "projectId": _id(body["projectId"]),
                "resources": normalized,
                "expectedRevision": body["expectedRevision"],
            }
        else:
            _scope(body["scope"])
            ids = [_id(value) for value in body["resourceIds"]]
            if len(set(ids)) != len(ids):
                _invalid("resourceIds must not contain duplicates")
            wire = {
                "scope": body["scope"],
                "resourceIds": ids,
                "expectedRevision": body["expectedRevision"],
            }
            if body["scope"] != "project":
                wire["projectId"] = _id(body["projectId"])
        return await self._request(
            "PUT", "/platform/billing/priorities", body=wire, options=options
        )
