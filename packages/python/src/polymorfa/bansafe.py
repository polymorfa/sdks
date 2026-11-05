"""Typed project and Number BanSafe settings; the API enforces entitlements."""

from __future__ import annotations

from typing import Literal

from typing_extensions import TypedDict

from .messaging import O, Resource, segment
from .models import Envelope
from .transport import ApiResponse, RequestOptions

PresenceMode = Literal["dark", "online_while_sending", "online_hours"]
TypingMode = Literal["off", "before_text", "before_all"]
ReadsMode = Literal["off", "replied_chats", "all_inbound"]
PacingMode = Literal["off", "jittered", "conversation"]


class SafeModeSettings(TypedDict):
    presence: PresenceMode
    typing: TypingMode
    reads: ReadsMode
    pacing: PacingMode
    onlineStart: int
    onlineEnd: int


class UpdateProjectSafeMode(TypedDict, total=False):
    presence: PresenceMode
    typing: TypingMode
    reads: ReadsMode
    pacing: PacingMode
    onlineStart: int
    onlineEnd: int


class ProjectSafeMode(TypedDict):
    projectId: str
    ceiling: SafeModeSettings
    entitled: bool
    entitlementReason: str | None


class SafeModeOverride(TypedDict):
    presence: PresenceMode | Literal["inherit"]
    typing: TypingMode | Literal["inherit"]
    reads: ReadsMode | Literal["inherit"]
    pacing: PacingMode | Literal["inherit"]


class SafeModeApplied(TypedDict):
    observedAt: str
    presence: str | None
    typing: str | None
    reads: str | None
    pacing: str | None


class SessionSafeMode(TypedDict):
    session: str
    projectId: str
    project: SafeModeSettings
    override: SafeModeOverride
    effective: SafeModeSettings
    applied: SafeModeApplied | None
    mismatch: bool
    entitled: bool
    entitlementReason: str | None


class UpdateSessionSafeMode(TypedDict, total=False):
    presence: PresenceMode | Literal["inherit"]
    typing: TypingMode | Literal["inherit"]
    reads: ReadsMode | Literal["inherit"]
    pacing: PacingMode | Literal["inherit"]


class WarmupPlanSettings(TypedDict):
    enabled: bool
    warmupDays: int
    dailyStart: int


class WarmupCurvePoint(TypedDict):
    day: int
    allowance: int


class ProjectWarmupPlan(TypedDict):
    projectId: str
    plan: WarmupPlanSettings
    ceiling: int
    curve: list[WarmupCurvePoint]
    entitled: bool
    entitlementReason: str | None


class UpdateProjectWarmupPlan(TypedDict, total=False):
    enabled: bool
    warmupDays: int
    dailyStart: int


class ProjectInsuranceEvidence(TypedDict):
    projectId: str
    enabled: bool
    banInsuranceIncluded: bool


class UpdateProjectInsuranceEvidence(TypedDict):
    enabled: bool


HealthAction = Literal["none", "stop", "slow_down", "log_out"]


class HealthIntegrations(TypedDict):
    emailConfigured: bool
    webhookConfigured: bool


class UpdateProjectHealthPolicy(TypedDict):
    version: int
    enabled: bool
    threshold: float
    sessionAction: HealthAction
    slowDownMps: float | None
    emailNotification: bool
    webhookNotification: bool


class ProjectHealthPolicy(UpdateProjectHealthPolicy):
    projectId: str
    integrations: HealthIntegrations


class BanSafe(Resource):
    async def get_project_safe_mode(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectSafeMode]]:
        self._server()
        return await self._request(
            "GET", self._project_path(project_id, "safe-mode"), options=options
        )

    async def update_project_safe_mode(
        self, project_id: str, body: UpdateProjectSafeMode, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectSafeMode]]:
        self._server()
        return await self._request(
            "PUT", self._project_path(project_id, "safe-mode"), body=body, options=options
        )

    async def get_project_warmup_plan(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectWarmupPlan]]:
        self._server()
        return await self._request(
            "GET", self._project_path(project_id, "warmup-plan"), options=options
        )

    async def update_project_warmup_plan(
        self, project_id: str, body: UpdateProjectWarmupPlan, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectWarmupPlan]]:
        self._server()
        return await self._request(
            "PUT", self._project_path(project_id, "warmup-plan"), body=body, options=options
        )

    async def get_project_insurance_evidence(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectInsuranceEvidence]]:
        self._server()
        return await self._request(
            "GET", self._project_path(project_id, "insurance-evidence"), options=options
        )

    async def update_project_insurance_evidence(
        self, project_id: str, body: UpdateProjectInsuranceEvidence, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectInsuranceEvidence]]:
        self._server()
        return await self._request(
            "PUT", self._project_path(project_id, "insurance-evidence"), body=body, options=options
        )

    async def get_project_health_policy(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectHealthPolicy]]:
        self._server()
        return await self._request(
            "GET", self._project_path(project_id, "health-policy"), options=options
        )

    async def update_project_health_policy(
        self, project_id: str, body: UpdateProjectHealthPolicy, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectHealthPolicy]]:
        self._server()
        return await self._request(
            "PUT", self._project_path(project_id, "health-policy"), body=body, options=options
        )

    async def get_session_safe_mode(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SessionSafeMode]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/safe-mode", options=options
        )

    async def update_session_safe_mode(
        self, session: str, body: UpdateSessionSafeMode, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SessionSafeMode]]:
        self._server()
        return await self._request(
            "PUT", f"/messaging/{segment(session)}/safe-mode", body=body, options=options
        )

    @staticmethod
    def _project_path(project_id: str, setting: str) -> str:
        return f"/messaging/projects/{segment(project_id)}/{setting}"
