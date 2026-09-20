import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  Client,
  MessagingClient,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaRateLimitError,
  PolymorfaValidationError,
  type CallOptOut,
  type CallPermission,
  type CallPermissionChangedPayload,
  type CallPolicy,
  type SendMessageRequest,
  type VoipCallCheck,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const OPT_OUT_ID = "0b0e5b1e-0000-4000-8000-000000000010";

function policy(overrides: Partial<CallPolicy> = {}): CallPolicy {
  return {
    blockedCountryCodes: ["44", "1876"],
    optOutCount: 2,
    revision: 3,
    updatedAt: "2026-09-19T10:00:00.000Z",
    ...overrides,
  };
}

function optOut(overrides: Partial<CallOptOut> = {}): CallOptOut {
  return {
    id: OPT_OUT_ID,
    phoneNumber: "+14155550123",
    bsuid: null,
    note: "Asked not to be called on 2026-09-18",
    source: "api",
    createdAt: "2026-09-18T09:00:00.000Z",
    ...overrides,
  };
}

function permission(overrides: Partial<CallPermission> = {}): CallPermission {
  return {
    conversation: { id: "739182640518203", phoneNumber: "+14155550123" },
    status: "temporary",
    expiresAt: "2026-09-26T10:00:00.000Z",
    source: "user_action",
    updatedAt: "2026-09-19T10:00:00.000Z",
    checkedAt: "2026-09-19T12:30:00.000Z",
    fresh: true,
    actions: {
      requestPermission: {
        allowed: false,
        limits: [
          {
            period: "PT24H",
            maxAllowed: 1,
            used: 1,
            resetsAt: "2026-09-20T10:00:00.000Z",
          },
        ],
      },
      startCall: { allowed: true, limits: [] },
    },
    ...overrides,
  };
}

function request(fetch: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetch.mock.calls[index] as [string | URL, RequestInit];
  return {
    method: init.method,
    url: new URL(String(url)),
    headers: new Headers(init.headers),
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

function teamClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example.com",
    maxNetworkRetries: 0,
    fetch,
  });
}

function messagingClient(
  fetch: typeof globalThis.fetch,
  credential: "apiKey" | "clientToken" = "apiKey",
) {
  return new MessagingClient({
    credential:
      credential === "apiKey"
        ? { type: "apiKey", value: ORGANIZATION_API_KEY }
        : { type: "clientToken", value: `pmfa_ct_${"A".repeat(94)}` },
    baseUrl: "https://api.example.com",
    maxNetworkRetries: 0,
    fetch,
  });
}

function errorBody(code: string, message: string, type: string) {
  return {
    error: {
      type,
      code,
      message,
      param: null,
      request_id: "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
    },
    data: null,
    docs: `https://docs.polymorfa.com/api/errors#${code.replaceAll("_", "-")}`,
  };
}

describe("team call policy", () => {
  it("reads the blocked country codes from the team route", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: policy() }),
    );
    const read = await teamClient(fetch).callPolicy.retrieve();

    expect(read.data).toEqual(policy());
    const sent = request(fetch);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe("/platform/call-policy");
    expect(sent.headers.get("authorization")).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });

  it("replaces the whole list and forwards expectedRevision", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: policy({ revision: 4 }) }),
    );
    const updated = await teamClient(fetch).callPolicy.update({
      blockedCountryCodes: ["44", "1876"],
      expectedRevision: 3,
    });

    expect(updated.data.revision).toBe(4);
    const sent = request(fetch);
    expect(sent.method).toBe("PUT");
    expect(sent.url.pathname).toBe("/platform/call-policy");
    expect(sent.body).toEqual({
      blockedCountryCodes: ["44", "1876"],
      expectedRevision: 3,
    });
  });

  it("allows every country with an empty list", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: policy({ blockedCountryCodes: [], revision: 5 }),
      }),
    );
    await teamClient(fetch).callPolicy.update({ blockedCountryCodes: [] });

    expect(request(fetch).body).toEqual({ blockedCountryCodes: [] });
  });

  it.each([
    ["+44", "a leading plus"],
    ["12345", "five digits"],
    ["044", "a leading zero"],
    ["", "an empty code"],
  ])("refuses %s before any request (%s)", (code) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() =>
      teamClient(fetch).callPolicy.update({ blockedCountryCodes: [code] }),
    ).toThrow(PolymorfaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses more than 300 codes and a negative expectedRevision", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = teamClient(fetch);
    expect(() =>
      client.callPolicy.update({
        blockedCountryCodes: Array.from({ length: 301 }, () => "44"),
      }),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      client.callPolicy.update({
        blockedCountryCodes: ["44"],
        expectedRevision: -1,
      }),
    ).toThrow(PolymorfaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("raises state_conflict when the policy moved on", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        errorBody(
          "state_conflict",
          "The request conflicts with the resource state.",
          "conflict_error",
        ),
        { status: 409 },
      ),
    );
    const failure = await teamClient(fetch)
      .callPolicy.update({ blockedCountryCodes: ["44"], expectedRevision: 1 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PolymorfaConflictError);
    expect((failure as PolymorfaConflictError).code).toBe("state_conflict");
  });
});

describe("do-not-call list", () => {
  it("reports a new entry and an existing one by response status", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: optOut() }, { status: 201 }),
    );
    const client = teamClient(fetch);
    const added = await client.callOptOuts.create({
      phoneNumber: "+14155550123",
      note: "Asked not to be called on 2026-09-18",
    });

    expect(added.metadata.status).toBe(201);
    expect(added.data).toEqual(optOut());
    const sent = request(fetch);
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/platform/call-opt-outs");
    expect(sent.body).toEqual({
      phoneNumber: "+14155550123",
      note: "Asked not to be called on 2026-09-18",
    });

    fetch.mockImplementationOnce(async () =>
      Response.json({ success: true, data: optOut() }, { status: 200 }),
    );
    const existing = await client.callOptOuts.create({
      phoneNumber: "+14155550123",
    });
    expect(existing.metadata.status).toBe(200);
    expect(existing.data.id).toBe(OPT_OUT_ID);
  });

  it("adds a person by BSUID", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          success: true,
          data: optOut({
            phoneNumber: null,
            bsuid: "US.13491208655302741918",
            source: "api",
          }),
        },
        { status: 201 },
      ),
    );
    const added = await teamClient(fetch).callOptOuts.create({
      bsuid: "US.13491208655302741918",
    });

    expect(added.data.phoneNumber).toBeNull();
    expect(request(fetch).body).toEqual({
      bsuid: "US.13491208655302741918",
    });
  });

  it("requires exactly one identifier", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const resource = teamClient(fetch).callOptOuts as unknown as {
      create(input: unknown): Promise<unknown>;
    };
    for (const input of [
      {},
      { phoneNumber: "+14155550123", bsuid: "US.13491208655302741918" },
      { note: "no identifier" },
    ]) {
      expect(() => resource.create(input)).toThrow(PolymorfaValidationError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows page.nextCursor across pages", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async () =>
        Response.json({
          success: true,
          data: [optOut()],
          page: { nextCursor: "cursor-2", hasMore: true },
        }),
      )
      .mockImplementationOnce(async () =>
        Response.json({
          success: true,
          data: [optOut({ id: `${OPT_OUT_ID}1`, phoneNumber: "+14155550124" })],
          page: { nextCursor: null, hasMore: false },
        }),
      );

    const first = await teamClient(fetch).callOptOuts.list({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe("cursor-2");

    const collected: CallOptOut[] = [];
    for await (const entry of first) collected.push(entry);
    expect(collected.map((entry) => entry.phoneNumber)).toEqual([
      "+14155550123",
      "+14155550124",
    ]);

    const firstRequest = request(fetch, 0);
    expect(firstRequest.method).toBe("GET");
    expect(firstRequest.url.pathname).toBe("/platform/call-opt-outs");
    expect(firstRequest.url.searchParams.get("limit")).toBe("1");
    expect(firstRequest.url.searchParams.get("cursor")).toBeNull();
    expect(request(fetch, 1).url.searchParams.get("cursor")).toBe("cursor-2");
  });

  it("filters by one identifier only", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: [optOut()],
        page: { nextCursor: null, hasMore: false },
      }),
    );
    const client = teamClient(fetch);
    const page = await client.callOptOuts.list({
      phoneNumber: "+14155550123",
    });
    expect(page.items).toEqual([optOut()]);
    expect(request(fetch).url.searchParams.get("phoneNumber")).toBe(
      "+14155550123",
    );

    expect(() =>
      client.callOptOuts.list({
        phoneNumber: "+14155550123",
        bsuid: "US.13491208655302741918",
      }),
    ).toThrow(PolymorfaValidationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("imports entries and reports the rejected ones", async () => {
    const result = {
      added: 1,
      existing: 1,
      rejected: [{ index: 2, reason: "invalid_phone_number" }],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: result }),
    );
    const imported = await teamClient(fetch).callOptOuts.import({
      entries: [
        { phoneNumber: "+14155550123" },
        { bsuid: "US.13491208655302741918" },
        { phoneNumber: "not-a-number" },
      ],
    });

    expect(imported.data).toEqual(result);
    const sent = request(fetch);
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/platform/call-opt-outs/import");
    expect(sent.body.entries).toHaveLength(3);
  });

  it("refuses an empty import and one past 5,000 entries", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = teamClient(fetch);
    expect(() => client.callOptOuts.import({ entries: [] })).toThrow(
      PolymorfaValidationError,
    );
    expect(() =>
      client.callOptOuts.import({
        entries: Array.from({ length: 5001 }, () => ({
          phoneNumber: "+14155550123",
        })),
      }),
    ).toThrow(PolymorfaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("raises call_opt_out_limit when the list is full", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        errorBody(
          "call_opt_out_limit",
          "The team's do-not-call list is full.",
          "conflict_error",
        ),
        { status: 409 },
      ),
    );
    const failure = await teamClient(fetch)
      .callOptOuts.create({ phoneNumber: "+14155550123" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PolymorfaConflictError);
    expect((failure as PolymorfaConflictError).code).toBe("call_opt_out_limit");
  });

  it("removes one entry and refuses a blank id", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: { id: OPT_OUT_ID, deleted: true },
      }),
    );
    const client = teamClient(fetch);
    const removed = await client.callOptOuts.delete(OPT_OUT_ID);

    expect(removed.data).toEqual({ id: OPT_OUT_ID, deleted: true });
    const sent = request(fetch);
    expect(sent.method).toBe("DELETE");
    expect(sent.url.pathname).toBe(`/platform/call-opt-outs/${OPT_OUT_ID}`);

    expect(() => client.callOptOuts.delete("  ")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("call permissions", () => {
  it("reads a permission by encoded phone number", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: permission() }),
    );
    const read = await messagingClient(fetch).voip.retrieveCallPermission(
      "support",
      "+14155550123",
    );

    expect(read.data).toEqual({ success: true, data: permission() });
    const sent = request(fetch);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe(
      "/messaging/support/call-permissions/%2B14155550123",
    );
    expect(sent.body).toBeUndefined();
  });

  it("keeps the stored state when WhatsApp could not be asked", async () => {
    const stale = permission({
      fresh: false,
      actions: null,
      checkedAt: "2026-09-18T10:00:00.000Z",
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: stale }),
    );
    const read = await messagingClient(fetch).voip.retrieveCallPermission(
      "support",
      "US.13491208655302741918",
    );

    expect(read.data.data.fresh).toBe(false);
    expect(read.data.data.actions).toBeNull();
    expect(request(fetch).url.pathname).toBe(
      "/messaging/support/call-permissions/US.13491208655302741918",
    );
  });

  it("requires a server credential and a session", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() =>
      messagingClient(fetch, "clientToken").voip.retrieveCallPermission(
        "support",
        "+14155550123",
      ),
    ).toThrow(PolymorfaConfigurationError);
    expect(() =>
      messagingClient(fetch).voip.retrieveCallPermission("", "+14155550123"),
    ).toThrow(PolymorfaConfigurationError);
    expect(() =>
      messagingClient(fetch).voip.retrieveCallPermission("support", ""),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks a destination without placing a call", async () => {
    const check: VoipCallCheck = {
      allowed: false,
      refusal: "call_permission_required",
      permission: {
        status: "revoked",
        expiresAt: null,
        source: "call_refused",
        updatedAt: "2026-09-19T10:00:00.000Z",
        checkedAt: "2026-09-19T12:30:00.000Z",
        fresh: true,
        actions: null,
      },
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ success: true, data: check }),
    );
    const result = await messagingClient(fetch).voip.check({
      session: "support",
      to: "+14155550123",
    });

    expect(result.data.data).toEqual(check);
    const sent = request(fetch);
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/messaging/voip/calls/check");
    expect(sent.body).toEqual({ session: "support", to: "+14155550123" });
  });

  it("refuses an incomplete check and a client token", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const messaging = messagingClient(fetch);
    expect(() =>
      messaging.voip.check({ session: "", to: "+14155550123" }),
    ).toThrow(PolymorfaValidationError);
    expect(() => messaging.voip.check({ session: "support", to: "" })).toThrow(
      PolymorfaValidationError,
    );
    expect(() =>
      messagingClient(fetch, "clientToken").voip.check({
        session: "support",
        to: "+14155550123",
      }),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a call permission request as message content", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: { id: "739182640518203", status: "sent" },
      }),
    );
    const body: SendMessageRequest = {
      conversation: { phoneNumber: "+14155550123" },
      content: {
        callPermissionRequest: {
          body: "We would like to call you about order 1522.",
        },
      },
    };
    await messagingClient(fetch).messages.send("support", body);

    const sent = request(fetch);
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/messaging/support/messages/send");
    expect(sent.body).toEqual(body);
  });

  it("surfaces WhatsApp's permission request limit with Retry-After", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        errorBody(
          "call_permission_request_limited",
          "WhatsApp's permission request limit for this person is reached.",
          "rate_limit_error",
        ),
        {
          status: 429,
          headers: {
            "retry-after": "3600",
            "polymorfa-ratelimit-reason": "call_permission_request",
          },
        },
      ),
    );
    const failure = await messagingClient(fetch)
      .messages.send("support", {
        conversation: { phoneNumber: "+14155550123" },
        content: { callPermissionRequest: { body: "May we call you?" } },
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PolymorfaRateLimitError);
    const error = failure as PolymorfaRateLimitError;
    expect(error.code).toBe("call_permission_request_limited");
    expect(error.rateLimitReason).toBe("call_permission_request");
    expect(error.metadata?.headers["retry-after"]).toBe("3600");
  });

  it("reports an already granted permanent permission", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        errorBody(
          "call_permission_granted",
          "The person already granted permanent permission.",
          "conflict_error",
        ),
        { status: 409 },
      ),
    );
    const failure = await messagingClient(fetch)
      .messages.send("support", {
        conversation: { phoneNumber: "+14155550123" },
        content: { callPermissionRequest: { body: "May we call you?" } },
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PolymorfaConflictError);
    expect((failure as PolymorfaConflictError).code).toBe(
      "call_permission_granted",
    );
  });
});

describe("refused placements", () => {
  it.each([
    ["call_recipient_opted_out", "The destination is on the do-not-call list."],
    ["call_destination_blocked", "The destination's country code is blocked."],
  ])("maps %s to an authorization error", async (code, message) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(errorBody(code, message, "permission_error"), {
        status: 403,
      }),
    );
    const failure = await messagingClient(fetch)
      .voip.place({ session: "support", to: "+14155550123" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PolymorfaAuthorizationError);
    expect((failure as PolymorfaAuthorizationError).code).toBe(code);
  });
});

describe("call permission types", () => {
  it("keeps the webhook payload and content types on the public surface", () => {
    expectTypeOf<CallPermissionChangedPayload["status"]>().toEqualTypeOf<
      "none" | "temporary" | "permanent" | "revoked"
    >();
    expectTypeOf<CallPermissionChangedPayload["source"]>().toEqualTypeOf<
      "user_action" | "automatic" | "sync" | "call_refused"
    >();
    expectTypeOf<VoipCallCheck["refusal"]>().toEqualTypeOf<
      | "calls_disabled"
      | "call_recipient_opted_out"
      | "call_destination_blocked"
      | "call_permission_required"
      | "call_limit_reached"
      | null
    >();
    expectTypeOf<CallOptOut["source"]>().toEqualTypeOf<
      "api" | "console" | "import"
    >();
  });
});
