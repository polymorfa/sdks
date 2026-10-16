import { PolymorfaValidationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { CursorEnvelope, DataEnvelope } from "./types.js";

/**
 * Customer-supplied campaign audience profiles (`campaigns.audience-profiles`
 * beta). Profiles belong to the team and are keyed by E.164 phone number.
 * Reads, import polling, import cancellation and deletion need
 * `campaigns:read` for reads, or `campaigns:manage` for cancellation and deletion;
 * creating, updating and starting an
 * import also need the team to be enrolled in the beta. Project tokens cannot
 * access team profiles.
 */

export type AudienceProfileSource = "api" | "csv" | "form";
export type AudienceProfileAttributeValue = string | number | boolean | null;

export interface AudienceProfileProvenance {
  readonly source: AudienceProfileSource;
  /** 1 to 128 UTF-8 bytes. */
  readonly reference: string;
}

export interface AudienceProfile {
  readonly id: string;
  /** E.164, for example `+14155550123`. */
  readonly phone: string;
  /** Send this as `expectedRevision` to update or delete the profile. */
  readonly revision: number;
  readonly tags: readonly string[];
  readonly attributes: Readonly<Record<string, AudienceProfileAttributeValue>>;
  readonly provenance: AudienceProfileProvenance | null;
  /** Unix milliseconds. */
  readonly createdAt: number;
  /** Unix milliseconds. */
  readonly updatedAt: number;
}

/** A consent assertion you supply. It never clears an opt-out. */
export interface AudienceProfileConsentInput {
  readonly purpose: "campaigns";
  readonly source: AudienceProfileSource;
  /** Reference to your evidence, 1 to 128 UTF-8 bytes. */
  readonly reference: string;
  readonly allowed: boolean;
  /** Unix milliseconds. */
  readonly assertedAt: number;
}

export interface AudienceProfileConsent extends AudienceProfileConsentInput {
  readonly id: string;
  /** The profile revision this assertion was recorded with. */
  readonly profileRevision: number;
  /** Unix milliseconds. */
  readonly createdAt: number;
}

export interface PutAudienceProfileRequest {
  /**
   * Omit only when creating a profile. Required to replace an existing profile
   * and to recreate one deleted in the last 30 days (use the revision the
   * delete returned).
   */
  readonly expectedRevision?: number;
  /** Up to 20 distinct tags of 1 to 48 UTF-8 bytes. Replaces stored tags. */
  readonly tags: readonly string[];
  /**
   * Up to 20 attributes, names matching `^[A-Za-z_][A-Za-z0-9_]{0,47}$`, at
   * most 8 KiB in total. Replaces stored attributes.
   */
  readonly attributes: Readonly<Record<string, AudienceProfileAttributeValue>>;
  /** Replaces stored provenance; omit to clear it. */
  readonly provenance?: AudienceProfileProvenance;
  /** Appends a consent assertion to the profile's history. */
  readonly consent?: AudienceProfileConsentInput;
}

export interface DeleteAudienceProfileResult {
  readonly deleted: true;
  readonly phone: string;
  /** Revision of the retained deletion record; send it to recreate within 30 days. */
  readonly revision: number;
}

export interface ListAudienceProfilesParams {
  /** `page.nextCursor` from the previous page. */
  readonly cursor?: string;
  /** Exact, case-sensitive tag. 1-48 UTF-8 bytes without control characters. */
  readonly tag?: string;
  /** `+` followed by 1-15 digits. Combined with tag before pagination. */
  readonly phonePrefix?: string;
  /** Profiles per page, 1 to 100. Defaults to 25. */
  readonly limit?: number;
}

export interface ListAudienceProfileConsentParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export type AudienceProfileImportField =
  | "phone"
  | "tags"
  | "attributes"
  | "expectedRevision"
  | "provenanceReference"
  | "consentAllowed"
  | "consentAssertedAt"
  | "consentReference";

/** Profile fields mapped to exact CSV header names; unmapped columns are ignored. */
export type AudienceProfileImportMapping = {
  readonly phone: string;
  readonly tags: string;
  readonly attributes: string;
} & Partial<
  Readonly<
    Record<
      Exclude<AudienceProfileImportField, "phone" | "tags" | "attributes">,
      string
    >
  >
>;

interface CreateAudienceProfileImportBase {
  /**
   * 1 to 128 of `A-Z a-z 0-9 . _ : -`. Repeating a key with the same file,
   * mapping and credential returns the existing job.
   */
  readonly replayKey: string;
  readonly mapping?: AudienceProfileImportMapping;
}

/** A UTF-8 CSV of at most 10 MiB and 10,000 data rows. */
export type CreateAudienceProfileImportRequest =
  CreateAudienceProfileImportBase &
    (
      | {
          /** CSV text or bytes; the SDK encodes it as padded base64. */
          readonly csv: string | Uint8Array;
          readonly csvBase64?: never;
        }
      | {
          /** The CSV already encoded as standard padded base64. */
          readonly csvBase64: string;
          readonly csv?: never;
        }
    );

export type AudienceProfileImportState = "queued" | "completed" | "cancelled";

export interface AudienceProfileImportRowSample {
  /** CSV row number; the header is row 1. */
  readonly row: number;
  /** For example `invalid_phone`, `invalid_profile` or `duplicate_phone`. */
  readonly reason: string;
}

export interface AudienceProfileImportConflictSample {
  readonly row: number;
  readonly reason: "quota" | "revision_conflict";
}

/** Aggregate import report; it never contains submitted phones or values. */
export interface AudienceProfileImport {
  readonly id: string;
  readonly state: AudienceProfileImportState;
  /** Rows that passed validation and will be written. */
  readonly totalValid: number;
  readonly invalidCount: number;
  /** Up to 20 refused rows. */
  readonly invalidSamples: readonly AudienceProfileImportRowSample[];
  /** Up to 20 valid rows not written. */
  readonly conflictSamples: readonly AudienceProfileImportConflictSample[];
  /** Valid rows written so far. */
  readonly processedValid: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly conflictCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

export type AudienceProfilesEnvelope = CursorEnvelope<AudienceProfile>;
export type AudienceProfileConsentEnvelope =
  CursorEnvelope<AudienceProfileConsent>;

const PROFILES = "/platform/audience-profiles";
const IMPORTS = "/platform/audience-profile-imports";

export class AudienceProfilesResource {
  constructor(private readonly transport: HttpTransport) {}

  /** One cursor page of the team's profiles. */
  list(
    params: ListAudienceProfilesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceProfilesEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: PROFILES,
      query: {
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.tag === undefined ? {} : { tag: params.tag }),
        ...(params.phonePrefix === undefined
          ? {}
          : { phonePrefix: params.phonePrefix }),
      },
      ...options,
    });
  }

  retrieve(
    phone: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    return this.transport.request({
      method: "GET",
      path: profilePath(phone),
      ...options,
    });
  }

  /**
   * Create or replace a profile. A stale or missing `expectedRevision` for an
   * existing profile returns 409; read it again before retrying.
   */
  put(
    phone: string,
    body: PutAudienceProfileRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    return this.transport.request({
      method: "PUT",
      path: profilePath(phone),
      body,
      ...options,
    });
  }

  /**
   * Delete a profile at its current revision. Removes its tags, attributes,
   * consent assertions and audience memberships; opt-outs are kept.
   */
  delete(
    phone: string,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<DeleteAudienceProfileResult>>> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw invalid("expectedRevision must be a positive integer");
    return this.transport.request({
      method: "DELETE",
      path: profilePath(phone),
      query: { expectedRevision },
      ...options,
    });
  }

  /** One cursor page of a profile's consent assertions, oldest first. */
  listConsent(
    phone: string,
    params: ListAudienceProfileConsentParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceProfileConsentEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: `${profilePath(phone)}/consent`,
      query: {
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  /**
   * Queue a CSV import. Only one import per team can be queued or running.
   * Poll {@link retrieveImport} until `state` is no longer `queued`.
   */
  createImport(
    request: CreateAudienceProfileImportRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImport>>> {
    const csvBase64 =
      request.csvBase64 ?? encodeBase64(request.csv as string | Uint8Array);
    return this.transport.request({
      method: "POST",
      path: IMPORTS,
      body: {
        replayKey: request.replayKey,
        csvBase64,
        ...(request.mapping === undefined ? {} : { mapping: request.mapping }),
      },
      ...options,
    });
  }

  retrieveImport(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImport>>> {
    return this.transport.request({
      method: "GET",
      path: importPath(jobId),
      ...options,
    });
  }

  /** Cancel the remaining rows. Batches already written stay. */
  cancelImport(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImport>>> {
    return this.transport.request({
      method: "DELETE",
      path: importPath(jobId),
      ...options,
    });
  }
}

function invalid(message: string): PolymorfaValidationError {
  return new PolymorfaValidationError(message, { code: "invalid_parameter" });
}

function profilePath(phone: string): string {
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone))
    throw invalid("phone must be E.164, for example +14155550123");
  return `${PROFILES}/${encodeURIComponent(phone)}`;
}

function importPath(jobId: string): string {
  if (!jobId) throw invalid("jobId is required");
  return `${IMPORTS}/${encodeURIComponent(jobId)}`;
}

/** Standard padded base64 without relying on Node's Buffer. */
export function encodeBase64(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
