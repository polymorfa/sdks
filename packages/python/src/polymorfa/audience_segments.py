"""Organization-owned saved audience segments and count previews.

Pinned to contracts/campaign-segments-drip.json. Team keys only:
campaigns:read for reads, campaigns:manage for writes and unsaved previews.
Revision conflicts and bounded evaluation timeouts return 409 state_conflict;
re-read, reconcile or simplify the rules before trying again. Writes and
previews are sent once.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Literal, cast

from typing_extensions import NotRequired, TypedDict

from . import campaign_contract_validation as V
from .errors import ConfigurationError
from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, CursorPage, QueryValue, RequestOptions

Match = Literal["all", "any"]
CampaignOutcome = Literal[
    "delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed"
]


class TagContains(TypedDict):
    field: Literal["tag"]
    operator: Literal["contains"]
    value: str


class TagIn(TypedDict):
    field: Literal["tag"]
    operator: Literal["in"]
    values: list[str]


class TagExists(TypedDict):
    field: Literal["tag"]
    operator: Literal["exists"]


class AttributeEquals(TypedDict):
    field: Literal["attribute"]
    name: str
    operator: Literal["equals"]
    value: str | float | bool


class AttributeText(TypedDict):
    field: Literal["attribute"]
    name: str
    operator: Literal["contains", "before", "after"]
    value: str


class AttributeIn(TypedDict):
    field: Literal["attribute"]
    name: str
    operator: Literal["in"]
    values: list[str | float]


class AttributeCompare(TypedDict):
    field: Literal["attribute"]
    name: str
    operator: Literal["greater_than", "less_than"]
    value: float


class AttributeExists(TypedDict):
    field: Literal["attribute"]
    name: str
    operator: Literal["exists"]


class ConsentEquals(TypedDict):
    field: Literal["consent"]
    operator: Literal["equals"]
    value: bool


class CampaignCondition(TypedDict):
    field: Literal["campaign"]
    campaignId: str
    outcome: CampaignOutcome


# Missing, null or wrong-type attributes do not match.
AudienceSegmentCondition = (
    TagContains
    | TagIn
    | TagExists
    | AttributeEquals
    | AttributeText
    | AttributeIn
    | AttributeCompare
    | AttributeExists
    | ConsentEquals
    | CampaignCondition
)


class AudienceSegmentGroup(TypedDict):
    match: Match
    negate: NotRequired[bool]
    conditions: list[AudienceSegmentCondition]


class AudienceSegmentRules(TypedDict):
    """At most 10 groups, 20 conditions per group, 40 conditions, 5 campaign
    conditions, 50 values per ``in`` and 16 KiB; the API enforces the limits."""

    match: Match
    groups: list[AudienceSegmentGroup]


class AudienceSegment(TypedDict):
    id: str
    name: str
    revision: int
    rules: AudienceSegmentRules
    createdAt: int
    updatedAt: int


class AudienceSegmentSample(TypedDict):
    phone: str
    tags: list[str]


class AudienceSegmentPreview(TypedDict):
    matchedCount: int
    optedOutCount: int
    consentWithheldCount: int
    eligibleCount: int
    sample: list[AudienceSegmentSample]
    evaluatedAt: int


class SavedAudienceSegmentPreview(AudienceSegmentPreview):
    revision: int


class CreateAudienceSegment(TypedDict):
    name: str
    rules: AudienceSegmentRules


class UpdateAudienceSegment(TypedDict):
    expectedRevision: int
    name: NotRequired[str]
    rules: NotRequired[AudienceSegmentRules]


class ListAudienceSegments(TypedDict, total=False):
    cursor: str
    limit: int


class AudienceSegmentDeletion(TypedDict):
    deleted: Literal[True]
    id: str


def _scalar(value: object, *, booleans: bool) -> bool:
    if isinstance(value, bool):
        return booleans
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return isinstance(value, str)


def _number(value: object) -> bool:
    return (
        not isinstance(value, bool)
        and _scalar(value, booleans=False)
        and not isinstance(value, str)
    )


def validate_rules(value: object) -> None:
    """Reject condition shapes and value types the contract does not define.

    Counts, sizes, patterns and evaluation remain API authority."""
    rules = V.fields(value, ["match", "groups"], ["match", "groups"], "rules")
    V.choice(rules["match"], ("all", "any"), "rules.match")
    if not isinstance(rules["groups"], list):
        V.invalid("rules.groups")
    for entry in rules["groups"]:
        group = V.fields(entry, ["match", "negate", "conditions"], ["match", "conditions"], "group")
        V.choice(group["match"], ("all", "any"), "group.match")
        if "negate" in group and not isinstance(group["negate"], bool):
            V.invalid("group.negate")
        if not isinstance(group["conditions"], list):
            V.invalid("group.conditions")
        for raw in group["conditions"]:
            _condition(raw)


def _condition(raw: object) -> None:
    c = V.obj(raw, "condition")
    field, operator = c.get("field"), c.get("operator")
    keys = set(c)
    ok = False
    if field == "tag" and operator == "contains":
        ok = keys == {"field", "operator", "value"} and isinstance(c["value"], str)
    elif field == "tag" and operator == "in":
        values = c.get("values")
        ok = keys == {"field", "operator", "values"} and isinstance(values, list)
        ok = ok and all(isinstance(v, str) for v in cast(list[object], values))
    elif field == "tag" and operator == "exists":
        ok = keys == {"field", "operator"}
    elif field == "attribute":
        named = isinstance(c.get("name"), str)
        if operator == "equals":
            ok = keys == {"field", "name", "operator", "value"}
            ok = ok and _scalar(c["value"], booleans=True)
        elif operator in ("contains", "before", "after"):
            ok = keys == {"field", "name", "operator", "value"} and isinstance(c["value"], str)
        elif operator == "in":
            values = c.get("values")
            ok = keys == {"field", "name", "operator", "values"} and isinstance(values, list)
            ok = ok and all(_scalar(v, booleans=False) for v in cast(list[object], values))
        elif operator in ("greater_than", "less_than"):
            ok = keys == {"field", "name", "operator", "value"} and _number(c["value"])
        elif operator == "exists":
            ok = keys == {"field", "name", "operator"}
        ok = ok and named
    elif field == "consent" and operator == "equals":
        ok = keys == {"field", "operator", "value"} and isinstance(c["value"], bool)
    elif field == "campaign":
        ok = keys == {"field", "campaignId", "outcome"} and isinstance(c["campaignId"], str)
        ok = ok and isinstance(c["outcome"], str)
    if not ok:
        V.invalid("condition")


def _path(segment_id: str) -> str:
    if not isinstance(segment_id, str) or not segment_id.strip():
        raise ConfigurationError("segmentId")
    return "/platform/audience-segments/" + segment(segment_id)


def _once(options: RequestOptions) -> RequestOptions:
    return replace(options, max_network_retries=0)


class AudienceSegments(Resource):
    async def list(
        self, params: ListAudienceSegments | None = None, *, options: RequestOptions = O
    ) -> CursorPage[AudienceSegment]:
        path = "/platform/audience-segments"
        query = cast(dict[str, QueryValue], dict(params or {}))
        response = await self._transport.request("GET", path, query=query, options=options)
        return CursorPage(self._transport, path, query, options, response)

    async def retrieve(
        self, segment_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[AudienceSegment]]:
        return await self._request("GET", _path(segment_id), options=options)

    async def create(
        self, body: CreateAudienceSegment, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[AudienceSegment]]:
        validate_rules(V.obj(body).get("rules"))
        return await self._request(
            "POST", "/platform/audience-segments", body=V.capture(body), options=_once(options)
        )

    async def update(
        self, segment_id: str, body: UpdateAudienceSegment, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[AudienceSegment]]:
        path = _path(segment_id)
        if "rules" in V.obj(body):
            validate_rules(body["rules"])
        return await self._request("PATCH", path, body=V.capture(body), options=_once(options))

    async def delete(
        self, segment_id: str, expected_revision: int, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[AudienceSegmentDeletion]]:
        """Refused while an unlaunched draft uses the segment. Launched campaigns
        keep their snapshot and recipients; their segmentId becomes null."""
        return await self._request(
            "DELETE",
            _path(segment_id),
            query={"expectedRevision": expected_revision},
            options=_once(options),
        )

    async def preview(
        self, segment_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SavedAudienceSegmentPreview]]:
        """Evaluates the saved segment once; an evaluation timeout is a 409."""
        return await self._request("GET", _path(segment_id) + "/preview", options=_once(options))

    async def preview_rules(
        self, rules: AudienceSegmentRules, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[AudienceSegmentPreview]]:
        validate_rules(rules)
        return await self._request(
            "POST",
            "/platform/audience-segments/preview",
            body=V.capture({"rules": rules}),
            options=_once(options),
        )
