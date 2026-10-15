import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
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
  contractString,
  contractUuid,
  validateCampaignTestSend,
  validateRecipientExport,
  validateReplyFlowAssignment,
  validateReplyFlowCreate,
} from "../campaign-contract-validation.js";
import { requestCampaignExport } from "../campaign-export.js";
import {
  withIdempotencyKey,
  withoutAutomaticRetry,
} from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AddCampaignRecipientsRequest,
  AddCampaignRecipientsResponse,
  CampaignAnalyticsResponse,
  CampaignOperationResponse,
  CampaignRequeueResponse,
  CampaignStopResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  GetCampaignResponse,
  LaunchCampaignRequest,
  ListCampaignRecipientsParams,
  ListCampaignRecipientsResponse,
  ListCampaignsResponse,
  RequeueCampaignRequest,
  RescheduleCampaignRequest,
  RescheduleCampaignResponse,
  UpdateCampaignRequest,
  UpdateCampaignResponse,
} from "./types.js";

/** Exact project-slug campaign workflow exposed by the Messaging API. */
export class MessagingCampaignsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"] = "apiKey",
  ) {}

  private requireServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Campaign operations require an organization API key or project token.",
        "credential",
      );
    }
  }

  getReplyFlow(
    projectSlug: string,
    replyFlowId: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: CampaignReplyFlow }>
  > {
    this.requireServerCredential();
    return this.transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `${replyFlowsPath(projectSlug)}/${contractUuid(replyFlowId, "replyFlowId")}`,
    });
  }

  createReplyFlow(
    projectSlug: string,
    body: CreateCampaignReplyFlowRequest,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: CampaignReplyFlow }>
  > {
    this.requireServerCredential();
    validateReplyFlowCreate(body);
    return this.transport.request({
      ...campaignContractOptions(options, true),
      method: "POST",
      path: replyFlowsPath(projectSlug),
      body: campaignContractBody(body),
    });
  }

  setReplyFlow(
    projectSlug: string,
    campaignId: string,
    body: SetCampaignReplyFlowRequest,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{
      readonly success: true;
      readonly data: CampaignReplyFlowAssignment;
    }>
  > {
    this.requireServerCredential();
    validateReplyFlowAssignment(body);
    return this.transport.request({
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: `${contractCampaignPath(projectSlug, campaignId)}/reply-flow`,
      body: campaignContractBody(body),
    });
  }

  testSend(
    projectSlug: string,
    campaignId: string,
    body: CampaignTestSendRequest,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: CampaignTestSend }>
  > {
    this.requireServerCredential();
    validateCampaignTestSend(body);
    return this.transport.request({
      ...campaignContractOptions(options, true, true),
      method: "POST",
      path: `${contractCampaignPath(projectSlug, campaignId)}/test-send`,
      body: campaignContractBody(body),
    });
  }

  links(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{
      readonly success: true;
      readonly data: readonly CampaignTrackedLinkReport[];
    }>
  > {
    this.requireServerCredential();
    return this.transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `${contractCampaignPath(projectSlug, campaignId)}/links`,
    });
  }

  exportRecipients(
    projectSlug: string,
    campaignId: string,
    params: CampaignRecipientExportParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignRecipientExportPage>> {
    this.requireServerCredential();
    return requestCampaignExport(
      this.transport,
      `${contractCampaignPath(projectSlug, campaignId)}/recipients/export`,
      validateRecipientExport(params),
      options,
    );
  }

  list(
    projectSlug: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListCampaignsResponse>> {
    return this.transport.request({
      method: "GET",
      path: campaignsPath(projectSlug),
      ...options,
    });
  }

  create(
    projectSlug: string,
    body: CreateCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateCampaignResponse>> {
    return this.transport.request({
      method: "POST",
      path: campaignsPath(projectSlug),
      body,
      ...withIdempotencyKey(options),
    });
  }

  retrieve(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetCampaignResponse>> {
    return this.transport.request({
      method: "GET",
      path: campaignPath(projectSlug, campaignId),
      ...options,
    });
  }

  update(
    projectSlug: string,
    campaignId: string,
    body: UpdateCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateCampaignResponse>> {
    return this.transport.request({
      method: "PATCH",
      path: campaignPath(projectSlug, campaignId),
      body,
      ...withoutAutomaticRetry(options),
    });
  }

  analytics(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignAnalyticsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${campaignPath(projectSlug, campaignId)}/analytics`,
      ...options,
    });
  }

  launch(
    projectSlug: string,
    campaignId: string,
    body: LaunchCampaignRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/launch`,
      body,
      ...withIdempotencyKey(options),
    });
  }

  reschedule(
    projectSlug: string,
    campaignId: string,
    body: RescheduleCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RescheduleCampaignResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/reschedule`,
      body,
      ...withIdempotencyKey(options),
    });
  }

  pause(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.lifecycleRequest(projectSlug, campaignId, "pause", options);
  }

  resume(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.lifecycleRequest(projectSlug, campaignId, "resume", options);
  }

  /**
   * Stop a campaign. The campaign is cancelled, and `operationId` is null when
   * there was no active delivery run to stop.
   */
  stop(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignStopResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/stop`,
      ...withIdempotencyKey(options),
    });
  }

  /** One cursor page of recipients in queue order. */
  listRecipients(
    projectSlug: string,
    campaignId: string,
    params: ListCampaignRecipientsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListCampaignRecipientsResponse>> {
    return this.transport.request({
      method: "GET",
      path: recipientsPath(projectSlug, campaignId),
      query: {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /**
   * Add up to 1,000 recipients to a campaign that has not started sending.
   * Repeated phones are skipped and invalid entries are reported, not added.
   *
   * The API declares no idempotent replay for this append, so by default the
   * SDK sends it once and does not retry it. Setting both `maxNetworkRetries`
   * and `idempotencyKey` on the request re-enables retries, and a retry can be
   * processed as a new append. After a lost response, list the recipients before
   * appending again.
   */
  addRecipients(
    projectSlug: string,
    campaignId: string,
    body: AddCampaignRecipientsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AddCampaignRecipientsResponse>> {
    return this.transport.request({
      method: "POST",
      path: recipientsPath(projectSlug, campaignId),
      body,
      ...withoutAutomaticRetry(options),
    });
  }

  requeue(
    projectSlug: string,
    campaignId: string,
    body: RequeueCampaignRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignRequeueResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/requeue`,
      body,
      ...options,
    });
  }

  private lifecycleRequest(
    projectSlug: string,
    campaignId: string,
    action: "pause" | "resume",
    options: RequestOptions,
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/${action}`,
      ...withIdempotencyKey(options),
    });
  }
}

function campaignsPath(projectSlug: string): string {
  return `/messaging/projects/${encodeURIComponent(projectSlug)}/campaigns`;
}

function campaignPath(projectSlug: string, campaignId: string): string {
  return `${campaignsPath(projectSlug)}/${encodeURIComponent(campaignId)}`;
}

function recipientsPath(projectSlug: string, campaignId: string): string {
  return `${campaignPath(projectSlug, campaignId)}/recipients`;
}

function replyFlowsPath(projectSlug: string): string {
  return `/messaging/projects/${encodeURIComponent(contractString(projectSlug, "projectSlug"))}/campaign-reply-flows`;
}

function contractCampaignPath(projectSlug: string, campaignId: string): string {
  return campaignPath(
    contractString(projectSlug, "projectSlug"),
    contractUuid(campaignId, "campaignId"),
  );
}
