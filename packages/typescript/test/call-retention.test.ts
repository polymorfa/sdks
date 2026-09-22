import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Client,
  PolymorfaAuthorizationError,
  PolymorfaConflictError,
  PolymorfaValidationError,
  type CallRetention,
  type UpdateCallRetentionRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const DEFAULT_RETENTION: CallRetention = {
  policy: "extended",
  retentionDays: 90,
  appliesTo: ["call_records", "call_events", "client_reports"],
  revision: 0,
  updatedAt: null,
};

function request(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetch.mock.calls[index] as [string | URL, RequestInit];
  return {
    method: init.method,
    url: new URL(String(url)),
    headers: new Headers(init.headers),
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

function organizationClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example.com",
    fetch,
    maxNetworkRetries: 0,
  });
}

function publicError(
  status: number,
  type: string,
  code: string,
  param: string | null,
  message: string,
) {
  return Response.json(
    {
      error: {
        type,
        code,
        message,
        param,
        request_id: "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
      },
      data: null,
      docs: `https://docs.polymorfa.com/api/errors#${code.replaceAll("_", "-")}`,
    },
    { status },
  );
}

describe("call retention", () => {
  it("reads the team setting with GET /platform/call-retention", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: DEFAULT_RETENTION }),
    );
    const response = await organizationClient(fetch).callRetention.retrieve();
    expect(response.data).toEqual(DEFAULT_RETENTION);
    const sent = request(fetch, 0);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe("/platform/call-retention");
    expect(sent.url.search).toBe("");
    expect(sent.body).toBeUndefined();
    expect(sent.headers.get("authorization")).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });

  it("keeps unknown appliesTo kinds", async () => {
    const future = {
      ...DEFAULT_RETENTION,
      appliesTo: [...DEFAULT_RETENTION.appliesTo, "recordings"],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: future }),
    );
    const response = await organizationClient(fetch).callRetention.retrieve();
    expect(response.data.appliesTo).toContain("recordings");
  });

  it("reads the same team setting from a project token without a project query", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: DEFAULT_RETENTION }),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project-a",
      baseUrl: "https://api.example.com",
      fetch,
      maxNetworkRetries: 0,
    });
    await client.callRetention.retrieve();
    const sent = request(fetch, 0);
    expect(sent.url.pathname).toBe("/platform/call-retention");
    expect(sent.url.search).toBe("");
  });

  it("sends the update body unchanged with PUT", async () => {
    const saved: CallRetention = {
      policy: "custom",
      retentionDays: 45,
      appliesTo: DEFAULT_RETENTION.appliesTo,
      revision: 1,
      updatedAt: "2026-09-19T10:00:00.000Z",
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: saved }),
    );
    const client = organizationClient(fetch);
    const input: UpdateCallRetentionRequest = {
      policy: "custom",
      retentionDays: 45,
      expectedRevision: 0,
    };
    const response = await client.callRetention.update(input);
    expect(response.data).toEqual(saved);
    const sent = request(fetch, 0);
    expect(sent.method).toBe("PUT");
    expect(sent.url.pathname).toBe("/platform/call-retention");
    expect(sent.headers.get("content-type")).toContain("application/json");
    expect(sent.body).toEqual({
      policy: "custom",
      retentionDays: 45,
      expectedRevision: 0,
    });

    await client.callRetention.update({ policy: "short" });
    expect(request(fetch, 1).body).toEqual({ policy: "short" });
  });

  it("requires retentionDays only for the custom policy", () => {
    expectTypeOf<{
      policy: "custom";
      retentionDays: number;
    }>().toExtend<UpdateCallRetentionRequest>();
    expectTypeOf<{
      policy: "extended";
    }>().toExtend<UpdateCallRetentionRequest>();
    expectTypeOf<{
      policy: "standard";
      retentionDays: number;
      expectedRevision: number;
    }>().toExtend<UpdateCallRetentionRequest>();
    expectTypeOf<{
      policy: "custom";
    }>().not.toExtend<UpdateCallRetentionRequest>();
    expectTypeOf<{
      policy: "custom";
      expectedRevision: number;
    }>().not.toExtend<UpdateCallRetentionRequest>();
    // @ts-expect-error custom requires retentionDays
    const missingDays: UpdateCallRetentionRequest = { policy: "custom" };
    expect(missingDays.policy).toBe("custom");
  });

  it("raises PolymorfaConflictError for a stale expectedRevision", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      publicError(
        409,
        "conflict_error",
        "state_conflict",
        "expectedRevision",
        "call retention revision is 2, not 1",
      ),
    );
    const error = await organizationClient(fetch)
      .callRetention.update({ policy: "standard", expectedRevision: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaConflictError);
    expect(error).toMatchObject({
      status: 409,
      code: "state_conflict",
      requestId: "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
      docUrl: "https://docs.polymorfa.com/api/errors#state-conflict",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("raises PolymorfaValidationError for an invalid retentionDays", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      publicError(
        400,
        "invalid_request_error",
        "invalid_parameter",
        "retentionDays",
        "retentionDays must be 30 for the standard policy",
      ),
    );
    const error = await organizationClient(fetch)
      .callRetention.update({ policy: "standard", retentionDays: 31 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect(error).toMatchObject({ status: 400, code: "invalid_parameter" });
    expect((error as PolymorfaValidationError).details).toMatchObject({
      error: { param: "retentionDays" },
    });
  });

  it("raises PolymorfaAuthorizationError when a project token tries to change it", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      publicError(
        403,
        "permission_error",
        "permission_denied",
        null,
        "call retention is a team setting; use a team API key to change it",
      ),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project-a",
      baseUrl: "https://api.example.com",
      fetch,
      maxNetworkRetries: 0,
    });
    const error = await client.callRetention
      .update({ policy: "short" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaAuthorizationError);
    expect(error).toMatchObject({
      status: 403,
      code: "permission_denied",
      message:
        "call retention is a team setting; use a team API key to change it",
    });
  });
});
