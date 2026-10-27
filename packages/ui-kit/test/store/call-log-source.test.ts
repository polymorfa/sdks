import { describe, expect, it } from "vitest";
import { createStoreCallLogSource } from "../../src/store/index.js";
import { openStore } from "./helpers.js";

describe("createStoreCallLogSource", () => {
  it("lists calls reduced from relayed events and names peers from contacts", async () => {
    const store = await openStore();
    await store.ingest([
      { id: "e1", session: "support", event: "call.received", timestamp: "2026-10-27T10:00:00Z", payload: { callId: "c1", from: { id: "7", phoneNumber: "+15550007" }, hasVideo: false } },
      { id: "e2", session: "support", event: "call.missed", timestamp: "2026-10-27T10:00:30Z", payload: { callId: "c1", from: { id: "7" }, reason: "timeout" } },
      { id: "e3", session: "support", event: "call.received", timestamp: "2026-10-27T11:00:00Z", payload: { callId: "c2", from: { id: "8" } } },
      { id: "e4", session: "support", event: "call.accepted", timestamp: "2026-10-27T11:00:05Z", payload: { callId: "c2", from: { id: "8" } } },
      { id: "e5", session: "support", event: "call.ended", timestamp: "2026-10-27T11:02:05Z", payload: { callId: "c2", from: { id: "8" }, durationSeconds: 120, direction: "inbound", hadVideo: true, reason: "hangup" } },
    ]);
    const source = createStoreCallLogSource(store);
    const page = await source.list();
    const byId = Object.fromEntries(page.entries.map((entry) => [entry.id, entry]));
    expect(byId.c1).toMatchObject({ outcome: "missed", direction: "inbound", peer: { id: "7", phoneNumber: "+15550007" }, conversationId: "7" });
    expect(byId.c2).toMatchObject({ outcome: "answered", video: true, durationSeconds: 120 });
    store.close();
  });
});
