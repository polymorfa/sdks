import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const feature = {
  id: "3b4736be-01b9-809f-8d5e-f86f257e3ac2",
  notionUrl: "https://app.notion.com/p/3b4736be01b9809f8d5ef86f257e3ac2",
};
export function coverageMarker(gap) {
  assert.ok(["messaging", "platform"].includes(gap.family));
  assert.ok(typeof gap.method === "string" && typeof gap.path === "string");
  return `<!-- polymorfa-sdk-coverage:v2:${createHash("sha256").update(`${gap.family}|${gap.method}|${gap.path}`).digest("hex")} -->`;
}
export async function reconcileCoverage(
  request,
  gaps,
  existing,
  sourceSha,
  teamId,
) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const links = [];
  for (const gap of gaps) {
    const marker = coverageMarker(gap);
    const matches = existing.filter((issue) =>
      issue.description?.includes(marker),
    );
    assert.ok(
      matches.length <= 1,
      "Duplicate coverage tickets need reconciliation",
    );
    const languageMatrix = gap.languages
      ? "\nAffected-language coverage:\n" +
        Object.entries(gap.languages)
          .map(
            ([language, mapping]) =>
              `${language}: ${mapping.status}${mapping.method ? ` (${mapping.method})` : ""}${mapping.reason ? `: ${mapping.reason}` : ""}`,
          )
          .join("\n") +
        "\n"
      : "";
    const description = `${marker}\n\nPlatform definition: ${feature.notionUrl}\n\nAPI source: https://github.com/polymorfa/polymorfa/commit/${sourceSha}\n\nOperation: ${gap.method} ${gap.path}\nContract: ${gap.family}\nGap: ${gap.status}\nFingerprint: ${gap.fingerprint}\n${languageMatrix}\nVerify request, response, errors and scopes; add wire tests and update the coverage ledger. Implementation completion and deployed availability are separate stages.\n`;
    const title = `SDK coverage: ${gap.method} ${gap.path}`;
    let issue = matches[0];
    if (!issue) {
      const result = await request(
        "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
        { input: { teamId, title, description } },
      );
      assert.equal(result.issueCreate?.success, true);
      issue = result.issueCreate.issue;
    } else if (issue.description !== description || issue.title !== title) {
      const result = await request(
        "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
        { id: issue.id, input: { title, description } },
      );
      assert.equal(result.issueUpdate?.success, true);
    }
    links.push({
      featureId: feature.id,
      notionUrl: feature.notionUrl,
      linearIssueId: issue.id,
      identifier: issue.identifier,
      url: issue.url,
      sourceSha,
      marker,
    });
  }
  // Clearing a ledger gap does not prove deployment or authorize closing a feature.
  return links;
}
async function main() {
  const {
    LINEAR_API_KEY: token,
    LINEAR_TEAM_ID: teamId,
    SOURCE_SHA: sourceSha,
  } = process.env;
  assert.ok(
    token && teamId,
    "Linear coverage blocked: configure LINEAR_API_KEY and LINEAR_TEAM_ID",
  );
  assert.equal(process.env.SOURCE_REPOSITORY, "polymorfa/polymorfa");
  const request = async (query, variables) => {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    assert.equal(response.status, 200, "Linear request failed");
    const result = await response.json();
    assert.ok(
      !result.errors?.length,
      "Linear rejected coverage synchronization",
    );
    return result.data;
  };
  const existing = [];
  let after;
  do {
    const result = await request(
      "query($teamId: ID!, $after: String) { issues(filter: {team: {id: {eq: $teamId}}}, first: 100, after: $after) { nodes { id identifier url title description } pageInfo { hasNextPage endCursor } } }",
      { teamId, after },
    );
    existing.push(...result.issues.nodes);
    after = result.issues.pageInfo.hasNextPage
      ? result.issues.pageInfo.endCursor
      : undefined;
  } while (after);
  const report = JSON.parse(readFileSync(process.env.COVERAGE_REPORT));
  assert.ok(Array.isArray(report.gaps));
  const links = await reconcileCoverage(
    request,
    report.gaps,
    existing,
    sourceSha,
    teamId,
  );
  writeFileSync(
    process.env.COVERAGE_LINKS_OUTPUT,
    JSON.stringify({ schemaVersion: 1, links }, null, 2) + "\n",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
