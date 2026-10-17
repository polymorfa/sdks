import assert from "node:assert/strict";
import test from "node:test";
import { serverCredentialType } from "./server-credential.mjs";

test("Calls setup accepts v2 server credentials and rejects v1 and other principals", () => {
  assert.equal(
    serverCredentialType(
      "pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8",
    ),
    "apiKey",
  );
  assert.equal(
    serverCredentialType(
      "pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL",
    ),
    "projectToken",
  );
  for (const value of [
    undefined,
    "pmfa_" + "A".repeat(72),
    "pmfa_pt_" + "A".repeat(94),
    "pmfa_pt_bad",
    "pmfa_ct_client",
    "pmfa_ls_listener",
  ]) {
    assert.equal(serverCredentialType(value), null);
  }
});
