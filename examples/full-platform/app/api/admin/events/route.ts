import type { ProjectEvent } from "@polymorfa/sdk";

import { project } from "../../../../lib/polymorfa.js";
import {
  action,
  idempotencyKey,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Durable project events. `list` returns a CursorPage: iterate it with
// `for await`, or call `nextPage()` yourself.
export const GET = route("admin", async ({ url }) => {
  const type = url.searchParams.get("type") ?? undefined;
  const page = await project().events.list({
    limit: 50,
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...(type === undefined ? {} : { type }),
  });
  const events: ProjectEvent[] = [];
  for await (const event of page) {
    events.push(event);
    if (events.length >= 200) break;
  }
  return { events, requestId: page.response.metadata.requestId };
});

export const POST = route("admin", async ({ body, request }) => {
  const events = project().events;
  switch (action(body)) {
    case "retrieve":
      return events.retrieve(text(body, "eventId"), { includePayload: true });
    case "replay":
      return events.replay(
        text(body, "eventId"),
        { webhookId: text(body, "webhookId") },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "nextPage": {
      const page = await events.list({
        limit: 50,
        cursor: text(body, "cursor"),
      });
      return { items: page.items, nextCursor: page.nextCursor };
    }
    default:
      return unknownAction(action(body));
  }
});
