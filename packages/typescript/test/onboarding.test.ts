import { afterEach, expect, it, vi } from "vitest";
import { MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
afterEach(() => vi.unstubAllGlobals());
it("uploads fixture content separately and advances an existing QuickLink without session credentials", async () => {
  const fetcher = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify({ fixtureId: "fixture" }), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example",
  });
  const input = {
    messages: [
      {
        id: "m1",
        senderPhone: "+12025550123",
        text: "Fixture",
        timestamp: 1,
        fromMe: false,
      },
    ],
  };
  await client.testing.createHistoryFixture("project-a", input);
  const signup = {
    quicklinkId: "ql_test",
    result: {
      code: "test-code",
      wabaId: "1",
      phoneNumberId: "2",
      coexistence: true,
    },
  };
  await client.cloudOnboarding.advance(signup);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(input);
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual(signup);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(
    "/messaging/testing/project-a/history-fixtures",
  );
  expect(String(fetcher.mock.calls[1]?.[0])).toContain(
    "/messaging/cloud-api/embedded-signup",
  );
});

it("rejects client-token fixture upload and Meta continuation before transport", () => {
  const fetcher = vi.fn<typeof globalThis.fetch>();
  const client = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_browser" },
    baseUrl: "https://api.example",
    fetch: fetcher,
  });
  expect(() =>
    client.testing.createHistoryFixture("project-a", { messages: [] }),
  ).toThrow("requires an organization API key or project token");
  expect(() =>
    client.cloudOnboarding.advance({ quicklinkId: "ql_test" }),
  ).toThrow("requires an organization API key or project token");
  expect(fetcher).not.toHaveBeenCalled();
});
