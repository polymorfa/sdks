import {
  createMediaDownloadRoute,
  type MediaDownloadGrant,
  type MediaDownloadRouteOptions,
  type MediaDownloadRouteResource,
} from "./media-route.js";
import {
  createTemplateBuilderRoute,
  type TemplateRouteResource,
} from "./template-builder-route.js";
import type { WebhookConstructor } from "./webhook.js";

/**
 * What a grant can allow. The API enforces the client-token actions
 * (`send_*`, `read_presence`, `subscribe_presence`, `read_contact`,
 * `voip_*`); this handler enforces the rest on its own routes.
 */
export type PolymorfaPermission =
  | "read_messages"
  | "subscribe_events"
  | "send_message"
  | "send_reaction"
  | "send_typing"
  | "send_seen"
  | "read_presence"
  | "subscribe_presence"
  | "read_contact"
  | "voip_place"
  | "voip_answer"
  | "voip_signal"
  | "connect_whatsapp"
  | "manage_templates";

const PERMISSIONS: ReadonlySet<string> = new Set<PolymorfaPermission>([
  "read_messages",
  "subscribe_events",
  "send_message",
  "send_reaction",
  "send_typing",
  "send_seen",
  "read_presence",
  "subscribe_presence",
  "read_contact",
  "voip_place",
  "voip_answer",
  "voip_signal",
  "connect_whatsapp",
  "manage_templates",
]);

/** Actions the API narrows on a Customer-scoped token (`allow`). */
const CUSTOMER_TOKEN_ACTIONS: ReadonlySet<string> = new Set([
  "send_message",
  "send_reaction",
  "send_typing",
  "send_seen",
  "read_presence",
  "subscribe_presence",
  "read_contact",
]);

/**
 * What `mint()` returns: the smallest grant this user needs. There is no
 * default that grants everything; every field that widens access is
 * explicit.
 */
export type PolymorfaGrantInput = (
  | { readonly session: string; readonly customer?: never }
  | {
      /** Polymorfa Customer ID (beta). Never your own external ID. */
      readonly customer: string;
      readonly session?: never;
    }
) & {
  /** Conversation IDs the user may read, or `"all"` for every one. */
  readonly conversations: "all" | readonly string[];
  /** Permissions for this user. At least one. */
  readonly allow: readonly PolymorfaPermission[];
  /** Token lifetime. Default 600 (10 minutes). */
  readonly ttlSeconds?: number;
  /** Stable per-user ID for rate limits. Defaults to `user.id`. */
  readonly ephemeralId?: string;
};

/** The grant as the handler resolved it. */
export interface PolymorfaGrant {
  readonly session?: string;
  readonly customer?: string;
  readonly conversations: "all" | readonly string[];
  readonly allow: readonly PolymorfaPermission[];
  readonly ttlSeconds: number;
  readonly ephemeralId: string;
}

/** Everything a route callback knows about the caller. */
export interface PolymorfaRouteContext<User> {
  readonly user: User;
  readonly grant: PolymorfaGrant;
  readonly request: Request;
  readonly signal: AbortSignal;
}

/** One conversation list row, as `<Inbox/>` renders it. */
export interface HistoryConversation {
  readonly id: string;
  readonly session?: string;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly avatarUrl?: string;
  readonly lastMessage?: {
    readonly text: string;
    readonly createdAt: number;
    readonly direction: "inbound" | "outbound";
  };
  readonly lastActivity: number;
  readonly unreadCount: number;
}

/** One message, as `<Inbox/>` renders it. */
export interface HistoryMessage {
  readonly id: string;
  readonly text: string;
  readonly createdAt: number;
  readonly direction: "inbound" | "outbound";
  readonly status: "pending" | "sent" | "failed";
  readonly replyTo?: string;
  readonly attachments?: readonly {
    readonly id: string;
    readonly name: string;
    readonly size: number;
    readonly contentType: string;
    readonly url?: string;
    readonly previewUrl?: string;
  }[];
}

export interface HistoryContact {
  readonly id: string;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly avatarUrl?: string;
  readonly about?: string;
  readonly email?: string;
  readonly fields?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface HistoryPage<T> {
  readonly data: readonly T[];
  readonly nextCursor?: string | null;
}

/** A webhook event envelope for the events relay. */
export interface RelayEvent {
  readonly id: string;
  readonly session: string;
  readonly event: string;
  readonly timestamp: string;
  readonly payload: unknown;
}

/** What the handler sends to `POST /platform/client-tokens`. */
export interface ClientTokenMintInput {
  readonly session?: string;
  readonly customer?: string;
  readonly allow?: readonly string[];
  readonly ephemeralId: string;
  readonly ttlSeconds?: number;
}

/** What `connect()` returns: the QuickLink to create for this user. */
export interface QuickLinkInput {
  readonly projectId?: string;
  readonly customerId?: string;
  readonly externalId?: string;
  readonly configuration?: object;
}

/** Structural subset of `MessagingClient` the handler uses. */
export interface PolymorfaHandlerClient {
  readonly clientTokens: {
    mint(
      input: ClientTokenMintInput,
      options: { readonly signal: AbortSignal },
    ): Promise<{
      readonly data: {
        readonly data: { readonly token: string; readonly expiresAt: string };
      };
    }>;
  };
  readonly quickLinks?: {
    create(
      input: QuickLinkInput,
      options: { readonly signal: AbortSignal },
    ): Promise<{
      readonly data: {
        readonly data: {
          readonly id: string;
          readonly url: string;
          readonly expiresAt: string | null;
        };
      };
    }>;
  };
  readonly media?: MediaDownloadRouteResource;
  readonly templates?: TemplateRouteResource;
}

export interface PolymorfaHandlerOptions<User extends { readonly id: string }> {
  /** A server-side `MessagingClient` from `@polymorfa/sdk`. */
  readonly polymorfa: PolymorfaHandlerClient;
  /** Your auth: the signed-in user, or `null` (answered with `401`). */
  readonly authenticate: (
    request: Request,
  ) => User | null | Promise<User | null>;
  /**
   * Required. The grant for this user, or `null` to refuse (`403`). Called
   * on every request, so revoking access takes effect on the next call.
   */
  readonly mint: (
    user: User,
    request: Request,
  ) => PolymorfaGrantInput | null | Promise<PolymorfaGrantInput | null>;
  /** Path the handler is mounted at. Default `/api/polymorfa`. */
  readonly basePath?: string;
  /** `POST /webhooks`: verified before `onEvent` runs. */
  readonly webhooks?: {
    readonly secret: string;
    readonly onEvent: (event: unknown) => void | Promise<void>;
    /** Pass `constructWebhookEvent` from `@polymorfa/sdk`. */
    readonly constructEvent: WebhookConstructor<unknown>;
    readonly signatureHeader?: string;
  };
  /** `GET /media/:id`, gated by `read_messages`. */
  readonly media?: {
    readonly mode: MediaDownloadRouteOptions["mode"];
    /** Resolve the media from your records; never trust the URL alone. */
    readonly authorize: (
      context: PolymorfaRouteContext<User>,
      mediaId: string,
    ) => MediaDownloadGrant | null | Promise<MediaDownloadGrant | null>;
  };
  /** `GET /history/...` from your own store, gated by `read_messages`. */
  readonly history?: {
    readonly conversations: (
      context: PolymorfaRouteContext<User>,
      page: { readonly cursor?: string },
    ) => Promise<HistoryPage<HistoryConversation>>;
    readonly messages: (
      context: PolymorfaRouteContext<User>,
      conversationId: string,
      page: { readonly cursor?: string },
    ) => Promise<HistoryPage<HistoryMessage>>;
    /** Contact panel data, gated by `read_contact`. */
    readonly contact?: (
      context: PolymorfaRouteContext<User>,
      conversationId: string,
    ) => Promise<HistoryContact | null>;
  };
  /**
   * `GET /events` as server-sent events, gated by `subscribe_events`.
   * Events outside the grant's session and conversations are dropped.
   */
  readonly events?: (
    context: PolymorfaRouteContext<User> & { readonly lastEventId?: string },
  ) => AsyncIterable<RelayEvent>;
  /**
   * `POST /connect`, gated by `connect_whatsapp`: the QuickLink to create.
   * The browser receives only the hosted URL.
   */
  readonly connect?: (
    context: PolymorfaRouteContext<User>,
  ) => QuickLinkInput | Promise<QuickLinkInput>;
  /** `POST /templates`, gated by `manage_templates`. */
  readonly templates?: {
    readonly projectSlug: (
      context: PolymorfaRouteContext<User>,
    ) => string | Promise<string>;
    readonly submissionSession: (
      context: PolymorfaRouteContext<User>,
    ) => string | Promise<string>;
  };
  /** SSE heartbeat interval. Default 25 s. */
  readonly heartbeatMs?: number;
  /** Receives unexpected errors. Responses never include their details. */
  readonly onError?: (error: unknown, route: string) => void;
}

export type PolymorfaRouteHandler = (request: Request) => Promise<Response>;

export interface PolymorfaHandler {
  readonly GET: PolymorfaRouteHandler;
  readonly POST: PolymorfaRouteHandler;
  /** Any method; the adapters call this. */
  readonly handle: PolymorfaRouteHandler;
}

const privateHeaders = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};

class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * One catch-all route for the drop-in components. Mount it at
 * `app/api/polymorfa/[...route]/route.ts` and export `GET` and `POST`.
 *
 * The API key stays on the server. The browser never sends permissions:
 * `mint()` decides them for the signed-in user on every request.
 */
export function createPolymorfaHandler<User extends { readonly id: string }>(
  options: PolymorfaHandlerOptions<User>,
): PolymorfaHandler {
  if (typeof options.authenticate !== "function")
    throw new TypeError("createPolymorfaHandler: authenticate is required.");
  if (typeof options.mint !== "function")
    throw new TypeError(
      "createPolymorfaHandler: mint is required. Return the smallest grant each user needs.",
    );
  if (typeof options.polymorfa?.clientTokens?.mint !== "function")
    throw new TypeError(
      "createPolymorfaHandler: polymorfa must be a server MessagingClient.",
    );
  if (
    options.webhooks !== undefined &&
    (typeof options.webhooks.secret !== "string" ||
      options.webhooks.secret.length === 0 ||
      typeof options.webhooks.constructEvent !== "function" ||
      typeof options.webhooks.onEvent !== "function")
  )
    throw new TypeError(
      "createPolymorfaHandler: webhooks needs secret, constructEvent and onEvent.",
    );
  if (
    options.connect !== undefined &&
    options.polymorfa.quickLinks === undefined
  )
    throw new TypeError(
      "createPolymorfaHandler: connect needs polymorfa.quickLinks.",
    );
  if (
    options.templates !== undefined &&
    options.polymorfa.templates === undefined
  )
    throw new TypeError(
      "createPolymorfaHandler: templates needs polymorfa.templates.",
    );
  const basePath = (options.basePath ?? "/api/polymorfa").replace(/\/+$/, "");
  const heartbeatMs = options.heartbeatMs ?? 25_000;
  const report = (error: unknown, route: string) => {
    try {
      options.onError?.(error, route);
    } catch {
      // A failing reporter must not change the response.
    }
  };

  const resolve = async (
    request: Request,
    permission?: PolymorfaPermission,
  ): Promise<PolymorfaRouteContext<User>> => {
    const user = await options.authenticate(request);
    if (user === null || user === undefined)
      throw new Refusal(401, "unauthenticated", "Sign in to continue.");
    if (typeof user.id !== "string" || user.id.length === 0)
      throw new TypeError("authenticate must return a user with a string id.");
    const input = await options.mint(user, request);
    if (input === null || input === undefined)
      throw new Refusal(403, "forbidden", "This user has no Polymorfa access.");
    const grant = normalizeGrant(input, user.id);
    if (permission !== undefined && !grant.allow.includes(permission))
      throw new Refusal(
        403,
        "permission_missing",
        `The grant lacks "${permission}".`,
      );
    return { user, grant, request, signal: request.signal };
  };

  const mediaRoute =
    options.media === undefined || options.polymorfa.media === undefined
      ? undefined
      : createMediaDownloadRoute({
          client: { media: options.polymorfa.media },
          mode: options.media.mode,
          authorize: async (request) => {
            const context = await resolve(request, "read_messages");
            const mediaId = routeOf(request, basePath)?.[1];
            if (mediaId === undefined) return null;
            return options.media!.authorize(context, mediaId);
          },
        });

  const templateRoute =
    options.templates === undefined
      ? undefined
      : (() => {
          const contexts = new WeakMap<Request, PolymorfaRouteContext<User>>();
          const route = createTemplateBuilderRoute({
            templates: options.polymorfa.templates!,
            authorize: (request) => {
              const context = contexts.get(request);
              return context === undefined ? null : { userId: context.user.id };
            },
            resolveProjectSlug: (_subject, request) =>
              options.templates!.projectSlug(contexts.get(request)!),
            resolveSubmissionSession: (_subject, request) =>
              options.templates!.submissionSession(contexts.get(request)!),
          });
          return async (request: Request) => {
            contexts.set(request, await resolve(request, "manage_templates"));
            return route(request);
          };
        })();

  const handle: PolymorfaRouteHandler = async (request) => {
    const segments = routeOf(request, basePath);
    const route = segments?.join("/") ?? "";
    try {
      if (segments === undefined || segments.length === 0)
        return error(404, "not_found", "Unknown Polymorfa route.");
      const [head, second, third, fourth] = segments;
      const method = request.method.toUpperCase();

      if (head === "token" && segments.length === 1) {
        requireMethod(method, "POST");
        return await mintToken(request);
      }
      if (head === "webhooks" && segments.length === 1 && options.webhooks) {
        requireMethod(method, "POST");
        return await receiveWebhook(request);
      }
      if (head === "media" && segments.length === 2 && mediaRoute) {
        requireMethod(method, "GET");
        return await mediaRoute(request);
      }
      if (head === "history" && second === "conversations" && options.history) {
        requireMethod(method, "GET");
        return await history(request, third, fourth, segments.length);
      }
      if (head === "events" && segments.length === 1 && options.events) {
        requireMethod(method, "GET");
        return await events(request);
      }
      if (head === "connect" && segments.length === 1 && options.connect) {
        requireMethod(method, "POST");
        return await connect(request);
      }
      if (head === "templates" && segments.length === 1 && templateRoute) {
        requireMethod(method, "POST");
        return await templateRoute(request);
      }
      return error(404, "not_found", "Unknown Polymorfa route.");
    } catch (cause) {
      if (cause instanceof Refusal)
        return error(cause.status, cause.code, cause.message, cause.headers);
      report(cause, route);
      return error(500, "handler_failed", "The Polymorfa route failed.");
    }
  };

  async function mintToken(request: Request): Promise<Response> {
    const { grant } = await resolve(request);
    let body: ClientTokenMintInput;
    if (grant.session !== undefined)
      body = {
        session: grant.session,
        ephemeralId: grant.ephemeralId,
        ttlSeconds: grant.ttlSeconds,
      };
    else {
      // The API narrows Customer tokens to these actions. Omitting allow
      // would fall back to the session rules, so an empty list is refused.
      const allow = grant.allow.filter((action) =>
        CUSTOMER_TOKEN_ACTIONS.has(action),
      );
      if (allow.length === 0)
        throw new TypeError(
          "A customer grant needs at least one API action (send_*, read_presence, subscribe_presence or read_contact).",
        );
      body = {
        customer: grant.customer!,
        allow,
        ephemeralId: grant.ephemeralId,
        ttlSeconds: grant.ttlSeconds,
      };
    }
    const response = await options.polymorfa.clientTokens.mint(body, {
      signal: request.signal,
    });
    const token = response?.data?.data?.token;
    const expiresAt = Date.parse(response?.data?.data?.expiresAt ?? "");
    if (
      typeof token !== "string" ||
      !token.startsWith("pmfa_ct_") ||
      token.length <= "pmfa_ct_".length ||
      !Number.isFinite(expiresAt)
    )
      throw new TypeError(
        "The Polymorfa API returned an invalid client token.",
      );
    return json({
      value: token,
      audience: "browser",
      expiresAt,
      scopes: grant.allow,
      grant: {
        ...(grant.session === undefined ? {} : { session: grant.session }),
        ...(grant.customer === undefined ? {} : { customer: grant.customer }),
        conversations: grant.conversations,
        allow: grant.allow,
      },
    });
  }

  async function receiveWebhook(request: Request): Promise<Response> {
    const webhooks = options.webhooks!;
    const header = webhooks.signatureHeader ?? "x-webhook-signature";
    const signature = request.headers.get(header);
    if (signature === null || signature.length === 0)
      return error(400, "signature_missing", `Missing ${header}.`);
    const constructEvent = webhooks.constructEvent;
    let event: unknown;
    try {
      event = await constructEvent(
        await request.arrayBuffer(),
        signature,
        webhooks.secret,
      );
    } catch {
      return error(
        400,
        "signature_invalid",
        "The webhook signature is invalid.",
      );
    }
    await webhooks.onEvent(event);
    return json({ received: true });
  }

  async function history(
    request: Request,
    conversationId: string | undefined,
    child: string | undefined,
    length: number,
  ): Promise<Response> {
    const context = await resolve(request, "read_messages");
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    const page = cursor === undefined ? {} : { cursor };
    const allowed = (id: string) =>
      context.grant.conversations === "all" ||
      context.grant.conversations.includes(id);
    if (length === 2) {
      const result = await options.history!.conversations(context, page);
      return json({
        data: result.data.filter((row) => allowed(row.id)),
        nextCursor: result.nextCursor ?? null,
      });
    }
    // A conversation outside the grant answers 404, like a missing one.
    if (
      conversationId === undefined ||
      !allowed(conversationId) ||
      length !== 4
    )
      throw new Refusal(404, "not_found", "Conversation not found.");
    if (child === "messages") {
      const result = await options.history!.messages(
        context,
        conversationId,
        page,
      );
      return json({ data: result.data, nextCursor: result.nextCursor ?? null });
    }
    if (child === "contact" && options.history!.contact) {
      if (!context.grant.allow.includes("read_contact"))
        throw new Refusal(
          403,
          "permission_missing",
          'The grant lacks "read_contact".',
        );
      const contact = await options.history!.contact(context, conversationId);
      if (contact === null)
        throw new Refusal(404, "not_found", "Contact not found.");
      return json({ data: contact });
    }
    throw new Refusal(404, "not_found", "Unknown Polymorfa route.");
  }

  async function events(request: Request): Promise<Response> {
    const context = await resolve(request, "subscribe_events");
    const lastEventId =
      request.headers.get("last-event-id") ??
      new URL(request.url).searchParams.get("lastEventId") ??
      undefined;
    const source = options.events!({
      ...context,
      ...(lastEventId === undefined ? {} : { lastEventId }),
    });
    const { grant } = context;
    const encoder = new TextEncoder();
    let iterator: AsyncIterator<RelayEvent> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
      void iterator?.return?.();
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 2000\n\n"));
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            stop();
          }
        }, heartbeatMs);
        request.signal.addEventListener("abort", () => {
          stop();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
      },
      async pull(controller) {
        iterator ??= source[Symbol.asyncIterator]();
        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) {
              stop();
              controller.close();
              return;
            }
            if (!eventAllowed(next.value, grant)) continue;
            controller.enqueue(
              encoder.encode(
                `id: ${next.value.id.replace(/[\r\n]/g, "")}\ndata: ${JSON.stringify(next.value)}\n\n`,
              ),
            );
            return;
          }
        } catch (cause) {
          stop();
          report(cause, "events");
          controller.error(cause);
        }
      },
      cancel() {
        stop();
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, private, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  async function connect(request: Request): Promise<Response> {
    const context = await resolve(request, "connect_whatsapp");
    const input = await options.connect!(context);
    const response = await options.polymorfa.quickLinks!.create(input, {
      signal: request.signal,
    });
    const link = response?.data?.data;
    if (typeof link?.url !== "string" || typeof link.id !== "string")
      throw new TypeError("The Polymorfa API returned an invalid QuickLink.");
    return json({
      data: { id: link.id, url: link.url, expiresAt: link.expiresAt ?? null },
    });
  }

  return { GET: handle, POST: handle, handle };
}

function requireMethod(method: string, expected: "GET" | "POST"): void {
  if (method !== expected)
    throw new Refusal(405, "method_not_allowed", `Use ${expected}.`, {
      Allow: expected,
    });
}

/** Route segments after `basePath`, or `undefined` outside it. */
function routeOf(request: Request, basePath: string): string[] | undefined {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`))
    return undefined;
  const rest = pathname.slice(basePath.length);
  const segments = rest.split("/").filter((segment) => segment.length > 0);
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
}

function normalizeGrant(
  input: PolymorfaGrantInput,
  userId: string,
): PolymorfaGrant {
  const hasSession =
    typeof input.session === "string" && input.session.length > 0;
  const hasCustomer =
    typeof input.customer === "string" && input.customer.length > 0;
  if (hasSession === hasCustomer)
    throw new TypeError("mint must return exactly one of session or customer.");
  if (
    !Array.isArray(input.allow) ||
    input.allow.length === 0 ||
    input.allow.some((permission) => !PERMISSIONS.has(permission))
  )
    throw new TypeError(
      "mint must return allow: a non-empty list of Polymorfa permissions.",
    );
  const conversations = input.conversations;
  if (
    conversations !== "all" &&
    !(
      Array.isArray(conversations) &&
      conversations.every((id) => typeof id === "string" && id.length > 0)
    )
  )
    throw new TypeError(
      'mint must return conversations: "all" or a list of conversation IDs.',
    );
  const ttlSeconds = input.ttlSeconds ?? 600;
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 60 ||
    ttlSeconds > 86_400
  )
    throw new TypeError("ttlSeconds must be an integer from 60 to 86400.");
  const ephemeralId = input.ephemeralId ?? userId;
  if (typeof ephemeralId !== "string" || ephemeralId.length === 0)
    throw new TypeError("ephemeralId must be a non-empty string.");
  return Object.freeze({
    ...(hasSession
      ? { session: input.session! }
      : { customer: input.customer! }),
    conversations:
      conversations === "all" ? "all" : Object.freeze([...conversations]),
    allow: Object.freeze([...new Set(input.allow)]),
    ttlSeconds,
    ephemeralId,
  });
}

function eventAllowed(event: RelayEvent, grant: PolymorfaGrant): boolean {
  if (
    typeof event !== "object" ||
    event === null ||
    typeof event.id !== "string" ||
    typeof event.event !== "string"
  )
    return false;
  if (grant.session !== undefined && event.session !== grant.session)
    return false;
  if (grant.conversations === "all") return true;
  const conversationId = conversationOf(event);
  // Session-level events carry no conversation and pass the session check.
  return (
    conversationId === undefined || grant.conversations.includes(conversationId)
  );
}

/** The conversation an event belongs to, as `@polymorfa/store` reads it. */
export function conversationOf(event: RelayEvent): string | undefined {
  const payload = event.payload as
    | { conversation?: { id?: unknown }; from?: { id?: unknown } }
    | null
    | undefined;
  const id = payload?.conversation?.id ?? payload?.from?.id;
  return typeof id === "string" ? id : undefined;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: privateHeaders });
}

function error(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...privateHeaders, ...headers } },
  );
}
