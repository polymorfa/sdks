import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Client,
  PolymorfaAuthorizationError,
  PolymorfaServerError,
  type Referral,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const REFERRAL: Referral = {
  code: "k3m9p2q8rt",
  link: "https://polymorfa.com/r/k3m9p2q8rt",
  enabled: true,
  welcomeBonus: { percent: 25, capCredits: "5000" },
  tiers: [
    { minReferrals: 1, percent: 10 },
    { minReferrals: 4, percent: 15 },
    { minReferrals: 25, percent: 20 },
  ],
  rewardCapCredits: "10000",
  holdDays: 30,
  groupShareEnabled: true,
};

function organizationClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example.com",
    fetch,
    maxNetworkRetries: 0,
  });
}

describe("referral", () => {
  it("reads the team's link with GET /platform/referral", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: REFERRAL }),
    );
    const response = await organizationClient(fetch).referral.retrieve();
    expect(response.data).toEqual(REFERRAL);
    expectTypeOf(response.data).toEqualTypeOf<Referral>();
    expectTypeOf(response.data.welcomeBonus.capCredits).toEqualTypeOf<string>();

    const [url, init] = fetch.mock.calls[0] as [string | URL, RequestInit];
    const sent = new URL(String(url));
    expect(init.method).toBe("GET");
    expect(sent.pathname).toBe("/platform/referral");
    expect(sent.search).toBe("");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });

  it("keeps credit amounts as decimal strings", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        data: {
          ...REFERRAL,
          welcomeBonus: { percent: 25, capCredits: "5000.5" },
          rewardCapCredits: "10000.000001",
        },
      }),
    );
    const { data } = await organizationClient(fetch).referral.retrieve();
    expect(data.welcomeBonus.capCredits).toBe("5000.5");
    expect(data.rewardCapCredits).toBe("10000.000001");
  });

  it("maps a 403 for teams without referral access", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            type: "permission_error",
            code: "feature_unavailable",
            message: "Referrals are not available to this team.",
            param: null,
            request_id: "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
          },
          data: null,
        },
        { status: 403 },
      ),
    );
    await expect(
      organizationClient(fetch).referral.retrieve(),
    ).rejects.toBeInstanceOf(PolymorfaAuthorizationError);
  });

  it("rejects a response without the data envelope", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(REFERRAL),
    );
    await expect(
      organizationClient(fetch).referral.retrieve(),
    ).rejects.toBeInstanceOf(PolymorfaServerError);
  });

  it("is a team resource, not available on project clients", () => {
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project_1",
      baseUrl: "https://api.example.com",
    });
    expect("referral" in client).toBe(false);
  });
});
