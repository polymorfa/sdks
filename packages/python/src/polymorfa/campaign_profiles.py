"""Finite, organization-owned customer-supplied profile operations."""

from __future__ import annotations

from typing import cast

from . import campaign_contract_models as M
from . import campaign_contract_validation as V
from .campaign_contract_response import checked
from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, QueryValue, RequestOptions, Transport


class AudienceProfileImports(Resource):
    @checked
    async def create(
        self, body: M.CreateAudienceProfileImportRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceProfileImportJob]]:
        V.import_body(body)
        return await self._request(
            "POST",
            "/platform/audience-profile-imports",
            body=V.capture(body),
            options=V.options(options, write=True),
        )

    @checked
    async def retrieve(
        self, job_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceProfileImportJob]]:
        return await self._request(
            "GET",
            "/platform/audience-profile-imports/" + V.uuid(job_id, "jobId"),
            options=V.options(options),
        )

    @checked
    async def cancel(
        self, job_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceProfileImportJob]]:
        return await self._request(
            "DELETE",
            "/platform/audience-profile-imports/" + V.uuid(job_id, "jobId"),
            options=V.options(options, write=True),
        )


class AudienceProfiles(Resource):
    imports: AudienceProfileImports

    def __init__(self, transport: Transport, kind: str) -> None:
        super().__init__(transport, kind)
        self.imports = AudienceProfileImports(transport, kind)

    @checked
    async def list(
        self, params: M.ListAudienceProfilesParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[M.AudienceProfilePage[M.AudienceProfile]]:
        return await self._request(
            "GET",
            "/platform/audience-profiles",
            query=cast(dict[str, QueryValue], V.page({} if params is None else params)),
            options=V.options(options),
        )

    @checked
    async def retrieve(
        self, phone: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceProfile]]:
        return await self._request("GET", profile_path(phone), options=V.options(options))

    @checked
    async def put(
        self, phone: str, body: M.PutAudienceProfileRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceProfile]]:
        V.profile(body)
        return await self._request(
            "PUT", profile_path(phone), body=V.capture(body), options=V.options(options, write=True)
        )

    @checked
    async def delete(
        self, phone: str, expected_revision: int, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.DeleteAudienceProfileResult]]:
        V.integer(expected_revision, "expectedRevision", 1)
        return await self._request(
            "DELETE",
            profile_path(phone),
            query={"expectedRevision": str(expected_revision)},
            options=V.options(options, write=True),
        )

    @checked
    async def list_consent(
        self,
        phone: str,
        params: M.ListAudienceProfilesParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[M.AudienceProfilePage[M.AudienceConsentAssertion]]:
        return await self._request(
            "GET",
            profile_path(phone) + "/consent",
            query=cast(dict[str, QueryValue], V.page({} if params is None else params)),
            options=V.options(options),
        )


def profile_path(phone: str) -> str:
    return "/platform/audience-profiles/" + segment(V.phone(phone))
