import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  ListCampaignsParams,
  PlatformPayload,
} from "./types.js";

type CampaignResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;
type CampaignAction =
  "launch" | "pause" | "resume" | "stop" | "archive" | "duplicate" | "requeue";
type CampaignRead = "analytics" | "events" | "recipients";

export class CampaignsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListCampaignsParams,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: "/v1/campaigns",
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
    return this.write("POST", "/v1/campaigns", body, options);
  }

  retrieve(campaignId: string, options: RequestOptions = {}): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: campaignPath(campaignId),
      ...options,
    });
  }

  update(
    campaignId: string,
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.write("PATCH", campaignPath(campaignId), body, options);
  }

  delete(campaignId: string, options: RequestOptions = {}): CampaignResponse {
    return this.transport.request({
      method: "DELETE",
      path: campaignPath(campaignId),
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
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.read(campaignId, "analytics", options);
  }

  events(campaignId: string, options: RequestOptions = {}): CampaignResponse {
    return this.read(campaignId, "events", options);
  }

  recipients(
    campaignId: string,
    options: RequestOptions = {},
  ): CampaignResponse {
    return this.read(campaignId, "recipients", options);
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
    options: RequestOptions,
  ): CampaignResponse {
    return this.transport.request({
      method: "GET",
      path: `${campaignPath(campaignId)}/${resource}`,
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
  return `/v1/campaigns/${encodeURIComponent(campaignId)}`;
}
