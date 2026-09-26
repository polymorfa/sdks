import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CallPermissionResponse,
  SessionCallSettingsResponse,
  SuccessResponse,
  UpdateSessionCallSettingsRequest,
  VoipCheckCallRequest,
  VoipCheckCallResponse,
  VoipCallReportRequest,
  VoipAcceptCallRequest,
  VoipAcceptCallResponse,
  VoipAddParticipantRequest,
  VoipAddParticipantResponse,
  VoipLeaveCallRequest,
  VoipPlaceCallRequest,
  VoipPlaceCallResponse,
  VoipRejectCallRequest,
} from "./types.js";

const PARTICIPANT_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const REPORT_SDK_PATTERN = /^[a-z0-9@/._-]{1,32}$/;
const REPORT_VERSION_PATTERN =
  /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:[-+][0-9A-Za-z.+-]{1,24})?$/;
const CODEC_PATTERN = /^[A-Za-z0-9/.-]{1,32}$/;
const ERROR_CODES = new Set([
  "media_permission_denied",
  "device_not_found",
  "device_in_use",
  "ice_failed",
  "negotiation_failed",
  "media_timeout",
  "reconnect_exhausted",
  "token_refresh_failed",
  "unsupported_browser",
  "other",
]);
const CANDIDATE_TYPES = new Set(["host", "srflx", "prflx", "relay"]);
/** Integer figures and their upper bounds; all start at 0. */
const QUALITY_INTEGERS = {
  rttMs: 60_000,
  jitterMs: 60_000,
  packetsLost: 2_147_483_647,
  packetsReceived: 2_147_483_647,
  reconnects: 1_000,
} as const;

/**
 * Polymorfa Calls control routes. Every incoming call rings until a
 * participant accepts or rejects it. Server credentials act as
 * `server:<participant>` (default `default`); a client token acts as its own
 * participant. Mint browser tokens with `clientTokens.mint`; the session's
 * client rules must grant `voip_place`, `voip_answer`, and `voip_signal`.
 */
export class VoipResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Places a call. Pass `idempotencyKey` in options to retry safely. */
  place(
    body: VoipPlaceCallRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipPlaceCallResponse>> {
    if (this.credentialType !== "clientToken" && !nonEmpty(body?.session)) {
      throw new PolymorfaValidationError(
        "Placing a call with a server credential requires a session.",
      );
    }
    assertPlacementTargets(body.to, body.participants, body.groupId);
    this.assertParticipant(body.participant);
    return this.transport.request({
      method: "POST",
      path: "/messaging/voip/calls",
      body,
      ...options,
    });
  }

  /**
   * Answers a ringing call, or joins an answered call that no participant has
   * claimed. `exclusive: true` claims the call; the API answers `409
   * call_claimed` when another participant already holds the claim.
   */
  accept(
    callId: string,
    body: VoipAcceptCallRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipAcceptCallResponse>> {
    this.assertParticipant(body.participant);
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/accept`,
      body,
      ...options,
    });
  }

  /** Declines a ringing call. The API answers `409 call_not_ringing` otherwise. */
  reject(
    callId: string,
    body: VoipRejectCallRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    this.assertParticipant(body.participant);
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/reject`,
      ...(body.participant === undefined ? {} : { body }),
      ...options,
    });
  }

  /** Closes one media connection. The call continues for everyone else. */
  leave(
    callId: string,
    body: VoipLeaveCallRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    if (
      typeof body?.connectionId !== "string" ||
      !CONNECTION_ID_PATTERN.test(body.connectionId)
    ) {
      throw new PolymorfaValidationError(
        "connectionId must be 8 to 64 letters, digits, underscores, or hyphens.",
      );
    }
    this.assertParticipant(body.participant);
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/leave`,
      body,
      ...options,
    });
  }

  /**
   * Sends quality figures or an error your app measured for one of its media
   * connections. The platform accepts one quality report per connection every
   * 5 seconds and 20 error reports per minute, while the call is live and for
   * 10 minutes after it ends. Reports are best-effort: do not retry a `4xx`,
   * and drop a report refused with `429` or `503`. Client tokens need the
   * `voip_signal` action and must not send `participant`.
   */
  report(
    callId: string,
    body: VoipCallReportRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    assertCallReport(body);
    this.assertParticipant(body.participant);
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/reports`,
      body,
      ...options,
    });
  }

  /** Ends the call for every participant. */
  end(
    callId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: callPath(callId),
      ...options,
    });
  }

  /** Invites another WhatsApp user into a call. */
  /** Send one transient reaction, or an empty emoji to clear it. Never automatically retried. */
  sendReaction(
    callId: string,
    body: {
      connectionId: string;
      participant?: string;
      emoji: "" | "👍" | "❤️" | "😂" | "😮" | "😢" | "🙏";
    },
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    this.assertParticipant(body.participant);
    if (
      !CONNECTION_ID_PATTERN.test(body.connectionId) ||
      !["", "👍", "❤️", "😂", "😮", "😢", "🙏"].includes(body.emoji)
    )
      throw new PolymorfaValidationError(
        "Invalid call reaction or connection ID.",
      );
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/reaction`,
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }
  /** Set the Number's shared hand state on an attached call connection. */
  setHandRaised(
    callId: string,
    body: { connectionId: string; participant?: string; raised: boolean },
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    this.assertParticipant(body.participant);
    if (
      !CONNECTION_ID_PATTERN.test(body.connectionId) ||
      typeof body.raised !== "boolean"
    )
      throw new PolymorfaValidationError(
        "Invalid hand state or connection ID.",
      );
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/hand`,
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }

  addParticipant(
    callId: string,
    body: VoipAddParticipantRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipAddParticipantResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/participants`,
      body,
      ...options,
    });
  }

  /** Rings one non-connected participant already in the call's upstream roster. */
  ringParticipant(
    callId: string,
    body: VoipAddParticipantRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${callPath(callId)}/participants/ring`,
      body,
      ...options,
    });
  }

  /**
   * Reads whether a person has given this Cloud API number permission to call
   * them. `to` is a user ID or a phone number in E.164 format. WhatsApp is
   * asked during the request: `fresh` is `false` when it could not be reached
   * and the stored state is returned instead. Linked-device numbers answer
   * `409 unsupported_for_connection`. Requires a server credential with
   * `sessions:read`.
   */
  retrieveCallPermission(
    session: string,
    to: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallPermissionResponse>> {
    this.assertServerCredential("Call permissions");
    if (!nonEmpty(session)) {
      throw new PolymorfaConfigurationError(
        "A session is required to read a call permission.",
        "session",
      );
    }
    if (!nonEmpty(to)) {
      throw new PolymorfaConfigurationError(
        "A user ID or E.164 phone number is required.",
        "to",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/call-permissions/${encodeURIComponent(to)}`,
      ...options,
    });
  }

  /**
   * Runs the checks a placement runs, without placing a call or reserving
   * anything. `refusal` names the first reason the call would fail: the team's
   * call policy (`call_recipient_opted_out`, `call_destination_blocked`), the
   * session's calling switch (`calls_disabled`), or WhatsApp
   * (`call_permission_required`, `call_limit_reached`). Requires a server
   * credential. If required call-check state is unavailable, the API answers
   * `503 service_unavailable` rather than a possibly incomplete check.
   */
  check(
    body: VoipCheckCallRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipCheckCallResponse>> {
    this.assertServerCredential("Call checks");
    if (typeof body !== "object" || body === null) {
      throw new PolymorfaValidationError("A call check must be an object.");
    }
    if (!nonEmpty(body.session)) {
      throw new PolymorfaValidationError(
        "session names the number that would place the call.",
      );
    }
    if (!nonEmpty(body.to)) {
      throw new PolymorfaValidationError(
        "to must be a user ID or an E.164 phone number.",
      );
    }
    return this.transport.request({
      method: "POST",
      path: "/messaging/voip/calls/check",
      body,
      ...options,
    });
  }

  /** Reads a session's call settings. Requires a server credential. */
  retrieveCallSettings(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionCallSettingsResponse>> {
    this.assertServerCredential("Session call settings");
    return this.transport.request({
      method: "GET",
      path: callSettingsPath(session),
      ...options,
    });
  }

  /**
   * Changes a session's call settings; omitted settings keep their values.
   * Requires a server credential.
   */
  updateCallSettings(
    session: string,
    body: UpdateSessionCallSettingsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionCallSettingsResponse>> {
    this.assertServerCredential("Session call settings");
    if (typeof body !== "object" || body === null) {
      throw new PolymorfaValidationError("Call settings must be an object.");
    }
    // The platform rejects the retired setting as an unknown field.
    if ("includeSelfAudio" in body) {
      throw new PolymorfaValidationError(
        "includeSelfAudio was replaced by conferenceMode.",
      );
    }
    const {
      callsEnabled,
      conferenceMode,
      inboundRoute,
      sipTrunkId,
      sipClaim,
      hostCloudApiCalls,
    } = body;
    if (
      callsEnabled === undefined &&
      conferenceMode === undefined &&
      inboundRoute === undefined &&
      sipTrunkId === undefined &&
      sipClaim === undefined &&
      hostCloudApiCalls === undefined
    ) {
      throw new PolymorfaValidationError(
        "Send at least one call setting to change.",
      );
    }
    for (const [name, value] of [
      ["callsEnabled", callsEnabled],
      ["conferenceMode", conferenceMode],
      ["sipClaim", sipClaim],
      ["hostCloudApiCalls", hostCloudApiCalls],
    ] as const) {
      if (value !== undefined && typeof value !== "boolean") {
        throw new PolymorfaValidationError(`${name} must be a boolean.`);
      }
    }
    if (
      inboundRoute !== undefined &&
      inboundRoute !== "clients" &&
      inboundRoute !== "sip_trunk"
    ) {
      throw new PolymorfaValidationError(
        "inboundRoute must be clients or sip_trunk.",
      );
    }
    if (
      body.expectedRevision !== undefined &&
      (!Number.isSafeInteger(body.expectedRevision) ||
        body.expectedRevision < 0)
    ) {
      throw new PolymorfaValidationError(
        "expectedRevision must be a non-negative integer.",
      );
    }
    return this.transport.request({
      method: "PUT",
      path: callSettingsPath(session),
      body,
      ...options,
    });
  }

  private assertParticipant(participant: string | undefined): void {
    if (participant === undefined) return;
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "A client token acts as its own participant and cannot set participant.",
        "participant",
      );
    }
    if (
      typeof participant !== "string" ||
      !PARTICIPANT_PATTERN.test(participant)
    ) {
      throw new PolymorfaValidationError(
        "participant must be 1 to 128 letters, digits, or . _ : @ - characters.",
      );
    }
  }

  private assertServerCredential(subject: string): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        `${subject} require a server API key.`,
        "credential",
      );
    }
  }
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Mirrors the strict request schema, so an invalid report never leaves. */
function assertCallReport(body: VoipCallReportRequest): void {
  const fail = (message: string): never => {
    throw new PolymorfaValidationError(message);
  };
  if (typeof body !== "object" || body === null)
    fail("A call report must be an object.");
  const record = body as unknown as Record<string, unknown>;
  const allowed = new Set([
    "kind",
    "connectionId",
    "participant",
    "client",
    record["kind"] === "error" ? "error" : "quality",
  ]);
  for (const key of Object.keys(record))
    if (!allowed.has(key)) fail(`Unknown call report field: ${key}.`);
  if (
    typeof body.connectionId !== "string" ||
    !CONNECTION_ID_PATTERN.test(body.connectionId)
  )
    fail(
      "connectionId must be 8 to 64 letters, digits, underscores, or hyphens.",
    );
  if (body.client !== undefined) {
    const client = body.client as unknown as Record<string, unknown>;
    if (typeof client !== "object" || client === null)
      fail("client must be an object.");
    for (const key of Object.keys(client))
      if (!["sdk", "version", "platform"].includes(key))
        fail(`Unknown client field: ${key}.`);
    if (
      typeof client["sdk"] !== "string" ||
      !REPORT_SDK_PATTERN.test(client["sdk"])
    )
      fail("client.sdk must be 1 to 32 of a-z 0-9 @ / . _ -.");
    if (
      typeof client["version"] !== "string" ||
      client["version"].length > 32 ||
      !REPORT_VERSION_PATTERN.test(client["version"])
    )
      fail("client.version must be MAJOR.MINOR.PATCH with an optional suffix.");
    if (!["browser", "node", "other"].includes(client["platform"] as string))
      fail("client.platform must be browser, node, or other.");
  }
  if (body.kind === "error") {
    const error = body.error as unknown as Record<string, unknown> | undefined;
    if (typeof error !== "object" || error === null)
      fail("An error report needs error.");
    for (const key of Object.keys(error!))
      if (key !== "code") fail(`Unknown error field: ${key}.`);
    if (!ERROR_CODES.has(error!["code"] as string))
      fail("error.code is not a known call error code.");
    return;
  }
  if (body.kind !== "quality") fail("kind must be quality or error.");
  const quality = (body as { quality?: unknown }).quality as
    Record<string, unknown> | undefined;
  if (typeof quality !== "object" || quality === null)
    fail("A quality report needs quality.");
  let figures = 0;
  for (const [key, value] of Object.entries(quality!)) {
    if (value === undefined) continue;
    figures += 1;
    if (key in QUALITY_INTEGERS) {
      const max = QUALITY_INTEGERS[key as keyof typeof QUALITY_INTEGERS];
      if (
        !Number.isInteger(value) ||
        (value as number) < 0 ||
        (value as number) > max
      )
        fail(`quality.${key} must be an integer from 0 to ${max}.`);
    } else if (key === "audioCodec" || key === "videoCodec") {
      if (typeof value !== "string" || !CODEC_PATTERN.test(value))
        fail(`quality.${key} must be 1 to 32 of A-Z a-z 0-9 / . -.`);
    } else if (key === "candidateType") {
      if (!CANDIDATE_TYPES.has(value as string))
        fail("quality.candidateType must be host, srflx, prflx, or relay.");
    } else fail(`Unknown quality field: ${key}.`);
  }
  if (figures === 0) fail("A quality report needs at least one figure.");
}

function callPath(callId: string): string {
  return `/messaging/voip/calls/${encodeURIComponent(callId)}`;
}

function callSettingsPath(session: string): string {
  return `/platform/sessions/${encodeURIComponent(session)}/call-settings`;
}

function assertPlacementTargets(
  to: string | undefined,
  participants: readonly string[] | undefined,
  groupId: string | undefined,
): void {
  if (groupId !== undefined) {
    if (
      to !== undefined ||
      participants !== undefined ||
      !/^[1-9][0-9]{0,18}$/.test(groupId)
    )
      throw new PolymorfaValidationError(
        "Provide one public groupId, without to or participants.",
      );
    return;
  }
  const valid = (value: unknown): value is string =>
    typeof value === "string" &&
    /^(?:\+[1-9]\d{1,14}|[1-9][0-9]{0,18})$/.test(value.trim());
  if (
    participants === undefined
      ? !valid(to)
      : to !== undefined ||
        !Array.isArray(participants) ||
        participants.length < 2 ||
        participants.length > 31 ||
        !participants.every(valid) ||
        new Set(participants.map((value) => value.trim())).size !==
          participants.length
  ) {
    throw new PolymorfaValidationError(
      "Provide to or 2 to 31 distinct participants as E.164 numbers or user IDs.",
    );
  }
}
