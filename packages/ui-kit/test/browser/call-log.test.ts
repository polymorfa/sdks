import { describe, expect, it, vi } from "vitest";
import {
  CallLogController,
  PolymorfaClient,
  createApiCallLogSource,
  groupCallLog,
  type CallLogEntry,
  type CallLogSource,
} from "@polymorfa/ui-kit";

const day = Date.parse("2026-10-27T12:00:00");
const entry = (id: string, at: number, extra: Partial<CallLogEntry> = {}): CallLogEntry => ({
  id,
  direction: "inbound",
  outcome: "missed",
  video: false,
  startedAt: at,
  peer: { id: "1", name: "Ada" },
  conversationId: "1",
  ...extra,
});

describe("groupCallLog", () => {
  it("merges consecutive same-person, same-kind calls on one day, like WhatsApp", () => {
    const groups = groupCallLog([
      entry("a", day),
      entry("b", day - 60_000),
      entry("c", day - 120_000, { outcome: "answered" }),
      entry("d", day - 180_000),
      entry("e", day - 86_400_000),
      entry("f", day - 86_500_000, { video: true }),
      entry("g", day - 86_600_000, { outcome: "ongoing" }),
      entry("h", day - 86_700_000, { outcome: "ongoing" }),
    ]);
    expect(groups.map((group) => group.entries.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
      ["h"],
    ]);
  });
});

describe("CallLogController", () => {
  it("sorts newest first, filters missed calls and applies live updates", async () => {
    let push: ((entry: CallLogEntry) => void) | undefined;
    const source: CallLogSource = {
      list: async () => ({
        entries: [entry("old", day - 10_000, { outcome: "answered", durationSeconds: 65 }), entry("new", day)],
        nextCursor: "c2",
      }),
      subscribe: (listener) => {
        push = listener;
        return () => undefined;
      },
    };
    const log = new CallLogController(source);
    await log.load();
    expect(log.getSnapshot().entries.map((item) => item.id)).toEqual(["new", "old"]);
    expect(log.getSnapshot().hasMore).toBe(true);
    log.setFilter("missed");
    expect(log.getSnapshot().groups.map((group) => group.latest.id)).toEqual(["new"]);
    push!(entry("live", day + 5_000, { peer: { id: "2", name: "Grace" }, conversationId: "2" }));
    expect(log.getSnapshot().groups.map((group) => group.latest.id)).toEqual(["live", "new"]);
    push!(entry("live", day + 5_000, { outcome: "answered", peer: { id: "2" } }));
    expect(log.getSnapshot().groups.map((group) => group.latest.id)).toEqual(["new"]);
    expect(log.getSnapshot().entries).toHaveLength(3);
  });

  it("reports a failed load and appends the next page", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ entries: [entry("a", day)], nextCursor: "p2" })
      .mockResolvedValueOnce({ entries: [entry("b", day - 1)] });
    const log = new CallLogController({ list });
    await log.load();
    expect(log.getSnapshot()).toMatchObject({ status: "error", error: "offline" });
    await log.load();
    await log.loadMore();
    expect(list).toHaveBeenLastCalledWith("p2", expect.any(AbortSignal));
    expect(log.getSnapshot()).toMatchObject({ status: "ready", hasMore: false });
    expect(log.getSnapshot().entries.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("createApiCallLogSource", () => {
  it("reads the number's calls with read_calls and maps callers", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "/api/polymorfa/token")
        return Response.json({ value: "pmfa_ct_Zml4dHVyZQ", audience: "browser", expiresAt: Date.now() + 600_000, grant: { session: "support", conversations: "all", allow: ["read_calls"] } });
      calls.push(new URL(url).pathname + new URL(url).search);
      return Response.json({
        success: true,
        data: [
          { callId: "c1", projectId: null, sessionId: "support", direction: "inbound", upstream: "linked_device", outcome: "in_progress", state: "offered", hasVideo: true, peer: { id: "15550100", phoneNumber: "+15550100" }, startedAt: "2026-10-27T10:00:00Z", connectedAt: null, endedAt: null, durationSeconds: null, endReason: null },
          { callId: "c0", projectId: null, sessionId: "support", direction: "outbound", upstream: "linked_device", outcome: "answered", state: "ended", hasVideo: false, peer: null, startedAt: "2026-10-27T09:00:00Z", connectedAt: "2026-10-27T09:00:05Z", endedAt: "2026-10-27T09:02:05Z", durationSeconds: 120, endReason: "hangup" },
        ],
        nextCursor: "next",
      });
    });
    const client = new PolymorfaClient({ fetch, baseUrl: "https://api.example" });
    await client.refresh();
    const source = createApiCallLogSource(client, { names: (peer) => (peer.id === "15550100" ? "Ada" : undefined) });
    const page = await source.list("c9");
    expect(calls).toEqual(["/messaging/support/calls?cursor=c9&limit=50"]);
    expect(page.nextCursor).toBe("next");
    expect(page.entries[0]).toMatchObject({ id: "c1", outcome: "ongoing", video: true, peer: { id: "15550100", phoneNumber: "+15550100", name: "Ada" }, conversationId: "15550100", startedAt: Date.parse("2026-10-27T10:00:00Z") });
    expect(page.entries[1]).toMatchObject({ id: "c0", outcome: "answered", durationSeconds: 120, peer: {} });
    expect(page.entries[1]).not.toHaveProperty("conversationId");
  });

  it("refuses without read_calls", async () => {
    const fetch = vi.fn(async () => Response.json({ value: "pmfa_ct_Zml4dHVyZQ", audience: "browser", expiresAt: Date.now() + 600_000, grant: { session: "support", conversations: "all", allow: [] } }));
    const client = new PolymorfaClient({ fetch });
    await client.refresh();
    await expect(createApiCallLogSource(client).list()).rejects.toMatchObject({ code: "permission_missing" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
