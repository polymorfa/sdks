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

For browser calls, the same route can mint through `MessagingClient.voip`
(`POST /api/voip/token`), which returns the same token shape:

```ts
mint: createMessagingClientTokenMint({
  clientTokens: { mint: (input, options) => messaging.voip.token(input, options) },
  resolve: async (subject) => ({ session: "support", ephemeralId: subject.userId }),
}),
```

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
