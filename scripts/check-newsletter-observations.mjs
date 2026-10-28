import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
const root = resolve(import.meta.dirname, "..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = read("contracts/newsletter-observations.json");
assert.match(contract.sourceCommit, /^[a-f0-9]{40}$/);
assert.match(contract.sourceSha256, /^[a-f0-9]{64}$/);
assert.equal(contract.published, false);
assert.equal(contract.polymorfaVersion, "2026-09-22");
const ajv = new Ajv({ strict: false });
addFormats(ajv);
// OpenAPI 3.0 uses boolean exclusive bounds; Ajv consumes JSON Schema bounds.
function jsonSchema(value) {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (value === null || typeof value !== "object") return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, jsonSchema(item)]),
  );
  for (const bound of ["Minimum", "Maximum"]) {
    const exclusive = `exclusive${bound}`,
      inclusive = bound.toLowerCase();
    if (typeof result[exclusive] === "boolean") {
      if (result[exclusive]) result[exclusive] = result[inclusive];
      else delete result[exclusive];
    }
  }
  return result;
}
const validate = (name) =>
  ajv.compile({
    components: jsonSchema(contract.components),
    $ref: `#/components/schemas/${name}`,
  });
const payload = validate("NewsletterUpdatePayload");
const fixture = read(
  "contracts/fixtures/newsletter-observations/delivery.json",
);
for (const event of fixture.events)
  assert.ok(payload(event.payload), JSON.stringify(payload.errors));
assert.equal(
  payload({ id: "123", action: "live_update", messages: [{ position: 0 }] }),
  false,
);
const channel = validate("ChannelMessage");
assert.ok(
  channel(
    read("contracts/fixtures/newsletter-observations/channel-message.json"),
  ),
  JSON.stringify(channel.errors),
);
const live = fixture.events[0].payload;
assert.equal(live.messages[0].forwards, 0);
assert.deepEqual(live.messages[0].reactionCounts, {});
assert.deepEqual(live.messages[1], { position: 124 });
assert.deepEqual(live.messages[0].viewCounts, [
  { count: 0 },
  { type: "views", count: 11 },
]);
assert.equal(fixture.events[1].payload.milestone.type, "FUTURE_MILESTONE");
for (const [language, evidence] of Object.entries(
  contract.nativeCounterparts,
)) {
  assert.ok(
    existsSync(resolve(root, evidence.testFile)),
    `${language} native evidence missing`,
  );
  if (language !== "typescript") {
    const ledger = read(`packages/${language}/coverage.json`).supplements
      .newsletterObservations;
    assert.equal(ledger.testFile, evidence.testFile);
    assert.equal(ledger.inventory, "contracts/newsletter-observations.json");
    assert.equal(ledger.published, false);
  }
}
assert.equal(Object.keys(contract.nativeCounterparts).length, 6);
console.log(
  "Newsletter contract fixtures and six native coverage receipts match the candidate supplement.",
);
