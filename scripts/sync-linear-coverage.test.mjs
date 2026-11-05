import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageMarker, reconcileCoverage } from "./sync-linear-coverage.mjs";
const gap = {
  family: "platform",
  method: "GET",
  path: "/platform/example",
  status: "missing",
  fingerprint: "a".repeat(64),
};
test("a contract revision updates the same issue and produces durable feature links", async () => {
  assert.equal(
    coverageMarker(gap),
    coverageMarker({ ...gap, fingerprint: "b".repeat(64) }),
  );
  const writes = [];
  const request = async (query, variables) => {
    writes.push({ query, variables });
    return {
      issueCreate: {
        success: true,
        issue: {
          id: "issue-1",
          identifier: "POL-1",
          url: "https://linear.app/example/issue/POL-1",
        },
      },
      issueUpdate: { success: true },
    };
  };
  const [link] = await reconcileCoverage(
    request,
    [gap],
    [],
    "c".repeat(40),
    "team",
  );
  assert.equal(link.linearIssueId, "issue-1");
  assert.ok(link.notionUrl);
  const existing = [
    {
      id: "issue-1",
      identifier: "POL-1",
      url: link.url,
      description: coverageMarker(gap),
    },
  ];
  await reconcileCoverage(request, [gap], existing, "d".repeat(40), "team");
  assert.equal(writes.length, 2);
  assert.equal(writes[1].variables.id, "issue-1");
  assert.ok(!("stateId" in writes[1].variables.input));
  await reconcileCoverage(request, [], existing, "d".repeat(40), "team");
  assert.equal(writes.length, 2);
});
test("duplicate marker ownership blocks mutations", async () => {
  const issue = { description: coverageMarker(gap) };
  await assert.rejects(
    reconcileCoverage(
      () => assert.fail("must not write"),
      [gap],
      [issue, issue],
      "c".repeat(40),
      "team",
    ),
  );
});
