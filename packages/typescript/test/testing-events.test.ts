import { readFileSync } from "node:fs";
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

const apiContract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/testing-events.json", import.meta.url),
    "utf8",
  ),
) as {
  schemas: {
    TriggerTestEventRequest: { properties: { event: { enum: string[] } } };
  };
};

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

it("matches the public fixture catalog at API 75264661fdf38690ff2d18b342b3026db6332093", () => {
  expect(TEST_EVENT_FIXTURES).toEqual(
    apiContract.schemas.TriggerTestEventRequest.properties.event.enum,
  );
});

it("resolves every local schema reference in the focused contract", () => {
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    if ("$ref" in value) {
      const ref = String(value.$ref);
      expect(ref).toMatch(/^#\//);
      const resolved = ref
        .slice(2)
        .split("/")
        .reduce<unknown>((current, part) => {
          const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
          return typeof current === "object" && current !== null
            ? (current as Record<string, unknown>)[key]
            : undefined;
        }, apiContract);
      expect(resolved, ref).toBeDefined();
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(apiContract);
});

it.each([true, false])(
  "sends the restriction fixture with restrictionActive=%s",
  async (restrictionActive) => {
    const accepted = {
      event: "session.restriction_updated",
      session: "test-a",
      delivery: "generated",
      eventId: "0199f1c2-7a4e-7c55-9d1e-3f0b8a2c6d10",
      source: "test",
    };
    const { client: messaging, fetcher } = client(json(accepted, 202));
    const input: TriggerTestEventRequest = {
      session: "test-a",
      event: "session.restriction_updated",
      overrides: { restrictionActive },
    };
    expect(
      (await messaging.testing.triggerEvent("project-a", input)).data,
    ).toEqual(accepted);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(input);
  },
);

it("sends a call restriction outcome supported by the API fixture", async () => {
  const { client: messaging, fetcher } = client(
    json({ event: "call.ended" }, 202),
  );
  const input: TriggerTestEventRequest = {
    session: "test-a",
    event: "call.ended",
    overrides: { callEndReason: "call_restricted" },
  };
  await messaging.testing.triggerEvent("project-a", input);
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(input);
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

it("serializes restriction fixtures and restricted call endings", async () => {
  for (const input of [
    {
      session: "test-a",
      event: "session.restriction_updated",
      overrides: { restrictionActive: true },
    },
    {
      session: "test-a",
      event: "call.ended",
      overrides: { callEndReason: "call_restricted" },
    },
  ] satisfies TriggerTestEventRequest[]) {
    const { client: messaging, fetcher } = client(
      json(
        {
          event: input.event,
          session: input.session,
          delivery: "generated",
          eventId: null,
          source: "test",
        },
        202,
      ),
    );
    await messaging.testing.triggerEvent("project-a", input);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(input);
  }
});
