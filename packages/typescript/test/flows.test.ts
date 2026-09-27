import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Client,
  PolymorfaAuthorizationError,
  PolymorfaValidationError,
  type FlowDraft,
  type FlowSummary,
  type FlowsResource,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const flowId = "20000000-0000-4000-8000-000000000002";
const summary: FlowSummary = {
  id: flowId,
  name: "Registration",
  status: "draft",
  version: "7.1",
  screenCount: 1,
  metaLinks: [],
  createdAt: 1,
  updatedAt: 2,
};

describe("project Flow reads", () => {
  it("binds both reads to the selected project and preserves list and nullable get envelopes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (request) => {
      const url = new URL(String(request));
      return Response.json({
        data:
          url.pathname === "/platform/flows"
            ? [summary]
            : url.pathname.endsWith(flowId)
              ? { ...summary, definition: { version: "7.1", screens: [] } }
              : null,
      });
    });
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch,
    });
    expect("flows" in client).toBe(false);
    const flows = client.project(projectId).flows;
    expectTypeOf(flows).toEqualTypeOf<FlowsResource>();
    const listed = await flows.list();
    const retrieved = await flows.retrieve(flowId);
    const absent = await flows.retrieve("30000000-0000-4000-8000-000000000003");
    expectTypeOf(listed.data.data).toEqualTypeOf<readonly FlowSummary[]>();
    expectTypeOf(retrieved.data.data).toEqualTypeOf<FlowDraft | null>();
    expect(listed.data.data).toEqual([summary]);
    expect(retrieved.data.data?.definition).toEqual({
      version: "7.1",
      screens: [],
    });
    expect(absent.data.data).toBeNull();
    expect(
      fetch.mock.calls.map(([url, init]) => [String(url), init?.method]),
    ).toEqual([
      [
        `https://api.polymorfa.com/platform/flows?projectId=${projectId}`,
        "GET",
      ],
      [
        `https://api.polymorfa.com/platform/flows/${flowId}?projectId=${projectId}`,
        "GET",
      ],
      [
        `https://api.polymorfa.com/platform/flows/30000000-0000-4000-8000-000000000003?projectId=${projectId}`,
        "GET",
      ],
    ]);
  });

  it("keeps project tokens bound, rejects malformed IDs locally, and preserves API authorization errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { error: { code: "forbidden", message: "Missing sessions:read" } },
        { status: 403 },
      ),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId,
      fetch,
      maxNetworkRetries: 0,
    });
    expect(() => client.project("other-project")).toThrow();
    expect(() => client.flows.retrieve("../other")).toThrow(
      PolymorfaValidationError,
    );
    expect(fetch).not.toHaveBeenCalled();
    await expect(client.flows.list()).rejects.toBeInstanceOf(
      PolymorfaAuthorizationError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
