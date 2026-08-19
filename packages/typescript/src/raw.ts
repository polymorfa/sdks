import { CursorPage, type PageDecoder } from "./pagination.js";
import { HttpTransport } from "./transport/http.js";
import type { ApiResponse, RawRequest } from "./transport/types.js";

export class RawClient {
  readonly #transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.#transport = transport;
  }

  request<T = unknown>(request: RawRequest): Promise<ApiResponse<T>> {
    return this.#transport.request<T>(request);
  }

  paginate<T>(
    request: RawRequest,
    decode: PageDecoder<T>,
    options: { readonly cursorParameter?: string } = {},
  ): Promise<CursorPage<T>> {
    return this.#loadPage(request, decode, options.cursorParameter ?? "cursor");
  }

  async #loadPage<T>(
    request: RawRequest,
    decode: PageDecoder<T>,
    cursorParameter: string,
    cursor?: string,
  ): Promise<CursorPage<T>> {
    const query =
      cursor === undefined
        ? request.query
        : { ...request.query, [cursorParameter]: cursor };
    const response = await this.request<unknown>({
      ...request,
      ...(query === undefined ? {} : { query }),
    });
    const decoded = decode(response.data);
    const nextCursor = decoded.nextCursor ?? undefined;
    return new CursorPage({
      items: decoded.items,
      ...(nextCursor === undefined ? {} : { nextCursor }),
      response,
      ...(nextCursor === undefined
        ? {}
        : {
            loadNext: () =>
              this.#loadPage(request, decode, cursorParameter, nextCursor),
          }),
    });
  }
}
