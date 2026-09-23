import { afterEach, expect, it, vi } from "vitest";
import { MessagingClient, PolymorfaConfigurationError } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
afterEach(() => vi.restoreAllMocks());
it("serializes scoped routing revisions and pause guards exactly", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ success: true, data: { revision: "new", paused: true } }),
  );
  const client = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example.test",
    fetch,
  });
  await client.hybridLink.getPolicy({
    scope: "session",
    projectId: "project/1",
    session: "number/1",
  });
  await client.hybridLink.setPolicy(
    { scope: "team" },
    {
      expectedRevision: "default",
      prefer: "official_api",
      allowedTransports: ["official_api"],
    },
  );
  await client.hybridLink.state("number/1");
  await client.hybridLink.setPaused("number/1", {
    expectedRevision: "revision-1",
    paused: true,
  });
  expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
    "https://api.example.test/messaging/routing/hybrid?scope=session&projectId=project%2F1&session=number%2F1",
    "https://api.example.test/messaging/routing/hybrid?scope=team",
    "https://api.example.test/messaging/number%2F1/hybrid-link",
    "https://api.example.test/messaging/number%2F1/hybrid-link",
  ]);
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({
    expectedRevision: "default",
    prefer: "official_api",
    allowedTransports: ["official_api"],
  });
  expect(JSON.parse(fetch.mock.calls[3]![1]!.body as string)).toEqual({
    expectedRevision: "revision-1",
    paused: true,
  });
});
it("rejects browser control and operation reads before transport", () => {
  const fetch = vi.fn();
  const client = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_browser" },
    fetch,
  });
  expect(() => client.hybridLink.state("number")).toThrow(
    PolymorfaConfigurationError,
  );
  expect(() =>
    client.hybridLink.setPaused("number", {
      expectedRevision: "revision",
      paused: false,
    }),
  ).toThrow(PolymorfaConfigurationError);
  expect(() => client.messages.operationStatus("number", "operation")).toThrow(
    PolymorfaConfigurationError,
  );
  expect(fetch).not.toHaveBeenCalled();
});
