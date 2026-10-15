import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope } from "./response.js";
import type {
  CampaignLaunchApproval,
  CampaignRecipientExportPage,
  CampaignRecipientExportParams,
  CampaignReplyFlow,
  CampaignReplyFlowAssignment,
  CampaignTestSend,
  CampaignTestSendRequest,
  CampaignTrackedLinkReport,
  CreateCampaignReplyFlowRequest,
  SetCampaignReplyFlowRequest,
} from "../campaign-contracts.js";
import {
  campaignContractBody,
  campaignContractOptions,
  contractUuid,
  validateCampaignTestSend,
  validateRecipientExport,
  validateReplyFlowAssignment,
  validateReplyFlowCreate,
} from "../campaign-contract-validation.js";
import { requestCampaignExport } from "../campaign-export.js";

/** Campaign operations confined to the constructor's project. */
export class ProjectCampaignsResource {
  readonly #transport: HttpTransport;
  readonly #projectId: string;

  constructor(transport: HttpTransport, projectId: string) {
    this.#transport = transport;
    this.#projectId = projectId;
    Object.freeze(this);
  }

  getReplyFlow(
    replyFlowId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `/platform/campaign-reply-flows/${contractUuid(replyFlowId, "replyFlowId")}`,
      query: this.#query(),
    });
  }

  createReplyFlow(
    body: CreateCampaignReplyFlowRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
    validateReplyFlowCreate(body);
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "POST",
      path: "/platform/campaign-reply-flows",
      body: campaignContractBody({ ...body, projectId: this.#project() }),
    });
  }

  setReplyFlow(
    campaignId: string,
    body: SetCampaignReplyFlowRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CampaignReplyFlowAssignment>>> {
    validateReplyFlowAssignment(body);
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: `${path(campaignId)}/reply-flow`,
      body: campaignContractBody({ ...body, projectId: this.#project() }),
    });
  }

  testSend(
    campaignId: string,
    body: CampaignTestSendRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CampaignTestSend>>> {
    validateCampaignTestSend(body);
    return this.#transport.request({
      ...campaignContractOptions(options, true, true),
      method: "POST",
      path: `${path(campaignId)}/test-send`,
      body: campaignContractBody({ ...body, projectId: this.#project() }),
    });
  }

  listLaunchApprovals(
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly CampaignLaunchApproval[]>>> {
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `${path(campaignId)}/approvals`,
      query: this.#query(),
    });
  }

  links(
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly CampaignTrackedLinkReport[]>>> {
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `${path(campaignId)}/links`,
      query: this.#query(),
    });
  }

  exportRecipients(
    campaignId: string,
    params: CampaignRecipientExportParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignRecipientExportPage>> {
    return requestCampaignExport(
      this.#transport,
      `${path(campaignId)}/recipients/export`,
      { ...validateRecipientExport(params), ...this.#query() },
      options,
    );
  }

  #project(): string {
    return contractUuid(this.#projectId, "projectId");
  }
  #query(): { readonly projectId: string } {
    return { projectId: this.#project() };
  }
}

function path(id: string): string {
  return `/platform/campaigns/${contractUuid(id, "campaignId")}`;
}
