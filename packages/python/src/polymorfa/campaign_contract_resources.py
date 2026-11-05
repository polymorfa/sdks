"""Confined project resources and one-page CSV export."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from . import campaign_contract_models as M
from . import campaign_contract_validation as V
from .campaign_contract_response import checked
from .content_disposition import parse_content_disposition_filename
from .errors import ServerError
from .messaging import O
from .models import DataEnvelope
from .transport import ApiResponse, QueryValue, RequestOptions, Transport


async def export_page(
    transport: Transport, path: str, query: dict[str, object], options: RequestOptions
) -> ApiResponse[M.CampaignRecipientExportPage]:
    result = await transport.text(
        "GET",
        path,
        query=cast(dict[str, QueryValue], query),
        accept="text/csv",
        options=V.options(options),
    )
    if (
        result.metadata.status != 200
        or result.metadata.headers.get("content-type", "").split(";")[0].strip().lower()
        != "text/csv"
    ):
        raise ServerError(
            "The API did not return a CSV export.",
            code="invalid_response",
            metadata=result.metadata,
            status=result.metadata.status,
        )
    return ApiResponse(
        {
            "csv": result.data,
            "nextCursor": result.metadata.headers.get("polymorfa-next-cursor"),
            "filename": parse_content_disposition_filename(
                result.metadata.headers.get("content-disposition")
            ),
        },
        result.metadata,
    )


def campaign_path(campaign_id: str) -> str:
    return "/platform/campaigns/" + V.uuid(campaign_id, "campaignId")


@dataclass(frozen=True)
class ProjectCampaigns:
    _transport: Transport
    _project_id: str

    def _query(self) -> dict[str, str]:
        return {"projectId": V.uuid(self._project_id, "projectId")}

    @checked
    async def get_reply_flow(
        self, reply_flow_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlow]]:
        return cast(
            ApiResponse[DataEnvelope[M.CampaignReplyFlow]],
            await self._transport.request(
                "GET",
                "/platform/campaign-reply-flows/" + V.uuid(reply_flow_id, "replyFlowId"),
                query=self._query(),
                options=V.options(options),
            ),
        )

    @checked
    async def create_reply_flow(
        self, body: M.CreateCampaignReplyFlowRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlow]]:
        V.reply_create(body)
        return cast(
            ApiResponse[DataEnvelope[M.CampaignReplyFlow]],
            await self._transport.request(
                "POST",
                "/platform/campaign-reply-flows",
                body=V.capture({**body, **self._query()}),
                options=V.options(options, write=True),
            ),
        )

    @checked
    async def set_reply_flow(
        self, campaign_id: str, body: M.SetCampaignReplyFlowRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignReplyFlowAssignment]]:
        V.assignment(body)
        return cast(
            ApiResponse[DataEnvelope[M.CampaignReplyFlowAssignment]],
            await self._transport.request(
                "PUT",
                campaign_path(campaign_id) + "/reply-flow",
                body=V.capture({**body, **self._query()}),
                options=V.options(options, write=True),
            ),
        )

    @checked
    async def test_send(
        self, campaign_id: str, body: M.CampaignTestSendRequest, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[M.CampaignTestSend]]:
        V.test_send(body)
        return cast(
            ApiResponse[DataEnvelope[M.CampaignTestSend]],
            await self._transport.request(
                "POST",
                campaign_path(campaign_id) + "/test-send",
                body=V.capture({**body, **self._query()}),
                options=V.options(options, write=True, replay=True),
            ),
        )

    @checked
    async def list_launch_approvals(
        self, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[list[M.CampaignLaunchApproval]]]:
        return cast(
            ApiResponse[DataEnvelope[list[M.CampaignLaunchApproval]]],
            await self._transport.request(
                "GET",
                campaign_path(campaign_id) + "/approvals",
                query=self._query(),
                options=V.options(options),
            ),
        )

    @checked
    async def links(
        self, campaign_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[list[M.CampaignTrackedLinkReport]]]:
        return cast(
            ApiResponse[DataEnvelope[list[M.CampaignTrackedLinkReport]]],
            await self._transport.request(
                "GET",
                campaign_path(campaign_id) + "/links",
                query=self._query(),
                options=V.options(options),
            ),
        )

    @checked
    async def export_recipients(
        self,
        campaign_id: str,
        params: M.CampaignRecipientExportParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[M.CampaignRecipientExportPage]:
        return await export_page(
            self._transport,
            campaign_path(campaign_id) + "/recipients/export",
            {**V.export({} if params is None else params), **self._query()},
            options,
        )


def custody_path(project_id: str, customer_id: str | None = None) -> str:
    project = "/platform/projects/" + V.uuid(project_id, "projectId")
    return (
        project
        + ("/customers/" + V.uuid(customer_id, "customerId") if customer_id is not None else "")
        + "/signal-custody"
    )


async def custody_request(
    transport: Transport,
    project_id: str,
    customer_id: str | None,
    body: M.ProjectSignalCustodyUpdate | M.CustomerSignalCustodyUpdate | None,
    options: RequestOptions,
) -> ApiResponse[DataEnvelope[M.SignalCustodyDefault]]:
    if body is not None:
        V.custody(body, customer_id is not None)
    return cast(
        ApiResponse[DataEnvelope[M.SignalCustodyDefault]],
        await transport.request(
            "GET" if body is None else "PUT",
            custody_path(project_id, customer_id),
            body=V.capture(body),
            options=V.options(options, write=body is not None),
        ),
    )


@dataclass(frozen=True)
class SignalCustody:
    _transport: Transport
    _project_id: str

    async def _read(
        self,
        customer_id: str | None,
        body: M.ProjectSignalCustodyUpdate | M.CustomerSignalCustodyUpdate | None,
        options: RequestOptions,
    ) -> ApiResponse[M.SignalCustodyDefault]:
        result = await custody_request(
            self._transport, self._project_id, customer_id, body, options
        )
        if not isinstance(result.data, dict) or "data" not in result.data:
            raise ServerError(
                "Invalid custody envelope.", code="invalid_response", metadata=result.metadata
            )
        return ApiResponse(result.data["data"], result.metadata)

    @checked
    async def retrieve(self, *, options: RequestOptions = O) -> ApiResponse[M.SignalCustodyDefault]:
        return await self._read(None, None, options)

    @checked
    async def update(
        self, body: M.ProjectSignalCustodyUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[M.SignalCustodyDefault]:
        V.custody(body)
        return await self._read(None, body, options)

    @checked
    async def retrieve_customer(
        self, customer_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[M.SignalCustodyDefault]:
        return await self._read(V.uuid(customer_id, "customerId"), None, options)

    @checked
    async def update_customer(
        self, customer_id: str, body: M.CustomerSignalCustodyUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[M.SignalCustodyDefault]:
        V.custody(body, True)
        return await self._read(V.uuid(customer_id, "customerId"), body, options)
