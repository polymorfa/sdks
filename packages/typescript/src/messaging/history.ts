import { CursorPage } from "../pagination.js";
import { PolymorfaServerError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";

interface HistoryEnvelope<T> {
  readonly data: readonly T[];
  readonly nextCursor: string | null;
  readonly previousCursor: string | null;
}

/**
 * A page of stored history. Iterating with `for await` follows `nextCursor`
 * through every later page; `previousPage()` walks back toward the start.
 */
export class HistoryPage<T> extends CursorPage<T> {
  readonly previousCursor: string | undefined;
  /** Data region that served the page (`Polymorfa-Data-Region`). */
  readonly dataRegion: string | undefined;
  readonly #loadPrevious: (() => Promise<HistoryPage<T>>) | undefined;

  constructor(options: {
    readonly items: readonly T[];
    readonly nextCursor?: string;
    readonly previousCursor?: string;
    readonly response: ApiResponse<unknown>;
    readonly loadNext?: () => Promise<HistoryPage<T>>;
    readonly loadPrevious?: () => Promise<HistoryPage<T>>;
  }) {
    super(options);
    this.previousCursor = options.previousCursor;
    this.dataRegion = headerValue(
      options.response.metadata.headers,
      "polymorfa-data-region",
    );
    this.#loadPrevious = options.loadPrevious;
  }

  override async nextPage(): Promise<HistoryPage<T> | null> {
    return (await super.nextPage()) as HistoryPage<T> | null;
  }

  get hasPrevious(): boolean {
    return this.previousCursor !== undefined;
  }

  async previousPage(): Promise<HistoryPage<T> | null> {
    return this.#loadPrevious === undefined ? null : this.#loadPrevious();
  }
}

function headerValue(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  for (const [key, value] of Object.entries(headers))
    if (key.toLowerCase() === name) return value;
  return undefined;
}

export function isoTime(value: string | Date | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : value;
}

function decode<T>(response: ApiResponse<unknown>): HistoryEnvelope<T> {
  const body = response.data as Partial<HistoryEnvelope<T>> | null;
  if (!body || !Array.isArray(body.data)) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid history page.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        ...(response.metadata.requestId === undefined
          ? {}
          : { requestId: response.metadata.requestId }),
        metadata: response.metadata,
        details: response.data,
      },
    );
  }
  return {
    data: body.data,
    nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
    previousCursor:
      typeof body.previousCursor === "string" ? body.previousCursor : null,
  };
}

export async function loadHistoryPage<T>(
  transport: HttpTransport,
  path: string,
  query: Readonly<Record<string, QueryValue>>,
  options: RequestOptions,
  cursor?: string,
): Promise<HistoryPage<T>> {
  const response = await transport.request<unknown>({
    method: "GET",
    path,
    query: cursor === undefined ? query : { ...query, cursor },
    ...options,
  });
  const page = decode<T>(response);
  const next = page.nextCursor ?? undefined;
  const previous = page.previousCursor ?? undefined;
  return new HistoryPage<T>({
    items: page.data,
    response,
    ...(next === undefined
      ? {}
      : {
          nextCursor: next,
          loadNext: () =>
            loadHistoryPage<T>(transport, path, query, options, next),
        }),
    ...(previous === undefined
      ? {}
      : {
          previousCursor: previous,
          loadPrevious: () =>
            loadHistoryPage<T>(transport, path, query, options, previous),
        }),
  });
}
