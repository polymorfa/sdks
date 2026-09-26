import { HttpTransport } from "../transport/http.js";
import { campaignRecipientExportPage } from "../transport/campaign-recipient-export.js";
import {
  withIdempotencyKey,
  withoutAutomaticRetry,
} from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AddCampaignRecipientsRequest,
  AddCampaignRecipientsResponse,
  CampaignRecipientsCsvPage,
  CampaignAnalyticsResponse,
  CampaignOperationResponse,
  CampaignRequeueResponse,
  CampaignStopResponse,
  CampaignTestSendRequest,
  CampaignTestSendResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  ExportCampaignRecipientsParams,
  GetCampaignResponse,
  LaunchCampaignRequest,
  ListCampaignRecipientsParams,
  ListCampaignRecipientsResponse,
  ListCampaignsResponse,
  RequeueCampaignRequest,
  RescheduleCampaignRequest,
  UpdateCampaignRequest,
  UpdateCampaignResponse,
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

  /** Update draft fields. The API rejects schedule changes after launch. */
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

  /** Sends one copy of a draft to a verified seed number. A timeout can leave its outcome unknown. */
  testSend(
    projectSlug: string,
    campaignId: string,
    body: CampaignTestSendRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignTestSendResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/test-send`,
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
        ...(params.reason === undefined ? {} : { reason: params.reason }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /**
   * Export one CSV page. Only unfiltered exports can continue with `nextCursor`.
   * Filtered exports contain at most 1,000 matches and reject larger results.
   */
  exportRecipients(
    projectSlug: string,
    campaignId: string,
    params: ExportCampaignRecipientsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignRecipientsCsvPage>> {
    return campaignRecipientExportPage(
      this.transport,
      `${recipientsPath(projectSlug, campaignId)}/export`,
      {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.reason === undefined ? {} : { reason: params.reason }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      options,
    );
  }

  /**
   * Add up to 1,000 recipients to a campaign that has not started sending.
   * Repeated phones are skipped and invalid entries are reported, not added.
   *
   * Safe to retry: the SDK sends an `Idempotency-Key` (a generated one unless
   * you pass `idempotencyKey`) and reuses it on every automatic retry. Within
   * 24 hours a retry of a successful append returns its original counts with
   * `Idempotent-Replayed: true` instead of adding the recipients again.
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
      ...withIdempotencyKey(options),
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
