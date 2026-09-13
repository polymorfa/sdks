import { expect, it, vi } from "vitest";
import {
  MessagingClient,
  CloudOnboardingResource,
  PolymorfaConfigurationError,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
it("advances authenticated Cloud onboarding at the pinned path with explicit false choices", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ success: true, data: { stage: "selected" } }),
  );
  const client = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    fetch,
  });
  const input = {
    session: "reserved",
    projectId: "11111111-2222-4333-8444-555555555555",
    result: {
      code: "authorization-code",
      wabaId: "123",
      phoneNumberId: "456",
      coexistence: false,
      historySync: false,
    },
  };
  expect((await client.cloudOnboarding.advance(input)).data).toEqual({
    success: true,
    data: { stage: "selected" },
  });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).pathname).toBe("/messaging/cloud-api/embedded-signup");
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual(input);
});
it("rejects client-token Cloud onboarding before transport", () => {
  const request = vi.fn();
  const resource = new CloudOnboardingResource(
    { request } as never,
    "clientToken",
  );
  expect(() => resource.advance({ session: "reserved" })).toThrow(
    PolymorfaConfigurationError,
  );
  expect(request).not.toHaveBeenCalled();
});
