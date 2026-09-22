import { afterEach, expect, it, vi } from "vitest";
import {
  MessagingClient,
  PolymorfaRateLimitError,
  PolymorfaValidationError,
  TEST_EVENT_FIXTURES,
  type TriggerTestEventRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

afterEach(() => vi.unstubAllGlobals());

function client(response: Response) {
  const fetcher = vi.fn<typeof globalThis.fetch>(async () => response);
  return {
    fetcher,
    client: new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: "https://api.example",
      fetch: fetcher,
    }),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

it("triggers a typed test event with overrides", async () => {
  const accepted = {
    event: "message.received",
    session: "test-a",
    delivery: "generated",
    eventId: "0199f1c2-7a4e-7c55-9d1e-3f0b8a2c6d10",
    source: "test",
  };
  const { client: messaging, fetcher } = client(json(accepted, 202));
  const input: TriggerTestEventRequest = {
    session: "test-a",
    event: "message.received",
    overrides: { text: "hi", from: "+15550100001" },
  };
  const result = await messaging.testing.triggerEvent("project a", input);
  expect(result.data).toEqual(accepted);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe(
    "https://api.example/messaging/testing/project%20a/events",
  );
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual(input);
});

it("lists fixtures", async () => {
  const fixtures = TEST_EVENT_FIXTURES.map((name) => ({
    name,
    description: name,
    overrides: [],
  }));
  const { client: messaging, fetcher } = client(json({ fixtures }));
  const result = await messaging.testing.listEventFixtures("project-a");
  expect(result.data.fixtures.map((f) => f.name)).toEqual([
    ...TEST_EVENT_FIXTURES,
  ]);
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    "https://api.example/messaging/testing/project-a/events/fixtures",
  );
  expect(fetcher.mock.calls[0]![1]?.method).toBe("GET");
});

it("serializes restriction fixtures and call termination overrides", async () => {
  const { client: messaging, fetcher } = client(
    json({ event: "session.restriction_updated", session: "test-a" }, 202),
  );
  await messaging.testing.triggerEvent("project-a", {
    session: "test-a",
    event: "session.restriction_updated",
    overrides: { restrictionActive: false },
  });
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
    session: "test-a",
    event: "session.restriction_updated",
    overrides: { restrictionActive: false },
  });
  const input: TriggerTestEventRequest = {
    session: "test-a",
    event: "call.ended",
    overrides: { callEndReason: "call_restricted" },
  };
  const call = client(json({ event: "call.ended", session: "test-a" }, 202));
  await call.client.testing.triggerEvent("project-a", input);
  expect(JSON.parse(String(call.fetcher.mock.calls[0]![1]?.body))).toEqual(
    input,
  );
});

it("surfaces a real-session refusal as an invalid request", async () => {
  const { client: messaging } = client(
    json(
      {
        error: {
          type: "invalid_request_error",
          code: "invalid_parameter",
          message:
            "Test events are available only for Test numbers. This session is not a Test number in the project, or it does not exist.",
          param: null,
        },
        data: null,
      },
      400,
    ),
  );
  await expect(
    messaging.testing.triggerEvent("project-a", {
      session: "real",
      event: "call.received",
    }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
});

it("rejects client tokens before transport", () => {
  const fetcher = vi.fn<typeof globalThis.fetch>();
  const messaging = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_browser" },
    baseUrl: "https://api.example",
    fetch: fetcher,
  });
  expect(() =>
    messaging.testing.triggerEvent("project-a", {
      session: "test-a",
      event: "session.status",
    }),
  ).toThrow("requires an organization API key or project token");
  expect(() => messaging.testing.listEventFixtures("project-a")).toThrow(
    "requires an organization API key or project token",
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("surfaces the per-project rate limit", async () => {
  const { client: messaging } = client(
    new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Test events are limited",
      }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "12" },
      },
    ),
  );
  await expect(
    messaging.testing.triggerEvent(
      "project-a",
      { session: "test-a", event: "call.missed" },
      { maxNetworkRetries: 0 },
    ),
  ).rejects.toBeInstanceOf(PolymorfaRateLimitError);
});

it("sends an optional Idempotency-Key and retries safely with it", async () => {
  const accepted = {
    event: "message.received",
    session: "test-a",
    delivery: "generated",
    eventId: "0199f1c2-7a4e-7c55-9d1e-3f0b8a2c6d10",
    source: "test",
  };
  const responses = [
    json({ error: { code: "service_unavailable", message: "busy" } }, 503),
    json(accepted, 202),
  ];
  const fetcher = vi.fn<typeof globalThis.fetch>(async () =>
    responses.shift()!,
  );
  const messaging = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example",
    fetch: fetcher,
  });
  const result = await messaging.testing.triggerEvent(
    "project-a",
    { session: "test-a", event: "message.received" },
    { idempotencyKey: "trigger-1", maxNetworkRetries: 1 },
  );
  expect(result.data).toEqual(accepted);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of fetcher.mock.calls) {
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("trigger-1");
  }
});

it("omits Idempotency-Key when none is given", async () => {
  const { client: messaging, fetcher } = client(
    json(
      {
        event: "session.status",
        session: "test-a",
        delivery: "generated",
        eventId: null,
        source: "test",
      },
      202,
    ),
  );
  await messaging.testing.triggerEvent("project-a", {
    session: "test-a",
    event: "session.status",
  });
  const init = fetcher.mock.calls[0]![1];
  expect(new Headers(init?.headers).has("idempotency-key")).toBe(false);
});
