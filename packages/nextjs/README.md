# `@polymorfa/nextjs`

Server-only helpers for Next.js App Router handlers. The package uses the Web
`Request` and `Response` APIs, so it does not add Next.js as a runtime dependency.

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
