import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  BanSafeClaim,
  BanSafeClaimEvidence,
  BanSafeClaimVerdict,
  SessionCallSettings,
  UpdateSessionCallSettingsRequest,
  WebhookPayloadMap,
} from "../src/index.js";

type Schema = {
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: string[];
  type?: string;
  [key: string]: unknown;
};
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/calls-simultaneous-calls.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  commit: string;
  published: boolean;
  sources: Record<
    "messaging" | "platform",
    {
      sourcePath: string;
      sourceSha256: string;
      schemas: Record<string, Schema>;
    }
  >;
};
const messaging = contract.sources.messaging.schemas;
const platform = contract.sources.platform.schemas;

const keys = (schema: Schema | undefined) =>
  Object.keys(schema?.properties ?? {}).sort();

// Every verdict must appear here; a missing or extra key fails to compile.
const VERDICTS: Record<BanSafeClaimVerdict, true> = {
  other_device: true,
  customer_conduct: true,
  shared_network: true,
  ours: true,
  inconclusive: true,
  simultaneous_calls: true,
};

describe("simultaneous calls contract supplement", () => {
  it("pins both audiences and stays held until the API change merges", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(contract.published).toBe(false);
    expect(contract.sources.messaging.sourcePath).toBe(
      "apps/api/docs/openapi.json",
    );
    expect(contract.sources.platform.sourcePath).toBe(
      "apps/api/docs/openapi.management.json",
    );
    for (const source of Object.values(contract.sources))
      expect(source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the call settings response and update request fields", () => {
    expect(keys(platform.PlatformAccessCallSettings)).toEqual(
      (
        [
          "callsEnabled",
          "conferenceMode",
          "inboundRoute",
          "sipTrunkId",
          "sipClaim",
          "hostCloudApiCalls",
          "simultaneousCalls",
          "revision",
          "updatedAt",
        ] satisfies (keyof SessionCallSettings)[]
      ).sort(),
    );
    expect(platform.PlatformAccessCallSettings!.required).toContain(
      "simultaneousCalls",
    );
    expect(keys(platform.PlatformAccessUpdateCallSettingsRequest)).toEqual(
      (
        [
          "callsEnabled",
          "conferenceMode",
          "inboundRoute",
          "sipTrunkId",
          "sipClaim",
          "hostCloudApiCalls",
          "simultaneousCalls",
          "acknowledgeRisk",
          "expectedRevision",
        ] satisfies (keyof UpdateSessionCallSettingsRequest)[]
      ).sort(),
    );
    expectTypeOf<
      SessionCallSettings["simultaneousCalls"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      UpdateSessionCallSettingsRequest["simultaneousCalls"]
    >().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<
      UpdateSessionCallSettingsRequest["acknowledgeRisk"]
    >().toEqualTypeOf<boolean | undefined>();
  });

  it("matches the claim verdicts and evidence", () => {
    const verdicts = Object.keys(VERDICTS).sort();
    expect(
      [...platform.BanSafeClaim!.properties!.verdict!.enum!].sort(),
    ).toEqual(verdicts);
    expect(
      [...messaging.BanSafeClaimPayload!.properties!.verdict!.enum!].sort(),
    ).toEqual(verdicts);
    expectTypeOf<
      WebhookPayloadMap["bansafe.claim"]["verdict"]
    >().toEqualTypeOf<BanSafeClaimVerdict>();
    expectTypeOf<
      BanSafeClaim["verdict"]
    >().toEqualTypeOf<BanSafeClaimVerdict>();

    const evidence = platform.BanSafeClaimEvidence!;
    expect(keys(evidence)).toEqual(
      (
        [
          "attributionRuleVersion",
          "windowDays",
          "deviceEvidence",
          "otherDevices",
          "restrictedInWindow",
          "criticalFindingDays",
          "sharedConnection",
          "measuredHours",
          "simultaneousCalls",
        ] satisfies (keyof BanSafeClaimEvidence)[]
      ).sort(),
    );
    expect(evidence.required).toContain("simultaneousCalls");
    expectTypeOf<
      BanSafeClaimEvidence["simultaneousCalls"]
    >().toEqualTypeOf<boolean>();
  });
});
