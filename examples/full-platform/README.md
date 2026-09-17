# Acme Support: full-platform example

A Next.js App Router support desk that uses every public Polymorfa SDK
surface: the Messaging and management server clients, signed webhooks, the
browser controllers, the React components, the Web Components, the Next.js
route helpers, and the development assistant.

The Polymorfa packages have not been published to npm yet. Inside this
repository, the root `npm run typecheck` checks this example against the
package sources.

## Setup

1. Build the SDK packages from the repository root:

   ```bash
   npm ci
   npm run build
   npm run build:workspaces
   ```

2. Install the example's dependencies. Until the packages are published,
   point the `@polymorfa/*` dependencies at the local builds, for example with
   `npm link`, or install `github:polymorfa/sdks#dev` for `@polymorfa/sdk`.

3. Copy `.env.example` to `.env.local` and fill it in:

   | Variable                         | Used for                                                                            |
   | -------------------------------- | ----------------------------------------------------------------------------------- |
   | `POLYMORFA_PROJECT_TOKEN`        | `MessagingClient`, `BridgeClient`, and the project view of `Client` (`pmfa_pt_...`) |
   | `POLYMORFA_ORGANIZATION_API_KEY` | The organization `Client` in the admin area (`pmfa_...`)                            |
   | `POLYMORFA_PROJECT_ID`           | The project the project token is bound to                                           |
   | `POLYMORFA_PROJECT_SLUG`         | Template and Messaging campaign routes                                              |
   | `POLYMORFA_SESSION`              | The session (number) the support team uses                                          |
   | `POLYMORFA_TEMPLATE_SESSION`     | The Cloud API session that submits templates to Meta                                |
   | `POLYMORFA_WEBHOOK_SECRET`       | Signing secret of the webhook that targets `/api/polymorfa/webhooks`                |
   | `POLYMORFA_API_BASE_URL`         | Optional API origin; defaults to `https://api.polymorfa.com`                        |

   These values are server-only. Never prefix them with `NEXT_PUBLIC_`.

4. Run `npm run dev` and open `http://localhost:3000`. Use the demo sign-in
   form on the home page. It sets unsigned cookies and exists only outside
   production; replace `lib/auth.ts` with your own session lookup.

5. In the admin area, apply the session's client rules
   (`POST /api/messaging/client-rules` with `{"action":"apply"}`) and register
   a webhook (`POST /api/admin/webhooks` with `{"action":"create"}`). Store the
   returned signing secret as `POLYMORFA_WEBHOOK_SECRET`.

## Credentials by area

| Area                                    | Credential                                                |
| --------------------------------------- | --------------------------------------------------------- |
| `app/api/messaging/*`                   | Project token through `MessagingClient`                   |
| `app/api/messaging/media` upload action | Organization API key (`Client.media`)                     |
| `app/api/admin/*` except the rows below | Organization API key through `Client`                     |
| `app/api/admin/events`, `webhooks`      | Project token through `Client<"project">`                 |
| `app/api/admin/settings`                | Organization API key and project token views              |
| `app/api/admin/bridge`                  | Project token (`BridgeClient`), no key for `SystemClient` |
| Browser pages                           | Short-lived `pmfa_ct_` client tokens minted by the server |

Browsers never receive a server credential. `lib/polymorfa.ts` calls
`assertServerRuntime()` before constructing a credentialed client, and `lib/route.ts`
maps each SDK error class to an HTTP status.

## QuickLink

QuickLink is a page hosted by Polymorfa. `app/api/messaging/quicklinks`
creates a link with `messaging.quickLinks.create()` and returns its `url`.
Send the person to that URL; this application renders no QuickLink UI. New
sessions are created through QuickLink, so there is no session "create" call.

## Feature map

| Feature                                                                                                                                                                          | File                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Client construction, `assertServerRuntime`                                                                                                                                       | `lib/polymorfa.ts`                                |
| Error classes to HTTP statuses, idempotency keys                                                                                                                                 | `lib/route.ts`                                    |
| Sessions: list, status, start, stop, restart, logout, delete, configuration, QR, pairing code                                                                                    | `app/api/messaging/sessions/route.ts`             |
| Messages: every send kind (text, media, template, poll, location, contact, buttons, list, address, flow, product, product list, order, phone request), seen, typing, react, star | `app/api/messaging/messages/route.ts`             |
| Chats: edit, delete, archive, disappearing timer                                                                                                                                 | `app/api/messaging/chats/route.ts`                |
| Contacts                                                                                                                                                                         | `app/api/messaging/contacts/route.ts`             |
| Groups                                                                                                                                                                           | `app/api/messaging/groups/route.ts`               |
| Labels                                                                                                                                                                           | `app/api/messaging/labels/route.ts`               |
| Media: download, metadata, persist, upload URL                                                                                                                                   | `app/api/messaging/media/route.ts`                |
| Presence                                                                                                                                                                         | `app/api/messaging/presence/route.ts`             |
| Privacy                                                                                                                                                                          | `app/api/messaging/privacy/route.ts`              |
| Profile                                                                                                                                                                          | `app/api/messaging/profile/route.ts`              |
| Business profile and commerce                                                                                                                                                    | `app/api/messaging/business/route.ts`             |
| Quick replies                                                                                                                                                                    | `app/api/messaging/quick-replies/route.ts`        |
| Identities and user security codes                                                                                                                                               | `app/api/messaging/identities/route.ts`           |
| Channels                                                                                                                                                                         | `app/api/messaging/channels/route.ts`             |
| Templates: list, retrieve, rename, preview, submit, delete                                                                                                                       | `app/api/messaging/templates/route.ts`            |
| Template builder route (`createTemplateBuilderRoute`)                                                                                                                            | `app/api/polymorfa/templates/route.ts`            |
| Messaging campaigns                                                                                                                                                              | `app/api/messaging/campaigns/route.ts`            |
| Calls: reject, socket ticket, agent token                                                                                                                                        | `app/api/messaging/calls/route.ts`                |
| Calls client token (`voip.token`)                                                                                                                                                | `app/api/messaging/calls/token/route.ts`          |
| Messaging client token (`createMessagingClientTokenMint`)                                                                                                                        | `app/api/polymorfa/token/route.ts`                |
| Client rules                                                                                                                                                                     | `app/api/messaging/client-rules/route.ts`         |
| QuickLink create, status, cancel                                                                                                                                                 | `app/api/messaging/quicklinks/route.ts`           |
| Cloud onboarding, testing fixtures, testing QuickLink                                                                                                                            | `app/api/messaging/onboarding/route.ts`           |
| Observation policies                                                                                                                                                             | `app/api/messaging/observation-policies/route.ts` |
| BanSafe settings (Messaging API)                                                                                                                                                 | `app/api/messaging/bansafe/route.ts`              |
| Messaging webhook registrations                                                                                                                                                  | `app/api/messaging/webhooks/route.ts`             |
| Inbox history and sends                                                                                                                                                          | `app/api/messaging/inbox/route.ts`                |
| Organization, members, API keys, project tokens                                                                                                                                  | `app/api/admin/organization/route.ts`             |
| Projects, Safe Mode, warm-up, insurance, Health policy, production enrollment                                                                                                    | `app/api/admin/projects/route.ts`                 |
| Customers and pairing links, with cursor pagination                                                                                                                              | `app/api/admin/customers/route.ts`                |
| Audiences                                                                                                                                                                        | `app/api/admin/audiences/route.ts`                |
| Opt-outs                                                                                                                                                                         | `app/api/admin/opt-outs/route.ts`                 |
| Management campaigns                                                                                                                                                             | `app/api/admin/campaigns/route.ts`                |
| Management media                                                                                                                                                                 | `app/api/admin/media/route.ts`                    |
| Billing                                                                                                                                                                          | `app/api/admin/billing/route.ts`                  |
| Audit logs, security incidents, session bans                                                                                                                                     | `app/api/admin/security/route.ts`                 |
| Management sessions, batches, tier changes                                                                                                                                       | `app/api/admin/sessions/route.ts`                 |
| BanSafe Health, telemetry, findings, incidents, claims                                                                                                                           | `app/api/admin/bansafe/route.ts`                  |
| Events with `CursorPage` iteration, replay                                                                                                                                       | `app/api/admin/events/route.ts`                   |
| Webhooks, deliveries, attempts, retries, secret rotation                                                                                                                         | `app/api/admin/webhooks/route.ts`                 |
| Session configuration and QuickLink settings                                                                                                                                     | `app/api/admin/settings/route.ts`                 |
| `SystemClient` and `BridgeClient`                                                                                                                                                | `app/api/admin/bridge/route.ts`                   |
| Signed webhooks (`readVerifiedWebhook`, `isEvent`)                                                                                                                               | `app/api/polymorfa/webhooks/route.ts`             |
| Server-sent events relay                                                                                                                                                         | `app/api/events/route.ts`, `lib/realtime.ts`      |
| `PolymorfaProvider`, appearance, locale, dev assistant                                                                                                                           | `app/providers.tsx`                               |
| Inbox: `ChatDrawer`, `MessageList`, `ComposeBox`                                                                                                                                 | `app/inbox/inbox.tsx`                             |
| `TemplateBuilder`                                                                                                                                                                | `app/templates/templates.tsx`                     |
| `CallSurface`, `DialPad`, webhook call relay                                                                                                                                     | `app/calls/calls.tsx`                             |
| Web Components                                                                                                                                                                   | `app/elements/elements.tsx`                       |
| Admin console                                                                                                                                                                    | `app/admin/admin.tsx`                             |

Route handlers take a JSON body with an `action` field, for example:

```bash
curl -X POST http://localhost:3000/api/messaging/messages \
  -H 'content-type: application/json' \
  -H 'idempotency-key: 8a4f1c52-0d7e-4f4e-9d0c-2b8c3c4f0e11' \
  --cookie 'acme_demo_user=casey' \
  -d '{"action":"send","kind":"text","chat":{"phoneNumber":"+15550100"},"text":"Hello"}'
```

## Limits of this example

- Sources import each other with `.js` specifiers so the root NodeNext
  typecheck accepts them. `next.config.mjs` maps those specifiers to the
  `.ts` and `.tsx` files.
- `lib/realtime.ts` keeps message history and event listeners in memory, so it
  works only with a single server process. Use a shared store and pub/sub in
  production.
- The Messaging API does not serve chat history. The inbox shows messages
  this application received through webhooks or sent itself.
- The server SDK has no call placement method. The calls page places calls
  with the browser client token through `BrowserCallsApi`.
- Management campaign, audience, opt-out, and media payloads are open objects
  in the API contract. Those routes forward the caller's `payload` unchanged.
