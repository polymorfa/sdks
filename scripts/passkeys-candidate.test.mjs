import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import Ajv from "ajv";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const m = JSON.parse(read("contracts/passkeys.candidate.json"));
const fragment = JSON.parse(read(m.fragment.path));
const f = JSON.parse(read("contracts/fixtures/passkeys.candidate.json"));
// OpenAPI 3.0 uses boolean exclusiveMinimum, unlike JSON Schema draft7.
function jsonSchema(value) {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== "object") return value;
  const out = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, jsonSchema(child)]),
  );
  if (typeof out.exclusiveMinimum === "boolean") {
    if (out.exclusiveMinimum) {
      out.exclusiveMinimum = out.minimum;
      delete out.minimum;
    } else delete out.exclusiveMinimum;
  }
  if (out.nullable && typeof out.type === "string")
    out.type = [out.type, "null"];
  delete out.nullable;
  return out;
}

test("candidate five-operation scope, immutable fragment, independent producer status", () => {
  assert.equal(m.sourceAccepted, false);
  assert.equal(m.published, false);
  assert.equal(
    m.candidateSource.commit,
    "c9902b86e4a1b52092029486cc16c1699456d539",
  );
  assert.equal(
    m.coexistingCandidate.commit,
    "0b7b739493b089c386fc21f2cf76f05f60de9151",
  );
  assert.equal(m.coexistingCandidate.sourceAccepted, false);
  assert.equal(
    m.fragment.sha256,
    createHash("sha256").update(read(m.fragment.path)).digest("hex"),
  );
  assert.equal(m.operations.length, 5);
  assert.equal(m.excluded.length, 3);
  for (const op of m.operations) {
    const actual = fragment.paths[op.path][op.method.toLowerCase()];
    assert.equal(actual.operationId, op.operationId);
    assert.equal(actual["x-required-scope"], "sessions:manage");
    assert.deepEqual(actual.security, [{ BearerAuth: [] }]);
    assert.equal(Object.keys(op.counterparts).length, 6);
    assert.equal(op.serverCredentialsOnly, true);
    if (op.method === "POST") assert.equal(op.automaticRetries, 0);
  }
  assert.deepEqual(
    f.statuses,
    fragment.components.schemas.PasskeyConfirmation.properties.status.enum,
  );
});
test("synthetic native wire values match candidate public schemas, not a live ceremony", () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  function check(schema, value) {
    const validate = ajv.compile(
      jsonSchema({
        components: fragment.components,
        ...schema,
      }),
    );
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  check({ $ref: "#/components/schemas/IssuePasskeyChallengeRequest" }, f.issue);
  check(
    { $ref: "#/components/schemas/SubmitPasskeyAssertionRequest" },
    f.assertion,
  );
  check({ $ref: "#/components/schemas/PasskeyTicket" }, f.ticket);
  check(
    { $ref: "#/components/schemas/PasskeyAssertionResult" },
    f.assertionResult,
  );
  const confirmation =
    fragment.paths["/messaging/{session}/passkey/confirmation"].post.requestBody
      .content["application/json"].schema;
  check(confirmation, f.confirm);
});
