import { afterEach, expect, it, vi } from "vitest";
import {
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type TestingPhone,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function client(response: Response, type: "apiKey" | "clientToken" = "apiKey") {
  const fetcher = vi.fn<typeof globalThis.fetch>(async () => response);
  return {
    fetcher,
    client: new MessagingClient({
      credential:
        type === "apiKey"
          ? { type, value: ORGANIZATION_API_KEY }
          : { type, value: "pmfa_ct_browser" },
      baseUrl: "https://api.example",
      fetch: fetcher,
    }),
  };
}

it("reads a Test number's phone", async () => {
  const phone: TestingPhone = {
    session: "test a",
    phone: "+15550100001",
    online: true,
    devices: [{ deviceId: 33 }, { deviceId: 74 }],
  };
  const { client: messaging, fetcher } = client(json(phone));
  const result = await messaging.testing.getPhone("project-a", "test a");
  expect(result.data).toEqual(phone);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe(
    "https://api.example/messaging/testing/project-a/numbers/test%20a/phone",
  );
  expect(init?.method).toBe("GET");
});

it("sends a message from the phone", async () => {
  const sent = { session: "test-a", to: "+15550100002", messageId: "3EB0AA" };
  const { client: messaging, fetcher } = client(json(sent, 202));
  const input = { to: "+15550100002", text: "hello" };
  const result = await messaging.testing.sendPhoneMessage(
    "project-a",
    "test-a",
    input,
  );
  expect(result.data).toEqual(sent);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe(
    "https://api.example/messaging/testing/project-a/numbers/test-a/phone/messages",
  );
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual(input);
});

it("unlinks a companion", async () => {
  const unlinked = { session: "test-a", deviceId: 74, unlinked: true };
  const { client: messaging, fetcher } = client(json(unlinked));
  const result = await messaging.testing.unlinkPhoneDevice(
    "project-a",
    "test-a",
    74,
  );
  expect(result.data).toEqual(unlinked);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe(
    "https://api.example/messaging/testing/project-a/numbers/test-a/phone/devices/74/unlink",
  );
  expect(init?.method).toBe("POST");
});

it.each([0, 100, 1.5])("refuses device ID %s before sending", (deviceId) => {
  const { client: messaging, fetcher } = client(json({}));
  expect(() =>
    messaging.testing.unlinkPhoneDevice("project-a", "test-a", deviceId),
  ).toThrow(PolymorfaValidationError);
  expect(fetcher).not.toHaveBeenCalled();
});

it("refuses client tokens", () => {
  const { client: messaging, fetcher } = client(json({}), "clientToken");
  expect(() => messaging.testing.getPhone("project-a", "test-a")).toThrow(
    PolymorfaConfigurationError,
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("surfaces an offline phone as a validation error", async () => {
  const { client: messaging } = client(
    json(
      {
        error: "bad_request",
        message:
          "The Test number's phone is offline. Start the Test number first.",
      },
      400,
    ),
  );
  await expect(
    messaging.testing.sendPhoneMessage("project-a", "test-a", {
      to: "+15550100002",
      text: "hi",
    }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
});
