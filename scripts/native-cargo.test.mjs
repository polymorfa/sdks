import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeCargoCommand, nativeCargoTargetArgs } from "./native-cargo.mjs";

test("Mac verification selects the shared shim independently of PATH", () => {
  const expected = "/fixture/Library/Application Support/mbx/bin/cargo";
  const inspected = [];
  assert.equal(
    nativeCargoCommand({
      platform: "darwin",
      home: "/fixture",
      exists: (path) => {
        inspected.push(path);
        return path === expected;
      },
    }),
    expected,
  );
  assert.deepEqual(inspected, [expected]);
});

test("Mac verification refuses a direct Cargo fallback when the shared shim is absent", () => {
  assert.throws(
    () =>
      nativeCargoCommand({
        platform: "darwin",
        home: "/fixture",
        exists: () => false,
      }),
    /MrBoxington/,
  );
});

test("other platforms retain the workflow-selected Cargo", () => {
  for (const platform of ["linux", "win32"]) {
    assert.equal(
      nativeCargoCommand({
        platform,
        exists: () => {
          throw new Error("unexpected Mac lookup");
        },
      }),
      "cargo",
    );
  }
});

test("Mac consumers never override the shared target/cache location", () => {
  assert.deepEqual(nativeCargoTargetArgs("/fixture/packed", "darwin"), []);
  assert.deepEqual(nativeCargoTargetArgs("/fixture/packed", "linux"), [
    "--target-dir",
    "/fixture/packed",
  ]);
});
