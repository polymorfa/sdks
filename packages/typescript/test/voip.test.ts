import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaAuthorizationError,
  PolymorfaConflictError,
  PolymorfaValidationError,
  VoipResource,
  type ApiResponse,
  type ClientRules,
  type SessionCallSettingsResponse,
  type SetClientRulesRequest,
  type SuccessResponse,
  type VoipAcceptCallResponse,
  type VoipAddParticipantResponse,
  type VoipPlaceCallResponse,
} from "../src/index.js";
import {
  startTestServer,
  type TestResponse,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serve(responses: TestResponse[]): Promise<TestServer> {
  const server = await startTestServer(
    () =>
      responses.shift() ?? {
        status: 500,
        body: '{"error":{"message":"unexpected request"}}',
      },
  );
  servers.push(server);
  return server;
}

function json(body: unknown, status = 200): TestResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function client(
  server: TestServer,
  credential: ConstructorParameters<typeof MessagingClient>[0]["credential"] = {
    type: "apiKey",
    value: ORGANIZATION_API_KEY,
  },
) {
  return new MessagingClient({
    credential,
    baseUrl: server.url,
    maxNetworkRetries: 0,
  });
}

const participant = {
  id: "15550100",
  phoneNumber: "+15550100",
  audioMuted: false,
  video: false,
  state: "invited",
} as const;

describe("VoipResource", () => {
  it("places, accepts, adds participants, leaves, rejects, and ends calls", async () => {
    const server = await serve([
      {
        ...json(
          {
            success: true,
            data: { callId: "call/1", session: "support", video: true },
          },
          201,
        ),
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_place",
        },
      },
      json(
        {
          success: true,
          data: {
            answered: true,
            answeredBy: "server:desk-1",
            exclusive: true,
          },
        },
        202,
      ),
      json({ success: true, data: participant }, 201),
      json({ success: true }),
      json({ success: true }, 202),
      json({ success: true }),
      json({ success: true }, 202),
      json({ success: true }, 202),
    ]);
    const sdk = client(server);
    expectTypeOf(sdk.voip).toEqualTypeOf<VoipResource>();

    const placed = await sdk.voip.place(
      {
        session: "support",
        to: "+15550100",
        video: true,
        exclusive: true,
        participant: "desk-1",
      },
      { idempotencyKey: "place-1" },
    );
    expectTypeOf(placed).toEqualTypeOf<ApiResponse<VoipPlaceCallResponse>>();
    expect(placed.data.data.callId).toBe("call/1");
    expect(placed.metadata.requestId).toBe("req_place");

    const accepted = await sdk.voip.accept("call/1", {
      exclusive: true,
      video: false,
      participant: "desk-1",
    });
    expectTypeOf(accepted).toEqualTypeOf<ApiResponse<VoipAcceptCallResponse>>();
    expect(accepted.data.data).toEqual({
      answered: true,
      answeredBy: "server:desk-1",
      exclusive: true,
    });

    const added = await sdk.voip.addParticipant("call/1", {
      to: "+15550100",
    });
    expectTypeOf(added).toEqualTypeOf<
      ApiResponse<VoipAddParticipantResponse>
    >();
    expect(added.data.data).toEqual(participant);

    const left = await sdk.voip.leave("call/1", {
      connectionId: "conn_0001",
    });
    expectTypeOf(left).toEqualTypeOf<ApiResponse<SuccessResponse>>();
    await sdk.voip.reject("call/2");
    await sdk.voip.end("call/1");
    await sdk.voip.leave("call/1", {
      connectionId: "conn_0002",
      participant: "desk-1",
    });
    await sdk.voip.reject("call/3", { participant: "desk-1" });

    expect(
      server.requests.map(({ method, path, body }) => ({
        method,
        path,
        body: body === "" ? undefined : JSON.parse(body),
      })),
    ).toEqual([
      {
        method: "POST",
        path: "/messaging/voip/calls",
        body: {
          session: "support",
          to: "+15550100",
          video: true,
          exclusive: true,
          participant: "desk-1",
        },
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F1/accept",
        body: { exclusive: true, video: false, participant: "desk-1" },
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F1/participants",
        body: { to: "+15550100" },
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F1/leave",
        body: { connectionId: "conn_0001" },
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F2/reject",
        body: undefined,
      },
      {
        method: "DELETE",
        path: "/messaging/voip/calls/call%2F1",
        body: undefined,
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F1/leave",
        body: { connectionId: "conn_0002", participant: "desk-1" },
      },
      {
        method: "POST",
        path: "/messaging/voip/calls/call%2F3/reject",
        body: { participant: "desk-1" },
      },
    ]);
    expect(server.requests[0]?.headers["idempotency-key"]).toBe("place-1");
    expect(server.requests[4]?.headers["content-type"]).toBeUndefined();
    for (const request of server.requests) {
      expect(request.headers.authorization).toBe(
        `Bearer ${ORGANIZATION_API_KEY}`,
      );
    }
  });

  it("sends an empty accept body by default", async () => {
    const server = await serve([
      json({
        success: true,
        data: {
          answered: true,
          answeredBy: "server:default",
          exclusive: false,
        },
      }),
    ]);
    await client(server).voip.accept("call-1");
    expect(JSON.parse(server.requests[0]?.body ?? "null")).toEqual({});
  });

  it("surfaces claimed and not-ringing conflicts", async () => {
    const server = await serve([
      json(
        {
          error: {
            type: "conflict_error",
            code: "call_claimed",
            message: "Another participant claimed this call.",
          },
        },
        409,
      ),
      json(
        {
          error: {
            type: "conflict_error",
            code: "call_not_ringing",
            message: "The call is not ringing.",
          },
        },
        409,
      ),
    ]);
    const sdk = client(server);
    const claimed = sdk.voip.accept("call-1", { exclusive: true });
    await expect(claimed).rejects.toBeInstanceOf(PolymorfaConflictError);
    await expect(claimed).rejects.toMatchObject({ code: "call_claimed" });
    const notRinging = sdk.voip.reject("call-1");
    await expect(notRinging).rejects.toMatchObject({
      status: 409,
      code: "call_not_ringing",
    });
  });

  it("validates participant, connection, and session input before sending", async () => {
    const server = await serve([]);
    const sdk = client(server);
    expect(() => sdk.voip.place({ to: "+15550100" })).toThrow(
      PolymorfaValidationError,
    );
    expect(() => sdk.voip.accept("call-1", { participant: "desk 1" })).toThrow(
      PolymorfaValidationError,
    );
    expect(() =>
      sdk.voip.accept("call-1", { participant: "x".repeat(129) }),
    ).toThrow(PolymorfaValidationError);
    expect(() => sdk.voip.leave("call-1", { connectionId: "short" })).toThrow(
      PolymorfaValidationError,
    );
    expect(() =>
      sdk.voip.leave("call-1", { connectionId: "conn/0001" }),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      sdk.voip.updateCallSettings("support", {
        conferenceMode: "yes",
      } as unknown as { conferenceMode: boolean }),
    ).toThrow(PolymorfaValidationError);
    // The retired setting fails before sending, with its replacement named.
    expect(() =>
      sdk.voip.updateCallSettings("support", {
        includeSelfAudio: true,
      } as unknown as { conferenceMode: boolean }),
    ).toThrow("includeSelfAudio was replaced by conferenceMode.");
    expect(server.requests).toHaveLength(0);
  });

  it("sends call reports and rejects reports the platform would refuse", async () => {
    const server = await serve([
      json({ success: true }, 202),
      json({ success: true }, 202),
    ]);
    const sdk = client(server, { type: "clientToken", value: "pmfa_ct_web" });
    const quality = {
      kind: "quality",
      connectionId: "conn_0123456789",
      client: {
        sdk: "@polymorfa/browser",
        version: "0.1.0-dev.0",
        platform: "browser",
      },
      quality: {
        rttMs: 40,
        jitterMs: 3,
        packetsLost: 0,
        packetsReceived: 1200,
        audioCodec: "audio/opus",
        candidateType: "srflx",
        reconnects: 1,
      },
    } as const;
    const sent = await sdk.voip.report("call/1", quality);
    expectTypeOf(sent).toEqualTypeOf<ApiResponse<SuccessResponse>>();
    await sdk.voip.report("call/1", {
      kind: "error",
      connectionId: "conn_0123456789",
      error: { code: "ice_failed" },
    });
    expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/messaging/voip/calls/call%2F1/reports"],
      ["POST", "/messaging/voip/calls/call%2F1/reports"],
    ]);
    expect(JSON.parse(server.requests[0]?.body ?? "null")).toEqual(quality);
    expect(JSON.parse(server.requests[1]?.body ?? "null")).toEqual({
      kind: "error",
      connectionId: "conn_0123456789",
      error: { code: "ice_failed" },
    });
    const invalid: unknown[] = [
      { ...quality, participant: "desk-1" }, // client tokens act as themselves
      { ...quality, connectionId: "short" },
      { ...quality, quality: {} },
      { ...quality, quality: { rttMs: 60_001 } },
      { ...quality, quality: { jitterMs: 1.5 } },
      { ...quality, quality: { packetsLost: -1 } },
      { ...quality, quality: { reconnects: 1001 } },
      { ...quality, quality: { audioCodec: "audio opus" } },
      { ...quality, quality: { candidateType: "turn" } },
      { ...quality, quality: { mos: 4 } },
      { ...quality, extra: true },
      { ...quality, client: { ...quality.client, sdk: "Polymorfa" } },
      { ...quality, client: { ...quality.client, version: "1.2" } },
      { ...quality, client: { ...quality.client, platform: "ios" } },
      { ...quality, client: { ...quality.client, name: "x" } },
      {
        kind: "error",
        connectionId: "conn_0123456789",
        error: { code: "boom" },
      },
      {
        kind: "error",
        connectionId: "conn_0123456789",
        error: { code: "other", detail: "x" },
      },
      {
        kind: "error",
        connectionId: "conn_0123456789",
        quality: { rttMs: 1 },
      },
      { kind: "debug", connectionId: "conn_0123456789" },
    ];
    for (const body of invalid)
      expect(
        () => sdk.voip.report("call/1", body as never),
        JSON.stringify(body),
      ).toThrow(
        (body as { participant?: string }).participant === undefined
          ? PolymorfaValidationError
          : PolymorfaConfigurationError,
      );
    expect(server.requests).toHaveLength(2);
  });

  it("lets a client token act only as itself", async () => {
    const server = await serve([
      json(
        { success: true, data: { callId: "c", session: "s", video: false } },
        201,
      ),
    ]);
    const sdk = client(server, { type: "clientToken", value: "pmfa_ct_web" });
    expect(() => sdk.voip.accept("call-1", { participant: "desk-1" })).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() => sdk.voip.retrieveCallSettings("support")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() =>
      sdk.voip.updateCallSettings("support", { conferenceMode: true }),
    ).toThrow(PolymorfaConfigurationError);
    await sdk.voip.place({ to: "+15550100" });
    expect(server.requests).toHaveLength(1);
    expect(JSON.parse(server.requests[0]?.body ?? "null")).toEqual({
      to: "+15550100",
    });
  });

  it("reads and replaces session call settings with a project token", async () => {
    const settings = {
      callsEnabled: true,
      conferenceMode: true,
      inboundRoute: "sip_trunk",
      sipTrunkId: "018f0000-0000-7000-8000-0000000000aa",
      sipClaim: false,
      revision: 3,
      updatedAt: "2026-09-16T10:00:00.000Z",
    };
    const server = await serve([
      json({ success: true, data: { ...settings, conferenceMode: false } }),
      json({ success: true, data: settings }),
    ]);
    const sdk = client(server, { type: "projectToken", value: PROJECT_TOKEN });
    const current = await sdk.voip.retrieveCallSettings("support/eu");
    expectTypeOf(current).toEqualTypeOf<
      ApiResponse<SessionCallSettingsResponse>
    >();
    expect(current.data.data.conferenceMode).toBe(false);
    const updated = await sdk.voip.updateCallSettings("support/eu", {
      conferenceMode: true,
      expectedRevision: current.data.data.revision,
    });
    expect(updated.data.data).toEqual(settings);
    expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
      ["GET", "/platform/sessions/support%2Feu/call-settings"],
      ["PUT", "/platform/sessions/support%2Feu/call-settings"],
    ]);
    expect(JSON.parse(server.requests[1]?.body ?? "null")).toEqual({
      conferenceMode: true,
      expectedRevision: 3,
    });
    expect(() => sdk.voip.updateCallSettings("support/eu", {})).toThrow(
      PolymorfaValidationError,
    );
    expect(() =>
      sdk.voip.updateCallSettings("support/eu", {
        callsEnabled: "off",
      } as unknown as { callsEnabled: boolean }),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      sdk.voip.updateCallSettings("support/eu", {
        inboundRoute: "pbx",
      } as unknown as { inboundRoute: "clients" }),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      sdk.voip.updateCallSettings("support/eu", {
        hostCloudApiCalls: "yes",
      } as unknown as { hostCloudApiCalls: boolean }),
    ).toThrow(PolymorfaValidationError);
    expect(() =>
      sdk.voip.updateCallSettings("support/eu", {
        conferenceMode: true,
        expectedRevision: -1,
      }),
    ).toThrow(PolymorfaValidationError);
    expect(server.requests).toHaveLength(2);
  });

  it("turns calling off and reports calls_disabled refusals", async () => {
    const server = await serve([
      json({
        success: true,
        data: {
          callsEnabled: false,
          conferenceMode: false,
          inboundRoute: "clients",
          sipTrunkId: null,
          sipClaim: true,
          revision: 1,
          updatedAt: "2026-09-17T10:00:00.000Z",
        },
      }),
      json(
        {
          success: false,
          error: {
            code: "calls_disabled",
            message: "Calling is turned off for this number.",
          },
        },
        403,
      ),
    ]);
    const sdk = client(server, { type: "projectToken", value: PROJECT_TOKEN });
    const off = await sdk.voip.updateCallSettings("support", {
      callsEnabled: false,
    });
    expect(off.data.data.callsEnabled).toBe(false);
    expect(JSON.parse(server.requests[0]?.body ?? "null")).toEqual({
      callsEnabled: false,
    });
    const refused = await sdk.voip
      .place({ session: "support", to: "+15550100" })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(PolymorfaAuthorizationError);
    expect((refused as PolymorfaAuthorizationError).code).toBe(
      "calls_disabled",
    );
  });

  it("no longer exposes session modes or calling tickets", () => {
    const resource = VoipResource.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const removed of ["token", "socketTicket", "agentToken", "setMode"]) {
      expect(resource[removed], removed).toBeUndefined();
    }
  });

  it("types the client rules the runtime returns, including the calls bindings", () => {
    const rules: ClientRules = {
      recipientMode: "any",
      allowedActions: "voip_place,voip_answer,voip_signal,read_contact",
      rateLimit: 60,
      maxDaily: 0,
      allowedOrigins: "",
      maxConcurrency: 2,
      maxSetupsPerMinute: 0,
      allowedNumber: "",
      conversationTtlSeconds: 86_400,
      enabled: true,
    };
    const update: SetClientRulesRequest = {
      recipientMode: "any",
      allowedActions: rules.allowedActions,
      maxConcurrency: 2,
      enabled: true,
    };
    expect(update.maxConcurrency).toBe(rules.maxConcurrency);
  });
});
