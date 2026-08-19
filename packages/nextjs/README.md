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
