import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  LabelsResource,
  MessagingClient,
  type ApiResponse,
  type CreateLabelRequest,
  type CreateLabelResponse,
  type GetChatLabelsResponse,
  type Label,
  type LabelCollection,
  type LabelReadData,
  type ListLabelsParams,
  type ListLabelsResponse,
  type ReplaceChatLabelsRequest,
  type SuccessResponse,
  type UpdateLabelRequest,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function labelsServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_labels",
    },
    body:
      request.method === "POST"
        ? '{"success":true,"data":{"id":"label-1","name":"Priority","color":3}}'
        : request.method === "GET"
          ? '{"success":true,"data":[]}'
          : '{"success":true,"message":"updated"}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_example" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient labels", () => {
  it("exports the exact label and observation-envelope shapes", () => {
    expectTypeOf<Label>().toEqualTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly color: number;
      readonly orderIndex?: number;
      readonly chatCount?: number;
      readonly observedAt?: string;
    }>();
    expectTypeOf<LabelCollection>().toEqualTypeOf<{
      readonly policy: "off" | "events" | "cache" | "project";
      readonly status: "disabled" | "unknown" | "partial" | "fresh";
      readonly unknownReason?:
        "observation_disabled" | "not_retained" | "not_observed" | "expired";
      readonly observedAt?: string;
      readonly expiresAt?: string;
      readonly labels: readonly Label[];
    }>();
    expectTypeOf<LabelReadData>().toEqualTypeOf<
      readonly Label[] | LabelCollection
    >();
    expectTypeOf<CreateLabelRequest>().toEqualTypeOf<{
      readonly name: string;
      readonly color?: number;
    }>();
    expectTypeOf<UpdateLabelRequest>().toEqualTypeOf<
      | { readonly name: string; readonly color?: number }
      | { readonly name?: string; readonly color: number }
    >();
    expectTypeOf<ReplaceChatLabelsRequest>().toEqualTypeOf<{
      readonly labels: readonly string[];
    }>();
    expectTypeOf<ListLabelsParams>().toEqualTypeOf<{
      readonly includeObservation?: boolean;
    }>();
    expectTypeOf<MessagingClient["labels"]>().toEqualTypeOf<LabelsResource>();
  });

  it("lists session and chat labels with observation envelopes and encoded identifiers", async () => {
    const { client, requests } = await labelsServer();

    const listed = await client.labels.list(
      "support/eu",
      { includeObservation: true },
      { apiVersion: "next" },
    );
    const attached = await client.labels.listForChat(
      "support/eu",
      "customer/1@g.us",
      { includeObservation: false },
    );

    expectTypeOf(listed).toEqualTypeOf<ApiResponse<ListLabelsResponse>>();
    expectTypeOf(attached).toEqualTypeOf<ApiResponse<GetChatLabelsResponse>>();
    expect(listed.metadata.requestId).toBe("req_labels");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/support%2Feu/labels?includeObservation=true",
      "GET /api/support%2Feu/labels/chats/customer%2F1%40g.us?includeObservation=false",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });

  it("maps CRUD and full-set chat replacement with idempotency metadata", async () => {
    const { client, requests } = await labelsServer();
    const options = { idempotencyKey: "labels-change" } as const;

    const created = await client.labels.create(
      "support/eu",
      { name: "Priority", color: 3 },
      options,
    );
    await client.labels.update(
      "support/eu",
      "label/1",
      { name: "Urgent" },
      options,
    );
    await client.labels.delete("support/eu", "label/1", options);
    const replaced = await client.labels.replaceForChat(
      "support/eu",
      "customer/1@g.us",
      { labels: ["label/2", "label/3"] },
      options,
    );

    expectTypeOf(created).toEqualTypeOf<ApiResponse<CreateLabelResponse>>();
    expectTypeOf(replaced).toEqualTypeOf<ApiResponse<SuccessResponse>>();
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "POST",
        path: "/api/support%2Feu/labels",
        body: '{"name":"Priority","color":3}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/labels/label%2F1",
        body: '{"name":"Urgent"}',
      },
      {
        method: "DELETE",
        path: "/api/support%2Feu/labels/label%2F1",
        body: "",
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/labels/chats/customer%2F1%40g.us",
        body: '{"labels":["label/2","label/3"]}',
      },
    ]);
    expect(
      requests.slice(0, 4).map(({ headers }) => headers["idempotency-key"]),
    ).toEqual([
      "labels-change",
      "labels-change",
      "labels-change",
      "labels-change",
    ]);
  });
});
