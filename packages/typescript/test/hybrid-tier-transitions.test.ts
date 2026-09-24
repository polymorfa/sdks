import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";
import {
  Client,
  PolymorfaConflictError,
  PolymorfaValidationError,
  isKnownPolymorfaErrorCode,
  type HybridMergeCandidate,
  type HybridMergeIneligibleReason,
  type HybridResolution,
  type HybridTransport,
  type NumberHybridTransition,
  type NumberHybridTransitionStatus,
  type NumberTierChange,
  type NumberTierQuoteRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
function client(server: TestServer) {
  servers.push(server);
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 0,
  });
}

const SURVIVOR = "01994234-0000-7000-8000-00000000000a";
const ABSORBED = "01994234-0000-7000-8000-00000000000b";
const CREATED = "01994234-0000-7000-8000-00000000000c";
const PROJECT = "01994234-0000-7000-8000-0000000000aa";

function tierChange(
  hybridTransition: NumberHybridTransition,
  overrides: Partial<NumberTierChange> = {},
): NumberTierChange {
  return {
    id: "01994234-0000-7000-8000-000000000001",
    status: "quoted",
    failureReason: null,
    expiresAtMs: 1800000600000,
    quote: {
      tier: "standard",
      tierOverride: "standard",
      amountCents: 0,
      priceVersion: "catalog-1",
      action: "downgrade",
      effectiveAtMs: 1800000000000,
      replacesWindowId: null,
      hybridTransition,
    },
    ...overrides,
  };
}

describe("Hybrid Link tier transitions", () => {
  it.each<[string, NumberTierQuoteRequest]>([
    [
      "keep",
      {
        tierOverride: "standard",
        hybridResolution: { action: "keep", transport: "linked_devices" },
      },
    ],
    [
      "split",
      {
        tierOverride: "standard",
        hybridResolution: {
          action: "split",
          existingNumberTransport: "official_api",
          newNumberName: "support-linked",
        },
      },
    ],
    [
      "inherited downgrade",
      {
        tierOverride: null,
        hybridResolution: { action: "keep", transport: "official_api" },
      },
    ],
    [
      "merge",
      { tierOverride: "pro", hybridMerge: { absorbNumberId: ABSORBED } },
    ],
  ])("serializes a %s quote body exactly", async (_, body) => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({
        data: tierChange({
          action: "keep",
          keepTransport: "linked_devices",
          survivingNumberId: SURVIVOR,
        }),
      }),
    }));
    await client(server).sessions.quoteTierChange(SURVIVOR, body);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.method).toBe("POST");
    expect(server.requests[0]?.path).toBe(
      `/platform/sessions/${SURVIVOR}/tier-quotes`,
    );
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body);
  });

  it("refuses a quote with both a resolution and a merge before any request", async () => {
    const server = await startTestServer(() => ({ body: "{}" }));
    const sdk = client(server);
    expect(() =>
      sdk.sessions.quoteTierChange(SURVIVOR, {
        tierOverride: "pro",
        hybridResolution: { action: "keep", transport: "linked_devices" },
        hybridMerge: { absorbNumberId: ABSORBED },
      } as unknown as NumberTierQuoteRequest),
    ).toThrow(PolymorfaValidationError);
    expect(server.requests).toHaveLength(0);

    // @ts-expect-error hybridResolution and hybridMerge are mutually exclusive.
    const both: NumberTierQuoteRequest = {
      tierOverride: "pro",
      hybridResolution: { action: "keep", transport: "linked_devices" },
      hybridMerge: { absorbNumberId: ABSORBED },
    };
    // @ts-expect-error a split needs the new Number's name.
    const unnamed: HybridResolution = {
      action: "split",
      existingNumberTransport: "official_api",
    };
    expect([both, unnamed]).toHaveLength(2);
  });

  it("reads split progress, the created Number and the Meta disconnect instruction", async () => {
    const statuses: NumberHybridTransitionStatus[] = [
      "scheduled",
      "running",
      "completed",
    ];
    const server = await startTestServer((_, index) => ({
      body: JSON.stringify({
        data: tierChange(
          {
            action: "split",
            existingNumberTransport: "linked_devices",
            newNumberName: "support-official",
            survivingNumberId: SURVIVOR,
            status: statuses[index]!,
            failureReason: null,
            metaDisconnectRequired: false,
            effectiveAtMs: 1800000000000,
            ...(index === 2 ? { newNumberId: CREATED } : {}),
          },
          { status: index === 0 ? "queued" : "applied" },
        ),
      }),
    }));
    const sdk = client(server);
    const seen: NumberHybridTransition[] = [];
    for (let i = 0; i < 3; i += 1) {
      const read = await sdk.sessions.retrieveTierChange(
        SURVIVOR,
        "01994234-0000-7000-8000-000000000001",
      );
      seen.push(read.data.data.quote.hybridTransition!);
    }
    expect(seen.map((t) => t.status)).toEqual(statuses);
    const done = seen[2]!;
    expect(done.action).toBe("split");
    if (done.action !== "split") throw new Error("narrowing");
    expect(done.newNumberId).toBe(CREATED);
    expect(done.newNumberName).toBe("support-official");
    expect(done.metaDisconnectRequired).toBe(false);
  });

  it("reads a failed keep and a merge plan with its absorbed Number", async () => {
    const server = await startTestServer((_, index) => ({
      body: JSON.stringify({
        data:
          index === 0
            ? tierChange(
                {
                  action: "keep",
                  keepTransport: "linked_devices",
                  survivingNumberId: SURVIVOR,
                  status: "failed",
                  failureReason: "hybrid_transition.runtime_unconfirmed",
                  metaDisconnectRequired: false,
                  effectiveAtMs: null,
                },
                { status: "applied" },
              )
            : tierChange({
                action: "merge",
                absorbNumberId: ABSORBED,
                survivingNumberId: SURVIVOR,
                effectiveAtMs: 1800000000000,
              }),
      }),
    }));
    const sdk = client(server);
    const failed = (await sdk.sessions.retrieveTierChange(SURVIVOR, "q")).data
      .data.quote.hybridTransition!;
    expect(failed).toMatchObject({
      action: "keep",
      status: "failed",
      failureReason: "hybrid_transition.runtime_unconfirmed",
    });
    const merge = (
      await sdk.sessions.quoteTierChange(SURVIVOR, {
        tierOverride: "pro",
        hybridMerge: { absorbNumberId: ABSORBED },
      })
    ).data.data.quote.hybridTransition!;
    expect(merge.action).toBe("merge");
    if (merge.action !== "merge") throw new Error("narrowing");
    expect(merge.absorbNumberId).toBe(ABSORBED);
    expect(merge.status).toBeUndefined();
  });

  it.each([
    [
      "hybrid_resolution_required",
      "choose which Hybrid Link connection to keep, or split the Number, before leaving Pro",
    ],
    [
      "hybrid_transition_ineligible",
      "Hybrid Link change unavailable: not_same_number",
    ],
  ])(
    "exposes %s as a typed conflict without retrying",
    async (code, message) => {
      const server = await startTestServer(() => ({
        status: 409,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_hybrid",
        },
        body: JSON.stringify({
          error: {
            type: "conflict_error",
            code,
            message,
            param: null,
            request_id: "req_hybrid",
          },
          data: null,
          docs: `https://docs.polymorfa.com/api/errors#${code}`,
        }),
      }));
      const error = await client(server)
        .sessions.quoteTierChange(SURVIVOR, { tierOverride: "standard" })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );
      expect(error).toBeInstanceOf(PolymorfaConflictError);
      expect(error).toMatchObject({
        status: 409,
        code,
        message,
        requestId: "req_hybrid",
      });
      expect(isKnownPolymorfaErrorCode(code)).toBe(true);
      expect(server.requests).toHaveLength(1);
    },
  );

  it("lists same-number merge candidates for a project", async () => {
    const candidates: HybridMergeCandidate[] = [
      {
        numbers: [
          {
            id: SURVIVOR,
            name: "support",
            transport: "linked_devices",
            status: "connected",
          },
          {
            id: ABSORBED,
            name: "support-cloud",
            transport: "official_api",
            status: "connected",
          },
        ],
        eligible: true,
      },
      {
        numbers: [
          {
            id: CREATED,
            name: "sales",
            transport: "linked_devices",
            status: "disconnected",
          },
          {
            id: "01994234-0000-7000-8000-00000000000d",
            name: "sales-cloud",
            transport: "official_api",
            status: "connected",
          },
        ],
        eligible: false,
        ineligibleReason: "not_connected",
      },
    ];
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data: candidates }),
    }));
    const result = await client(server).projects.listHybridMergeCandidates(
      `${PROJECT}/x`,
    );
    expect(result.data.data).toEqual(candidates);
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /platform/projects/${PROJECT}%2Fx/hybrid-merge-candidates`,
    ]);
  });
});

interface Schema {
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly enum?: readonly unknown[];
  readonly required?: readonly string[];
  readonly oneOf?: readonly Schema[];
  readonly items?: Schema;
  readonly $ref?: string;
}
const platform = (
  JSON.parse(
    readFileSync(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    ),
  ) as { components: { schemas: Record<string, Schema> } }
).components.schemas;

type AllKeys<T> = T extends unknown ? keyof T : never;
/** A complete key list checked by the compiler against every union member. */
function unionKeys<T>(record: { readonly [K in AllKeys<T>]: true }) {
  return Object.keys(record).sort();
}
function values<T extends string>(record: { readonly [K in T]: true }) {
  return Object.keys(record).sort();
}

describe("Hybrid tier transition types match the pinned Platform snapshot", () => {
  it("covers every request and response field and enum", () => {
    expect(
      Object.keys(platform.NumberTierQuoteRequest!.properties!).sort(),
    ).toEqual(
      unionKeys<NumberTierQuoteRequest>({
        projectId: true,
        tierOverride: true,
        hybridResolution: true,
        hybridMerge: true,
      }),
    );
    expect(platform.HybridTransport!.enum!.slice().sort()).toEqual(
      values<HybridTransport>({ linked_devices: true, official_api: true }),
    );
    const [keep, split] = platform.HybridResolution!.oneOf!;
    expect(keep!.properties!.action!.enum).toEqual(["keep"]);
    expect(split!.properties!.action!.enum).toEqual(["split"]);
    expect(
      [...Object.keys(keep!.properties!), ...Object.keys(split!.properties!)]
        .filter((key, index, all) => all.indexOf(key) === index)
        .sort(),
    ).toEqual(
      unionKeys<HybridResolution>({
        action: true,
        transport: true,
        existingNumberTransport: true,
        newNumberName: true,
      }),
    );
    expect(Object.keys(platform.HybridMerge!.properties!)).toEqual([
      "absorbNumberId",
    ]);

    const transition = platform.NumberHybridTransition!;
    expect(Object.keys(transition.properties!).sort()).toEqual(
      unionKeys<NumberHybridTransition>({
        action: true,
        keepTransport: true,
        existingNumberTransport: true,
        newNumberName: true,
        absorbNumberId: true,
        survivingNumberId: true,
        newNumberId: true,
        status: true,
        failureReason: true,
        metaDisconnectRequired: true,
        effectiveAtMs: true,
      }),
    );
    expect(transition.required).toEqual(["action", "survivingNumberId"]);
    expect(transition.properties!.action!.enum!.slice().sort()).toEqual([
      "keep",
      "merge",
      "split",
    ]);
    expect(transition.properties!.status!.enum!.slice().sort()).toEqual(
      values<NumberHybridTransitionStatus>({
        scheduled: true,
        running: true,
        completed: true,
        failed: true,
        cancelled: true,
      }),
    );
    expect(
      platform.NumberTierChange!.properties!.quote!.properties!
        .hybridTransition!.$ref,
    ).toBe("#/components/schemas/NumberHybridTransition");

    const candidate = platform.HybridMergeCandidateList!.items!;
    expect(Object.keys(candidate.properties!).sort()).toEqual(
      unionKeys<HybridMergeCandidate>({
        numbers: true,
        eligible: true,
        ineligibleReason: true,
      }),
    );
    expect(
      candidate.properties!.ineligibleReason!.enum!.slice().sort(),
    ).toEqual(
      values<HybridMergeIneligibleReason>({
        deletion_in_progress: true,
        not_coexistence: true,
        different_customer: true,
        connection_disabled: true,
        not_connected: true,
      }),
    );
    expect(
      Object.keys(candidate.properties!.numbers!.items!.properties!).sort(),
    ).toEqual(["id", "name", "status", "transport"]);
  });
});
