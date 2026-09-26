import { afterEach, describe, expect, it } from "vitest";

import { PolymorfaServerError } from "../src/errors.js";
import { MessagingCampaignsResource } from "../src/messaging/campaigns.js";
import { AudiencesResource } from "../src/platform/audiences.js";
import { CampaignsResource } from "../src/platform/campaigns.js";
import { HttpTransport } from "../src/transport/http.js";
import type { RequestOptions } from "../src/transport/types.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

// The API records a successful append or audience create against its
// Idempotency-Key and replays the original result on a retry, so the SDK
// sends a key and retries with it like any other keyed write.

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function transportWith(
  respond: (attempt: number) => {
    status: number;
    headers?: Record<string, string>;
    body: string;
  },
): Promise<{ transport: HttpTransport; requests: RecordedRequest[] }> {
  let attempt = 0;
  const server = await startTestServer(() => {
    attempt += 1;
    const { status, headers, body } = respond(attempt);
    return {
      status,
      headers: { "content-type": "application/json", ...headers },
      body,
    };
  });
  servers.push(server);
  return {
    requests: server.requests,
    transport: new HttpTransport({
      baseUrl: server.url,
      authorization: "Bearer pmfa_example",
      timeoutMs: 500,
      maxNetworkRetries: 2,
      sleep: async () => undefined,
      random: () => 0,
    }),
  };
}

const unavailable = {
  status: 503,
  body: '{"error":{"code":"unavailable","message":"Try again."}}',
};

const recipients = { recipients: [{ phone: "+15551234567" }] };

const writes: ReadonlyArray<
  readonly [
    string,
    (transport: HttpTransport, options?: RequestOptions) => Promise<unknown>,
  ]
> = [
  [
    "MessagingClient.campaigns.addRecipients",
    (transport, options) =>
      new MessagingCampaignsResource(transport).addRecipients(
        "launch",
        "campaign",
        recipients,
        options,
      ),
  ],
  [
    "Client.campaigns.addRecipients",
    (transport, options) =>
      new CampaignsResource(transport).addRecipients(
        "campaign",
        { projectId: "project", ...recipients },
        options,
      ),
  ],
  [
    "Client.audiences.addMembers",
    (transport, options) =>
      new AudiencesResource(transport).addMembers(
        "list",
        { members: recipients.recipients },
        options,
      ),
  ],
  [
    "Client.audiences.create",
    (transport, options) =>
      new AudiencesResource(transport).create(
        { name: "September", members: recipients.recipients },
        options,
      ),
  ],
];

describe("replayable appends and audience create", () => {
  it.each(writes)(
    "%s retries a retryable failure with one generated key",
    async (_name, write) => {
      const { transport, requests } = await transportWith(() => unavailable);

      await expect(write(transport)).rejects.toBeInstanceOf(
        PolymorfaServerError,
      );

      expect(requests).toHaveLength(3);
      const keys = requests.map(({ headers }) => headers["idempotency-key"]);
      expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
      expect(new Set(keys).size).toBe(1);
    },
  );

  it.each(writes)(
    "%s reuses the caller's key and returns the replayed result",
    async (_name, write) => {
      const { transport, requests } = await transportWith((attempt) =>
        attempt === 1
          ? unavailable
          : {
              status: 200,
              headers: { "idempotent-replayed": "true" },
              body: '{"data":{"added":1,"recipientCount":1}}',
            },
      );

      const response = (await write(transport, {
        idempotencyKey: "append-1",
      })) as { data: unknown };

      expect(response.data).toEqual({ data: { added: 1, recipientCount: 1 } });
      expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual(
        ["append-1", "append-1"],
      );
    },
  );

  it.each(writes)(
    "%s respects a per-request retry limit",
    async (_name, write) => {
      const { transport, requests } = await transportWith(() => unavailable);

      await expect(
        write(transport, { maxNetworkRetries: 0 }),
      ).rejects.toBeInstanceOf(PolymorfaServerError);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers["idempotency-key"]).toMatch(
        /^[0-9a-f-]{36}$/u,
      );
    },
  );

  it("still generates a replay key for a campaign create", async () => {
    const { transport, requests } = await transportWith(() => unavailable);

    await expect(
      new MessagingCampaignsResource(transport).create("launch", {
        name: "August",
      }),
    ).rejects.toBeInstanceOf(PolymorfaServerError);

    expect(requests).toHaveLength(3);
    expect(
      new Set(requests.map(({ headers }) => headers["idempotency-key"])).size,
    ).toBe(1);
  });
});
