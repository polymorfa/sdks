"""Campaign workflows preserve the distinct Messaging and Platform contracts."""

from __future__ import annotations

import builtins
from collections.abc import Mapping
from dataclasses import replace
from typing import cast

from . import campaign_models as C
from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import DataEnvelope, Envelope
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, JsonObject, QueryValue, RequestOptions


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
    async def list(
        self, project_slug: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[C.Campaign]]]:
        return await self._request("GET", campaign_path(project_slug), options=options)

    async def create(
        self, project_slug: str, body: C.CreateCampaign, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[C.Campaign]]:
        return await self._request(
            "POST", campaign_path(project_slug), body=body, options=options.with_idempotency_key()
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
        if not body:
            raise ValidationError("Supply at least one campaign field.")
        return await self._request(
            "PATCH",
            campaign_path(project_slug, campaign_id),
            body=body,
            options=append_options(options),
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
        return await self._request(
            "POST",
            campaign_path(project_slug, campaign_id) + "/launch",
            body={} if body is None else body,
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
            body=body,
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
            body=body,
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


class Campaigns(Resource):
    async def list(
        self, params: C.ListCampaigns, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[C.Campaign]]]:
        return await self._request(
            "GET", "/platform/campaigns", query=_query(params), options=options
        )

    async def create(
        self, body: C.CreatePlatformCampaign, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.Campaign]]:
        # Platform draft creation declares neither request-key replay nor automatic retry.
        if options.idempotency_key is not None or options.max_network_retries is not None:
            raise ValidationError(
                "Platform campaign creation does not accept idempotency or retry overrides."
            )
        return await self._request(
            "POST",
            "/platform/campaigns",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def retrieve(
        self, campaign_id: str, params: C.CampaignParams, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[C.Campaign | None]]:
        return await self._request(
            "GET",
            f"/platform/campaigns/{segment(campaign_id)}",
            query=_query(params),
            options=options,
        )

    async def update(
        self,
        campaign_id: str,
        body: C.UpdateCampaign | None,
        params: C.CampaignParams,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[C.Campaign]]:
        return await self._request(
            "PATCH",
            f"/platform/campaigns/{segment(campaign_id)}",
            body=body,
            query=_query(params),
            options=options,
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
        self, campaign_id: str, body: JsonObject | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/platform/campaigns/{segment(campaign_id)}/launch",
            body=body,
            options=options.with_idempotency_key(),
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
    ) -> CursorPage[C.Recipient]:
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
            body=body,
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
        return await self._request("POST", "/platform/audiences", body=body, options=options)

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
            body=body,
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
