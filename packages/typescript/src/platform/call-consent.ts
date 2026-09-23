import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import type { CursorPage } from "../pagination.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import {
  decodeCursorPage,
  type DataEnvelope,
  unwrapResponse,
} from "./response.js";

const CALL_POLICY_PATH = "/platform/call-policy";
const CALL_OPT_OUTS_PATH = "/platform/call-opt-outs";
const COUNTRY_CODE = /^[1-9]\d{0,3}$/;
const COUNTRY_CODE_LIMIT = 300;
const IMPORT_LIMIT = 5_000;

/** The team's call policy (`/platform/call-policy`). */
export interface CallPolicy {
  /**
   * Calls to phone numbers that start with one of these country calling codes
   * or dialing prefixes are refused with `call_destination_blocked`. While the
   * list is not empty, calls to a person whose phone number is not known are
   * refused too.
   */
  readonly blockedCountryCodes: readonly string[];
  /** Entries on the team's do-not-call list. */
  readonly optOutCount: number;
  /**
   * Increases every time the blocked country codes change; `0` before they
   * are first saved. Send it as `expectedRevision`.
   */
  readonly revision: number;
  /** When the blocked country codes last changed, or `null`. */
  readonly updatedAt: string | null;
}

export interface UpdateCallPolicyInput {
  /**
   * The complete list, replacing the stored one: country calling codes or
   * longer dialing prefixes as 1 to 4 digits without `+` (`44`, `1876`). At
   * most 300 codes; duplicates are removed. Send `[]` to allow every country.
   */
  readonly blockedCountryCodes: readonly string[];
  /**
   * Apply the change only if the policy still has this `revision`; otherwise
   * it fails with `PolymorfaConflictError` (`state_conflict`).
   */
  readonly expectedRevision?: number;
}

export type CallOptOutSource = "api" | "console" | "import";

/** One entry on the team's do-not-call list. */
export interface CallOptOut {
  readonly id: string;
  /** The phone number in E.164 format, or `null` for a BSUID entry. */
  readonly phoneNumber: string | null;
  /** The WhatsApp business-scoped user ID, or `null` for a phone number entry. */
  readonly bsuid: string | null;
  readonly note: string | null;
  /** How the entry was added. */
  readonly source: CallOptOutSource;
  readonly createdAt: string;
}

export interface ListCallOptOutsParams {
  /** Entries per page, 1 to 500. The API defaults to 100. */
  readonly limit?: number;
  /** `page.nextCursor` from a previous page. `CursorPage` follows it for you. */
  readonly cursor?: string;
  /** Return only the entry for this E.164 phone number. */
  readonly phoneNumber?: string;
  /** Return only the entry for this BSUID. */
  readonly bsuid?: string;
}

/** Add a person by exactly one of `phoneNumber` (E.164) or `bsuid`. */
export type CreateCallOptOutInput =
  | {
      readonly phoneNumber: string;
      readonly bsuid?: never;
      /** 1 to 500 characters. */
      readonly note?: string;
    }
  | {
      readonly bsuid: string;
      readonly phoneNumber?: never;
      readonly note?: string;
    };

/**
 * One import entry. The API reports an entry without exactly one valid
 * identifier, or with a note outside 1 to 500 characters, in `rejected`.
 */
export interface CallOptOutImportEntry {
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly note?: string;
}

export interface ImportCallOptOutsInput {
  /** 1 to 5,000 entries. */
  readonly entries: readonly CallOptOutImportEntry[];
}

export type CallOptOutRejectionReason =
  | "invalid_phone_number"
  | "invalid_bsuid"
  | "missing_identifier"
  | "multiple_identifiers"
  | "invalid_note";

export interface CallOptOutImportResult {
  /** Entries added. */
  readonly added: number;
  /** Entries already on the list, left unchanged. */
  readonly existing: number;
  /** Entries that were not added, by their position in `entries`. */
  readonly rejected: readonly {
    readonly index: number;
    readonly reason: CallOptOutRejectionReason;
  }[];
}

export interface CallOptOutDeleted {
  readonly id: string;
  readonly deleted: true;
}

/**
 * The team's blocked country codes. Organization credentials only: the API
 * refuses project tokens and client tokens with `403`.
 */
export class CallPolicyResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Reads the blocked country codes and the size of the do-not-call list. */
  retrieve(options: RequestOptions = {}): Promise<ApiResponse<CallPolicy>> {
    return this.transport
      .request<DataEnvelope<CallPolicy>>({
        method: "GET",
        path: CALL_POLICY_PATH,
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Replaces the blocked country codes. New calls are checked against the new
   * list at once; calls in progress continue.
   */
  update(
    input: UpdateCallPolicyInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallPolicy>> {
    assertPolicyInput(input);
    return this.transport
      .request<DataEnvelope<CallPolicy>>({
        method: "PUT",
        path: CALL_POLICY_PATH,
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }
}

/**
 * The team's do-not-call list. Calls to a listed person are refused with
 * `call_recipient_opted_out`. Organization credentials only: the API refuses
 * project tokens and client tokens with `403`.
 */
export class CallOptOutsResource {
  readonly #raw: RawClient;

  constructor(private readonly transport: HttpTransport) {
    this.#raw = new RawClient(transport);
  }

  /** Lists entries, newest first. Iterate the page to follow every cursor. */
  list(
    params: ListCallOptOutsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<CallOptOut>> {
    if (params.phoneNumber !== undefined && params.bsuid !== undefined) {
      throw new PolymorfaValidationError(
        "Filter by phoneNumber or bsuid, not both.",
      );
    }
    return this.#raw.paginate<CallOptOut>(
      {
        method: "GET",
        path: CALL_OPT_OUTS_PATH,
        query: { ...params },
        ...options,
      },
      decodeCursorPage<CallOptOut>,
    );
  }

  /**
   * Adds a phone number or BSUID. The API answers `201` with a new entry and
   * `200` with the existing entry when the person is already listed; read
   * `metadata.status` to tell them apart. A full list fails with
   * `PolymorfaConflictError` (`call_opt_out_limit`).
   */
  create(
    input: CreateCallOptOutInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallOptOut>> {
    const record = input as { phoneNumber?: unknown; bsuid?: unknown };
    if (
      typeof input !== "object" ||
      input === null ||
      nonEmpty(record.phoneNumber) === nonEmpty(record.bsuid)
    ) {
      throw new PolymorfaValidationError(
        "Supply exactly one of phoneNumber or bsuid.",
      );
    }
    return this.transport
      .request<DataEnvelope<CallOptOut>>({
        method: "POST",
        path: CALL_OPT_OUTS_PATH,
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Adds up to 5,000 entries in one request. Valid entries are added together
   * and invalid ones are listed in `rejected`. If the valid entries would take
   * the list past its limit, nothing is added and the request fails with
   * `PolymorfaConflictError` (`call_opt_out_limit`).
   */
  import(
    input: ImportCallOptOutsInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallOptOutImportResult>> {
    const entries = (input as { entries?: unknown } | null)?.entries;
    if (
      !Array.isArray(entries) ||
      entries.length === 0 ||
      entries.length > IMPORT_LIMIT
    ) {
      throw new PolymorfaValidationError(
        `entries must hold 1 to ${IMPORT_LIMIT.toLocaleString("en-US")} entries.`,
      );
    }
    return this.transport
      .request<DataEnvelope<CallOptOutImportResult>>({
        method: "POST",
        path: `${CALL_OPT_OUTS_PATH}/import`,
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }

  /** Removes one entry. The person can be called again. */
  delete(
    optOutId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallOptOutDeleted>> {
    if (typeof optOutId !== "string" || optOutId.trim().length === 0) {
      throw new PolymorfaConfigurationError(
        "A call opt-out id is required.",
        "optOutId",
      );
    }
    return this.transport
      .request<DataEnvelope<CallOptOutDeleted>>({
        method: "DELETE",
        path: `${CALL_OPT_OUTS_PATH}/${encodeURIComponent(optOutId)}`,
        ...options,
      })
      .then(unwrapResponse);
  }
}

function assertPolicyInput(input: UpdateCallPolicyInput): void {
  const codes = (input as { blockedCountryCodes?: unknown } | null)
    ?.blockedCountryCodes;
  if (!Array.isArray(codes)) {
    throw new PolymorfaValidationError("blockedCountryCodes must be an array.");
  }
  if (codes.length > COUNTRY_CODE_LIMIT) {
    throw new PolymorfaValidationError(
      `blockedCountryCodes holds at most ${COUNTRY_CODE_LIMIT} codes.`,
    );
  }
  for (const code of codes) {
    if (typeof code !== "string" || !COUNTRY_CODE.test(code)) {
      throw new PolymorfaValidationError(
        "Each blocked country code is 1 to 4 digits without +, for example 44 or 1876.",
      );
    }
  }
  const revision = input.expectedRevision;
  if (
    revision !== undefined &&
    (!Number.isSafeInteger(revision) || revision < 0)
  ) {
    throw new PolymorfaValidationError(
      "expectedRevision must be a non-negative integer.",
    );
  }
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
