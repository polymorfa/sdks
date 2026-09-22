import { HttpTransport } from "../transport/http.js";
import { withoutAutomaticRetry } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AddPlatformCampaignRecipientsRequest,
  AddPlatformCampaignRecipientsResult,
  DataEnvelope,
  ListCampaignsParams,
  ListPlatformCampaignRecipientsParams,
  PlatformCampaignParams,
  PlatformCampaignRecipientsEnvelope,
  PlatformPayload,
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
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.write("POST", "/platform/campaigns", body, options);
  }

  retrieve(
    campaignId: string,
    params: PlatformCampaignParams = {},
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
   * audience, or detaches it with null; the API refuses the change once the
   * campaign has launched or its audience has been copied into recipients.
   */
  update(
    campaignId: string,
    body?: UpdatePlatformCampaignRequest,
    params: PlatformCampaignParams = {},
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
    params: PlatformCampaignParams = {},
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "DELETE",
      path: campaignPath(campaignId),
      query: campaignQuery(params),
      ...options,
    });
  }

  launch(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.action(campaignId, "launch", body, options);
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
    params: PlatformCampaignParams = {},
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.read(campaignId, "analytics", params, options);
  }

  events(
    campaignId: string,
    params: PlatformCampaignParams = {},
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
    params: ListPlatformCampaignRecipientsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<PlatformCampaignRecipientsEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: recipientsPath(campaignId),
      query: {
        ...(params.projectId === undefined
          ? {}
          : { projectId: params.projectId }),
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /**
   * Add up to 1,000 recipients to a campaign that has not started sending.
   *
   * The API declares no idempotent replay for this append, so by default the
   * SDK sends it once and does not retry it. Setting both `maxNetworkRetries`
   * and `idempotencyKey` on the request re-enables retries, and a retry can be
   * processed as a new append. After a lost response, list the recipients before
   * appending again.
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
      ...withoutAutomaticRetry(options),
    });
  }

  private action(
    campaignId: string,
    action: CampaignAction,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): CampaignResponse {
    return this.write(
      "POST",
      `${campaignPath(campaignId)}/${action}`,
      body,
      options,
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
  return params.projectId === undefined ? {} : { projectId: params.projectId };
}

function recipientsPath(campaignId: string): string {
  return `${campaignPath(campaignId)}/recipients`;
}
