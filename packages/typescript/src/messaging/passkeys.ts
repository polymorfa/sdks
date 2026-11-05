import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
export interface IssuePasskeyChallengeRequest {
  readonly challengeB64Url?: string;
  readonly ttlSeconds?: number;
  /** @deprecated Ignored. The runner determines ceremony verification. */
  readonly userVerification?: "required" | "preferred" | "discouraged";
  /** @deprecated Ignored. The runner determines ceremony timeout. */
  readonly timeoutMs?: number;
}
export interface PasskeyTicket {
  readonly version: 2;
  readonly ticket: string;
  readonly session: string;
  readonly rpId: string;
  readonly challengeB64Url: string;
  readonly userVerification: "required" | "preferred" | "discouraged";
  readonly expiresAt: string;
  readonly timeoutMs?: number;
}
export interface PasskeyAssertionResponse {
  readonly authenticatorDataB64: string;
  readonly clientDataJSONB64: string;
  readonly signatureB64: string;
  readonly userHandleB64?: string;
}
export interface PasskeyAssertion {
  readonly id: string;
  readonly rawIdB64Url: string;
  readonly response: PasskeyAssertionResponse;
}
export interface SubmitPasskeyAssertionRequest {
  readonly ticketId: string;
  readonly assertion: PasskeyAssertion;
}
export interface PasskeyAssertionResult {
  readonly ok: true;
  readonly ticket: string;
  readonly session: string;
}
export interface ConfirmPasskeyRequest {
  readonly ticketId: string;
  readonly code?: string;
}
export type PasskeyConfirmationStatus =
  | "none"
  | "challenge_pending"
  | "assertion_sending"
  | "assertion_submitted"
  | "code_available"
  | "confirmation_sending"
  | "waiting_for_pairing"
  | "completed"
  | "failed";
export interface PasskeyConfirmation {
  readonly status: PasskeyConfirmationStatus;
  readonly ticketId?: string;
  readonly code?: string;
  readonly skipHandoffUX?: boolean;
  readonly error?: string;
}
export interface PasskeyResponse<T> {
  readonly success: true;
  readonly data: T;
}
function invalid(): never {
  throw new PolymorfaValidationError("Invalid passkey request.");
}
function nonempty(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}
/** Direct customer relay. All five operations require sessions:manage server credentials. */
export class PasskeysResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}
  private path(session: string): string {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Passkeys require a server credential.",
        "credential",
      );
    if (!nonempty(session)) invalid();
    return `/messaging/${encodeURIComponent(session)}/passkey`;
  }
  private write<T>(
    path: string,
    body: object,
    options: RequestOptions,
  ): Promise<ApiResponse<PasskeyResponse<T>>> {
    let text: string;
    try {
      text = JSON.stringify(body);
    } catch {
      return invalid();
    }
    if (new TextEncoder().encode(text).length > 1048576) invalid();
    return this.transport.request({
      method: "POST",
      path,
      body: JSON.parse(text),
      ...options,
      maxNetworkRetries: 0,
    });
  }
  issueChallenge(
    session: string,
    body: IssuePasskeyChallengeRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<PasskeyResponse<PasskeyTicket>>> {
    const path = this.path(session);
    if (!body || typeof body !== "object") invalid();
    if (
      (body.challengeB64Url !== undefined && !nonempty(body.challengeB64Url)) ||
      (body.ttlSeconds !== undefined &&
        !Number.isSafeInteger(body.ttlSeconds)) ||
      (body.timeoutMs !== undefined &&
        (!Number.isSafeInteger(body.timeoutMs) || body.timeoutMs <= 0)) ||
      (body.userVerification !== undefined &&
        !["required", "preferred", "discouraged"].includes(
          body.userVerification,
        ))
    )
      invalid();
    return this.write(path + "/challenge", body, options);
  }
  getChallenge(
    session: string,
    ticketId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<PasskeyResponse<PasskeyTicket>>> {
    const path = this.path(session);
    if (!nonempty(ticketId)) invalid();
    return this.transport.request({
      method: "GET",
      path: path + "/challenge/" + encodeURIComponent(ticketId),
      ...options,
    });
  }
  submitAssertion(
    session: string,
    body: SubmitPasskeyAssertionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<PasskeyResponse<PasskeyAssertionResult>>> {
    const path = this.path(session);
    const a = body?.assertion;
    const v = a?.response;
    if (
      !nonempty(body?.ticketId) ||
      !nonempty(a?.id) ||
      a.id.length > 1364 ||
      !nonempty(a?.rawIdB64Url) ||
      a.rawIdB64Url.length > 1364 ||
      !v ||
      !nonempty(v.authenticatorDataB64) ||
      !nonempty(v.clientDataJSONB64) ||
      !nonempty(v.signatureB64) ||
      (v.userHandleB64 !== undefined &&
        (typeof v.userHandleB64 !== "string" || v.userHandleB64.length > 86))
    )
      invalid();
    return this.write(path + "/assertion", body, options);
  }
  getConfirmation(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<PasskeyResponse<PasskeyConfirmation>>> {
    return this.transport.request({
      method: "GET",
      path: this.path(session) + "/confirmation",
      ...options,
    });
  }
  /** Confirm only after comparison; an accepted receipt is not pairing completion. */
  confirm(
    session: string,
    body: ConfirmPasskeyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<PasskeyResponse<PasskeyConfirmation>>> {
    const path = this.path(session);
    if (
      !nonempty(body?.ticketId) ||
      (body.code !== undefined &&
        (typeof body.code !== "string" ||
          !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.code)))
    )
      invalid();
    return this.write(path + "/confirmation", body, options);
  }
}
