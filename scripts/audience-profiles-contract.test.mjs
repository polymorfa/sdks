import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  extract,
  scope,
  sourceCommit,
  sourcePath,
} from "./extract-audience-profiles-contract.mjs";
function fixture() {
  const paths = {};
  for (const [path, methods] of Object.entries(scope))
    paths[path] = Object.fromEntries(
      methods.map((method) => [
        method,
        {
          operationId: method + path,
          responses: { 200: { $ref: "#/components/responses/Page" } },
        },
      ]),
    );
  paths["/private/never-export"] = { get: { operationId: "private" } };
  return {
    paths,
    components: {
      responses: {
        Page: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Page" },
            },
          },
        },
      },
      schemas: {
        Page: {
          type: "object",
          properties: { next: { $ref: "#/components/schemas/Page" } },
        },
        Private: { description: "must stay outside the closure" },
      },
    },
  };
}
test("extracts only approved operations and their complete cyclic reference closure", () => {
  const input = fixture(),
    before = structuredClone(input),
    result = extract(input);
  assert.equal(Object.values(result.paths).flatMap(Object.keys).length, 8);
  assert.equal(result.paths["/private/never-export"], undefined);
  assert.equal(result.components.schemas.Private, undefined);
  assert.deepEqual(
    result.components.schemas.Page,
    input.components.schemas.Page,
  );
  assert.deepEqual(
    result.components.responses.Page,
    input.components.responses.Page,
  );
  assert.deepEqual(input, before);
});
test("refuses missing operations and unresolved or external references", () => {
  const missing = fixture();
  delete missing.paths["/platform/audience-profiles"].get;
  assert.throws(() => extract(missing), /Missing approved profile operation/);
  const unresolved = fixture();
  delete unresolved.components.schemas.Page;
  assert.throws(() => extract(unresolved), /Unresolved component reference/);
  const external = fixture();
  external.components.responses.Page = {
    $ref: "https://invalid.example/private",
  };
  assert.throws(() => extract(external), /Nonlocal component reference/);
});
test("the source binding has eight closed operations, UUID paging and accepted source identity", () => {
  const contract = JSON.parse(
    readFileSync(
      new URL("../contracts/audience-profiles.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(contract.commit, sourceCommit);
  assert.equal(contract.sourcePath, sourcePath);
  assert.equal(
    contract.sourceSha256,
    "3a4370816296cf96296d643e3d823185c64d354ca29ac24343cebff774d43319",
  );
  assert.deepEqual(extract(contract), {
    paths: contract.paths,
    components: contract.components,
  });
  assert.equal(
    Object.values(contract.components).flatMap(Object.keys).length,
    8,
  );
  const parameters =
    contract.paths["/platform/audience-profiles"].get.parameters;
  assert.equal(
    parameters.find((p) => p.name === "cursor").schema.format,
    "uuid",
  );
  const limit = parameters.find((p) => p.name === "limit").schema;
  assert.equal(limit.type, "integer");
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 100);
  assert.equal(limit.default, 25);
});
