import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  KnownWebhookEvent,
  WebhookEvent,
  WebhookEventOf,
  WebhookPayloadMap,
} from "../../typescript/src/webhooks/index.js";
import {
  BUILT_IN_REDUCERS,
  DEFAULT_SSE_EVENT_TYPES,
  type PolymorfaEvent,
} from "../src/index.js";
import { KNOWN_WEBHOOK_EVENT_TYPES } from "../../typescript/src/webhooks/index.js";
import { openStore } from "./helpers.js";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

describe("webhook contract", () => {
  it("accepts the SDK webhook event union", () => {
    expectTypeOf<WebhookEvent>().toExtend<PolymorfaEvent>();
    expectTypeOf<KnownWebhookEvent>().toExtend<PolymorfaEvent>();
    expectTypeOf<
      WebhookEventOf<"message.received", WebhookPayloadMap["message.received"]>
    >().toExtend<PolymorfaEvent>();
  });

  it("routes only known webhook event types", () => {
    const known = new Set<string>(KNOWN_WEBHOOK_EVENT_TYPES);
    expect(
      Object.keys(BUILT_IN_REDUCERS).filter((type) => !known.has(type)),
    ).toEqual([]);
    expect(DEFAULT_SSE_EVENT_TYPES.filter((type) => !known.has(type))).toEqual(
      [],
    );
  });

  it("follows every reduced event type by default", () => {
    expect([...DEFAULT_SSE_EVENT_TYPES].sort()).toEqual(
      Object.keys(BUILT_IN_REDUCERS).sort(),
    );
    expect(DEFAULT_SSE_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "group.update",
        "blocklist.update",
        "session.phone_offline",
      ]),
    );
  });

  it("accepts a typed SDK event at runtime", async () => {
    const store = await openStore({ indexedDB: null });
    const webhook: KnownWebhookEvent = {
      id: "evt_1",
      session: "support",
      timestamp: "2026-09-01T10:00:00Z",
      event: "session.status",
      payload: { status: "ready" },
    };
    expect((await store.ingest(webhook)).accepted).toBe(1);
    store.close();
  });

  it("contains no server SDK import or server key", () => {
    const matches = readdirSync(sourceRoot)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => {
        const source = readFileSync(join(sourceRoot, name), "utf8");
        return (
          source.includes("@polymorfa/sdk") ||
          source.includes("typescript/src") ||
          /pmfa_(?!ct_|\[)/.test(source)
        );
      });
    expect(matches).toEqual([]);
  });
});
