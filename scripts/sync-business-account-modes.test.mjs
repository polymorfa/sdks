import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBusinessContract } from "./sync-business-account-modes.mjs";
const sha = "a".repeat(40);
function fixture() {
  return {
    paths: {
      "/mode": {
        put: {
          operationId: "setTestingAccountMode",
          responses: { 200: { $ref: "#/components/schemas/Mode" } },
        },
      },
      "/links": { post: { operationId: "createQuickLink" } },
      "/profile": { get: { operationId: "getBusinessProfile" } },
      "/unrelated": { get: { operationId: "other" } },
    },
    components: {
      schemas: {
        Mode: {
          type: "object",
          properties: {
            recursive: { $ref: "#/components/schemas/Mode" },
            platform: { $ref: "#/components/schemas/Platform" },
          },
        },
        Platform: { enum: ["android", "ios"] },
        Unrelated: { type: "string" },
      },
    },
  };
}
test("projects only the three bound operations and their transitive references", () => {
  const c = extractBusinessContract(JSON.stringify(fixture()), sha);
  assert.deepEqual(Object.keys(c.sources.messaging.paths), [
    "/mode",
    "/links",
    "/profile",
  ]);
  assert.deepEqual(Object.keys(c.sources.messaging.components.schemas), [
    "Mode",
    "Platform",
  ]);
  assert.equal(c.commit, sha);
  assert.equal(c.releaseStatus, "source-only");
  assert.match(c.sources.messaging.sourceSha256, /^[a-f0-9]{64}$/);
});
test("fails closed on an incomplete operation set", () => {
  const c = fixture();
  delete c.paths["/mode"];
  assert.throws(
    () => extractBusinessContract(JSON.stringify(c), sha),
    /missing/,
  );
});
test("rejects ambiguous operation identities", () => {
  const c = fixture();
  c.paths["/other"] = { put: { operationId: "setTestingAccountMode" } };
  assert.throws(
    () => extractBusinessContract(JSON.stringify(c), sha),
    /Duplicate/,
  );
});
test("rejects an unresolvable or external reference", () => {
  for (const ref of [
    "#/components/schemas/Missing",
    "https://example.test/schema",
  ]) {
    const c = fixture();
    c.components.schemas.Mode.properties.recursive.$ref = ref;
    assert.throws(
      () => extractBusinessContract(JSON.stringify(c), sha),
      /reference/,
    );
  }
});
test("requires an immutable full source commit", () =>
  assert.throws(
    () => extractBusinessContract(JSON.stringify(fixture()), "main"),
    /exact/,
  ));
