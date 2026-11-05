import { expect, it } from "vitest";
import { webhooks } from "@polymorfa/sdk";
import {
  createStorage,
  memoryAdapter,
  storageWebhookHandler,
} from "../src/index.js";

const descriptor = {
  delivery: "descriptor" as const,
  whatsapp_ids: { linked_devices: "synthetic-notification" },
  syncType: "RECENT",
  fileLength: 2,
  progress: 92,
  inline: {
    encoding: "zlib-base64-protobuf" as const,
    data: "eJzjYAYAABUADA==",
  },
};

it("refuses an undecoded signed descriptor before consuming its progress or marker", async () => {
  const event = {
    id: "descriptor-event",
    session: "descriptor-session",
    event: "history.sync" as const,
    timestamp: "2026-10-17T00:00:00Z",
    payload: descriptor,
  };
  const signed = await webhooks.createFixture({
    event,
    secret: "synthetic-descriptor-secret",
  });
  const verified = await webhooks.verify({
    body: signed.body,
    signature: signed.signature,
    secret: "synthetic-descriptor-secret",
  });
  const adapter = memoryAdapter();
  const storage = createStorage(adapter);
  await expect(storageWebhookHandler(storage)(verified)).rejects.toThrow(
    "descriptor",
  );
  expect(await storage.hasEvent(event.session, event.id)).toBe(false);
  expect(adapter.rows("history_progress")).toHaveLength(0);
});

import * as sdk from "@polymorfa/sdk";
import * as storageLib from "../src/index.js";
import * as history from "../../typescript/src/history/index.js";
import { readFileSync } from "node:fs";
import { prove } from "./history-descriptor-proof.mjs";
it("keeps the public descriptor handling, validation, identity and replay contract", async () => {
  const fixture: unknown = JSON.parse(
    readFileSync(
      new URL("./fixtures/history-descriptor.json", import.meta.url),
      "utf8",
    ),
  );
  expect(
    (await prove(sdk, storageLib, fixture, history)).outcomes,
  ).toBeGreaterThan(50);
});
// Compile controls retain the old archive callback and exclude nullable descriptor returns.
const archiveOptions: storageLib.ApplyEventOptions = {
  decodeHistory: async (payload) => {
    void payload.whatsapp.data;
    return null;
  },
};
const descriptorOptions: storageLib.ApplyEventOptions = {
  decodeHistoryDescriptor: async (payload) => {
    void payload.delivery;
    return {};
  },
  historyDescriptorMode: "decode",
};
const badReturn: storageLib.ApplyEventOptions = {
  // @ts-expect-error Descriptors require a non-null decoded projection.
  decodeHistoryDescriptor: async () => null,
};
const badMode: storageLib.ApplyEventOptions = {
  // @ts-expect-error Mode is explicit and closed.
  historyDescriptorMode: "skip",
};
void [archiveOptions, descriptorOptions, badReturn, badMode];

it("validates descriptor mode even when a stream explicitly permits absent payloads", () => {
  const source: storageLib.EventStreamSource = {
    async *stream() {
      yield* [];
    },
    async acknowledgeStream() {
      return undefined;
    },
  };
  expect(() =>
    storageLib.syncToStorage(source, memoryAdapter(), {
      requirePayload: false,
      // @ts-expect-error Exercise an invalid raw JavaScript option.
      historyDescriptorMode: "skip",
    }),
  ).toThrow("descriptor mode");
});

it("rejects unprojected descriptor fields before metadata-only consumption", async () => {
  for (const payload of [
    { ...descriptor, unprojected: "synthetic" },
    {
      ...descriptor,
      inline: { ...descriptor.inline, unprojected: "synthetic" },
    },
  ]) {
    const adapter = memoryAdapter();
    await expect(
      storageLib.applyEvent(
        adapter,
        {
          id: "strict-fields",
          session: "session",
          event: "history.sync",
          timestamp: "2026-10-17T00:00:00Z",
          payload,
        },
        { historyDescriptorMode: "metadata-only" },
      ),
    ).rejects.toThrow("descriptor");
    expect(adapter.rows("history_progress")).toHaveLength(0);
  }
});
