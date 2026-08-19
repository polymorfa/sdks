#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined)
      throw new Error("Coverage issue arguments must be flag/value pairs.");
    values[toCamelCase(flag.slice(2))] = value;
  }
  for (const required of [
    "report",
    "repository",
    "targetBranch",
    "sourceRepository",
    "sourceBranch",
    "sourceSha",
  ]) {
    if (typeof values[required] !== "string" || values[required].length === 0) {
      throw new Error(`Missing required --${toKebabCase(required)} argument.`);
    }
  }
  return values;
}

async function synchronizeIssues(api, args, gaps, issues) {
  const existingByMarker = new Map();
  for (const issue of issues) {
    const parsed = parseMarker(issue.body);
    if (
      parsed?.branch === args.targetBranch &&
      !existingByMarker.has(parsed.marker)
    ) {
      existingByMarker.set(parsed.marker, issue);
    }
  }

  const activeMarkers = new Set();
  const result = { created: 0, updated: 0, closed: 0, unchanged: 0 };
  for (const gap of gaps) {
    validateGap(gap);
    const marker = issueMarker(args.targetBranch, gap);
    activeMarkers.add(marker);
    const title = `[${args.targetBranch}] SDK coverage: ${gap.method} ${gap.path}`;
    const body = issueBody(marker, args, gap);
    const existing = existingByMarker.get(marker);
    if (existing === undefined) {
      await api.request("POST", `/repos/${args.repository}/issues`, {
        title,
        body,
        labels: ["coverage"],
      });
      result.created += 1;
      continue;
    }
    if (
      existing.state === "open" &&
      existing.title === title &&
      existing.body === body
    ) {
      result.unchanged += 1;
      continue;
    }
    await api.request(
      "PATCH",
      `/repos/${args.repository}/issues/${existing.number}`,
      {
        title,
        body,
        labels: ["coverage"],
        state: "open",
      },
    );
    result.updated += 1;
  }

  for (const [marker, issue] of existingByMarker) {
    if (activeMarkers.has(marker) || issue.state !== "open") continue;
    await api.request(
      "PATCH",
      `/repos/${args.repository}/issues/${issue.number}`,
      {
        state: "closed",
        state_reason: "completed",
      },
    );
    result.closed += 1;
  }
  return result;
}

async function ensureCoverageLabel(api, repository) {
  const response = await api.request(
    "GET",
    `/repos/${repository}/labels/coverage`,
    undefined,
    [200, 404],
  );
  if (response.status === 404) {
    await api.request("POST", `/repos/${repository}/labels`, {
      name: "coverage",
      color: "d4c5f9",
      description: "Missing or changed handwritten SDK contract coverage",
    });
  }
}

async function listCoverageIssues(api, repository) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const response = await api.request(
      "GET",
      `/repos/${repository}/issues?state=all&labels=coverage&per_page=100&page=${page}`,
    );
    if (!Array.isArray(response.data))
      throw new Error("GitHub issues response was not an array.");
    const pageIssues = response.data.filter(
      (issue) => issue.pull_request === undefined,
    );
    issues.push(...pageIssues);
    if (response.data.length < 100) return issues;
  }
}

function issueMarker(branch, gap) {
  const key = createHash("sha256")
    .update(`${branch}|${gap.family}|${gap.method}|${gap.path}`)
    .digest("hex");
  return `<!-- polymorfa-sdk-coverage:v1:${branch}:${key} -->`;
}

function parseMarker(body) {
  if (typeof body !== "string") return null;
  const match = body.match(
    /<!-- polymorfa-sdk-coverage:v1:([^:]+):([a-f0-9]{64}) -->/,
  );
  return match === null ? null : { branch: match[1], marker: match[0] };
}

function issueBody(marker, args, gap) {
  const coverage = gap.typescript ?? {};
  const lines = [
    marker,
    "",
    "## Contract gap",
    "",
    `- SDK target branch: \`${args.targetBranch}\``,
    `- Source: \`${args.sourceRepository}\` at \`${args.sourceSha}\``,
    `- Source branch: \`${args.sourceBranch}\``,
    `- Contract: \`${gap.family}\``,
    `- Operation: \`${gap.method} ${gap.path}\``,
    `- Operation ID: \`${gap.operationId ?? "none"}\``,
    `- Fingerprint: \`${gap.fingerprint}\``,
    `- Gap: \`${gap.status}\``,
    `- TypeScript status: \`${coverage.status ?? "missing"}\``,
  ];
  if (typeof coverage.method === "string")
    lines.push(`- Existing method: \`${coverage.method}\``);
  if (typeof coverage.reason === "string")
    lines.push(`- Reason: ${coverage.reason}`);
  if (typeof coverage.milestone === "string")
    lines.push(`- Milestone: \`${coverage.milestone}\``);
  lines.push(
    "",
    "## Acceptance criteria",
    "",
    "- [ ] Review the current request, response, error, authentication, and idempotency contract.",
    "- [ ] Add or update the handwritten public SDK method and exported types.",
    "- [ ] Add a wire-level fixture test for the operation.",
    "- [ ] Update the coverage ledger fingerprint and method mapping.",
    "",
    "This issue is synchronized automatically. Resolving the ledger gap closes it.",
    "",
  );
  return lines.join("\n");
}

function validateGap(gap) {
  if (
    gap === null ||
    typeof gap !== "object" ||
    !new Set(["messaging", "platform"]).has(gap.family) ||
    typeof gap.method !== "string" ||
    typeof gap.path !== "string" ||
    typeof gap.fingerprint !== "string"
  ) {
    throw new Error("Coverage report contains an invalid gap.");
  }
}

class GitHubApi {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async request(method, path, body, expectedStatuses = undefined) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.token}`,
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = text.length === 0 ? undefined : safeJson(text);
    const accepted = expectedStatuses ?? [200, 201];
    if (!accepted.includes(response.status)) {
      const message =
        data && typeof data.message === "string"
          ? data.message
          : `HTTP ${response.status}`;
      throw new Error(`GitHub API ${method} ${path} failed: ${message}`);
    }
    return { status: response.status, data };
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.repository !== "polymorfa/sdks") {
    throw new Error(
      "Coverage issues may only be synchronized to polymorfa/sdks.",
    );
  }
  const token = process.env.GITHUB_TOKEN;
  if (typeof token !== "string" || token.length === 0)
    throw new Error("GITHUB_TOKEN is required.");
  const report = JSON.parse(readFileSync(args.report, "utf8"));
  if (!Array.isArray(report.gaps))
    throw new Error("Coverage report must contain a gaps array.");
  const api = new GitHubApi(args.apiBaseUrl ?? "https://api.github.com", token);
  await ensureCoverageLabel(api, args.repository);
  const existingIssues = await listCoverageIssues(api, args.repository);
  const result = await synchronizeIssues(
    api,
    args,
    report.gaps,
    existingIssues,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
