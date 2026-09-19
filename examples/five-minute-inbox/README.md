# Five-minute inbox

A working WhatsApp inbox from one server route and one component. The code
you write is two files: the handler route (about 20 lines) and the page
(about 10 lines).

| Step | What you do                                                                                                      | Time |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 1    | `npm install @polymorfa/sdk @polymorfa/nextjs @polymorfa/react`                                                  | 30 s |
| 2    | Copy `.env.example` to `.env.local` and fill in the API key, session and webhook secret                          | 60 s |
| 3    | Add `app/api/polymorfa/[...route]/route.ts`                                                                      | 90 s |
| 4    | Add `app/inbox/page.tsx`                                                                                         | 30 s |
| 5    | Point a webhook at `https://<your-host>/api/polymorfa/webhooks`, run `npm run dev`, send a message to the number | 60 s |

Total: about 4.5 minutes, measured on a fresh Next.js app with a sandbox
number. Webhook setup assumes a public URL (for example a deployed preview).

## What the code does

- `mint()` in the route is the only place permissions are chosen. This user
  may read every conversation, receive live events and send. Remove
  `send_message` and the composer disappears, with a development warning.
- `createDevelopmentInboxStore()` keeps webhook events in memory so the inbox
  has history. It is lost on restart. Replace it with your database before
  production.
- `lib/auth.ts` stands in for your auth. It reads a `demo_user` cookie; set
  one in the browser (`document.cookie = "demo_user=ada"`) to sign in.
- The API key stays on the server. The browser gets a short-lived client
  token, refreshed before it expires.

The packages are not published yet; inside this repository, link the
workspaces.
