import { requestContract } from "../campaign-contract-response.js";
import { existingOptions } from "../campaign-existing-validation.js";
import { HttpTransport } from "../transport/http.js";
import {
  campaignContractBody,
  campaignContractOptions,
  validateRetarget,
} from "../campaign-contract-validation.js";
import type {
  AudienceFromCampaignResult,
  CreateAudienceFromCampaignRequest,
} from "../campaign-contracts.js";
import { withoutAutomaticRetry } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AddAudienceMembersRequest,
  AddAudienceMembersResult,
  AudienceImportResult,
  AudienceMembersEnvelope,
  CreateAudienceRequest,
  DataEnvelope,
  DeleteAudienceMemberResult,
  ListAudienceMembersParams,
  PlatformPayload,
} from "./types.js";

type AudienceResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

export class AudiencesResource {
  constructor(private readonly transport: HttpTransport) {}

  createFromCampaign(
    body: CreateAudienceFromCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceFromCampaignResult>>> {
    validateRetarget(body);
    return requestContract(
      this.transport,
      {
        ...campaignContractOptions(options, true),
        method: "POST",
        path: "/platform/audiences/from-campaign",
        body: campaignContractBody(body),
      },
      "retarget",
    );
  }

  list(options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "GET",
      path: "/platform/audiences",
      ...options,
    });
  }

  /**
   * Create an audience from inline `members`, or from an uploaded spreadsheet
   * with `fileId` and `mapping`. The result carries the import counts and up
   * to 20 rejected rows.
   */
  create(
    body: CreateAudienceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceImportResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/audiences",
      body: campaignContractBody(body),
      ...existingOptions(options),
    });
  }

  /**
   * Append up to 1,000 members to an existing audience.
   *
   * The SDK sends this unsafe append once by default. A caller key supports
   * replay; select maxNetworkRetries explicitly to authorize automatic retries.
   * Without a key, inspect members after an uncertain result before appending.
   */
  addMembers(
    listId: string,
    body: AddAudienceMembersRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AddAudienceMembersResult>>> {
    return this.transport.request({
      method: "POST",
      path: membersPath(listId),
      body: campaignContractBody(body),
      ...withoutAutomaticRetry(existingOptions(options)),
    });
  }

  /** One cursor page of an audience's members. */
  listMembers(
    listId: string,
    params: ListAudienceMembersParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceMembersEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: membersPath(listId),
      query: {
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /** Remove one member by phone number. */
  deleteMember(
    listId: string,
    phone: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<DeleteAudienceMemberResult>>> {
    return this.transport.request({
      method: "DELETE",
      path: `${membersPath(listId)}/${encodeURIComponent(phone)}`,
      ...options,
    });
  }

  retrieve(listId: string, options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "GET",
      path: audiencePath(listId),
      ...options,
    });
  }

  delete(listId: string, options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "DELETE",
      path: audiencePath(listId),
      ...options,
    });
  }

  createUpload(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): AudienceResponse {
    return this.write("/platform/audiences/uploads", body, options);
  }

  private write(
    path: string,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): AudienceResponse {
    return this.transport.request({
      method: "POST",
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function audiencePath(listId: string): string {
  return `/platform/audiences/${encodeURIComponent(listId)}`;
}

function membersPath(listId: string): string {
  return `${audiencePath(listId)}/members`;
}
