import { describe, expect, it, vi } from "vitest";
import {
  Client,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaNotFoundError,
  type SipTrunk,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const TRUNK_ID = "6f1c2f0e-1d5b-4d8e-9a55-0d4b8a6c1f10";

function trunk(projectId = "project-a"): SipTrunk {
  return {
    id: TRUNK_ID,
    projectId,
    name: "Head office PBX",
    enabled: true,
    direction: "both",
    outbound: {
      targetUri: "sip:pbx.example.com",
      transport: "udp",
      authUsername: null,
      hasPassword: false,
      fromUser: null,
    },
    inbound: {
      username: "pmfa_abc",
      realm: "sip.example.test",
      session: "support",
      allowedAddresses: ["203.0.113.10/32"],
      allowedDestinations: [],
    },
    codecs: ["PCMU"],
    maxConcurrentCalls: 30,
    revision: 1,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
  };
}

function request(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetch.mock.calls[index] as [string | URL, RequestInit];
  return {
    method: init.method,
    url: new URL(String(url)),
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

function organizationClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    fetch,
    maxNetworkRetries: 0,
  });
}

describe("SIP trunks", () => {
  it("names the project for team clients and unwraps responses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: [trunk()] }),
    );
    const client = organizationClient(fetch);
    const listed = await client.sipTrunks.list("project-a");
    expect(listed.data).toEqual([trunk()]);
    const first = request(fetch, 0);
    expect(first.method).toBe("GET");
    expect(first.url.pathname).toBe("/platform/sip-trunks");
    expect(first.url.searchParams.get("projectId")).toBe("project-a");

    fetch.mockImplementationOnce(async () =>
      Response.json(
        {
          success: true,
          data: {
            trunk: trunk(),
            inboundCredentials: {
              username: "pmfa_abc",
              password: "secret",
              realm: "sip.example.test",
            },
          },
        },
        { status: 201 },
      ),
    );
    const created = await client.sipTrunks.create("project-a", {
      name: "Head office PBX",
      direction: "inbound",
      inbound: { allowedAddresses: ["203.0.113.10"] },
    });
    expect(created.data.inboundCredentials?.password).toBe("secret");
    expect(request(fetch, 1).body).toEqual({
      projectId: "project-a",
      name: "Head office PBX",
      direction: "inbound",
      inbound: { allowedAddresses: ["203.0.113.10"] },
    });
  });

  it("requires a project for team clients", async () => {
    const client = organizationClient(vi.fn());
    // @ts-expect-error team clients must name the project
    expect(() => client.sipTrunks.list()).toThrow(PolymorfaConfigurationError);
  });

  it("uses the project of a project token without extra reads", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: trunk() }),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project-a",
      fetch,
      maxNetworkRetries: 0,
    });
    await client.sipTrunks.update(TRUNK_ID, {
      enabled: false,
      expectedRevision: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = request(fetch, 0);
    expect(sent.method).toBe("PATCH");
    expect(sent.url.pathname).toBe(`/platform/sip-trunks/${TRUNK_ID}`);
    expect(sent.body).toEqual({ enabled: false, expectedRevision: 1 });

    await client.sipTrunks.list();
    expect(request(fetch, 1).url.searchParams.get("projectId")).toBe(
      "project-a",
    );
  });

  it("confines team-key project clients to their project's trunks", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: trunk("project-b") }),
    );
    const scoped = organizationClient(fetch).project("project-a");
    await expect(scoped.sipTrunks.delete(TRUNK_ID)).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
    await expect(scoped.sipTrunks.retrieve(TRUNK_ID)).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
    expect(
      fetch.mock.calls.every(
        (_, index) => request(fetch, index).method === "GET",
      ),
    ).toBe(true);

    fetch.mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? Response.json({
            success: true,
            data: { username: "pmfa_abc", password: "new", realm: "r" },
          })
        : Response.json({ success: true, data: trunk("project-a") }),
    );
    const rotated = await scoped.sipTrunks.rotateCredentials(TRUNK_ID);
    expect(rotated.data.password).toBe("new");
    const last = request(fetch, fetch.mock.calls.length - 1);
    expect(last.method).toBe("POST");
    expect(last.url.pathname).toBe(
      `/platform/sip-trunks/${TRUNK_ID}/credentials`,
    );
  });

  it("surfaces conflicts with their stable code", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          success: false,
          error: {
            code: "sip_trunk_in_use",
            message: "A session routes calls to this trunk.",
          },
        },
        { status: 409 },
      ),
    );
    const error = await organizationClient(fetch)
      .sipTrunks.delete(TRUNK_ID)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PolymorfaConflictError);
    expect((error as PolymorfaConflictError).code).toBe("sip_trunk_in_use");
  });
});
