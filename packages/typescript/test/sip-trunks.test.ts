import { describe, expect, it, vi } from "vitest";
import {
  Client,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaNotFoundError,
  type SipEndpoint,
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

  it("checks the trunk with the caller's options but not its idempotency key", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) =>
      init?.method === "DELETE"
        ? Response.json({
            success: true,
            data: { id: TRUNK_ID, deleted: true },
          })
        : Response.json({ success: true, data: trunk("project-a") }),
    );
    const scoped = organizationClient(fetch).project("project-a");
    await scoped.sipTrunks.delete(TRUNK_ID, {
      apiVersion: "2026-09-01",
      headers: { "x-trace": "abc" },
      idempotencyKey: "delete-1",
    });
    const [read, change] = fetch.mock.calls.map(
      ([, init]) => new Headers(init?.headers),
    );
    expect(read?.get("x-trace")).toBe("abc");
    expect(read?.get("idempotency-key")).toBeNull();
    expect(change?.get("idempotency-key")).toBe("delete-1");
    expect(read?.get("polymorfa-version")).toBe("2026-09-01");
  });

  it("matches the project regardless of letter case", async () => {
    const projectId = "018F0000-0000-7000-8000-00000000000A";
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: trunk(projectId.toLowerCase()) }),
    );
    const scoped = organizationClient(fetch).project(projectId);
    await expect(scoped.sipTrunks.retrieve(TRUNK_ID)).resolves.toBeDefined();
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

describe("SIP address", () => {
  const hosted: SipEndpoint = {
    status: "hosted",
    host: "sip.example.test",
    transports: [
      { transport: "udp", port: 5060, srtp: "not_supported" },
      { transport: "tcp", port: 5060, srtp: "not_supported" },
      { transport: "tls", port: 5061, srtp: "required" },
    ],
    rtp: { protocol: "udp", portMin: 20000, portMax: 20999 },
  };

  it("reads the hosted address without a project", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: hosted }),
    );
    const response = await organizationClient(fetch).sipTrunks.endpoint();
    expect(response.data).toEqual(hosted);
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = request(fetch, 0);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe("/platform/sip/endpoint");
    expect([...sent.url.searchParams.keys()]).toEqual([]);
    expect(sent.body).toBeUndefined();
  });

  it("returns sip_not_hosted as data on project clients", async () => {
    const notHosted: SipEndpoint = {
      status: "sip_not_hosted",
      host: null,
      transports: [],
      rtp: null,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: notHosted }),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project-a",
      fetch,
      maxNetworkRetries: 0,
    });
    const response = await client.sipTrunks.endpoint();
    expect(response.data).toEqual(notHosted);
    const sent = request(fetch, 0);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe("/platform/sip/endpoint");
    expect([...sent.url.searchParams.keys()]).toEqual([]);
  });

  it("is the same call on a project view of a team client", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: hosted }),
    );
    const project = organizationClient(fetch).project("project-a");
    await project.sipTrunks.endpoint();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(request(fetch, 0).url.pathname).toBe("/platform/sip/endpoint");
  });
});
