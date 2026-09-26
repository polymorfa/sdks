import type {
  VoipCallReportClient,
  VoipCallErrorCode,
} from "../messaging/types.js";
import {
  PolymorfaConfigurationError,
  PolymorfaServerError,
} from "../errors.js";
import { CursorPage } from "../pagination.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";
import type { ClientOwner } from "./developer-types.js";
import {
  type DataEnvelope,
  decodeCursorPage,
  unwrapResponse,
} from "./response.js";

export type CallDirection = "inbound" | "outbound";
/** How the number connects to WhatsApp. */
export type CallUpstream = "linked_device" | "cloud_api";
/**
 * How the call went. `answered`: media connected, including answered calls
 * still in progress. `declined`: declined by a participant or the other
 * party, or the line was busy. `missed`: nobody answered before ringing
 * stopped or the caller hung up. `failed`: ended before it connected for any
 * other reason. `in_progress`: still ringing.
 */
export type CallOutcome =
  "answered" | "missed" | "declined" | "failed" | "in_progress";
/** Call state. `offered` and `accepted` calls may still be live. */
export type CallRecordState =
  "offered" | "accepted" | "rejected" | "missed" | "ended";
export type CallStatsGroupBy = "day" | "hour" | "session" | "outcome";
export type CallExportFormat = "csv" | "ndjson";

/** One call detail record. The other party appears only as `peerRef`. */
export interface CallRecord {
  readonly callId: string;
  /** Owning project when known, preserved after the number is deleted. */
  readonly projectId: string | null;
  /** Session name of the number that placed or received the call. */
  readonly sessionId: string;
  readonly direction: CallDirection;
  readonly upstream: CallUpstream;
  readonly outcome: CallOutcome;
  readonly state: CallRecordState;
  readonly hasVideo: boolean;
  /**
   * Team-specific pseudonym of the other party: the same party has the same
   * value across your team's calls. Never a phone number. `null` when unknown.
   */
  readonly peerRef: string | null;
  readonly startedAt: string;
  readonly connectedAt: string | null;
  readonly endedAt: string | null;
  /** Connected seconds; 0 for a call that never connected, `null` until it ends. */
  readonly durationSeconds: number | null;
  /** Such as `user_hangup` or `ring_timeout`; `null` until the call ends. */
  readonly endReason: string | null;
}

/** Customer-understandable end or failure reason. */
export interface CallRecordEndReason {
  /**
   * Stable reason code. A well-formed code this API does not label is kept
   * as is (with the label `Other`); only a malformed value becomes `other`.
   */
  code: string;
  label: string;
}

/** One public roster participant, as call.participant_* webhooks name it. */
export interface CallRecordParticipant {
  /** Public participant resource id. */
  id: string;
  state: "invited" | "ringing" | "connected" | "left";
  firstSeenAt: string;
  updatedAt: string;
  leftReason: string | null;
}

/** One client media connection and its recorded lifetime. */
export interface CallRecordConnection {
  id: string;
  /** `client:<id>` or `server:<id>`. */
  participant: string;
  /** `unknown` when the join was not recorded. */
  transport: "webrtc" | "socket" | "sip" | "unknown";
  /** Null when the join was not recorded. */
  joinedAt: string | null;
  /** Null while the connection is open, or when the end time is unknown. */
  leftAt: string | null;
  reason:
    | "left"
    | "replaced"
    | "claimed"
    | "call_ended"
    | "sip_busy"
    | "sip_declined"
    | "sip_no_answer"
    | "sip_unavailable"
    | "sip_auth_failed"
    | null;
}

/** Allowlisted media measurements. Unmeasured values are null, never 0. */
export interface CallRecordTelemetry {
  /** `unknown` until the media server reports the call's measurements. */
  status: "reported" | "unknown";
  source: "media_server";
  setupMs: number | null;
  ringMs: number | null;
  codec: string | null;
  jitterMs: number | null;
  packetsLost: number | null;
  rttMs: number | null;
  receivedKbps: number | null;
  sentKbps: number | null;
}

/** The latest quality report one connection's app sent. Unmeasured figures are null. */
export interface CallRecordAppQuality {
  reportedAt: string;
  rttMs: number | null;
  jitterMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  candidateType: "host" | "srflx" | "prflx" | "relay" | null;
  reconnects: number | null;
}

/** Diagnostics reported by the app behind one connection. */
export interface CallRecordAppConnection {
  connectionId: string;
  /** `client:<id>` or `server:<id>`. */
  participant: string;
  /** The SDK named by the connection's most recent report, when it named one. */
  client: VoipCallReportClient | null;
  quality: CallRecordAppQuality | null;
  /** Reported errors, newest first. */
  errors: Array<{ code: VoipCallErrorCode; reportedAt: string }>;
}

/** Diagnostics your app reported with `POST /voip/calls/{id}/reports`. */
export interface CallRecordAppReports {
  /** `none` when no report was received for the call. */
  status: "reported" | "none";
  connections: CallRecordAppConnection[];
  /** True when the call reached the stored report limit or older errors are not shown. */
  truncated: boolean;
}

/** A call summary in the stored detail. */
export interface CallRecordSummary {
  callId: string;
  sessionId: string;
  projectId: string | null;
  direction: "inbound" | "outbound";
  state: "offered" | "accepted" | "rejected" | "missed" | "ended";
  /** The call may still have a live media leg. */
  live: boolean;
  /** How the number reaches WhatsApp for this call. */
  backend: string;
  hasVideo: boolean;
  /** Per-team pseudonym of the remote party. */
  peerRef: string | null;
  startedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: CallRecordEndReason | null;
  answeredBy: string | null;
  exclusive: boolean | null;
}

/** `GET /platform/calls/{callId}`. */
export interface CallRecordDetail {
  call: CallRecordSummary;
  participants: CallRecordParticipant[];
  connections: CallRecordConnection[];
  telemetry: CallRecordTelemetry;
  appReports: CallRecordAppReports;
  history: {
    /** Recorded events, oldest first, as correlation identifiers. */
    events: Array<{ eventId: string; type: string; occurredAt: string }>;
    truncated: boolean;
  };
  correlation: { callId: string; sessionId: string };
}

export interface CallStatsMetrics {
  /** Calls that started in the range. */
  readonly calls: number;
  readonly answered: number;
  readonly missed: number;
  readonly declined: number;
  readonly failed: number;
  /** Calls still ringing. */
  readonly inProgress: number;
  /** `answered` divided by calls no longer ringing (four decimals), or `null` when there are none. */
  readonly answerRate: number | null;
  /** Connected seconds of answered calls. */
  readonly totalDurationSeconds: number;
  /** Mean connected seconds of ended answered calls (one decimal), or `null` when there are none. */
  readonly averageDurationSeconds: number | null;
}

export interface CallStatsGroup extends CallStatsMetrics {
  /**
   * Local date (`2026-09-18`) for `day`, local hour (`2026-09-18T14:00`) for
   * `hour`, session name for `session`, or the outcome for `outcome`.
   */
  readonly key: string;
  /** Start of the day or hour bucket; `null` for `session` and `outcome` groups. */
  readonly start: string | null;
}

export interface CallStatsHeatmapCell {
  /** ISO day of week in `timezone`: 1 is Monday, 7 is Sunday. */
  readonly dayOfWeek: number;
  /** Hour of day in `timezone`, 0 to 23. */
  readonly hour: number;
  readonly calls: number;
  readonly answered: number;
}

export interface CallStats {
  readonly since: string;
  readonly until: string;
  readonly timezone: string;
  readonly groupBy: CallStatsGroupBy;
  readonly totals: CallStatsMetrics;
  readonly groups: readonly CallStatsGroup[];
  /** True when a `session` grouping left out numbers beyond the first 500. Totals still count every call. */
  readonly groupsTruncated: boolean;
  /** 168 cells, Monday 00:00 first. */
  readonly heatmap: readonly CallStatsHeatmapCell[];
}

/** Filters shared by call statistics, call records and the export. */
export interface CallFilters {
  /** Session name of one number (1 to 128 characters). */
  readonly sessionId?: string;
  readonly direction?: CallDirection;
  readonly upstream?: CallUpstream;
  readonly outcome?: CallOutcome;
  /** Include calls that started at or after this time. */
  readonly since?: string | Date;
  /** Include calls that started before this time. */
  readonly until?: string | Date;
}

export interface CallStatsParams extends CallFilters {
  /** Defaults to `day`. `day` covers at most 366 days, `hour` at most 31. */
  readonly groupBy?: CallStatsGroupBy;
  /** IANA time zone name for day and hour buckets and the heatmap. Defaults to `UTC`. */
  readonly timezone?: string;
}

export interface ListCallRecordsParams extends CallFilters {
  /** 1 to 100; the API default is 25. */
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ExportCallRecordsParams extends CallFilters {
  /** Defaults to `csv`. */
  readonly format?: CallExportFormat;
  /** Records per page, 1 to 1,000; the API default is 1,000. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. Send the same filters. */
  readonly cursor?: string;
}

/** Team clients may name a project; omitting it covers every project. */
interface TeamProjectFilter {
  readonly projectId?: string;
}

type ParamsFor<O extends ClientOwner, P> = O extends "project"
  ? P
  : P & TeamProjectFilter;

export type RetrieveCallRecordParamsFor<O extends ClientOwner> =
  O extends "project" ? { readonly projectId?: never } : TeamProjectFilter;

export type CallStatsParamsFor<O extends ClientOwner> = ParamsFor<
  O,
  CallStatsParams
>;
export type ListCallRecordsParamsFor<O extends ClientOwner> = ParamsFor<
  O,
  ListCallRecordsParams
>;
export type ExportCallRecordsParamsFor<O extends ClientOwner> = ParamsFor<
  O,
  ExportCallRecordsParams
>;

/** One page of exported call records. */
export interface CallRecordExportPage {
  readonly format: CallExportFormat;
  /**
   * CSV with a header row and CRLF line endings, or one JSON call record per
   * line for `ndjson`.
   */
  readonly body: string;
  /** Cursor of the next page, or `null` on the last page. */
  readonly nextCursor: string | null;
}

const DIRECTIONS: readonly CallDirection[] = ["inbound", "outbound"];
const UPSTREAMS: readonly CallUpstream[] = ["linked_device", "cloud_api"];
const OUTCOMES: readonly CallOutcome[] = [
  "answered",
  "missed",
  "declined",
  "failed",
  "in_progress",
];
const GROUP_BY: readonly CallStatsGroupBy[] = [
  "day",
  "hour",
  "session",
  "outcome",
];
const FORMATS: readonly CallExportFormat[] = ["csv", "ndjson"];
const CONTENT_TYPES: Readonly<Record<CallExportFormat, string>> = {
  csv: "text/csv",
  ndjson: "application/x-ndjson",
};

/**
 * Call analytics and call detail records (`sessions:read`). Team clients
 * cover every project unless they pass `projectId`; project clients read
 * their own project.
 */
export class PlatformCallsResource<O extends ClientOwner> {
  readonly #raw: RawClient;

  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {
    this.#raw = new RawClient(transport);
  }

  /** Read one stored call with bounded, metadata-only history and diagnostics. */
  retrieve(
    callId: string,
    params: RetrieveCallRecordParamsFor<O> = {} as RetrieveCallRecordParamsFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallRecordDetail>> {
    if (typeof callId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(callId)) {
      throw new PolymorfaConfigurationError(
        "callId must contain 1 to 128 letters, digits, underscores or hyphens.",
        "callId",
      );
    }
    return this.transport
      .request<DataEnvelope<CallRecordDetail>>({
        method: "GET",
        path: `/platform/calls/${encodeURIComponent(callId)}`,
        query: this.#filters(params),
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Call volume, outcomes, answer rate and connected duration for a time
   * range, grouped by day, hour, number or outcome, with an hour-of-week
   * heatmap. Without `since` and `until` the range is the last 7 days.
   */
  stats(
    params: CallStatsParamsFor<O> = {} as CallStatsParamsFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallStats>> {
    const query = this.#filters(params);
    const { groupBy, timezone } = params as CallStatsParams;
    if (groupBy !== undefined) {
      query.groupBy = oneOf(groupBy, GROUP_BY, "groupBy");
    }
    if (timezone !== undefined) {
      query.timezone = text(timezone, "timezone", 64);
    }
    return this.transport
      .request<DataEnvelope<CallStats>>({
        method: "GET",
        path: "/platform/calls/stats",
        query,
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Call detail records, newest first. Iterate the returned page with
   * `for await` to read every matching record.
   */
  list(
    params: ListCallRecordsParamsFor<O> = {} as ListCallRecordsParamsFor<O>,
    options: RequestOptions = {},
  ): Promise<CursorPage<CallRecord>> {
    const query = this.#filters(params);
    const { limit, cursor } = params as ListCallRecordsParams;
    if (limit !== undefined) query.limit = integer(limit, "limit", 1, 100);
    if (cursor !== undefined) query.cursor = text(cursor, "cursor", 256);
    return this.#raw.paginate<CallRecord>(
      { method: "GET", path: "/platform/calls", query, ...options },
      decodeCursorPage<CallRecord>,
    );
  }

  /**
   * One page of up to 1,000 call records as CSV or newline-delimited JSON.
   * Pass `nextCursor` back as `cursor`, with the same filters, for the next
   * page. `exportAll` walks every page for you.
   */
  export(
    params: ExportCallRecordsParamsFor<O> = {} as ExportCallRecordsParamsFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CallRecordExportPage>> {
    const query = this.#filters(params);
    const { format, limit, cursor } = params as ExportCallRecordsParams;
    const resolved =
      format === undefined ? "csv" : oneOf(format, FORMATS, "format");
    query.format = resolved;
    if (limit !== undefined) query.limit = integer(limit, "limit", 1, 1000);
    if (cursor !== undefined) query.cursor = text(cursor, "cursor", 256);
    return this.transport
      .requestText(
        { method: "GET", path: "/platform/calls/export", query, ...options },
        CONTENT_TYPES[resolved],
      )
      .then((response) => {
        const contentType = response.metadata.headers["content-type"];
        if (
          contentType?.split(";", 1)[0]?.trim().toLowerCase() !==
          CONTENT_TYPES[resolved]
        ) {
          throw new PolymorfaServerError(
            "The Polymorfa API returned an unexpected call export content type.",
            {
              code: "invalid_response",
              status: response.metadata.status,
              ...(response.metadata.requestId === undefined
                ? {}
                : { requestId: response.metadata.requestId }),
              metadata: response.metadata,
            },
          );
        }
        if (typeof response.data !== "string") {
          throw new PolymorfaServerError(
            "The Polymorfa API returned an invalid export body.",
            {
              code: "invalid_response",
              status: response.metadata.status,
              ...(response.metadata.requestId === undefined
                ? {}
                : { requestId: response.metadata.requestId }),
              metadata: response.metadata,
            },
          );
        }
        const next = response.metadata.headers["polymorfa-next-cursor"];
        return Object.freeze({
          data: Object.freeze({
            format: resolved,
            body: response.data,
            nextCursor: next === undefined || next === "" ? null : next,
          }),
          metadata: response.metadata,
        });
      });
  }

  /**
   * Yields the body of every export page in order, starting at
   * `params.cursor` when given. CSV pages after the first omit their header
   * row, so the concatenated chunks form one CSV document.
   */
  async *exportAll(
    params: ExportCallRecordsParamsFor<O> = {} as ExportCallRecordsParamsFor<O>,
    options: RequestOptions = {},
  ): AsyncGenerator<string, void, undefined> {
    let cursor = (params as ExportCallRecordsParams).cursor;
    let first = true;
    // Cursors already requested. A page whose next cursor is one of these is
    // rejected before its body is yielded, so a replayed page never reaches
    // the consumer's output.
    const seen = new Set<string>(cursor === undefined ? [] : [cursor]);
    while (true) {
      const { data, metadata } = await this.export(
        { ...params, ...(cursor === undefined ? {} : { cursor }) },
        options,
      );
      if (data.nextCursor !== null && seen.has(data.nextCursor)) {
        throw new PolymorfaServerError(
          "The Polymorfa API repeated an export cursor.",
          {
            code: "invalid_response",
            status: metadata.status,
            ...(metadata.requestId === undefined
              ? {}
              : { requestId: metadata.requestId }),
            metadata,
          },
        );
      }
      const body =
        !first && data.format === "csv" ? withoutHeader(data.body) : data.body;
      first = false;
      if (body.length > 0) yield body;
      if (data.nextCursor === null) return;
      seen.add(data.nextCursor);
      cursor = data.nextCursor;
    }
  }

  #filters(
    params: CallFilters & TeamProjectFilter,
  ): Record<string, QueryValue> {
    if (typeof params !== "object" || params === null) {
      throw new PolymorfaConfigurationError(
        "Call filters must be an object.",
        "params",
      );
    }
    const query: Record<string, QueryValue> = {};
    if (this.projectId !== null) {
      if (
        params.projectId !== undefined &&
        params.projectId !== this.projectId
      ) {
        throw new PolymorfaConfigurationError(
          "A project client reads only its own project's calls.",
          "projectId",
        );
      }
      query.projectId = this.projectId;
    } else if (params.projectId !== undefined) {
      query.projectId = text(params.projectId, "projectId", 64);
    }
    if (params.sessionId !== undefined) {
      query.sessionId = text(params.sessionId, "sessionId", 128);
    }
    if (params.direction !== undefined) {
      query.direction = oneOf(params.direction, DIRECTIONS, "direction");
    }
    if (params.upstream !== undefined) {
      query.upstream = oneOf(params.upstream, UPSTREAMS, "upstream");
    }
    if (params.outcome !== undefined) {
      query.outcome = oneOf(params.outcome, OUTCOMES, "outcome");
    }
    if (params.since !== undefined) {
      query.since = timestamp(params.since, "since");
    }
    if (params.until !== undefined) {
      query.until = timestamp(params.until, "until");
    }
    return query;
  }
}

function withoutHeader(body: string): string {
  const end = body.indexOf("\n");
  return end === -1 ? "" : body.slice(end + 1);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new PolymorfaConfigurationError(
      `${field} must be one of ${allowed.join(", ")}.`,
      field,
    );
  }
  return value as T;
}

function text(value: unknown, field: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new PolymorfaConfigurationError(
      `${field} must be a non-empty string of at most ${maxLength} characters.`,
      field,
    );
  }
  return value;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PolymorfaConfigurationError(
      `${field} must be an integer from ${minimum} to ${maximum}.`,
      field,
    );
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new PolymorfaConfigurationError(
        `${field} must be a valid date.`,
        field,
      );
    }
    return value.toISOString();
  }
  if (typeof value !== "string" || !isIsoDateTime(value)) {
    throw new PolymorfaConfigurationError(
      `${field} must be an ISO 8601 date-time with a time zone, such as 2026-09-01T00:00:00Z, or a Date.`,
      field,
    );
  }
  return value;
}

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

/**
 * An RFC 3339 date-time (`2026-09-01T00:00:00Z`, `2026-09-01T09:30:00.5+03:00`)
 * naming a real calendar instant. Date-only values and other strings that
 * `Date.parse` tolerates are refused, as the API refuses them.
 */
function isIsoDateTime(value: string): boolean {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const part = (index: number): number => Number(match[index] ?? 0);
  const [year, month, day] = [part(1), part(2), part(3)];
  const [hour, minute, second] = [part(4), part(5), part(6)];
  const [offsetHour, offsetMinute] = [part(7), part(8)];
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  const daysInMonth = lastDay.getUTCDate();
  return (
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
