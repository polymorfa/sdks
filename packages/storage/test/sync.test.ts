import { describe, expect, it } from "vitest";
import type { EventStreamItem, EventStreamParams } from "@polymorfa/sdk";
import { Client } from "@polymorfa/sdk";
import { createStorage } from "../src/engine.js";
import { memoryAdapter } from "../src/adapters/memory.js";
import { conformanceEvents } from "../src/conformance.js";
import { syncToStorage, type EventStreamSource } from "../src/sync.js";

function item(cursor = "cursor-1", sequence = 1): EventStreamItem {
  const webhook = conformanceEvents("sync-fixture")[0]!;
  return {
    cursor,
    sequence,
    streamId: "fixture-stream",
    webhook: webhook as EventStreamItem["webhook"],
    event: {
      id: webhook.id,
      organizationId: "fixture-org",
      projectId: "fixture-project",
      type: webhook.event,
      source: "runtime",
      environment: "development",
      createdAt: webhook.timestamp,
      payloadAvailability: "available",
      payload: null,
      replayableUntil: null,
      metadataExpiresAt: "2026-10-15T00:00:00Z",
    },
  };
}
function source(
  items: EventStreamItem[],
  observe: (params: EventStreamParams) => void = () => undefined,
  acknowledge: EventStreamSource["acknowledgeStream"] = async () => undefined,
): EventStreamSource {
  return {
    async *stream(params) {
      observe(params);
      for (const value of items) {
        if (params.signal?.aborted) break;
        yield value;
      }
    },
    acknowledgeStream: acknowledge,
  };
}
describe("durable stream synchronization", () => {
  it("stores data and cursor before manual acknowledgement and resumes the cursor", async () => {
    const storage = createStorage(memoryAdapter());
    const delivered = item();
    let params: EventStreamParams | undefined;
    let acknowledgements = 0;
    await syncToStorage(
      source(
        [delivered],
        (value) => {
          params = value;
        },
        async (streamId, input) => {
          expect(streamId).toBe(delivered.streamId);
          expect(input).toEqual({
            cursor: delivered.cursor,
            sequence: delivered.sequence,
          });
          expect(
            await storage.hasEvent("sync-fixture", delivered.webhook!.id),
          ).toBe(true);
          expect((await storage.getCheckpoint("*", "events"))?.cursor).toBe(
            delivered.cursor,
          );
          acknowledgements++;
        },
      ),
      storage,
    ).done;
    expect(params?.ack).toBe("manual");
    expect(acknowledgements).toBe(1);
    await syncToStorage(
      source([], (value) => {
        expect(value.since).toBe(delivered.cursor);
      }),
      storage,
    ).done;
  });
  it("fails closed on missing bodies without storing or acknowledging the cursor", async () => {
    const storage = createStorage(memoryAdapter());
    let acked = false;
    await expect(
      syncToStorage(
        source([{ ...item(), webhook: null }], undefined, async () => {
          acked = true;
        }),
        storage,
      ).done,
    ).rejects.toThrow("body is unavailable");
    expect(await storage.getCheckpoint("*", "events")).toBeNull();
    expect(acked).toBe(false);
  });
  it("requires explicit metadata-only consumption", async () => {
    const storage = createStorage(memoryAdapter());
    let acked = false;
    await syncToStorage(
      source([{ ...item(), webhook: null }], undefined, async () => {
        acked = true;
      }),
      storage,
      { requirePayload: false },
    ).done;
    expect(acked).toBe(true);
    expect((await storage.getCheckpoint("*", "events"))?.cursor).toBe(
      "cursor-1",
    );
  });
  it("stops on a retention gap instead of silently advancing", async () => {
    const storage = createStorage(memoryAdapter());
    let noticed = false;
    await expect(
      syncToStorage(
        source([item()], (params) => {
          params.onGap?.({
            reason: "retention_exceeded",
            missedEvents: 2,
            requestedCursor: null,
          });
        }),
        storage,
        {
          params: {
            onGap: () => {
              noticed = true;
            },
          },
        },
      ).done,
    ).rejects.toThrow("storage gap");
    expect(noticed).toBe(true);
    expect(await storage.getCheckpoint("*", "events")).toBeNull();
  });
  it("persists before ACK failure and safely deduplicates an unacknowledged replay", async () => {
    const storage = createStorage(memoryAdapter());
    const delivered = item();
    await expect(
      syncToStorage(
        source([delivered], undefined, async () => {
          throw new Error("fixture ACK unavailable");
        }),
        storage,
      ).done,
    ).rejects.toThrow("ACK unavailable");
    expect((await storage.getCheckpoint("*", "events"))?.cursor).toBe(
      delivered.cursor,
    );
    let applied: boolean | undefined;
    await syncToStorage(source([delivered]), storage, {
      onApplied: (_item, result) => {
        applied = result.applied;
      },
    }).done;
    expect(applied).toBe(false);
  });
  it("accepts the real project-bound SDK source without a wrapper", () => {
    const client = new Client({
      credential: {
        type: "organizationApiKey",
        value: `pmfa_${"A".repeat(72)}`,
      },
    });
    const actual: EventStreamSource = client.project("fixture-project").events;
    expect(typeof actual.stream).toBe("function");
    expect(typeof actual.acknowledgeStream).toBe("function");
  });
});
