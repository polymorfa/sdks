import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaPaymentRequiredError,
  PolymorfaRateLimitError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  assertServerRuntime,
  type ApiResponse,
  type ConversationReference,
} from "@polymorfa/sdk";

import { authenticate, type Operator, type Role } from "./auth.js";
import { env } from "./env.js";

export type Body = Readonly<Record<string, unknown>>;

export class InputError extends Error {}

export interface RouteContext {
  readonly request: Request;
  readonly operator: Operator;
  readonly body: Body;
  readonly url: URL;
  /** Sessions this operator may address. */
  readonly sessionOf: (body: Body) => string;
}

const privateHeaders = { "Cache-Control": "no-store, private" };

/** Wraps a handler with authentication, JSON parsing and SDK error mapping. */
export function route(
  role: Role,
  handler: (context: RouteContext) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      assertServerRuntime();
      const rejected = rejectCrossSite(request);
      if (rejected !== null) return rejected;
      const operator = await authenticate(request);
      if (operator === null) return problem(401, "unauthorized");
      if (role === "admin" && operator.role !== "admin") {
        return problem(403, "forbidden");
      }
      const body = request.method === "GET" ? {} : await readBody(request);
      const result = await handler({
        request,
        operator,
        body,
        url: new URL(request.url),
        sessionOf: (input) => sessionOf(input, operator.role),
      });
      if (result instanceof Response) return result;
      return Response.json(unwrap(result), { headers: privateHeaders });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * CSRF defence for cookie-authenticated routes: mutations must be JSON (which a
 * cross-site form cannot send without a CORS preflight) and come from this
 * app's own origin.
 */
function rejectCrossSite(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const type = request.headers.get("content-type") ?? "";
  if (type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return problem(415, "unsupported_media_type");
  }
  if (request.headers.get("origin") !== env.appOrigin()) {
    return problem(403, "cross_origin_request");
  }
  return null;
}

function unwrap(result: unknown): unknown {
  if (isApiResponse(result)) {
    return { data: result.data, requestId: result.metadata.requestId };
  }
  return { data: result };
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "metadata" in value &&
    "data" in value
  );
}

async function readBody(request: Request): Promise<Body> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InputError("A JSON request body is required.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputError("The request body must be a JSON object.");
  }
  return value as Body;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof InputError) {
    return problem(400, "invalid_request", error.message);
  }
  if (error instanceof PolymorfaConfigurationError) {
    // Never echo configuration details such as variable names to callers.
    console.error(error);
    return problem(500, "server_misconfigured");
  }
  if (error instanceof PolymorfaError) {
    const status = statusFor(error);
    const headers: Record<string, string> = {};
    const retryAfter = error.metadata?.headers["retry-after"];
    if (error instanceof PolymorfaRateLimitError && retryAfter !== undefined) {
      headers["Retry-After"] = retryAfter;
    }
    return problem(
      status,
      error.code ?? "polymorfa_error",
      error.message,
      error.requestId,
      headers,
    );
  }
  console.error(error);
  return problem(500, "internal_error");
}

function statusFor(error: PolymorfaError): number {
  if (error instanceof PolymorfaValidationError) return 422;
  // Our server credential was rejected: that is our failure, not the caller's.
  if (error instanceof PolymorfaAuthenticationError) return 502;
  if (error instanceof PolymorfaAuthorizationError) return 403;
  if (error instanceof PolymorfaPaymentRequiredError) return 402;
  if (error instanceof PolymorfaNotFoundError) return 404;
  if (error instanceof PolymorfaConflictError) return 409;
  if (error instanceof PolymorfaRateLimitError) return 429;
  if (error instanceof PolymorfaTimeoutError) return 504;
  if (error instanceof PolymorfaCancelledError) return 499;
  if (error instanceof PolymorfaConnectionError) return 502;
  return 502;
}

function problem(
  status: number,
  code: string,
  message?: string,
  requestId?: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    {
      error: {
        code,
        ...(message === undefined ? {} : { message }),
        ...(requestId === undefined ? {} : { requestId }),
      },
    },
    { status, headers: { ...privateHeaders, ...headers } },
  );
}

export function action(body: Body): string {
  return text(body, "action");
}

export function unknownAction(name: string): never {
  throw new InputError(`Unknown action: ${name}.`);
}

export function text(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InputError(`${key} must be a non-empty string.`);
  }
  return value;
}

export function optionalText(body: Body, key: string): string | undefined {
  return body[key] === undefined ? undefined : text(body, key);
}

export function flag(body: Body, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") {
    throw new InputError(`${key} must be a boolean.`);
  }
  return value;
}

export function optionalFlag(body: Body, key: string): boolean | undefined {
  return body[key] === undefined ? undefined : flag(body, key);
}

export function integer(body: Body, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new InputError(`${key} must be an integer.`);
  }
  return value;
}

export function optionalInteger(body: Body, key: string): number | undefined {
  return body[key] === undefined ? undefined : integer(body, key);
}

export function texts(body: Body, key: string): string[] {
  const value = body[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new InputError(`${key} must be an array of strings.`);
  }
  return value as string[];
}

export function object(body: Body, key: string): Body {
  const value = body[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputError(`${key} must be an object.`);
  }
  return value as Body;
}

export function oneOf<const T extends string>(
  body: Body,
  key: string,
  values: readonly T[],
): T {
  const value = body[key];
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new InputError(`${key} must be one of ${values.join(", ")}.`);
  }
  return value as T;
}

/** Mutations retry only with an idempotency key, so forward the caller's or mint one. */
export function idempotencyKey(request: Request): string {
  return request.headers.get("idempotency-key") ?? crypto.randomUUID();
}

/**
 * Agents may only address the default session or one listed in
 * POLYMORFA_AGENT_SESSIONS; admins may address any session.
 */
function sessionOf(body: Body, role: Role): string {
  const requested = optionalText(body, "session");
  const fallback = env.session();
  if (requested === undefined || requested === fallback) return fallback;
  if (role === "admin" || env.agentSessions().includes(requested)) {
    return requested;
  }
  throw new InputError("session is not available to this operator.");
}

/** Accepts `{ chat: { phoneNumber } }`, `{ chat: { id } }` or `{ chat: { bsuid } }`. */
export function conversationOf(body: Body): ConversationReference {
  const chat = object(body, "chat");
  const id = optionalText(chat, "id");
  const phoneNumber = optionalText(chat, "phoneNumber");
  const bsuid = optionalText(chat, "bsuid");
  if (id !== undefined) return { id };
  if (phoneNumber !== undefined) return { phoneNumber };
  if (bsuid !== undefined) return { bsuid };
  throw new InputError("chat needs an id, phoneNumber or bsuid.");
}
