import { describe, expect, it, vi } from "vitest";

import { Client, PolymorfaServerError } from "../src/index.js";

describe("management response envelopes", () => {
  it.each([undefined, null, {}, { data: undefined }])(
    "rejects malformed successful response %j with a typed error",
    async (body) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        body === undefined
          ? new Response(undefined, {
              status: 200,
              headers: { "x-request-id": "req_invalid" },
            })
          : Response.json(body, {
              headers: { "x-request-id": "req_invalid" },
            }),
      );
      const client = new Client({
        credential: { type: "organizationApiKey", value: "pmfa_org" },
        baseUrl: "https://api.example.com",
        fetch,
      });

      await expect(client.events.retrieve("event_1")).rejects.toMatchObject({
        name: PolymorfaServerError.name,
        code: "invalid_response",
        status: 200,
        requestId: "req_invalid",
      });
    },
  );
});
