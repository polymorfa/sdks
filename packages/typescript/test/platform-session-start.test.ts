import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  Client,
  type ApiResponse,
  type DataEnvelope,
  type SessionStartResult,
} from "../src/index.js";

describe("Client.sessions.start", () => {
  it("starts an organization-managed session", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: { starting: true, sessionId: "session-uuid" } }),
    );
    const client = new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: "https://api.example.com",
      fetch,
    });

    const response = await client.sessions.start(
      "support/us",
      { projectId: "project-a" },
      { idempotencyKey: "start-support" },
    );

    expectTypeOf(response).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionStartResult>>
    >();
    expect(response.data.data).toEqual({
      starting: true,
      sessionId: "session-uuid",
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(
      "/platform/sessions/support%2Fus/start",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ projectId: "project-a" });
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(
      "start-support",
    );
  });
});
