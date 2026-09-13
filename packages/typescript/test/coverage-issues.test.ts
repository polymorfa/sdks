import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const synchronizer = fileURLToPath(
  new URL("../../../scripts/sync-coverage-issues.mjs", import.meta.url),
);
const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function marker(
  branch: string,
  family: string,
  method: string,
  path: string,
): string {
  const key = createHash("sha256")
    .update(`${branch}|${family}|${method}|${path}`)
    .digest("hex");
  return `<!-- polymorfa-sdk-coverage:v1:${branch}:${key} -->`;
}

async function runScript(
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const child = spawn(process.execPath, [synchronizer, ...args], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const code = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { code, stdout, stderr };
}

describe("coverage issue synchronizer", () => {
  it("creates the label, reopens and updates matches, creates new gaps, and closes resolved issues", async () => {
    const requests: RecordedRequest[] = [];
    const existingMarker = marker(
      "dev",
      "messaging",
      "GET",
      "/messaging/sessions",
    );
    const staleMarker = marker("dev", "platform", "GET", "/platform/old");
    const server = await startTestServer((request) => {
      requests.push(request);
      if (
        request.method === "GET" &&
        request.path === "/repos/polymorfa/sdks/labels/coverage"
      ) {
        return { status: 404, body: '{"message":"Not Found"}' };
      }
      if (
        request.method === "POST" &&
        request.path === "/repos/polymorfa/sdks/labels"
      ) {
        return { status: 201, body: '{"name":"coverage"}' };
      }
      if (
        request.method === "GET" &&
        request.path.startsWith("/repos/polymorfa/sdks/issues?")
      ) {
        return {
          body: JSON.stringify([
            {
              number: 7,
              state: "closed",
              title: "old",
              body: existingMarker,
              pull_request: undefined,
            },
            {
              number: 8,
              state: "open",
              title: "stale",
              body: staleMarker,
              pull_request: undefined,
            },
          ]),
        };
      }
      if (
        request.method === "PATCH" &&
        request.path === "/repos/polymorfa/sdks/issues/7"
      ) {
        return { body: '{"number":7}' };
      }
      if (
        request.method === "POST" &&
        request.path === "/repos/polymorfa/sdks/issues"
      ) {
        return { status: 201, body: '{"number":9}' };
      }
      if (
        request.method === "PATCH" &&
        request.path === "/repos/polymorfa/sdks/issues/8"
      ) {
        return { body: '{"number":8}' };
      }
      return {
        status: 500,
        body: JSON.stringify({
          unexpected: `${request.method} ${request.path}`,
        }),
      };
    });
    servers.push(server);

    const directory = mkdtempSync(join(tmpdir(), "polymorfa-issues-"));
    const reportPath = join(directory, "report.json");
    writeFileSync(
      reportPath,
      JSON.stringify({
        gaps: [
          {
            family: "messaging",
            method: "GET",
            path: "/messaging/sessions",
            operationId: "listSessions",
            fingerprint: "a".repeat(64),
            status: "changed",
            typescript: {
              status: "covered",
              method: "MessagingClient.sessions.list",
            },
          },
          {
            family: "platform",
            method: "POST",
            path: "/platform/new",
            operationId: "createNew",
            fingerprint: "b".repeat(64),
            status: "missing",
            typescript: {
              status: "missing",
              reason: "No method.",
              milestone: "typescript-parity",
            },
          },
        ],
        resolutions: [],
      }),
    );

    const result = await runScript(
      [
        "--report",
        reportPath,
        "--repository",
        "polymorfa/sdks",
        "--target-branch",
        "dev",
        "--source-repository",
        "polymorfa/polymorfa",
        "--source-branch",
        "dev",
        "--source-sha",
        "abc123",
        "--api-base-url",
        server.url,
      ],
      { GITHUB_TOKEN: "test-token" },
    );

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      created: 1,
      updated: 1,
      closed: 1,
      unchanged: 0,
    });
    const reopen = requests.find((request) =>
      request.path.endsWith("/issues/7"),
    );
    expect(JSON.parse(reopen?.body ?? "{}")).toMatchObject({
      state: "open",
      labels: ["coverage"],
    });
    const created = requests.find(
      (request) =>
        request.method === "POST" && request.path.endsWith("/issues"),
    );
    expect(JSON.parse(created?.body ?? "{}").body).toContain("abc123");
    const closed = requests.find((request) =>
      request.path.endsWith("/issues/8"),
    );
    expect(JSON.parse(closed?.body ?? "{}")).toMatchObject({
      state: "closed",
      state_reason: "completed",
    });
    expect(
      requests.every(
        (request) => request.headers.authorization === "Bearer test-token",
      ),
    ).toBe(true);
  });
});
