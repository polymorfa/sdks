import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  SessionCallSettingsResponse,
  SuccessResponse,
  UpdateSessionCallSettingsRequest,
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

  /** Reads a session's call settings. Requires a server credential. */
  retrieveCallSettings(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionCallSettingsResponse>> {
    this.assertServerCredential();
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
    this.assertServerCredential();
    if (typeof body !== "object" || body === null) {
      throw new PolymorfaValidationError("Call settings must be an object.");
    }
    const {
      callsEnabled,
      includeSelfAudio,
      inboundRoute,
      sipTrunkId,
      sipClaim,
      hostCloudApiCalls,
    } = body;
    if (
      callsEnabled === undefined &&
      includeSelfAudio === undefined &&
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
      ["includeSelfAudio", includeSelfAudio],
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

  private assertServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Session call settings require a server API key.",
        "credential",
      );
    }
  }
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function callPath(callId: string): string {
  return `/messaging/voip/calls/${encodeURIComponent(callId)}`;
}

function callSettingsPath(session: string): string {
  return `/platform/sessions/${encodeURIComponent(session)}/call-settings`;
}
