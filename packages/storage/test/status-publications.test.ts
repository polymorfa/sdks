import { describe, it, expect } from "vitest";
import { reduceEvent, STORED_EVENT_TYPES } from "../src/reducer/events.js";
import type { WebhookEvent } from "@polymorfa/sdk";

describe("status publication storage boundary", () => {
  it.each(["status.received", "status.update", "status.revoked"])(
    "does not turn %s into chats, contacts or messages",
    (event) => {
      const publication = {
        id: "event",
        session: "number",
        timestamp: "2026-11-15T00:00:00Z",
        event,
        payload: {
          id: "123",
          scope: "personal",
          publisher: { id: "456" },
          content: { type: "text", text: "authored publication" },
        },
      } as WebhookEvent;
      expect(reduceEvent(publication).operations).toEqual([]);
      expect(STORED_EVENT_TYPES).not.toContain(event);
    },
  );
});
