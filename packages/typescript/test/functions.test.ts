import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Client,
  PolymorfaValidationError,
  type FunctionInvocationResult,
  type FunctionDeployment,
  type FunctionDeploymentSummary,
  type FunctionsResource,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
const project = "10000000-0000-4000-8000-000000000001";
const fn = "20000000-0000-4000-8000-000000000001";
const deployment = "30000000-0000-4000-8000-000000000001";
const secret = "40000000-0000-4000-8000-000000000001";
const invocation = "50000000-0000-4000-8000-000000000001";
const request = {
  method: "POST" as const,
  url: "https://function.polymorfa.invalid/test",
  headers: {},
  bodyBase64: "e30=",
};
function fixture() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ data: { ok: true } }),
  );
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    fetch,
  });
  return { client, fetch, functions: client.project(project).functions };
}
describe("Functions project contract", () => {
  it("exposes all lifecycle operations with an explicit immutable project binding", async () => {
    const { client, fetch, functions } = fixture();
    expect("functions" in client).toBe(false);
    expectTypeOf(functions).toEqualTypeOf<FunctionsResource>();
    await functions.list({ limit: 3, before: fn });
    await functions.create({ functionId: fn, name: "Example" });
    await functions.retrieve(fn);
    await functions.update(fn, { expectedRevision: 1, enabled: false });
    await functions.delete(fn, 2);
    await functions.deployments.list(fn);
    await functions.deployments.create(fn, {
      deploymentId: deployment,
      source: "export default {}",
      language: "typescript",
      region: "eu",
      compatibilityDate: "2026-09-22",
    });
    await functions.deployments.retrieve(fn, deployment);
    await functions.deployments.promote(fn, {
      deploymentId: deployment,
      expectedRevision: 3,
    });
    await functions.secrets.list(fn);
    await functions.secrets.create(fn, {
      name: "TOKEN",
      value: "external-secret",
    });
    await functions.secrets.revoke(fn, secret);
    await functions.invocations.list(fn);
    await functions.invocations.retrieve(fn, invocation);
    await functions.invocations.create(
      fn,
      { deploymentId: deployment, request },
      { idempotencyKey: "attempt:1" },
    );
    expect(fetch).toHaveBeenCalledTimes(15);
    const methods = [
      "GET",
      "POST",
      "GET",
      "PATCH",
      "DELETE",
      "GET",
      "POST",
      "GET",
      "PUT",
      "GET",
      "POST",
      "DELETE",
      "GET",
      "GET",
      "POST",
    ];
    for (const [index, call] of fetch.mock.calls.entries()) {
      const [url, init] = call;
      const parsed = new URL(String(url));
      expect(parsed.pathname).toMatch(/^\/platform\/functions(?:\/|$)/);
      expect(init?.method).toBe(methods[index]);
      if (init?.method === "GET" || init?.method === "DELETE") {
        expect(init.body).toBeUndefined();
        expect(parsed.searchParams.get("projectId")).toBe(project);
      } else {
        expect(JSON.parse(String(init?.body)).projectId).toBe(project);
        expect(parsed.search).toBe("");
      }
    }
    expect(
      new URL(String(fetch.mock.calls[4]![0])).searchParams.get(
        "expectedRevision",
      ),
    ).toBe("2");
    expect(String(fetch.mock.calls[7]![0])).toContain(
      `/${fn}/deployments/${deployment}`,
    );
    expect(String(fetch.mock.calls[8]![0])).toContain(`/${fn}/promotion`);
    expect(String(fetch.mock.calls[11]![0])).toContain(
      `/${fn}/secrets/${secret}`,
    );
    expect(String(fetch.mock.calls[13]![0])).toContain(
      `/${fn}/invocations/${invocation}`,
    );
    expect(
      new Headers(fetch.mock.calls[14]![1]?.headers).get("Idempotency-Key"),
    ).toBe("attempt:1");
  });
  it("keeps project-token Functions access pinned to its project", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: project,
      fetch,
    });
    expectTypeOf(client.functions).toEqualTypeOf<FunctionsResource>();
    expect(() => client.project(fn)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("types deployment pages as metadata and retrieval as full source", async () => {
    const { fetch, functions } = fixture();
    const metadata = {
      id: deployment,
      functionId: fn,
      language: "typescript",
      region: "eu",
      compatibilityDate: "2026-09-22",
      sha256: "a".repeat(64),
      secretVersionIds: [],
      egressOrigins: [],
      createdAt: "2026-09-22T00:00:00Z",
    };
    fetch.mockResolvedValueOnce(
      Response.json({ data: { items: [metadata], nextCursor: null } }),
    );
    fetch.mockResolvedValueOnce(
      Response.json({ data: { ...metadata, source: "export default {}" } }),
    );
    const page = await functions.deployments.list(fn);
    const full = await functions.deployments.retrieve(fn, deployment);
    expectTypeOf(
      page.data.items[0]!,
    ).toEqualTypeOf<FunctionDeploymentSummary>();
    expectTypeOf(full.data).toEqualTypeOf<FunctionDeployment>();
    expect(page.data.items[0]).toEqual(metadata);
    expect(full.data.source).toBe("export default {}");
  });
  it("rejects path and project overrides before sending a credential", () => {
    const { fetch, functions } = fixture();
    expect(() => functions.retrieve("../secrets")).toThrow(
      PolymorfaValidationError,
    );
    expect(() => functions.delete(fn, 0)).toThrow(PolymorfaValidationError);
    expect(() =>
      functions.create({ name: "Bad", projectId: fn } as never),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      functions.update(fn, {
        expectedRevision: 1,
        functionId: deployment,
      } as never),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      functions.invocations.create(fn, { request }, {} as never),
    ).toThrow(PolymorfaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never automatically repeats an invocation after transport uncertainty", async () => {
    const { fetch, functions } = fixture();
    fetch.mockRejectedValue(new TypeError("transport interrupted"));
    await expect(
      functions.invocations.create(
        fn,
        { request },
        { idempotencyKey: "one-attempt", maxNetworkRetries: 5 },
      ),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("preserves metadata-only replay and uncertain receipt semantics", async () => {
    const { fetch, functions } = fixture();
    const data = {
      receipt: {
        id: invocation,
        outcome: "unknown",
        errorCode: "function_execution_uncertain",
      },
      replayed: true,
      responseRetained: false,
      retryable: false,
    };
    fetch.mockResolvedValue(Response.json({ data }));
    const result = await functions.invocations.create(
      fn,
      { request },
      { idempotencyKey: "same-attempt" },
    );
    expectTypeOf(result.data).toEqualTypeOf<FunctionInvocationResult>();
    expect(result.data).toEqual(data);
    expect(result.data.response).toBeUndefined();
  });
});
