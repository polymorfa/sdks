import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CampaignPausedPayload,
  CampaignRecipientSkippedPayload,
} from "../src/index.js";

type Schema = {
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  [key: string]: unknown;
};
const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/campaign-paused-reasons.json", import.meta.url),
    "utf8",
  ),
) as {
  repository: string;
  commit: string;
  sources: {
    messaging: {
      sourcePath: string;
      sourceSha256: string;
      schemas: Record<string, Schema>;
    };
  };
};
const messaging = contract.sources.messaging;
const keys = (schema: Schema | undefined) =>
  Object.keys(schema?.properties ?? {}).sort();

describe("campaign pause reason contract supplement", () => {
  it("pins the merged API source", () => {
    expect(contract.repository).toBe("polymorfa/polymorfa");
    expect(contract.commit).toBe("9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f");
    expect(messaging.sourcePath).toBe("apps/api/docs/openapi.json");
    expect(messaging.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(messaging.schemas).sort()).toEqual([
      "CampaignPausedPayload",
      "CampaignRecipientSkippedPayload",
    ]);
  });

  it("types reason and code as optional strings on campaign.paused", () => {
    const paused = messaging.schemas.CampaignPausedPayload;
    expect(keys(paused)).toEqual(
      (
        [
          "campaignId",
          "code",
          "pausedAt",
          "reason",
          "remainingCount",
          "sentCount",
        ] satisfies (keyof CampaignPausedPayload)[]
      ).sort(),
    );
    expect(paused?.required).not.toContain("reason");
    expect(paused?.required).not.toContain("code");
    expect(paused?.properties?.reason?.type).toBe("string");
    expect(paused?.properties?.code?.type).toBe("string");
    expectTypeOf<CampaignPausedPayload["reason"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<CampaignPausedPayload["code"]>().toEqualTypeOf<
      string | undefined
    >();
    // A customer pause carries neither field.
    expectTypeOf<{
      campaignId: string;
      sentCount: number;
      remainingCount: number;
      pausedAt: number;
    }>().toMatchTypeOf<CampaignPausedPayload>();
  });

  it("documents the skip timestamp in milliseconds and the marketing limit reason", () => {
    const skipped = messaging.schemas.CampaignRecipientSkippedPayload;
    expect(keys(skipped)).toEqual(
      (
        [
          "campaignId",
          "phone",
          "reason",
          "recipientId",
          "skippedAt",
          "messageIndex",
          "followUpId",
        ] satisfies (keyof CampaignRecipientSkippedPayload)[]
      ).sort(),
    );
    expect(skipped?.required).not.toContain("messageIndex");
    expect(skipped?.required).not.toContain("followUpId");
    expect(skipped?.properties?.messageIndex?.type).toBe("integer");
    expect(skipped?.properties?.followUpId?.type).toBe("string");
    expectTypeOf<
      CampaignRecipientSkippedPayload["messageIndex"]
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<CampaignRecipientSkippedPayload["followUpId"]>().toEqualTypeOf<
      string | undefined
    >();
    expect(skipped?.properties?.skippedAt?.description).toMatch(/milliseconds/);
    expect(skipped?.properties?.reason?.description).toMatch(
      /whatsapp_marketing_limit/,
    );
  });
});
