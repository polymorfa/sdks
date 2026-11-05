import assert from "node:assert/strict";
import test from "node:test";
import { serverCredentialType } from "./server-credential.mjs";

test("Calls setup accepts v2 server credentials and rejects v1 and other principals", () => {
  assert.equal(
    serverCredentialType("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
    "apiKey",
  );
  assert.equal(
    serverCredentialType("pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
    "projectToken",
  );
  for (const value of [
    undefined,
    "pmfa_" + "A".repeat(72),
    "pmfa_pt_" + "A".repeat(94),
    "pmfa_pt_bad",
    "pmfa_ct_Y2xpZW50",
    "pmfa_ls_listener",
  ]) {
    assert.equal(serverCredentialType(value), null);
  }
});
