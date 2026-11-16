import { describe, it, expect } from "vitest";
import {
  isEvent,
  KNOWN_WEBHOOK_EVENT_TYPES,
  type WebhookEvent,
  type StatusPublicationPayload,
} from "../src/webhooks/events.js";

describe("status publications", () => {
  it("narrows a status audience and shares content without inventing a chat", () => {
    const payload: StatusPublicationPayload = {
      id: "123",
      whatsapp_ids: { linked_devices: "authored-status" },
      scope: "group",
      publisher: { id: "456" },
      group: { id: "789" },
      fromMe: false,
      timestamp: 1700000000,
      pushName: "Authored",
      content: { type: "text", text: "publication" },
    };
    const event: WebhookEvent = {
      id: "event",
      session: "number",
      timestamp: "2026-11-15T00:00:00Z",
      event: "status.received",
      payload,
    };
    expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("status.received");
    expect(isEvent(event, "message.received")).toBe(false);
    if (!isEvent(event, "status.received"))
      throw new Error("status not recognized");
    expect(event.payload.content.text).toBe("publication");
    if (event.payload.scope === "group")
      expect(event.payload.group.id).toBe("789");
    expect(event.payload).not.toHaveProperty("conversation");
  });
});
