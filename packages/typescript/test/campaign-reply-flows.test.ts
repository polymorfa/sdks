import { readFileSync } from "node:fs";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import {
  Client,
  MessagingClient,
  PolymorfaServerError,
  type CampaignReplyFlow,
  type CampaignReplyFlowDefinition,
  type CreateCampaignReplyFlowRequest,
  type SetCampaignReplyFlowRequest,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const definition: CampaignReplyFlowDefinition = {
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      edges: [
        {
          match: { kind: "choice", replyKind: "button", id: "yes" },
          to: "thanks",
        },
        { match: { kind: "keyword", value: "form" }, to: "form" },
      ],
    },
    { id: "thanks", send: { kind: "text", text: "Thanks!" }, edges: [] },
    {
      id: "form",
      send: {
        kind: "flow_form",
        flowId: "018f0000-0000-7000-8000-000000000009",
        body: "Tell us more",
        buttonText: "Open form",
        screen: "DETAILS",
      },
      edges: [],
    },
  ],
};

const replyFlow: CampaignReplyFlow = {
  id: "018f0000-0000-7000-8000-000000000001",
  flowKey: "018f0000-0000-7000-8000-000000000002",
  revision: 1,
  name: "Follow-up",
  definition,
  createdAt: 1_790_000_000_000,
};

const json = (body: unknown) => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("campaign reply flows", () => {
  it("creates, reads and attaches a reply flow on the Messaging API", async () => {
    const server = await startTestServer((request) =>
      request.method === "PUT"
        ? json({
            success: true,
            data: {
              campaignId: "campaign-1",
              replyFlowId: replyFlow.id,
            },
          })
        : json({ success: true, data: replyFlow }),
    );
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });

    const created = await client.campaigns.createReplyFlow("my project", {
      name: "Follow-up",
      definition,
    });
    expect(created.data.data).toEqual(replyFlow);
    const read = await client.campaigns.retrieveReplyFlow(
      "my project",
      replyFlow.id,
    );
    expect(read.data.data.revision).toBe(1);
    const attached = await client.campaigns.setReplyFlow(
      "my project",
      "campaign-1",
      { replyFlowId: replyFlow.id },
    );
    expect(attached.data.data.replyFlowId).toBe(replyFlow.id);

    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /messaging/projects/my%20project/campaign-reply-flows",
      `GET /messaging/projects/my%20project/campaign-reply-flows/${replyFlow.id}`,
      "PUT /messaging/projects/my%20project/campaigns/campaign-1/reply-flow",
    ]);
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      name: "Follow-up",
      definition,
    });
  });

  it("scopes Platform reply flows to a project and detaches with null", async () => {
    const server = await startTestServer((request) =>
      request.method === "PUT"
        ? json({
            data: { campaignId: "campaign-1", replyFlowId: null },
          })
        : json({ data: replyFlow }),
    );
    servers.push(server);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });

    await client.campaigns.createReplyFlow({
      name: "Follow-up",
      definition,
      projectId: "project-1",
    });
    await client.campaigns.retrieveReplyFlow(replyFlow.id, {
      projectId: "project-1",
    });
    const detached = await client.campaigns.setReplyFlow("campaign-1", {
      replyFlowId: null,
      projectId: "project-1",
    });
    expect(detached.data.data.replyFlowId).toBeNull();

    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /platform/campaign-reply-flows",
      `GET /platform/campaign-reply-flows/${replyFlow.id}?projectId=project-1`,
      "PUT /platform/campaigns/campaign-1/reply-flow",
    ]);
    expect(JSON.parse(server.requests[2]!.body)).toEqual({
      replyFlowId: null,
      projectId: "project-1",
    });
  });

  it("sends a reply flow create once, because a repeat is a conflict", async () => {
    const server = await startTestServer(() => ({
      status: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: { code: "unavailable", message: "Try again" },
      }),
    }));
    servers.push(server);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 2,
    });
    await expect(
      client.campaigns.createReplyFlow({ name: "Follow-up", definition }),
    ).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(server.requests).toHaveLength(1);
  });

  it("matches the pinned contract request and response fields", () => {
    const spec = JSON.parse(
      readFileSync(
        new URL("../../../contracts/openapi.messaging.json", import.meta.url),
        "utf8",
      ),
    ) as {
      components: {
        schemas: Record<string, { properties: Record<string, unknown> }>;
      };
    };
    const keys = (name: string) =>
      Object.keys(spec.components.schemas[name]!.properties).sort();
    expect(keys("CampaignReplyFlow")).toEqual(
      (
        [
          "createdAt",
          "definition",
          "flowKey",
          "id",
          "name",
          "revision",
        ] satisfies (keyof CampaignReplyFlow)[]
      ).sort(),
    );
    expect(keys("CreateCampaignReplyFlowRequest")).toEqual(
      (
        [
          "definition",
          "flowKey",
          "name",
          "revision",
        ] satisfies (keyof CreateCampaignReplyFlowRequest)[]
      ).sort(),
    );
    expect(keys("SetCampaignReplyFlowRequest")).toEqual([
      "replyFlowId",
    ] satisfies (keyof SetCampaignReplyFlowRequest)[]);
    expectTypeOf<SetCampaignReplyFlowRequest["replyFlowId"]>().toEqualTypeOf<
      string | null
    >();
  });
});
