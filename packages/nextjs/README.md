# `@polymorfa/nextjs`

Server-only helpers for Next.js App Router handlers. The package uses the Web
`Request` and `Response` APIs, so it does not add Next.js as a runtime dependency.

## Drop-in handler

`createPolymorfaHandler` serves every drop-in route from one catch-all
route, `app/api/polymorfa/[...route]/route.ts`:

```ts
import { MessagingClient, constructWebhookEvent } from "@polymorfa/sdk";
import { createPolymorfaHandler } from "@polymorfa/nextjs";

export const { GET, POST } = createPolymorfaHandler({
  polymorfa: new MessagingClient({
    credential: { type: "apiKey", value: process.env.POLYMORFA_API_KEY! },
  }),
  authenticate: (request) => currentUser(request), // your auth; null → 401
  mint: (user) => ({
    session: "support",
    conversations: user.assignedConversationIds, // or "all"
    allow: ["read_messages", "subscribe_events", "send_message"],
    ttlSeconds: 600,
  }),
  webhooks: {
    secret: process.env.POLYMORFA_WEBHOOK_SECRET!,
    constructEvent: constructWebhookEvent,
    onEvent: saveEvent,
  },
  history: { conversations: listConversations, messages: listMessages },
  events: streamEvents,
});
```

`mint` is required and is the only place permissions are chosen. It returns
`null` to refuse (`403`). There is no default that grants everything: `allow`
and `conversations` must be explicit. The handler calls `authenticate` and
`mint` on every request, so revoked access takes effect on the next call. The
browser never sends permissions, and the API key never leaves the server.

| Route                                | Method | Needs                               | Purpose                                                   |
| ------------------------------------ | ------ | ----------------------------------- | --------------------------------------------------------- |
| `token`                              | POST   | signed-in user                      | Mints a client token and returns it with the grant        |
| `webhooks`                           | POST   | signature                           | Verifies the raw body, then calls `onEvent`               |
| `media/:id`                          | GET    | `read_messages` + `media.authorize` | Reuses `createMediaDownloadRoute` modes                   |
| `history/conversations`              | GET    | `read_messages`                     | Your list, filtered to the grant                          |
| `history/conversations/:id/messages` | GET    | `read_messages`                     | `404` outside the grant                                   |
| `history/conversations/:id/contact`  | GET    | `read_contact`                      | Contact panel data                                        |
| `events`                             | GET    | `subscribe_events`                  | Server-sent events, filtered by session and conversations |
| `connect`                            | POST   | `connect_whatsapp`                  | Creates a QuickLink; the browser gets only the hosted URL |
| `templates`                          | POST   | `manage_templates`                  | The template builder route plus `list`                    |

Enforcement: the Polymorfa API enforces the client-token actions (`send_*`,
`read_presence`, `subscribe_presence`, `read_contact`, `voip_*`). Session
tokens carry the session's client rules; `allow` narrows them in the API only
for Customer tokens (`customer`, beta), where the handler forwards the API
actions in `allow`. The handler enforces `read_messages`,
`subscribe_events`, `connect_whatsapp`, `manage_templates` and
`conversations` on its own routes. A Customer grant with no API action is
refused rather than minted with the session rules. For Customer grants your
`events` source must return only that Customer's events.

`createDevelopmentInboxStore()` keeps webhook events in memory and serves
them as `history` and `events`, so `<Inbox/>` works before you build
storage. It is lost on restart and not shared between instances; replace it
with your database before production.

### Express and Hono

The handler uses Fetch `Request` and `Response`, so other servers need only an
adapter:

```ts
import { toExpress } from "@polymorfa/nextjs/express";
app.use("/api/polymorfa", toExpress(handler)); // before express.json()

import { toHono } from "@polymorfa/nextjs/hono";
app.all("/api/polymorfa/*", toHono(handler));
```

Mount `toExpress` before `express.json()`: webhook signatures are checked
against the raw body.

`createClientTokenRoute` requires an application-owned authorization callback.
`createMessagingClientTokenMint` adapts the real server SDK response to the
browser claim shape. Never send a server API key or messaging credential to the
browser.

```ts
import { MessagingClient } from "@polymorfa/sdk";
import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
} from "@polymorfa/nextjs";

const messaging = new MessagingClient({
  credential: { type: "apiKey", value: process.env.POLYMORFA_API_KEY! },
});

export const POST = createClientTokenRoute({
  authorize: async (request) => authorizeApplicationUser(request),
  mint: createMessagingClientTokenMint({
    clientTokens: messaging.clientTokens,
    resolve: async (subject) => ({
      session: "support",
      ephemeralId: subject.userId,
      ttlSeconds: 600,
    }),
  }),
});
```

Browser calls use this same route. `POST /platform/client-tokens` is the only
way to mint a client token, so `@polymorfa/sdk/calls` and `@polymorfa/browser`
receive the token from `messaging.clientTokens.mint`. The path the browser
posts to is your own route; `createClientTokenProvider` defaults to
`/api/polymorfa/token`. Grant the session's client rules the Calls actions
the browser needs: `voip_place` to place calls and add participants,
`voip_answer` to accept or decline, and `voip_signal` for signaling, ending a
call, and the call lifecycle socket.

The server key that mints tokens needs all client delegation scopes:
`sessions:manage`, `messages:write`, `contacts:read`, `presence:read`,
`presence:observe`, and `mcp`.

`createTemplateBuilderRoute` pairs the browser template transport with
`MessagingClient.templates`. The application authorizes every request and
resolves both project scope and the Cloud API submission session on the server.

```ts
import { MessagingClient } from "@polymorfa/sdk";
import { createTemplateBuilderRoute } from "@polymorfa/nextjs";

const messaging = new MessagingClient({
  credential: { type: "apiKey", value: process.env.POLYMORFA_API_KEY! },
});

export const POST = createTemplateBuilderRoute({
  templates: messaging.templates,
  authorize: async (request) => authorizeApplicationUser(request),
  resolveProjectSlug: async (subject) => projectSlugFor(subject.projectId),
  resolveSubmissionSession: async (subject) =>
    cloudSessionFor(subject.projectId),
});
```

Browser request bodies cannot override either resolver. Responses are private,
non-cacheable, and server failures are returned without credential or internal
error details.

`createMediaDownloadRoute` serves Messaging media to signed-in users. Its
`authorize` callback is required, and the route denies with `403` when the
callback returns `null`, throws, or returns an invalid grant. Look up the
media in your own records inside `authorize` instead of trusting an ID from
the URL.

```ts
import { MessagingClient } from "@polymorfa/sdk";
import { createMediaDownloadRoute } from "@polymorfa/nextjs";

const messaging = new MessagingClient({
  credential: { type: "apiKey", value: process.env.POLYMORFA_API_KEY! },
});

export const GET = createMediaDownloadRoute({
  client: messaging,
  mode: "proxy", // or "redirect" | "whatsapp"
  authorize: async (request) => {
    const attachment = await attachmentForUser(request);
    return attachment ? { mediaId: attachment.polymorfaMediaId } : null;
  },
});
```

| Mode       | Behavior                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect` | Answers `302` with the short-lived signed storage URL. If the API streams that file instead, the route proxies it.                                                |
| `proxy`    | Streams the bytes through your route.                                                                                                                             |
| `whatsapp` | Downloads and decrypts the file from the WhatsApp CDN on the server. `authorize` returns `{ message: { type, media } }`, loaded from your stored webhook payload. |

The route accepts only `GET`. Every response carries `Cache-Control: private,
no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy:
no-referrer`. Proxied responses also carry `Content-Security-Policy: sandbox`.
Common image, audio and video types (`INLINE_MEDIA_TYPES`, which excludes SVG)
are served `inline` with their normalized MIME type. All other types are served
as `application/octet-stream` with `Content-Disposition: attachment`. Filenames
are sanitized and sent with an RFC 6266 `filename*` parameter. The route
returns `404` when the media is missing and `502` for any other upstream
failure, with no upstream details. Redirect mode hands the signed URL to the
browser, so use it only when the user may hold that link until it expires.

`readVerifiedWebhook` preserves the raw request body and delegates verification
to `constructWebhookEvent` from `@polymorfa/sdk`.

```ts
import { constructWebhookEvent } from "@polymorfa/sdk";
import { readVerifiedWebhook } from "@polymorfa/nextjs";

export async function POST(request: Request) {
  const event = await readVerifiedWebhook(request, {
    constructEvent: constructWebhookEvent,
    secret: process.env.POLYMORFA_WEBHOOK_SECRET!,
  });
  return Response.json({ received: event.id });
}
```
