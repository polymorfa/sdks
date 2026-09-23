import { HttpTransport } from "../transport/http.js";
import {
  assertServerRuntime,
  validateClientCredential,
  type ClientCredential,
  type SharedClientOptions,
} from "../credentials.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/**
 * How long Polymorfa keeps a team's call data: `short` (7 days), `standard`
 * (30 days), `extended` (90 days, the default), `compliance` (365 days), or
 * `custom` (the number of days in `retentionDays`).
 */
export type CallRetentionPolicy =
  "short" | "standard" | "extended" | "compliance" | "custom";

/** A team's call data retention. */
export interface CallRetention {
  readonly policy: CallRetentionPolicy;
  /**
   * Days Polymorfa keeps the team's call data, from 1 to 2555. Deletion of
   * older call data starts on a date Polymorfa announces; until then the
   * setting records a choice and nothing is deleted. Defaults to 90.
   */
  readonly retentionDays: number;
  /**
   * The call data the period applies to, such as `call_records`,
   * `call_events`, and `client_reports`. New kinds of call data are added to
   * this list and follow the same period.
   */
  readonly appliesTo: readonly string[];
  /** Increases on every change; 0 while the team uses the default. */
  readonly revision: number;
  /** When the setting last changed, or `null` while the team uses the default. */
  readonly updatedAt: string | null;
}

interface UpdateCallRetentionFields {
  /**
   * Apply the update only if the setting still has this `revision` (0 for a
   * team on the default). Otherwise the update fails with `state_conflict`.
   * Omit it to apply the update without a revision check (last write wins).
   */
  readonly expectedRevision?: number;
}

/**
 * A new call data retention. `custom` requires `retentionDays`; a named
 * policy sets its own period, so `retentionDays` is optional there.
 */
export type UpdateCallRetentionRequest =
  | (UpdateCallRetentionFields & {
      /** Keep call data for the number of days in `retentionDays`. */
      readonly policy: "custom";
      /** A whole number of days from 1 to 2555. */
      readonly retentionDays: number;
    })
  | (UpdateCallRetentionFields & {
      /** A named policy sets its own period. */
      readonly policy: Exclude<CallRetentionPolicy, "custom">;
      /**
       * Omit it or send exactly that policy's period; any other value fails
       * with `invalid_parameter`.
       */
      readonly retentionDays?: number;
    });

const PATH = "/platform/call-retention";

/** A team-wide retention request does not need a project ID, even for a project token. */
export interface TeamCallRetentionClientOptions extends SharedClientOptions {
  readonly credential: ClientCredential;
}

/**
 * Creates only the team-wide call retention resource. Use this entrypoint
 * when a project token has no project ID; project-scoped Client methods still
 * require an explicit project ID.
 */
export function createTeamCallRetentionClient(
  options: TeamCallRetentionClientOptions,
): CallRetentionResource {
  const credential = validateClientCredential(options.credential);
  assertServerRuntime();
  return new CallRetentionResource(
    new HttpTransport({
      baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
      authorization: `Bearer ${credential.value}`,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxNetworkRetries: options.maxNetworkRetries ?? 2,
      ...(options.apiVersion === undefined
        ? {}
        : { apiVersion: options.apiVersion }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    }),
  );
}

/**
 * The team's call data retention. It is one setting per team: project clients
 * read the same value as their team. Changing it requires a team API key.
 */
export class CallRetentionResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Returns the saved setting, or the default when the team never saved one. */
  retrieve(options: RequestOptions = {}): Promise<ApiResponse<CallRetention>> {
    return this.transport
      .request<DataEnvelope<CallRetention>>({
        method: "GET",
        path: PATH,
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Replaces the team's call data retention. Requires a team API key; project
   * tokens receive `PolymorfaAuthorizationError`.
   *
   * Once deletion runs, a shorter period also applies to call data already
   * stored, and deleted data cannot be recovered. Until Polymorfa announces
   * that deletion has started, saving a period deletes nothing.
   */
  update(
    input: UpdateCallRetentionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallRetention>> {
    return this.transport
      .request<DataEnvelope<CallRetention>>({
        method: "PUT",
        path: PATH,
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }
}
