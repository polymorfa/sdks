import { it, expect } from "vitest";
import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import {
  convexStorageTable,
  convexStorageHandlers,
} from "../src/adapters/convex.js";
import { emptyRow } from "../src/merge.js";
import { STORAGE_SCHEMA } from "../src/schema.js";
const schema = defineSchema({
  polymorfaStorage: convexStorageTable(),
  applicationRecords: defineTable({ value: v.string() }),
});
type ApplicationContext = GenericMutationCtx<
  DataModelFromSchemaDefinition<typeof schema>
>;
it("supports a real application schema and isolates the same row identity by trusted tenant", async () => {
  const t = convexTest(schema, {
    "./_generated/server.ts": () => import("convex/server"),
  });
  const first = convexStorageHandlers({ resolveNamespace: () => "ownerA" });
  const foreign = convexStorageHandlers({ resolveNamespace: () => "ownerB" });
  const row = {
    ...emptyRow(STORAGE_SCHEMA.contacts, {
      sessionId: "session",
      contactId: "contact",
    }),
    _rev: 1,
    fullName: "owned",
  };
  expect(
    await t.run((ctx: ApplicationContext) =>
      first.commit(ctx, {
        writes: [{ kind: "put", entity: "contacts", row, expectedRev: null }],
      }),
    ),
  ).toEqual({ ok: true });
  expect(
    await t.run((ctx) =>
      foreign.get(ctx, { entity: "contacts", ids: [row._id] }),
    ),
  ).toEqual([]);
  expect(
    (
      await t.run((ctx) =>
        first.get(ctx, { entity: "contacts", ids: [row._id] }),
      )
    )[0]?.fullName,
  ).toBe("owned");
});
