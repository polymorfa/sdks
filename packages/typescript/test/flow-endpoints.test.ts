import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  Client,
  FLOW_FORWARD_SIGNATURE_HEADER,
  verifyFlowForwardSignature,
  type FlowEndpointSetResult,
  type SetFlowEndpointRequest,
} from "../src/index.js";
import { PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
const projectId = "11111111-2222-4333-8444-555555555555";
const flowId = "20000000-0000-4000-8000-000000000002";

async function setup(status = 200) {
  const server = await startTestServer(() => ({
    status,
    body: JSON.stringify({ data: { ok: true } }),
  }));
  servers.push(server);
  const flows = new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId,
    baseUrl: server.url,
    maxNetworkRetries: 3,
  }).flows;
  return { server, flows };
}

describe("dynamic Flow endpoints", () => {
  it("binds project identity on endpoint, receipt and key paths", async () => {
    const { server, flows } = await setup();
    await flows.endpoint(flowId, { connectionId: "support" });
    await flows.setEndpoint(flowId, {
      connectionId: "support",
      mode: "forward",
      url: "https://example.com/flow",
    });
    await flows.setEndpoint(flowId, {
      connectionId: "support",
      mode: "function",
      functionId: "fn",
      deploymentId: null,
    });
    await flows.setEndpoint(flowId, {
      connectionId: "support",
      mode: "direct",
      url: "https://example.com/direct",
      expectedRevision: 2,
    });
    await flows.deleteEndpoint(flowId, { connectionId: "support" });
    await flows.endpointReceipts(flowId, {
      connectionId: "support",
      limit: 10,
    });
    await flows.encryptionKey({ connectionId: "support" });
    await flows.rotateEncryptionKey({ connectionId: "support" });
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /platform/flows/${flowId}/endpoint?connectionId=support&projectId=${projectId}`,
      `PUT /platform/flows/${flowId}/endpoint`,
      `PUT /platform/flows/${flowId}/endpoint`,
      `PUT /platform/flows/${flowId}/endpoint`,
      `DELETE /platform/flows/${flowId}/endpoint?connectionId=support&projectId=${projectId}`,
      `GET /platform/flows/${flowId}/endpoint/receipts?connectionId=support&limit=10&projectId=${projectId}`,
      `GET /platform/flow-encryption-keys?connectionId=support&projectId=${projectId}`,
      "POST /platform/flow-encryption-keys/rotate",
    ]);
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      connectionId: "support",
      mode: "forward",
      url: "https://example.com/flow",
      projectId,
    });
    expect(JSON.parse(server.requests[7]!.body)).toEqual({
      connectionId: "support",
      projectId,
    });
  });

  it("sends writes once", async () => {
    const { server, flows } = await setup(503);
    await expect(
      flows.setEndpoint(flowId, {
        connectionId: "support",
        mode: "forward",
        url: "https://example.com/flow",
      }),
    ).rejects.toThrow();
    await expect(
      flows.rotateEncryptionKey({ connectionId: "support" }),
    ).rejects.toThrow();
    expect(server.requests).toHaveLength(2);
  });

  it("validates input before transport", async () => {
    const { server, flows } = await setup();
    const bad: SetFlowEndpointRequest[] = [
      { connectionId: "", mode: "forward", url: "https://example.com" },
      { connectionId: "s", mode: "forward", url: "http://example.com" },
      { connectionId: "s", mode: "forward", url: "https://" },
      { connectionId: "s", mode: "direct", url: "https://user:pw@example.com" },
      { connectionId: "s", mode: "direct", url: "https://example.com/#x" },
      { connectionId: "s", mode: "function", functionId: "" },
      {
        connectionId: "s",
        mode: "direct",
        url: "https://example.com",
        expectedRevision: 0,
      },
      { connectionId: "s", mode: "other" } as unknown as SetFlowEndpointRequest,
      {
        connectionId: "s",
        mode: "forward",
        url: "https://example.com",
        projectId: "x",
      } as unknown as SetFlowEndpointRequest,
    ];
    for (const body of bad)
      expect(() => flows.setEndpoint(flowId, body)).toThrow();
    expect(() => flows.endpointReceipts(flowId, { limit: 101 })).toThrow(
      "limit",
    );
    expect(() => flows.rotateEncryptionKey({ connectionId: " " })).toThrow(
      "connectionId",
    );
    expect(server.requests).toHaveLength(0);
    const typed: FlowEndpointSetResult["signingSecret"] = undefined;
    expect(typed).toBeUndefined();
  });
});

describe("verifyFlowForwardSignature", () => {
  const secret = "pfes_secret";
  const body = JSON.stringify({
    version: "3.0",
    action: "data_exchange",
    data: { a: 1 },
  });
  const now = 1_700_000_000_000;
  const sign = (t: number, payload = body, key = secret) =>
    `t=${t},v1=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;

  it("accepts the exact signed body inside the tolerance", async () => {
    expect(FLOW_FORWARD_SIGNATURE_HEADER).toBe("x-polymorfa-flow-signature");
    expect(
      await verifyFlowForwardSignature(body, sign(now / 1000), secret, { now }),
    ).toBe(true);
    expect(
      await verifyFlowForwardSignature(
        new TextEncoder().encode(body),
        sign(now / 1000 - 299),
        secret,
        { now },
      ),
    ).toBe(true);
  });

  it("rejects tampering, wrong secrets, stale timestamps and malformed headers", async () => {
    const t = now / 1000;
    expect(
      await verifyFlowForwardSignature(`${body} `, sign(t), secret, { now }),
    ).toBe(false);
    expect(
      await verifyFlowForwardSignature(body, sign(t, body, "other"), secret, {
        now,
      }),
    ).toBe(false);
    expect(
      await verifyFlowForwardSignature(body, sign(t - 301), secret, { now }),
    ).toBe(false);
    expect(
      await verifyFlowForwardSignature(body, sign(t + 301), secret, { now }),
    ).toBe(false);
    expect(
      await verifyFlowForwardSignature(body, sign(t - 600), secret, {
        now,
        toleranceSeconds: 900,
      }),
    ).toBe(true);
    for (const header of [
      undefined,
      null,
      "",
      "v1=abc",
      `t=${t}`,
      `t=x,v1=${"a".repeat(64)}`,
    ])
      expect(
        await verifyFlowForwardSignature(body, header, secret, { now }),
      ).toBe(false);
    expect(await verifyFlowForwardSignature(body, sign(t), "", { now })).toBe(
      false,
    );
  });
});
