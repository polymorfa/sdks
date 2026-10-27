import { BrowserValidationError } from "../errors.js";
import {
  BrowserTransport,
  type BrowserTransportOptions,
} from "../transport.js";
import type {
  BrowserActionOptions,
  BrowserActionResponse,
  BrowserAsyncAcceptedData,
  BrowserChatPresenceData,
  BrowserContact,
  BrowserCallPage,
  BrowserContactCheckResult,
  BrowserListCallsParams,
  BrowserCreateGroupRequest,
  BrowserGroup,
  BrowserGroupInviteCode,
  BrowserGroupInviteInfo,
  BrowserGroupMemberAddMode,
  BrowserGroupParticipant,
  BrowserMessageResult,
  BrowserMessageReceipt,
  BrowserPairingCode,
  BrowserPairingCodeRequest,
  BrowserPresenceData,
  BrowserPresenceSubscriptionData,
  BrowserProfilePicture,
  BrowserQrCode,
  BrowserReactionRequest,
  BrowserSeenRequest,
  BrowserSendMessageRequest,
  BrowserStarRequest,
  BrowserSuccessEnvelope,
  BrowserSuccessResponse,
  BrowserTypingRequest,
} from "./types.js";

export interface BrowserMessagingClientOptions extends BrowserTransportOptions {
  readonly session: string;
}

export class BrowserMessagingClient {
  readonly messages: BrowserMessagesResource;
  readonly presence: BrowserPresenceResource;
  readonly contacts: BrowserContactsResource;
  readonly groups: BrowserGroupsResource;
  readonly calls: BrowserCallsResource;
  readonly widget: BrowserWidgetResource;

  constructor(options: BrowserMessagingClientOptions) {
    if (typeof options.session !== "string" || options.session.length === 0) {
      throw new BrowserValidationError(
        "A session is required for the browser Messaging client.",
        "missing_session",
      );
    }
    const { session, ...transportOptions } = options;
    const transport = new BrowserTransport(transportOptions);
    this.messages = new BrowserMessagesResource(transport, session);
    this.presence = new BrowserPresenceResource(transport, session);
    this.contacts = new BrowserContactsResource(transport, session);
    this.groups = new BrowserGroupsResource(transport, session);
    this.calls = new BrowserCallsResource(transport, session);
    this.widget = new BrowserWidgetResource(transport, session);
  }
}

export class BrowserMessagesResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  send(
    body: BrowserSendMessageRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserMessageResult>>
  > {
    return this.post("send", body, withIdempotencyKey(options));
  }

  markSeen(
    body: BrowserSeenRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<{ readonly status: string }>>
  > {
    return this.post("seen", body, options);
  }

  setTyping(
    body: BrowserTypingRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<{ readonly status: string }>>
  > {
    return this.post("typing", body, options);
  }

  react(
    body: BrowserReactionRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserMessageReceipt>>
  > {
    return this.post("react", body, withIdempotencyKey(options));
  }

  star(
    body: BrowserStarRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<{ readonly status: "OK" }>>
  > {
    return this.post("star", body, options);
  }

  private post<T>(
    action: "send" | "seen" | "typing" | "react" | "star",
    body: unknown,
    options: BrowserActionOptions,
  ): Promise<BrowserActionResponse<T>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/messages/${action}`,
      body,
      ...options,
    });
  }
}

export class BrowserPresenceResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  retrieve(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserPresenceData>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/presence`,
      ...options,
    });
  }

  retrieveChat(
    chatId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserChatPresenceData>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/presence/${encodeURIComponent(chatId)}`,
      ...options,
    });
  }

  subscribe(
    chatId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<
      | BrowserSuccessEnvelope<BrowserPresenceSubscriptionData>
      | BrowserSuccessEnvelope<BrowserAsyncAcceptedData>
    >
  > {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/presence/${encodeURIComponent(chatId)}/subscribe`,
      ...options,
    });
  }
}

export class BrowserContactsResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  list(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<readonly BrowserContact[]>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts`,
      ...options,
    });
  }

  retrieve(
    contactId: string,
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessEnvelope<BrowserContact>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/${encodeURIComponent(contactId)}`,
      ...options,
    });
  }

  picture(
    contactId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserProfilePicture>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/${encodeURIComponent(contactId)}/picture`,
      ...options,
    });
  }

  check(
    phone: string | readonly string[],
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<
      BrowserSuccessEnvelope<readonly BrowserContactCheckResult[]>
    >
  > {
    const value = typeof phone === "string" ? phone : phone.join(",");
    if (value.length === 0) {
      throw new BrowserValidationError(
        "At least one phone number is required.",
        "missing_phone",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/check`,
      query: { phone: value },
      ...options,
    });
  }
}

/** The number's calls, newest first, with each caller's identity (`read_calls`). */
export class BrowserCallsResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  list(
    params: BrowserListCallsParams = {},
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserCallPage>> {
    if (
      params.limit !== undefined &&
      (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)
    )
      throw new BrowserValidationError("limit must be 1 to 100.", "invalid_limit");
    const query: Record<string, string> = {};
    for (const key of ["cursor", "direction", "outcome", "since", "until"] as const) {
      const value = params[key];
      if (value !== undefined) query[key] = value;
    }
    if (params.limit !== undefined) query.limit = String(params.limit);
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/calls`,
      query,
      ...options,
    });
  }
}

type Envelope<T> = BrowserActionResponse<BrowserSuccessEnvelope<T>>;
type Done = BrowserActionResponse<BrowserSuccessResponse>;

/**
 * Group reads need `groups_read`; changes need `groups_manage`. Creating a
 * group and adding participants also need the session's recipient mode to be
 * `any`. The picture and capabilities routes are server-only.
 */
export class BrowserGroupsResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  list(options: BrowserActionOptions = {}): Promise<Envelope<readonly BrowserGroup[]>> {
    return this.call("GET", "", undefined, options);
  }

  retrieve(groupId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserGroup>> {
    return this.call("GET", this.group(groupId), undefined, options);
  }

  participants(
    groupId: string,
    options: BrowserActionOptions = {},
  ): Promise<Envelope<readonly BrowserGroupParticipant[]>> {
    return this.call("GET", `${this.group(groupId)}/participants`, undefined, options);
  }

  inviteCode(groupId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserGroupInviteCode>> {
    return this.call("GET", `${this.group(groupId)}/invite-code`, undefined, options);
  }

  joinInfo(code: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserGroupInviteInfo>> {
    requireText(code, "An invite code is required.", "missing_invite_code");
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/groups/join-info`,
      query: { code },
      ...options,
    });
  }

  create(body: BrowserCreateGroupRequest, options: BrowserActionOptions = {}): Promise<Envelope<BrowserGroup>> {
    requireText(body.name.trim(), "A group name is required.", "missing_group_name");
    requireIds(body.participants);
    return this.call("POST", "", body, withIdempotencyKey(options));
  }

  join(code: string, options: BrowserActionOptions = {}): Promise<Done> {
    requireText(code, "An invite code is required.", "missing_invite_code");
    return this.call("POST", "/join", { code }, options);
  }

  leave(groupId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `${this.group(groupId)}/leave`, undefined, options);
  }

  setSubject(groupId: string, value: string, options: BrowserActionOptions = {}): Promise<Done> {
    requireText(value.trim(), "A group name is required.", "missing_group_name");
    return this.call("PUT", `${this.group(groupId)}/subject`, { value }, options);
  }

  setDescription(groupId: string, value: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `${this.group(groupId)}/description`, { value }, options);
  }

  revokeInviteCode(groupId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserGroupInviteCode>> {
    return this.call("POST", `${this.group(groupId)}/invite-code/revoke`, undefined, options);
  }

  addParticipants(groupId: string, participants: readonly string[], options: BrowserActionOptions = {}): Promise<Done> {
    return this.members(groupId, "participants/add", participants, options);
  }

  removeParticipants(groupId: string, participants: readonly string[], options: BrowserActionOptions = {}): Promise<Done> {
    return this.members(groupId, "participants/remove", participants, options);
  }

  promote(groupId: string, participants: readonly string[], options: BrowserActionOptions = {}): Promise<Done> {
    return this.members(groupId, "admin/promote", participants, options);
  }

  demote(groupId: string, participants: readonly string[], options: BrowserActionOptions = {}): Promise<Done> {
    return this.members(groupId, "admin/demote", participants, options);
  }

  /** Only admins may edit the group name, description and picture. */
  setInfoEditing(groupId: string, adminsOnly: boolean, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `${this.group(groupId)}/settings/info-edit`, { adminsOnly }, options);
  }

  /** Only admins may send messages. */
  setMessaging(groupId: string, adminsOnly: boolean, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `${this.group(groupId)}/settings/messages`, { adminsOnly }, options);
  }

  setMemberAddMode(groupId: string, mode: BrowserGroupMemberAddMode, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `${this.group(groupId)}/settings/member-add`, { mode }, options);
  }

  setJoinApproval(groupId: string, required: boolean, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `${this.group(groupId)}/settings/join-approval`, { required }, options);
  }

  private members(
    groupId: string,
    action: string,
    participants: readonly string[],
    options: BrowserActionOptions,
  ): Promise<Done> {
    requireIds(participants);
    return this.call("POST", `${this.group(groupId)}/${action}`, { participants }, options);
  }

  private group(groupId: string): string {
    if (!/^[1-9][0-9]{0,18}$/.test(groupId))
      throw new BrowserValidationError("Group IDs are decimal strings.", "invalid_group_id");
    return `/${groupId}`;
  }

  private call<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body: unknown,
    options: BrowserActionOptions,
  ): Promise<BrowserActionResponse<T>> {
    return this.transport.request({
      method,
      path: `${sessionRoot(this.session)}/groups${path}`,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function requireText(value: string, message: string, code: string): void {
  if (value.length === 0) throw new BrowserValidationError(message, code);
}

function requireIds(ids: readonly string[]): void {
  if (ids.length === 0 || ids.length > 256 || ids.some((id) => !/^[1-9][0-9]{0,18}$/.test(id)))
    throw new BrowserValidationError(
      "Pass 1 to 256 participant user IDs.",
      "invalid_participants",
    );
}

export class BrowserWidgetResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  qr(
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessEnvelope<BrowserQrCode>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/pair/qr`,
      ...options,
    });
  }

  requestPairingCode(
    body: BrowserPairingCodeRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserPairingCode>>
  > {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/pair/code`,
      body,
      ...options,
    });
  }
}

function sessionRoot(session: string): string {
  return `/messaging/${encodeURIComponent(session)}`;
}

/** One key per call; automatic retries reuse it so the API never repeats the write. */
function withIdempotencyKey(
  options: BrowserActionOptions,
): BrowserActionOptions {
  if (options.idempotencyKey !== undefined) return options;
  return { ...options, idempotencyKey: globalThis.crypto.randomUUID() };
}
