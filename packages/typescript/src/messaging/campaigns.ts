import { HttpTransport } from "../transport/http.js";
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
} from "./types.js";

/** Exact project-slug campaign workflow exposed by the Messaging API. */
export class MessagingCampaignsResource {
  constructor(private readonly transport: HttpTransport) {}

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

  /** Move a launched campaign that has not started sending, or start it now. */
  reschedule(
    projectSlug: string,
    campaignId: string,
    body: RescheduleCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/reschedule`,
      body,
      ...withoutAutomaticRetry(withIdempotencyKey(options)),
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
