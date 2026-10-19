"""Campaign workflows preserve the distinct Messaging and Platform contracts."""

from __future__ import annotations

import builtins
from collections.abc import Mapping
from dataclasses import replace
from typing import cast

from . import campaign_contract_models as M
from . import campaign_contract_validation as V
from . import campaign_existing_validation as E
from . import campaign_models as C
from .campaign_contract_resources import ProjectCampaigns, export_page
from .campaign_contract_response import checked
from .errors import ServerError, ValidationError
from .messaging import O, Resource, segment
from .models import DataEnvelope, Envelope
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, Json, JsonObject, QueryValue, RequestOptions


def _query(params: Mapping[str, object]) -> dict[str, QueryValue]:
    return {key: cast(QueryValue, value) for key, value in params.items()}


def append_options(options: RequestOptions) -> RequestOptions:
    return (
        replace(options, max_network_retries=0) if options.max_network_retries is None else options
    )


def campaign_path(project_slug: str, campaign_id: str | None = None) -> str:
    path = f"/messaging/projects/{segment(project_slug)}/campaigns"
    return path if campaign_id is None else path + "/" + segment(campaign_id)


class MessagingCampaigns(Resource):
    @checked
    async def get_reply_flow(
        self, project_slug: str, reply_flow_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[M.CampaignReplyFlow]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/projects/{segment(project_slug)}/campaign-reply-flows/"
            + V.uuid(reply_flow_id, "replyFlowId"),
            options=V.options(options),
        )

    @checked
    async def create_reply_flow(
        self,
        project_slug: str,
        body: M.CreateCampaignReplyFlowRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[M.CampaignReplyFlow]]:
        self._server()
        V.reply_create(body)
        return await self._request(
            "POST",
            f"/messaging/projects/{segment(project_slug)}/campaign-reply-flows",
            body=V.capture(body),
            options=V.options(options, write=True),
        )

    @checked
    async def set_reply_flow(
        self,
        project_slug: str,
        campaign_id: str,
        body: M.SetCampaignReplyFlowRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[M.CampaignReplyFlowAssignment]]:
        self._server()
        V.assignment(body)
        return await self._request(
            "PUT",
            campaign_path(project_slug, V.uuid(campaign_id, "campaignId")) + "/reply-flow",
            body=V.capture(body),
            options=V.options(options, write=True),
        )

    @checked
    async def test_send(
        self,
        project_slug: str,
        campaign_id: str,
        body: M.CampaignTestSendRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[M.CampaignTestSend]]:
        self._server()
        V.test_send(body)
        return await self._request(
            "POST",
            campaign_path(project_slug, V.uuid(campaign_id, "campaignId")) + "/test-send",
            body=V.capture(body),
            options=V.options(options, write=True, replay=True),
        )

    @checked
    async def links(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[M.CampaignTrackedLinkReport]]]:
        self._server()
        return await self._request(
            "GET",
            campaign_path(project_slug, V.uuid(campaign_id, "campaignId")) + "/links",
            options=V.options(options),
        )

    @checked
    async def export_recipients(
        self,
        project_slug: str,
        campaign_id: str,
        params: M.CampaignRecipientExportParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[M.CampaignRecipientExportPage]:
        self._server()
        return await export_page(
            self._transport,
            campaign_path(project_slug, V.uuid(campaign_id, "campaignId")) + "/recipients/export",
            V.export({} if params is None else params),
            options,
        )

    async def list(
        self, project_slug: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[C.Campaign]]]:
        return await self._request("GET", campaign_path(project_slug), options=options)

    async def create(
        self, project_slug: str, body: C.CreateCampaign, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.Campaign]]:
        E.campaign(body)
        return await self._request(
            "POST",
            campaign_path(project_slug),
            body=V.capture(body),
            options=options.with_idempotency_key(),
        )

    async def retrieve(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.Campaign]]:
        return await self._request("GET", campaign_path(project_slug, campaign_id), options=options)

    async def update(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.UpdateCampaign,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.Campaign]]:
        E.campaign(body, patch=True)
        return await self._request(
            "PATCH",
            campaign_path(project_slug, campaign_id),
            body=V.capture(body),
            options=append_options(options),
        )

    async def enroll(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.EnrollContact,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.Enrollment]]:
        """Adds a contact to a running or paused continuous drip. Sent once:
        per-phone server idempotency does not make an ambiguous retry safe."""
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/enrollments",
            body=V.capture(body),
            options=replace(options, max_network_retries=0),
        )

    async def analytics(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.Analytics]]:
        return await self._request(
            "GET", campaign_path(project_slug, campaign_id) + "/analytics", options=options
        )

    async def launch(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.LaunchCampaign | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.CampaignOperation]]:
        E.launch({} if body is None else body)
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/launch",
            body=V.capture({} if body is None else body),
            options=options.with_idempotency_key(),
        )

    async def reschedule(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.Reschedule,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.CampaignOperation]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/reschedule",
            body=V.capture(body),
            options=options.with_idempotency_key(),
        )

    async def pause(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.CampaignOperation]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/pause",
            options=options.with_idempotency_key(),
        )

    async def resume(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.CampaignOperation]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/resume",
            options=options.with_idempotency_key(),
        )

    async def stop(
        self, project_slug: str, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.CampaignStopped]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/stop",
            options=options.with_idempotency_key(),
        )

    async def recipients(
        self,
        project_slug: str,
        campaign_id: str,
        params: C.RecipientsParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> CursorPage[C.Recipient]:
        E.recipients({} if params is None else params)
        path = campaign_path(project_slug, campaign_id) + "/recipients"
        query: dict[str, QueryValue] = _query(params or {})
        response = await self._transport.request("GET", path, query=query, options=options)
        return CursorPage(self._transport, path, query, options, response)

    async def add_recipients(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.AddRecipients,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.AddedRecipients]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/recipients",
            body=V.capture(body),
            options=append_options(options),
        )

    async def requeue(
        self,
        project_slug: str,
        campaign_id: str,
        body: C.Requeue | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[C.Requeued]]:
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/requeue",
            body={} if body is None else body,
            options=options,
        )


def platform_campaign_response(
    response: ApiResponse[DataEnvelope[C.Campaign | list[C.Campaign] | None]],
) -> ApiResponse[DataEnvelope[C.PlatformCampaign | list[C.PlatformCampaign] | None]]:
    if not isinstance(response.data, dict) or "data" not in response.data:
        raise ServerError(
            "Invalid campaign envelope.", code="invalid_response", metadata=response.metadata
        )
    envelope = cast(JsonObject, response.data)
    value = envelope.get("data")
    if isinstance(value, dict):
        converted: C.PlatformCampaign | list[C.PlatformCampaign] | None = C.PlatformCampaign(value)
    elif isinstance(value, list) and all(isinstance(item, dict) for item in value):
        converted = [C.PlatformCampaign(cast(JsonObject, item)) for item in value]
    elif value is None:
        converted = None
    else:
        raise ServerError(
            "Invalid campaign response.", code="invalid_response", metadata=response.metadata
        )
    data = {**envelope, "data": converted}
    return ApiResponse(
        cast(DataEnvelope[C.PlatformCampaign | list[C.PlatformCampaign] | None], data),
        response.metadata,
    )


class Campaigns(Resource):
    @checked
    async def get_reply_flow(
        self, reply_flow_id: str, params: M.CampaignProjectParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlow]]:
        return await ProjectCampaigns(self._transport, V.selection(params)).get_reply_flow(
            reply_flow_id, options=options
        )

    @checked
    async def create_reply_flow(
        self, body: M.CreatePlatformCampaignReplyFlowRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlow]]:
        V.reply_create(body, True)
        project = body["projectId"]
        data = cast(
            M.CreateCampaignReplyFlowRequest,
            {key: value for key, value in body.items() if key != "projectId"},
        )
        return await ProjectCampaigns(self._transport, project).create_reply_flow(
            data, options=options
        )

    @checked
    async def set_reply_flow(
        self,
        campaign_id: str,
        body: M.SetPlatformCampaignReplyFlowRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlowAssignment]]:
        V.assignment(body, True)
        return await ProjectCampaigns(self._transport, body["projectId"]).set_reply_flow(
            campaign_id, {"replyFlowId": body["replyFlowId"]}, options=options
        )

    @checked
    async def test_send(
        self,
        campaign_id: str,
        body: M.PlatformCampaignTestSendRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[M.CampaignTestSend]]:
        V.test_send(body, True)
        data = cast(
            M.CampaignTestSendRequest,
            {key: value for key, value in body.items() if key != "projectId"},
        )
        return await ProjectCampaigns(self._transport, body["projectId"]).test_send(
            campaign_id, data, options=options
        )

    @checked
    async def list_launch_approvals(
        self, campaign_id: str, params: M.CampaignProjectParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[M.CampaignLaunchApproval]]]:
        return await ProjectCampaigns(self._transport, V.selection(params)).list_launch_approvals(
            campaign_id, options=options
        )

    @checked
    async def links(
        self, campaign_id: str, params: M.CampaignProjectParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[M.CampaignTrackedLinkReport]]]:
        return await ProjectCampaigns(self._transport, V.selection(params)).links(
            campaign_id, options=options
        )

    @checked
    async def export_recipients(
        self,
        campaign_id: str,
        params: M.PlatformCampaignRecipientExportParams,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[M.CampaignRecipientExportPage]:
        V.export(params, True)
        data = cast(
            M.CampaignRecipientExportParams,
            {key: value for key, value in params.items() if key != "projectId"},
        )
        return await ProjectCampaigns(self._transport, params["projectId"]).export_recipients(
            campaign_id, data, options=options
        )

    @checked
    async def get_settings(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignSettings]]:
        return await self._request("GET", "/platform/campaign-settings", options=V.options(options))

    async def get_frequency_cap(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.FrequencyCapSettings]]:
        """Team cap. Team key with campaigns:read."""
        return await self._request(
            "GET", "/platform/campaign-settings/frequency-cap", options=options
        )

    async def update_frequency_cap(
        self, body: C.UpdateFrequencyCap, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.FrequencyCapSettings]]:
        """Replaces both limits with the last read revision. A stale revision raises
        ConflictError; read again and reconcile. Limits require beta access. Sent
        once: reconcile a lost response with a fresh read."""
        return await self._request(
            "PUT",
            "/platform/campaign-settings/frequency-cap",
            body=V.capture(body),
            options=replace(options, max_network_retries=0),
        )

    async def enroll(
        self, campaign_id: str, body: C.EnrollPlatformContact, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.Enrollment]]:
        """Adds a contact to a running or paused continuous drip; sent once."""
        V.uuid(V.obj(body).get("projectId"), "projectId")
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/enrollments",
            body=V.capture(body),
            options=replace(options, max_network_retries=0),
        )

    async def list(
        self, params: C.ListCampaigns, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[C.PlatformCampaign]]]:
        E.selection(params, slug=True)
        response: ApiResponse[
            DataEnvelope[C.Campaign | list[C.Campaign] | None]
        ] = await self._request("GET", "/platform/campaigns", query=_query(params), options=options)
        return cast(
            ApiResponse[DataEnvelope[builtins.list[C.PlatformCampaign]]],
            platform_campaign_response(response),
        )

    async def create(
        self, body: C.CreatePlatformCampaign, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.PlatformCampaign]]:
        E.campaign(body, platform=True)
        V.uuid(body.get("projectId"), "projectId")
        # Platform draft creation declares neither request-key replay nor automatic retry.
        if options.idempotency_key is not None or options.max_network_retries is not None:
            raise ValidationError(
                "Platform campaign creation does not accept idempotency or retry overrides."
            )
        response: ApiResponse[
            DataEnvelope[C.Campaign | list[C.Campaign] | None]
        ] = await self._request(
            "POST",
            "/platform/campaigns",
            body=V.capture(body),
            options=replace(options, max_network_retries=0),
        )
        return cast(
            ApiResponse[DataEnvelope[C.PlatformCampaign]], platform_campaign_response(response)
        )

    async def retrieve(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.PlatformCampaign | None]]:
        E.selection(params)
        response: ApiResponse[
            DataEnvelope[C.Campaign | list[C.Campaign] | None]
        ] = await self._request(
            "GET",
            f"/platform/campaigns/{segment(campaign_id)}",
            query=_query(params),
            options=options,
        )
        return cast(
            ApiResponse[DataEnvelope[C.PlatformCampaign | None]],
            platform_campaign_response(response),
        )

    async def update(
        self,
        campaign_id: str,
        body: C.UpdateCampaign | C.UpdatePlatformCampaign | None,
        params: C.CampaignParams,
        *,
        options: RequestOptions = O,
        extra_fields: Mapping[str, Json] | None = None,
    ) -> ApiResponse[DataEnvelope[C.PlatformCampaign]]:
        E.selection(params)
        E.protected_extra(extra_fields, set(C.UpdatePlatformCampaign.__annotations__))
        if body is not None:
            E.protected_extra(
                {
                    key: value
                    for key, value in body.items()
                    if key not in C.UpdatePlatformCampaign.__annotations__
                },
                set(),
            )
            E.campaign(body, platform=True, patch=True)
        merged = (
            V.capture({**(body or {}), **extra_fields})
            if extra_fields is not None
            else V.capture(body)
        )
        response: ApiResponse[
            DataEnvelope[C.Campaign | list[C.Campaign] | None]
        ] = await self._request(
            "PATCH",
            f"/platform/campaigns/{segment(campaign_id)}",
            body=V.capture(merged),
            query=_query(params),
            options=options,
        )
        return cast(
            ApiResponse[DataEnvelope[C.PlatformCampaign]], platform_campaign_response(response)
        )

    async def delete(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "DELETE",
            f"/platform/campaigns/{segment(campaign_id)}",
            query=_query(params),
            options=options,
        )

    async def launch(
        self, campaign_id: str, body: C.LaunchPlatformCampaign, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.PlatformCampaignLaunchResult]]:
        E.launch(body, True)
        response: ApiResponse[DataEnvelope[JsonObject]] = await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/launch",
            body=V.capture(body),
            options=options.with_idempotency_key(),
        )
        if not isinstance(response.data, dict) or not isinstance(response.data.get("data"), dict):
            raise ServerError(
                "Invalid campaign launch response.",
                code="invalid_response",
                metadata=response.metadata,
            )
        result = response.data["data"]
        if not all(isinstance(result.get(key), str) for key in ("id", "status", "operationId")):
            raise ServerError(
                "Invalid campaign launch response.",
                code="invalid_response",
                metadata=response.metadata,
            )
        return ApiResponse(
            cast(
                DataEnvelope[C.PlatformCampaignLaunchResult],
                {**response.data, "data": C.PlatformCampaignLaunchResult(result)},
            ),
            response.metadata,
        )

    async def reschedule(
        self, campaign_id: str, body: C.PlatformReschedule, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/reschedule",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def pause(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/pause",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def resume(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/resume",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def stop(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/stop",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def archive(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/archive",
            body=body,
            options=options,
        )

    async def duplicate(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/duplicate",
            body=body,
            options=options,
        )

    async def requeue(
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/requeue",
            body=body,
            options=options,
        )

    async def analytics(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.PlatformAnalytics]]:
        E.selection(params)
        return await self._request(
            "GET",
            f"/platform/campaigns/{segment(campaign_id)}/analytics",
            query=_query(params),
            options=options,
        )

    async def events(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "GET",
            f"/platform/campaigns/{segment(campaign_id)}/events",
            query=_query(params),
            options=options,
        )

    async def recipients(
        self, campaign_id: str, params: C.PlatformRecipientsParams, *, options: RequestOptions = O
    ) -> CursorPage[C.PlatformRecipient]:
        E.recipients(params, True)
        path = f"/platform/campaigns/{segment(campaign_id)}/recipients"
        query: dict[str, QueryValue] = _query(params)
        response = await self._transport.request("GET", path, query=query, options=options)
        return CursorPage(self._transport, path, query, options, response)

    async def add_recipients(
        self, campaign_id: str, body: C.AddPlatformRecipients, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.AddedRecipients]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/recipients",
            body=V.capture(body),
            options=append_options(options),
        )

    async def record_conversion(
        self, campaign_id: str, body: C.RecordConversion, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.Conversion]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/conversions",
            body=body,
            options=options,
        )

    async def conversions(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.ConversionReport]]:
        return await self._request(
            "GET",
            f"/platform/campaigns/{segment(campaign_id)}/conversions",
            query=_query(params),
            options=options,
        )


class Audiences(PlatformResource):
    @checked
    async def create_from_campaign(
        self, body: M.CreateAudienceFromCampaignRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.AudienceFromCampaignResult]]:
        V.retarget(body)
        return await self._request(
            "POST",
            "/platform/audiences/from-campaign",
            body=V.capture(body),
            options=V.options(options, write=True),
        )

    # TS deliberately keeps list/retrieve/delete/upload payloads opaque.
    async def list(self, *, options: RequestOptions = O) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request("GET", "/platform/audiences", options=options)

    async def create(
        self, body: C.CreateAudience, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.ImportedAudience]]:
        if "fileId" in body and ("members" in body or "mapping" not in body):
            raise ValidationError(
                "File import requires a mapping and cannot include inline members."
            )
        if "mapping" in body and "fileId" not in body:
            raise ValidationError("File import requires fileId.")
        return await self._request(
            "POST", "/platform/audiences", body=V.capture(body), options=options
        )

    async def retrieve(
        self, list_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "GET", f"/platform/audiences/{segment(list_id)}", options=options
        )

    async def delete(
        self, list_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "DELETE", f"/platform/audiences/{segment(list_id)}", options=options
        )

    async def create_upload(
        self, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST", "/platform/audiences/uploads", body=body, options=options
        )

    async def add_members(
        self, list_id: str, body: C.AddMembers, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.AddedMembers]]:
        return await self._request(
            "POST",
            f"/platform/audiences/{segment(list_id)}/members",
            body=V.capture(body),
            options=append_options(options),
        )

    async def list_members(
        self, list_id: str, params: C.ListMembers | None = None, *, options: RequestOptions = O
    ) -> CursorPage[C.AudienceMember]:
        return await self._page(
            f"/platform/audiences/{segment(list_id)}/members", _query(params or {}), options
        )

    async def delete_member(
        self, list_id: str, phone: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.RemovedMember]]:
        return await self._request(
            "DELETE",
            f"/platform/audiences/{segment(list_id)}/members/{segment(phone)}",
            options=options,
        )
