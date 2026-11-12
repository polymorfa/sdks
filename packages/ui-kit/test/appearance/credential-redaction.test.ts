import { expect, it } from "vitest";
import { redactDiagnostic } from "../../src/appearance/redaction.js";
it("redacts long credentials and credential fields recursively", () => {
  const token = "pmfa_ct_" + "A".repeat(17000);
  const redacted = redactDiagnostic({
    apiKey: "synthetic",
    projectToken: token,
    nested: [{ message: `reflected ${token}` }],
  });
  expect(JSON.stringify(redacted)).not.toContain(token);
  expect(JSON.stringify(redacted)).not.toContain("synthetic");
});
