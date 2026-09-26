import { HttpTransport } from "../transport/http.js";
import { campaignRecipientExportPage } from "../transport/campaign-recipient-export.js";
import type { CampaignRecipientsCsvPage } from "../messaging/types.js";
import {
  withIdempotencyKey,
  withoutAutomaticRetry,
} from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { CampaignTestSend } from "../messaging/types.js";
import type {
  AddPlatformCampaignRecipientsRequest,
  AddPlatformCampaignRecipientsResult,
  CreatePlatformCampaignRequest,
  LaunchPlatformCampaignRequest,
  ExportPlatformCampaignRecipientsParams,
  DataEnvelope,
  ListCampaignsParams,
  ListPlatformCampaignRecipientsParams,
  PlatformCampaignParams,
  PlatformCampaignRecipientsEnvelope,
  PlatformCampaignTestSendRequest,
  PlatformPayload,
  ReschedulePlatformCampaignRequest,
  UpdatePlatformCampaignRequest,
} from "./types.js";

type CampaignResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;
type CampaignAction =
  "launch" | "pause" | "resume" | "stop" | "archive" | "duplicate" | "requeue";
type CampaignRead = "analytics" | "events";

export class CampaignsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListCampaignsParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: "/platform/campaigns",
      query: {
        projectId: params.projectId,
        ...(params.projectSlug === undefined
          ? {}
          : { projectSlug: params.projectSlug }),
      },
      ...options,
    });
  }

  create(
    body: CreatePlatformCampaignRequest,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "POST",
      path: "/platform/campaigns",
      body,
      ...options,
    });
  }

  retrieve(
    campaignId: string,
    params: PlatformCampaignParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: campaignPath(campaignId),
      query: campaignQuery(params),
      ...options,
    });
  }

  /**
   * Change a campaign. `recipientListId` points an unlaunched draft at another
   * audience and replaces its draft recipients, or detaches it with null; the
   * API refuses the change once the campaign has launched.
   */
  update(
    campaignId: string,
    body: UpdatePlatformCampaignRequest | undefined,
    params: PlatformCampaignParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "PATCH",
      path: campaignPath(campaignId),
      query: campaignQuery(params),
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }

  delete(
    campaignId: string,
    params: PlatformCampaignParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "DELETE",
      path: campaignPath(campaignId),
      query: campaignQuery(params),
      ...options,
    });
  }

  /**
   * Start a draft. Fails with `422 campaign_variables_missing` when recipients
   * lack a value and fallback, unless `skipMissingVariables` is true.
   */
  launch(
    campaignId: string,
    body?: LaunchPlatformCampaignRequest,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "launch", body, options);
  }

  /** Move a launched campaign that has not started sending, or start it now. */
  reschedule(
    campaignId: string,
    body: ReschedulePlatformCampaignRequest,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(campaignId)}/reschedule`,
      body,
      ...withoutAutomaticRetry(withIdempotencyKey(options)),
    });
  }

  /** Sends one copy of a draft to a team number. Use the same idempotency key to reconcile an uncertain result. */
  testSend(
    campaignId: string,
    body: PlatformCampaignTestSendRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CampaignTestSend>>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(campaignId)}/test-send`,
      body,
      ...withoutAutomaticRetry(withIdempotencyKey(options)),
    });
  }

  pause(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "pause", body, options);
  }

  resume(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "resume", body, options);
  }

  stop(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "stop", body, options);
  }

  archive(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "archive", body, options);
  }

  duplicate(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "duplicate", body, options);
  }

  requeue(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "requeue", body, options);
  }

  analytics(
    campaignId: string,
    params: PlatformCampaignParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.read(campaignId, "analytics", params, options);
  }

  events(
    campaignId: string,
    params: PlatformCampaignParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.read(campaignId, "events", params, options);
  }

  /**
   * One cursor page of a campaign's recipients in queue order.
   *
   * This replaces the earlier bare array: the response is now
   * `{ data, page }`, and each recipient carries its own delivery timestamps.
   */
  recipients(
    campaignId: string,
    params: ListPlatformCampaignRecipientsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<PlatformCampaignRecipientsEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: recipientsPath(campaignId),
      query: {
        projectId: params.projectId,
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.reason === undefined ? {} : { reason: params.reason }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /** One CSV page. Only unfiltered exports can continue with `nextCursor`. */
  exportRecipients(
    campaignId: string,
    params: ExportPlatformCampaignRecipientsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignRecipientsCsvPage>> {
    return campaignRecipientExportPage(
      this.transport,
      `${recipientsPath(campaignId)}/export`,
      {
        projectId: params.projectId,
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
   *
   * Safe to retry: the SDK sends an `Idempotency-Key` (a generated one unless
   * you pass `idempotencyKey`) and reuses it on every automatic retry. Within
   * 24 hours a retry of a successful append returns its original counts with
   * `Idempotent-Replayed: true` instead of adding the recipients again.
   */
  addRecipients(
    campaignId: string,
    body: AddPlatformCampaignRecipientsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AddPlatformCampaignRecipientsResult>>> {
    return this.transport.request({
      method: "POST",
      path: recipientsPath(campaignId),
      body,
      ...withIdempotencyKey(options),
    });
  }

  private action(
    campaignId: string,
    action: CampaignAction,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): CampaignResponse {
    const retryable =
      action === "launch" ||
      action === "pause" ||
      action === "resume" ||
      action === "stop";
    return this.write(
      "POST",
      `${campaignPath(campaignId)}/${action}`,
      body,
      retryable ? withIdempotencyKey(options) : options,
    );
  }

  private read(
    campaignId: string,
    resource: CampaignRead,
    params: PlatformCampaignParams,
    options: RequestOptions,
  ): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: `${campaignPath(campaignId)}/${resource}`,
      query: campaignQuery(params),
      ...options,
    });
  }

  private write(
    method: "POST" | "PATCH",
    path: string,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): CampaignResponse {
    return this.transport.request({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function campaignPath(campaignId: string): string {
  return `/platform/campaigns/${encodeURIComponent(campaignId)}`;
}

function campaignQuery(
  params: PlatformCampaignParams,
): Readonly<Record<string, string>> {
  return { projectId: params.projectId };
}

function recipientsPath(campaignId: string): string {
  return `${campaignPath(campaignId)}/recipients`;
}
