import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ConversationIdentity, SuccessEnvelope } from "./types.js";

/**
 * Beta: WhatsApp groups created through the Official API on a Connection whose
 * WhatsApp Business Account is an Official Business Account. Linked Devices
 * groups use `groups`. Participants join with the invite link; they cannot be
 * added. A group holds at most 8 participants besides your business, and a
 * Connection can create at most 10,000 groups. Requires team enrollment.
 */
export interface OfficialGroupCursors {
  readonly before?: string;
  readonly after?: string;
}

export interface OfficialGroupSummary {
  readonly id: string;
  readonly subject?: string;
  /** Creation time as WhatsApp reported it. */
  readonly createdAt?: string;
}

export interface OfficialGroupList {
  readonly groups: readonly OfficialGroupSummary[];
  readonly cursors: OfficialGroupCursors;
  readonly hasMore: boolean;
}

export interface OfficialGroup {
  readonly id: string;
  readonly subject?: string;
  readonly description?: string;
  readonly suspended?: boolean;
  readonly createdAt?: string;
  /** Participants, excluding your business. */
  readonly participantCount?: number;
  readonly joinApprovalRequired?: boolean;
  readonly participants: readonly ConversationIdentity[];
}

export interface ListOfficialGroupsParams {
  /** 1 to 1024. WhatsApp's default is 25. */
  readonly limit?: number;
  readonly before?: string;
  readonly after?: string;
}

export interface CreateOfficialGroupRequest {
  /** 1 to 128 characters. */
  readonly subject: string;
  /** At most 2048 characters. */
  readonly description?: string;
  /** When true, people who open the invite link request to join. */
  readonly joinApprovalRequired?: boolean;
}

export interface CreateOfficialGroupResult {
  /**
   * WhatsApp creates the group asynchronously. A `group.update` event with
   * action `created` (or `create_failed`) carries this request ID, the
   * group's conversation ID and its invite link.
   */
  readonly requestId: string;
}

export interface UpdateOfficialGroupRequest {
  readonly subject?: string;
  readonly description?: string;
}

export interface OfficialGroupChangeAccepted {
  /** The outcome arrives as a `group.update` or `group.participant` event. */
  readonly accepted: true;
}

export interface OfficialGroupInviteLink {
  readonly inviteLink: string;
}

export interface OfficialGroupJoinRequest {
  readonly joinRequestId: string;
  readonly user: ConversationIdentity;
  readonly createdAt?: string;
}

export interface OfficialGroupJoinRequestList {
  readonly items: readonly OfficialGroupJoinRequest[];
  readonly cursors: OfficialGroupCursors;
  readonly hasMore: boolean;
}

export interface OfficialGroupJoinRequestDecision {
  readonly succeeded: readonly string[];
  readonly failed: readonly {
    readonly joinRequestId: string;
    readonly errors: readonly {
      readonly code: number;
      readonly title?: string;
    }[];
  }[];
}

export type PinOfficialGroupMessageRequest =
  | {
      readonly operation: "pin";
      readonly messageId: string;
      /** 1 to 30 days. */
      readonly expirationDays: number;
    }
  | { readonly operation: "unpin"; readonly messageId: string };

export interface OfficialGroupCursorParams {
  readonly before?: string;
  readonly after?: string;
}

/**
 * Beta. Reads may be retried; every change is sent once, even when a retry
 * override is set. Pass `options.idempotencyKey` so a manual retry after an
 * unknown outcome is answered by the API instead of changing the group again,
 * and read the group before repeating an uncertain change.
 */
export class OfficialGroupsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  private requireServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Official groups require a team key or project token.",
        "credential",
      );
    }
  }

  private read<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    options: RequestOptions,
  ) {
    this.requireServerCredential();
    return this.transport.request<SuccessEnvelope<T>>({
      method: "GET",
      path,
      query,
      ...options,
    });
  }

  private write<T>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body: unknown,
    options: RequestOptions,
  ) {
    this.requireServerCredential();
    return this.transport.request<SuccessEnvelope<T>>({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
      maxNetworkRetries: 0,
    });
  }

  list(
    connection: string,
    params: ListOfficialGroupsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupList>>> {
    return this.read(
      groupsPath(connection),
      { limit: params.limit, before: params.before, after: params.after },
      options,
    );
  }

  /** Asks WhatsApp to create a group; see `CreateOfficialGroupResult`. */
  create(
    connection: string,
    body: CreateOfficialGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CreateOfficialGroupResult>>> {
    return this.write("POST", groupsPath(connection), body, options);
  }

  retrieve(
    connection: string,
    group: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroup>>> {
    return this.read(groupPath(connection, group), {}, options);
  }

  update(
    connection: string,
    group: string,
    body: UpdateOfficialGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
    return this.write("PATCH", groupPath(connection, group), body, options);
  }

  /** Deletes the group and removes every participant, including your business. */
  delete(
    connection: string,
    group: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
    return this.write("DELETE", groupPath(connection, group), undefined, options);
  }

  getInviteLink(
    connection: string,
    group: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> {
    return this.read(`${groupPath(connection, group)}/invite-link`, {}, options);
  }

  /** Creates a new invite link; every earlier link stops working. */
  resetInviteLink(
    connection: string,
    group: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> {
    return this.write(
      "POST",
      `${groupPath(connection, group)}/invite-link/reset`,
      undefined,
      options,
    );
  }

  /** Removes up to eight participants (conversation IDs or E.164 numbers). A removed participant cannot rejoin with the link. */
  removeParticipants(
    connection: string,
    group: string,
    participants: readonly string[],
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
    return this.write(
      "POST",
      `${groupPath(connection, group)}/participants/remove`,
      { participants },
      options,
    );
  }

  listJoinRequests(
    connection: string,
    group: string,
    params: OfficialGroupCursorParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestList>>> {
    return this.read(
      `${groupPath(connection, group)}/join-requests`,
      { before: params.before, after: params.after },
      options,
    );
  }

  approveJoinRequests(
    connection: string,
    group: string,
    joinRequestIds: readonly string[],
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> {
    return this.write(
      "POST",
      `${groupPath(connection, group)}/join-requests/approve`,
      { joinRequestIds },
      options,
    );
  }

  rejectJoinRequests(
    connection: string,
    group: string,
    joinRequestIds: readonly string[],
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> {
    return this.write(
      "POST",
      `${groupPath(connection, group)}/join-requests/reject`,
      { joinRequestIds },
      options,
    );
  }

  /** Beta. Official-only; Hybrid Connections must use groups.setPicture on Linked Devices.
   * Upload a square JPEG, at least 192 x 192 pixels, at most 5 MB. The server
   * validates image bytes and dimensions. An event confirms the applied change.
   */
  setPicture(
    connection: string,
    group: string,
    file: Blob,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
    this.requireServerCredential();
    if (
      !(file instanceof Blob) ||
      file.type !== "image/jpeg" ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    )
      throw new PolymorfaValidationError(
        "Provide a nonempty JPEG of at most 5 MB, square and at least 192 x 192 pixels.",
      );
    const body = new FormData();
    body.set("file", file, "picture.jpg");
    return this.transport.request({
      method: "PUT",
      path: `${groupPath(connection, group)}/picture`,
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }

  /** Pins a group message for 1 to 30 days, or unpins it. At most three stay pinned. */
  pin(
    connection: string,
    group: string,
    body: PinOfficialGroupMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
    return this.write(
      "POST",
      `${groupPath(connection, group)}/pins`,
      body,
      options,
    );
  }
}

function groupsPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/official-groups`;
}

function groupPath(connection: string, group: string): string {
  return `${groupsPath(connection)}/${encodeURIComponent(group)}`;
}
