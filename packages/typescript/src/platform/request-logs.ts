import {
  PolymorfaConfigurationError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  RequestOptions,
  ResponseMetadata,
} from "../transport/types.js";

export type RequestLogSource = "api" | "mcp";
export type RequestLogCredentialType =
  "team_key" | "project_token" | "client_token";
export type RequestLogMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One API or MCP request made to a project. */
export interface RequestLog {
  readonly id: string;
  readonly projectId: string;
  /** RFC 3339 time the request was recorded. */
  readonly createdAt: string;
  readonly method: string;
  /** Matched route pattern, for example `/messaging/:session/messages`. */
  readonly route: string;
  readonly status: number | null;
  readonly durationMs: number | null;
  readonly result: "success" | "failure";
  readonly source: RequestLogSource;
  /** The `X-Request-Id` response header. */
  readonly requestId: string | null;
  /** W3C trace ID, also returned as the `X-Trace-Id` response header. */
  readonly traceId: string | null;
  readonly errorCode: string | null;
  readonly mcpTool: string | null;
  /** Null when the key or token no longer exists. */
  readonly credential: {
    readonly type: RequestLogCredentialType;
    /** Null for client tokens, which have no listed record. */
    readonly id: string | null;
    readonly last4: string | null;
  } | null;
}

export interface RequestLogFilters {
  /** HTTP status codes or classes, for example `[404, "5xx"]`. */
  readonly status?: readonly (
    number | `${1 | 2 | 3 | 4 | 5}xx` | `${number}`
  )[];
  readonly method?: readonly RequestLogMethod[];
  /** Exact route pattern, for example `/messaging/:session/messages`. */
  readonly route?: string;
  readonly source?: RequestLogSource;
  /** ID of the team key or project token that made the request. */
  readonly credentialId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly since?: string | Date;
  readonly until?: string | Date;
}

interface ProjectSelection {
  /** Required on a team client; a project client uses its own project. */
  readonly projectId?: string;
}

export interface ListRequestLogsParams
  extends RequestLogFilters, ProjectSelection {
  /** Requests per page, 1 to 100. */
  readonly limit?: number;
  /** `nextCursor` from an earlier page, for older requests. Excludes filters. */
  readonly cursor?: string;
}

export interface FollowRequestLogsParams extends ProjectSelection {
  /** `followCursor` from an earlier page. */
  readonly after: string;
  readonly limit?: number;
}

export interface TailRequestLogsParams
  extends RequestLogFilters, ProjectSelection {
  /** Milliseconds between polls when no new requests arrived. Default 2000, 1000 to 60000. */
  readonly intervalMs?: number;
  /** Recent requests to yield before following, oldest first. Default 0, at most 100. */
  readonly backfill?: number;
  readonly signal?: AbortSignal;
}

/** One page of the request log. */
export interface RequestLogPage {
  readonly items: readonly RequestLog[];
  readonly hasMore: boolean;
  /** Pass as `cursor` for older requests. */
  readonly nextCursor: string | null;
  /** Pass as `after` for newer requests. Valid for 24 hours. */
  readonly followCursor: string;
  readonly metadata: ResponseMetadata;
}

const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60_000;

/** Read and follow a project's API request log (`logs:read`). */
export class RequestLogsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {}

  /** Newest first. Use `nextCursor` for older requests and `followCursor` to follow. */
  async list(
    params: ListRequestLogsParams = {},
    options: RequestOptions = {},
  ): Promise<RequestLogPage> {
    const { projectId, limit, cursor, ...filters } = params;
    if (cursor !== undefined && hasFilters(filters)) {
      throw new PolymorfaValidationError(
        "cursor keeps the filters of the page that returned it; do not combine it with filters.",
      );
    }
    return this.read(
      projectId,
      {
        ...filterQuery(filters),
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
      },
      options,
    );
  }

  /** Requests recorded after `after`, oldest first. */
  follow(
    params: FollowRequestLogsParams,
    options: RequestOptions = {},
  ): Promise<RequestLogPage> {
    return this.read(
      params.projectId,
      {
        after: params.after,
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      options,
    );
  }

  /**
   * Yields new requests as they are recorded, oldest first, until `signal`
   * aborts. Polls every `intervalMs` while idle, reads again at once while
   * more requests are waiting, and waits for `Retry-After` on a rate limit.
   */
  async *tail(
    params: TailRequestLogsParams = {},
    options: RequestOptions = {},
  ): AsyncGenerator<RequestLog, void, undefined> {
    const {
      intervalMs = 2_000,
      backfill = 0,
      signal,
      projectId,
      ...filters
    } = params;
    if (
      !Number.isInteger(intervalMs) ||
      intervalMs < MIN_INTERVAL_MS ||
      intervalMs > MAX_INTERVAL_MS
    ) {
      throw new PolymorfaValidationError(
        `intervalMs must be an integer from ${MIN_INTERVAL_MS} to ${MAX_INTERVAL_MS}.`,
      );
    }
    if (!Number.isInteger(backfill) || backfill < 0 || backfill > 100) {
      throw new PolymorfaValidationError(
        "backfill must be an integer from 0 to 100.",
      );
    }
    const requestOptions =
      signal === undefined ? options : { ...options, signal };
    const first = await this.withRateLimit(
      () =>
        this.list(
          {
            ...filters,
            ...(projectId === undefined ? {} : { projectId }),
            limit: Math.max(backfill, 1),
          },
          requestOptions,
        ),
      signal,
    );
    if (first === undefined) return;
    if (backfill > 0) yield* [...first.items].reverse();
    let after = first.followCursor;
    while (!signal?.aborted) {
      const page = await this.withRateLimit(
        () =>
          this.follow(
            {
              after,
              limit: 100,
              ...(projectId === undefined ? {} : { projectId }),
            },
            requestOptions,
          ),
        signal,
      );
      if (page === undefined) return;
      yield* page.items;
      after = page.followCursor;
      if (!page.hasMore && !(await sleep(intervalMs, signal))) return;
    }
  }

  private async withRateLimit<T>(
    read: () => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T | undefined> {
    for (;;) {
      if (signal?.aborted) return undefined;
      try {
        return await read();
      } catch (error) {
        if (signal?.aborted) return undefined;
        if (!(error instanceof PolymorfaRateLimitError)) throw error;
        const seconds = Number(error.metadata?.headers["retry-after"]);
        const waitMs =
          Number.isFinite(seconds) && seconds > 0
            ? seconds * 1_000
            : MAX_INTERVAL_MS;
        if (!(await sleep(Math.min(waitMs, MAX_INTERVAL_MS * 5), signal)))
          return undefined;
      }
    }
  }

  private async read(
    projectId: string | undefined,
    query: Record<string, string | number>,
    options: RequestOptions,
  ): Promise<RequestLogPage> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: `/platform/projects/${encodeURIComponent(this.project(projectId))}/request-logs`,
      query,
      ...options,
    });
    return decodePage(response);
  }

  private project(projectId: string | undefined): string {
    if (this.projectId !== null) {
      if (projectId !== undefined && projectId !== this.projectId) {
        throw new PolymorfaValidationError(
          "This client reads only its own project's request log.",
        );
      }
      return this.projectId;
    }
    if (projectId === undefined || projectId === "") {
      throw new PolymorfaConfigurationError(
        "projectId is required to read a request log with a team key.",
        "projectId",
      );
    }
    return projectId;
  }
}

function hasFilters(filters: RequestLogFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

function filterQuery(filters: RequestLogFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.status?.length)
    query.status = filters.status.map(String).join(",");
  if (filters.method?.length) query.method = filters.method.join(",");
  if (filters.route !== undefined) query.route = filters.route;
  if (filters.source !== undefined) query.source = filters.source;
  if (filters.credentialId !== undefined)
    query.credentialId = filters.credentialId;
  if (filters.requestId !== undefined) query.requestId = filters.requestId;
  if (filters.traceId !== undefined) query.traceId = filters.traceId;
  if (filters.since !== undefined) query.since = timestamp(filters.since);
  if (filters.until !== undefined) query.until = timestamp(filters.until);
  return query;
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function decodePage(response: ApiResponse<unknown>): RequestLogPage {
  const body = response.data as {
    data?: unknown;
    page?: { nextCursor?: unknown; hasMore?: unknown; followCursor?: unknown };
  } | null;
  const page = body?.page;
  if (
    !Array.isArray(body?.data) ||
    typeof page?.hasMore !== "boolean" ||
    typeof page.followCursor !== "string" ||
    (page.nextCursor !== null && typeof page.nextCursor !== "string")
  ) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid request log page.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        metadata: response.metadata,
        details: response.data,
      },
    );
  }
  return Object.freeze({
    items: Object.freeze([...(body.data as RequestLog[])]),
    hasMore: page.hasMore,
    nextCursor: (page.nextCursor as string | null) ?? null,
    followCursor: page.followCursor,
    metadata: response.metadata,
  });
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
