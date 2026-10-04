import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AddAudienceMembersRequest,
  AddAudienceMembersResult,
  AudienceImportResult,
  AudienceFromCampaignResult,
  AudienceMembersEnvelope,
  CreateAudienceRequest,
  CreateAudienceFromCampaignRequest,
  DataEnvelope,
  DeleteAudienceMemberResult,
  ListAudienceMembersParams,
  PlatformPayload,
} from "./types.js";

type AudienceResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

export class AudiencesResource {
  constructor(private readonly transport: HttpTransport) {}

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
   *
   * Safe to retry: the SDK sends an `Idempotency-Key` (a generated one unless
   * you pass `idempotencyKey`) and reuses it on every automatic retry. Within
   * 24 hours a retry of a successful create returns that audience, as it is
   * now, with the original import counts, instead of creating another. If that
   * audience was deleted, the retry fails with `idempotency_completed`.
   */
  create(
    body: CreateAudienceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceImportResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/audiences",
      body,
      ...withIdempotencyKey(options),
    });
  }

  /**
   * Snapshot one outcome from a prior campaign into a new team audience.
   * Opted-out numbers are omitted. If the response is lost, list audiences
   * before retrying: this create has no idempotent replay contract.
   */
  createFromCampaign(
    body: CreateAudienceFromCampaignRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceFromCampaignResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/audiences/from-campaign",
      body,
      ...options,
      // The API has no replay key for this create. A lost response must be
      // reconciled through audience reads, even if the caller requested retries.
      maxNetworkRetries: 0,
    });
  }

  /**
   * Append up to 1,000 members to an existing audience.
   *
   * Safe to retry: the SDK sends an `Idempotency-Key` (a generated one unless
   * you pass `idempotencyKey`) and reuses it on every automatic retry. Within
   * 24 hours a retry of a successful append returns its original counts with
   * `Idempotent-Replayed: true` instead of adding the members again.
   */
  addMembers(
    listId: string,
    body: AddAudienceMembersRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AddAudienceMembersResult>>> {
    return this.transport.request({
      method: "POST",
      path: membersPath(listId),
      body,
      ...withIdempotencyKey(options),
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
