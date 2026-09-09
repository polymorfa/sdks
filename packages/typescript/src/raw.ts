import { CursorPage, type PageDecoder } from "./pagination.js";
import { HttpTransport } from "./transport/http.js";
import { PolymorfaValidationError } from "./errors.js";
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
    const decoded = decode(response.data, response.metadata);
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

export interface ProjectScopedRawClient {
  request<T = unknown>(request: RawRequest): Promise<ApiResponse<T>>;
  paginate<T>(
    request: RawRequest,
    decode: PageDecoder<T>,
    options?: { readonly cursorParameter?: string },
  ): Promise<CursorPage<T>>;
}

export class ConfinedProjectRawClient implements ProjectScopedRawClient {
  readonly #raw: RawClient;
  readonly #prefix: string;

  constructor(transport: HttpTransport, projectId: string) {
    this.#raw = new RawClient(transport);
    this.#prefix = `/platform/projects/${encodeURIComponent(projectId)}`;
  }

  async request<T = unknown>(request: RawRequest): Promise<ApiResponse<T>> {
    return this.#raw.request<T>(this.#confine(request));
  }

  async paginate<T>(
    request: RawRequest,
    decode: PageDecoder<T>,
    options: { readonly cursorParameter?: string } = {},
  ): Promise<CursorPage<T>> {
    return this.#raw.paginate(this.#confine(request), decode, options);
  }

  #confine(request: RawRequest): RawRequest {
    validateProjectRelativeRequest(request);
    return { ...request, path: `${this.#prefix}${request.path}` };
  }
}

function validateProjectRelativeRequest(request: RawRequest): void {
  const path = request.path;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw invalidProjectRawPath();
  }
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path) ||
    decoded.split("/").includes("..") ||
    decoded.startsWith("/platform/projects/")
  ) {
    throw invalidProjectRawPath();
  }
  if (
    Object.keys(request.headers ?? {}).some(
      (name) => name.toLowerCase() === "authorization",
    )
  ) {
    throw new PolymorfaValidationError(
      "Project raw requests cannot override Authorization.",
      { code: "authorization_override_forbidden" },
    );
  }
}

function invalidProjectRawPath(): PolymorfaValidationError {
  return new PolymorfaValidationError(
    "Project raw paths must be relative to the bound project.",
    { code: "invalid_project_request_path" },
  );
}
