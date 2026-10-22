import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { WebhookEvent } from "@polymorfa/sdk";
import { createStorage } from "../src/engine.js";
import { memoryAdapter } from "../src/adapters/memory.js";
import {
  ENTITY_NAMES,
  STORAGE_SCHEMA,
  STORAGE_SCHEMA_VERSION,
} from "../src/schema.js";
import { publicRow } from "../src/merge.js";
import { reduceEvent } from "../src/reducer/events.js";
import { reduceHistoryChunk } from "../src/reducer/history.js";
import type { HistorySyncChunk } from "../src/history-types.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("../conformance-fixtures.json", import.meta.url),
    "utf8",
  ),
) as {
  schemaVersion: number;
  events: WebhookEvent[];
  eventRows: unknown;
  history: HistorySyncChunk;
  historyRows: unknown;
};
const snapshot = (adapter: ReturnType<typeof memoryAdapter>) =>
  Object.fromEntries(
    ENTITY_NAMES.filter(
      (entity) => entity !== "leases" && entity !== "events",
    ).map((entity) => [
      entity,
      adapter.rows(entity).map((row) => publicRow(STORAGE_SCHEMA[entity], row)),
    ]),
  );
describe("portable language fixtures", () => {
  it("matches fixed event outcomes and idempotent replay", async () => {
    expect(fixture.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    const adapter = memoryAdapter();
    const storage = createStorage(adapter);
    for (const event of fixture.events) await storage.apply(reduceEvent(event));
    expect(snapshot(adapter)).toEqual(fixture.eventRows);
    for (const event of fixture.events)
      expect((await storage.apply(reduceEvent(event))).applied).toBe(false);
    expect(snapshot(adapter)).toEqual(fixture.eventRows);
  });
  it("matches fixed decoded-history outcomes and replay", async () => {
    const adapter = memoryAdapter();
    const storage = createStorage(adapter);
    const batch = reduceHistoryChunk({
      sessionId: "portable-fixture",
      chunk: fixture.history,
    });
    await storage.apply(batch);
    expect(snapshot(adapter)).toEqual(fixture.historyRows);
    expect((await storage.apply(batch)).writes).toBe(0);
  });
});
