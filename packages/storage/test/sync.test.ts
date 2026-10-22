import { describe, expect, it } from "vitest";
import { ORGANIZATION_API_KEY } from "../../typescript/test/support/credentials.js";
import type { EventStreamItem, EventStreamParams } from "@polymorfa/sdk";
import { Client, webhooks } from "@polymorfa/sdk";
import { decodeHistorySyncPayload } from "../../typescript/src/history/index.js";
import { gzipSync } from "node:zlib";
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
  it("keeps real decoder failures ahead of storage, checkpoint and ACK", async () => {
    const valid = gzipSync(new Uint8Array([8, 3]));
    const compressed = new Uint8Array([
      ...valid,
      ...gzipSync(new Uint8Array()),
    ]);
    for (const [bytes, rejected] of [
      [compressed, true],
      [valid, false],
    ] as const) {
      const archive = {
        id: "strict-history-event",
        session: "sync-fixture",
        timestamp: "2026-10-17T00:00:00Z",
        event: "history.sync" as const,
        payload: {
          whatsapp_ids: { linked_devices: "synthetic-history" },
          messages: [],
          mode: "deliver" as const,
          syncType: "RECENT",
          chunkOrder: 0,
          progress: 92,
          fileLength: 2,
          conversationCount: 0,
          messageCount: 0,
          pushNameCount: 0,
          statusMessageCount: 0,
          whatsapp: {
            encoding: "gzip-base64-protobuf" as const,
            data: Buffer.from(bytes).toString("base64"),
          },
        },
      };
      const signed = await webhooks.createFixture({
        event: archive,
        secret: "synthetic-history-secret",
      });
      const verified = await webhooks.verify({
        body: signed.body,
        signature: signed.signature,
        secret: "synthetic-history-secret",
      });
      const storage = createStorage(memoryAdapter());
      let acknowledgements = 0;
      const delivered = {
        ...item(),
        webhook: verified as EventStreamItem["webhook"],
      };
      const done = syncToStorage(
        source([delivered], undefined, async () => {
          acknowledgements++;
        }),
        storage,
        {
          decodeHistory: async (payload) => {
            const decoded = await decodeHistorySyncPayload(
              payload.whatsapp.data,
            );
            return {
              syncType: decoded.syncType,
              chunkOrder: decoded.chunkOrder,
              progress: decoded.progress,
            };
          },
        },
      ).done;
      if (rejected)
        await expect(done).rejects.toMatchObject({
          code: "media_invalid_ciphertext",
        });
      else await done;
      expect(await storage.hasEvent(archive.session, archive.id)).toBe(
        !rejected,
      );
      expect(await storage.getCheckpoint("*", "events")).toEqual(
        rejected ? null : expect.objectContaining({ cursor: delivered.cursor }),
      );
      const progress = await storage.get("history_progress", {
        sessionId: archive.session,
        syncType: "RECENT",
      });
      expect(progress === null).toBe(rejected);
      expect(acknowledgements).toBe(rejected ? 0 : 1);
    }
  });
  it("accepts the real project-bound SDK source without a wrapper", () => {
    const client = new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
    });
    const actual: EventStreamSource = client.project("fixture-project").events;
    expect(typeof actual.stream).toBe("function");
    expect(typeof actual.acknowledgeStream).toBe("function");
  });
});
