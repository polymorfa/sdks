import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStorage,
  ENTITY_NAMES,
  publicRow,
  reduceEvent,
  reduceHistoryChunk,
  STORAGE_SCHEMA,
  type EntityName,
  type HistoryChunkInput,
  type RowKey,
  type StorageAdapter,
} from "../src/index.js";
import type { WebhookEvent } from "@polymorfa/sdk";
import { memoryAdapter } from "../src/adapters/memory.js";
import { sqliteAdapter } from "../src/adapters/sqlite.js";

interface Step {
  history?: HistoryChunkInput;
  event?: WebhookEvent;
  operations?: unknown;
  applied?: boolean;
}
const fixture = JSON.parse(
  readFileSync(
    new URL("../history-edit-guard-fixtures.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: {
    name: string;
    steps: Step[];
    expect: { entity: EntityName; key: RowKey; text: string | null }[];
    rows?: Record<string, unknown[]>;
  }[];
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

async function run(adapter: StorageAdapter, steps: Step[]) {
  const storage = createStorage(adapter);
  const results = [];
  for (const step of steps) {
    const batch = step.history
      ? reduceHistoryChunk(step.history)
      : reduceEvent(step.event!);
    results.push({
      operations: json(batch.operations),
      applied: (await storage.apply(batch)).applied,
    });
  }
  return { storage, results };
}

describe("historical protocol edits honor chat clear and delete watermarks", () => {
  for (const c of fixture.cases) {
    it(c.name, async () => {
      const adapter = memoryAdapter();
      const { storage, results } = await run(adapter, c.steps);
      for (const e of c.expect) {
        const row = await storage.get(e.entity, e.key);
        expect(row === null ? null : row.text).toBe(e.text);
      }
      if (c.rows) {
        expect(results).toEqual(
          c.steps.map((s) => ({
            operations: s.operations,
            applied: s.applied,
          })),
        );
        const rows = Object.fromEntries(
          ENTITY_NAMES.filter((e) => e !== "leases" && e !== "events")
            .map((e) => [
              e,
              json(adapter.rows(e).map((r) => publicRow(STORAGE_SCHEMA[e], r))),
            ])
            .filter(([, r]) => (r as unknown[]).length > 0),
        );
        expect(rows).toEqual(c.rows);
      }
    });
  }

  it("records producer operations and rows for every case", () => {
    for (const c of fixture.cases) expect(c.rows, c.name).toBeDefined();
  });

  describe.skipIf(Number(process.versions.node.split(".")[0]) < 22)(
    "node:sqlite JSON roundtrip",
    () => {
      for (const name of [
        "stale-edit-after-clear",
        "newer-edit-after-delete",
        "replay-applied-edit-after-clear",
      ]) {
        it(name, async () => {
          const c = fixture.cases.find((x) => x.name === name)!;
          const { DatabaseSync } = await import("node:sqlite");
          const adapter = sqliteAdapter(new DatabaseSync(":memory:"), {
            closeClient: true,
          });
          await adapter.setup?.();
          const { storage } = await run(adapter, c.steps);
          for (const e of c.expect) {
            const row = await storage.get(e.entity, e.key);
            expect(row === null ? null : row.text).toBe(e.text);
          }
          await adapter.close?.();
        });
      }
    },
  );
});
