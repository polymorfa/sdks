import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStorage,
  ENTITY_NAMES,
  protoNumber,
  publicRow,
  reduceHistoryChunk,
  STORAGE_SCHEMA,
  type HistorySyncChunk,
  type StorageOperation,
} from "../src/index.js";
import { memoryAdapter } from "../src/adapters/memory.js";

const fixture = JSON.parse(
  readFileSync(
    new URL("../proto-number-fixtures.json", import.meta.url),
    "utf8",
  ),
) as {
  strings: { input: string; bits: string | null }[];
  histories: {
    name: string;
    chunk: HistorySyncChunk;
    operations: unknown;
    rows: unknown;
    cleanup: { operations: StorageOperation[]; rows: unknown }[];
  }[];
};
const snapshot = (adapter: ReturnType<typeof memoryAdapter>) =>
  Object.fromEntries(
    ENTITY_NAMES.filter((e) => e !== "leases" && e !== "events").map((e) => [
      e,
      adapter.rows(e).map((r) => publicRow(STORAGE_SCHEMA[e], r)),
    ]),
  );

describe("producer numeric-string contract", () => {
  it("preserves exact Number(string) finite results, including signed zero", () => {
    for (const { input, bits } of fixture.strings) {
      const value = protoNumber(input);
      const buffer = Buffer.alloc(8);
      if (value !== undefined) buffer.writeDoubleBE(value);
      expect(
        value === undefined ? null : buffer.toString("hex"),
        JSON.stringify(input),
      ).toBe(bits);
    }
  });
  for (const f of fixture.histories) {
    it(`reduces and persists ${f.name} with exact field versions and dedup`, async () => {
      const adapter = memoryAdapter();
      const storage = createStorage(adapter);
      const batch = reduceHistoryChunk({
        sessionId: "numeric",
        chunk: f.chunk,
        chunkId: f.name,
      });
      expect(JSON.parse(JSON.stringify(batch.operations))).toEqual(
        f.operations,
      );
      expect((await storage.apply(batch)).applied).toBe(true);
      expect(JSON.parse(JSON.stringify(snapshot(adapter)))).toEqual(f.rows);
      expect((await storage.apply(batch)).applied).toBe(false);
      expect(JSON.parse(JSON.stringify(snapshot(adapter)))).toEqual(f.rows);
      for (const [i, cleanup] of f.cleanup.entries()) {
        await storage.apply({
          sessionId: "numeric",
          operations: cleanup.operations,
        });
        await storage.apply({ ...batch, eventId: `${f.name}:late:${i}` });
        expect(JSON.parse(JSON.stringify(snapshot(adapter)))).toEqual(
          cleanup.rows,
        );
      }
    });
  }
  it("keeps generic numeric fields and revisions strict", async () => {
    expect(protoNumber("16")).toBe(16);
    const storage = createStorage(memoryAdapter());
    await expect(
      storage.apply({
        sessionId: "numeric",
        operations: [
          {
            kind: "upsert",
            entity: "messages",
            key: { sessionId: "numeric", messageId: "strict" },
            fields: { timestamp: { value: "16", version: 1 } },
          },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      storage.apply({
        sessionId: "numeric",
        operations: [
          {
            kind: "upsert",
            entity: "messages",
            key: { sessionId: "numeric", messageId: "strict" },
            fields: {
              timestamp: { value: 16, version: "16" as unknown as number },
            },
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
