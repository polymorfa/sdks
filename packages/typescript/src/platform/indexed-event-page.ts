import { CursorPage } from "../pagination.js";
import type { ApiResponse } from "../transport/types.js";
import type { IndexedEventPageMetadata } from "./developer-types.js";

export interface IndexedEventEnvelope<T> {
  readonly data: readonly T[];
  readonly page: IndexedEventPageMetadata;
}

interface IndexedEventPageOptions<T> {
  readonly response: ApiResponse<IndexedEventEnvelope<T>>;
  readonly nextOffset: string | null;
  readonly highWatermark: string;
  readonly hasMore: boolean;
  readonly loadNext?: () => Promise<IndexedEventPage<T>>;
}

/** An event page followed by retained-stream offset rather than cursor. */
export class IndexedEventPage<T> extends CursorPage<T> {
  readonly nextOffset: string | null;
  readonly highWatermark: string;
  declare readonly response: ApiResponse<IndexedEventEnvelope<T>>;
  readonly #hasMore: boolean;
  readonly #loadNextIndexed: (() => Promise<IndexedEventPage<T>>) | undefined;

  constructor(options: IndexedEventPageOptions<T>) {
    super({ items: options.response.data.data, response: options.response });
    this.nextOffset = options.nextOffset;
    this.highWatermark = options.highWatermark;
    this.#hasMore = options.hasMore;
    this.#loadNextIndexed = options.loadNext;
  }

  override get hasMore(): boolean {
    return this.#hasMore;
  }

  override nextPage(): Promise<IndexedEventPage<T> | null> {
    return this.#loadNextIndexed?.() ?? Promise.resolve(null);
  }

  override async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (const item of this.items) yield item;
    const next = await this.nextPage();
    if (next === null) return;
    for await (const item of next) yield item;
  }
}
