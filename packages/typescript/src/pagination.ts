import type { ApiResponse } from "./transport/types.js";

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
}

export type PageDecoder<T> = (data: unknown) => PageResult<T>;

interface CursorPageOptions<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly response: ApiResponse<unknown>;
  readonly loadNext?: () => Promise<CursorPage<T>>;
}

export class CursorPage<T> implements AsyncIterable<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | undefined;
  readonly response: ApiResponse<unknown>;
  readonly #loadNext: (() => Promise<CursorPage<T>>) | undefined;

  constructor(options: CursorPageOptions<T>) {
    this.items = Object.freeze([...options.items]);
    this.nextCursor = options.nextCursor;
    this.response = options.response;
    this.#loadNext = options.loadNext;
  }

  get hasMore(): boolean {
    return this.nextCursor !== undefined;
  }

  async nextPage(): Promise<CursorPage<T> | null> {
    return this.#loadNext === undefined ? null : this.#loadNext();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: CursorPage<T> | null = this;
    while (page !== null) {
      for (const item of page.items) yield item;
      page = await page.nextPage();
    }
  }
}
