import { describe, expect, it, vi } from "vitest";
import {
  CallLogController,
  callLogReducer,
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

describe("callLogReducer", () => {
  const relay = (event: string, payload: object, timestamp = "2026-10-27T10:00:00Z") => ({
    id: `${event}-${Math.random()}`,
    session: "support",
    event,
    timestamp,
    payload,
  });

  it("follows a call from ringing to answered with its duration", () => {
    const reduce = callLogReducer();
    expect(reduce(relay("call.received", { callId: "c", from: { id: "1", phoneNumber: "+1555" }, hasVideo: true }))).toMatchObject({
      outcome: "ongoing",
      video: true,
      peer: { id: "1", phoneNumber: "+1555" },
      conversationId: "1",
    });
    expect(
      reduce(relay("call.ended", { callId: "c", from: null, durationSeconds: 125, direction: "inbound", hadVideo: true, reason: "hangup" }, "2026-10-27T10:03:00Z")),
    ).toMatchObject({ outcome: "answered", durationSeconds: 125, startedAt: Date.parse("2026-10-27T10:00:00Z"), peer: { id: "1" } });
  });

  it("keeps missed and declined, and ignores other events", () => {
    const reduce = callLogReducer();
    reduce(relay("call.received", { callId: "m", from: { id: "1" } }));
    reduce(relay("call.missed", { callId: "m", from: { id: "1" }, reason: "timeout" }));
    expect(reduce(relay("call.ended", { callId: "m", from: { id: "1" }, durationSeconds: 0, direction: "inbound", hadVideo: false, reason: "timeout" }))?.outcome).toBe("missed");
    reduce(relay("call.received", { callId: "r", from: { id: "2" } }));
    expect(reduce(relay("call.rejected", { callId: "r", from: { id: "2" } }))?.outcome).toBe("declined");
    expect(reduce(relay("message.received", { id: "x" }))).toBeUndefined();
    expect(reduce(relay("call.telemetry", { callId: "q", setupMs: 3 }))).toBeUndefined();
  });
});
