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

// The pinned contracts declare no Idempotency-Key or replay semantics for
// these appends. A resend after a lost response would be processed as a new
// append and report the first attempt's rows as duplicates, so the SDK must
// send each append once.

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function failingTransport(): Promise<{
  transport: HttpTransport;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    status: 503,
    headers: { "content-type": "application/json" },
    body: '{"error":{"code":"unavailable","message":"Try again."}}',
  }));
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

const recipients = { recipients: [{ phone: "+15551234567" }] };

const appends: ReadonlyArray<
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
];

describe("appends without declared replay", () => {
  it.each(appends)(
    "%s sends once without a generated key on a retryable failure",
    async (_name, append) => {
      const { transport, requests } = await failingTransport();

      await expect(append(transport)).rejects.toBeInstanceOf(
        PolymorfaServerError,
      );

      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.headers["idempotency-key"]).toBeUndefined();
    },
  );

  it.each(appends)(
    "%s is not retried even with a caller key",
    async (_name, append) => {
      const { transport, requests } = await failingTransport();

      await expect(
        append(transport, { idempotencyKey: "append-1" }),
      ).rejects.toBeInstanceOf(PolymorfaServerError);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers["idempotency-key"]).toBe("append-1");
    },
  );

  it.each(appends)(
    "%s retries only when the caller opts in for the request",
    async (_name, append) => {
      const { transport, requests } = await failingTransport();

      await expect(
        append(transport, { idempotencyKey: "append-1", maxNetworkRetries: 1 }),
      ).rejects.toBeInstanceOf(PolymorfaServerError);

      expect(requests).toHaveLength(2);
    },
  );

  it.each(appends)(
    "%s is not retried by a retry count without a key",
    async (_name, append) => {
      const { transport, requests } = await failingTransport();

      await expect(
        append(transport, { maxNetworkRetries: 2 }),
      ).rejects.toBeInstanceOf(PolymorfaServerError);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers["idempotency-key"]).toBeUndefined();
    },
  );

  it("still retries a read on the same transport", async () => {
    const { transport, requests } = await failingTransport();

    await expect(
      new MessagingCampaignsResource(transport).listRecipients(
        "launch",
        "campaign",
      ),
    ).rejects.toBeInstanceOf(PolymorfaServerError);

    expect(requests).toHaveLength(3);
  });

  it("still generates a replay key for a campaign create", async () => {
    const { transport, requests } = await failingTransport();

    await expect(
      new MessagingCampaignsResource(transport).create("launch", {
        name: "August",
      }),
    ).rejects.toBeInstanceOf(PolymorfaServerError);

    expect(requests).toHaveLength(3);
    const keys = requests.map(({ headers }) => headers["idempotency-key"]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(new Set(keys).size).toBe(1);
  });
});
