import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  BanSafeClaim,
  BanSafeClaimEvidence,
  BanSafeClaimPayload,
  BanSafeClaimVerdict,
  WebhookPayloadMap,
} from "../src/index.js";

interface Supplement {
  readonly sourceCommit: string;
  readonly verdicts: Readonly<
    Record<
      "BanSafeClaim" | "BanSafeClaimPayload",
      { readonly enum: readonly string[] }
    >
  >;
  readonly evidence: {
    readonly BanSafeClaimEvidence: {
      readonly required: readonly string[];
      readonly properties: Readonly<Record<string, { readonly type: string }>>;
    };
  };
}

// Pinned to the API source revision that adds the two Ban Credit waivers.
const supplement = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../contracts/ban-credit-waivers.json", import.meta.url),
    ),
    "utf8",
  ),
) as Supplement;

// Exhaustive maps: adding or removing a verdict in the SDK types without
// updating these fails the typecheck, and the tests compare them to the API.
const CLAIM_VERDICTS: Record<BanSafeClaimVerdict, true> = {
  other_device: true,
  customer_conduct: true,
  shared_network: true,
  ours: true,
  inconclusive: true,
  simultaneous_calls: true,
  linked_device_interactive: true,
  referral_group_send: true,
};
const PAYLOAD_VERDICTS: Record<BanSafeClaimPayload["verdict"], true> = {
  ...CLAIM_VERDICTS,
};

describe("Ban Credit waiver claim contract", () => {
  it("types every claim verdict the API returns", () => {
    expect(Object.keys(CLAIM_VERDICTS).sort()).toEqual(
      [...supplement.verdicts.BanSafeClaim.enum].sort(),
    );
    expect(Object.keys(PAYLOAD_VERDICTS).sort()).toEqual(
      [...supplement.verdicts.BanSafeClaimPayload.enum].sort(),
    );
  });

  it("uses one verdict type for claim reads and the bansafe.claim webhook", () => {
    expectTypeOf<
      BanSafeClaim["verdict"]
    >().toEqualTypeOf<BanSafeClaimVerdict>();
    expectTypeOf<
      WebhookPayloadMap["bansafe.claim"]["verdict"]
    >().toEqualTypeOf<BanSafeClaimVerdict>();
  });

  it("types the waiver evidence flags as required booleans", () => {
    const evidence = supplement.evidence.BanSafeClaimEvidence;
    for (const field of ["linkedDeviceInteractive", "referralGroupSend"]) {
      expect(evidence.required).toContain(field);
      expect(evidence.properties[field]?.type).toBe("boolean");
    }
    expectTypeOf<
      BanSafeClaimEvidence["linkedDeviceInteractive"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      BanSafeClaimEvidence["referralGroupSend"]
    >().toEqualTypeOf<boolean>();
  });
});
