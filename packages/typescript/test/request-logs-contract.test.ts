import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type {
  ListRequestLogsParams,
  RequestLog,
  RequestLogPage,
} from "../src/index.js";

const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/request-logs.json", import.meta.url),
    "utf8",
  ),
) as {
  sourceCommit: string;
  paths: Record<
    string,
    {
      get: {
        operationId: string;
        "x-required-scope": string;
        parameters: { name: string; in: string }[];
      };
    }
  >;
  schemas: Record<
    string,
    {
      properties: Record<string, { properties?: Record<string, unknown> }>;
      required?: string[];
    }
  >;
};

const operation =
  contract.paths["/platform/projects/{projectId}/request-logs"]!.get;

// One entry per SDK key, so a renamed or added contract field fails here.
const logKeys = [
  "id",
  "projectId",
  "createdAt",
  "method",
  "route",
  "status",
  "durationMs",
  "result",
  "source",
  "requestId",
  "traceId",
  "errorCode",
  "mcpTool",
  "credential",
] satisfies readonly (keyof RequestLog)[];
const credentialKeys = [
  "type",
  "id",
  "last4",
] satisfies readonly (keyof NonNullable<RequestLog["credential"]>)[];
const pageKeys = [
  "nextCursor",
  "hasMore",
  "followCursor",
] satisfies readonly (keyof RequestLogPage)[];
const queryKeys = [
  "limit",
  "cursor",
  "since",
  "until",
  "status",
  "method",
  "route",
  "source",
  "credentialId",
  "requestId",
  "traceId",
] satisfies readonly (keyof ListRequestLogsParams)[];

describe("request log contract", () => {
  it("is pinned to the merged API revision", () => {
    expect(contract.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(operation.operationId).toBe("listProjectRequestLogs");
    expect(operation["x-required-scope"]).toBe("logs:read");
  });

  it("matches the RequestLog and page schemas", () => {
    const log = contract.schemas.RequestLog!;
    expect([...logKeys].sort()).toEqual(Object.keys(log.properties).sort());
    expect([...credentialKeys].sort()).toEqual(
      Object.keys(log.properties.credential!.properties!).sort(),
    );
    expect([...pageKeys].sort()).toEqual(
      Object.keys(contract.schemas.RequestLogPageMetadata!.properties).sort(),
    );
  });

  it("sends every query parameter the operation accepts", () => {
    const query = operation.parameters
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name);
    expect([...queryKeys, "after"].sort()).toEqual([...query].sort());
  });
});
