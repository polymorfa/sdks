import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CampaignAnalyticsResponse,
  CampaignOperationResponse,
  CampaignRequeueResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  GetCampaignResponse,
  LaunchCampaignRequest,
  ListCampaignsResponse,
  RequeueCampaignRequest,
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
      ...options,
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
      ...options,
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

  stop(
    projectSlug: string,
    campaignId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.lifecycleRequest(projectSlug, campaignId, "stop", options);
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
    action: "pause" | "resume" | "stop",
    options: RequestOptions,
  ): Promise<ApiResponse<CampaignOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${campaignPath(projectSlug, campaignId)}/${action}`,
      ...options,
    });
  }
}

function campaignsPath(projectSlug: string): string {
  return `/api/projects/${encodeURIComponent(projectSlug)}/campaigns`;
}

function campaignPath(projectSlug: string, campaignId: string): string {
  return `${campaignsPath(projectSlug)}/${encodeURIComponent(campaignId)}`;
}
