import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  Campaign,
  CampaignAnalytics,
  CampaignExperimentOutcome,
  CampaignExperimentResults,
  CampaignExperimentVariantResult,
  CampaignVariant,
  CampaignVariantStrategy,
  CreateCampaignRequest,
  CreatePlatformCampaignRequest,
  PlatformCampaignAnalytics,
  UpdateCampaignRequest,
  UpdatePlatformCampaignRequest,
} from "../src/index.js";

type Schema = {
  properties?: Record<string, { items?: Schema } & Record<string, unknown>>;
  required?: string[];
  [key: string]: unknown;
};
const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/campaign-ab-tests.json", import.meta.url),
    "utf8",
  ),
) as {
  commit: string;
  sources: Record<
    "messaging" | "platform",
    {
      sourcePath: string;
      sourceSha256: string;
      schemas: Record<string, Schema>;
      fields: Record<string, Record<string, unknown>>;
    }
  >;
};
const messaging = contract.sources.messaging;
const platform = contract.sources.platform;
const keys = (schema: Schema | undefined) =>
  Object.keys(schema?.properties ?? {}).sort();

describe("campaign A/B test contract supplement", () => {
  it("pins the merged API source for both audiences", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(messaging.sourcePath).toBe("apps/api/docs/openapi.json");
    expect(platform.sourcePath).toBe("apps/api/docs/openapi.management.json");
    for (const source of [messaging, platform])
      expect(source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the SDK variant, strategy and result keys", () => {
    expect(keys(messaging.schemas.CampaignVariant)).toEqual(
      (
        [
          "blueprint",
          "key",
          "label",
          "weight",
        ] satisfies (keyof CampaignVariant)[]
      ).sort(),
    );
    const strategy = [
      "autoPromote",
      "holdoutPercent",
      "testSlicePercent",
      "testWindowMinutes",
      "winnerCriterion",
    ] satisfies (keyof CampaignVariantStrategy)[];
    expect(keys(messaging.schemas.CampaignVariantStrategy)).toEqual(
      strategy.sort(),
    );
    expect(keys(platform.schemas.CampaignVariantStrategy)).toEqual(
      strategy.sort(),
    );
    expect(platform.schemas.CampaignVariantStrategy?.required?.sort()).toEqual([
      "autoPromote",
      "holdoutPercent",
      "testWindowMinutes",
      "winnerCriterion",
    ]);
    expect(keys(messaging.schemas.CampaignExperimentResults)).toEqual(
      (
        [
          "criterion",
          "holdoutCount",
          "outcome",
          "reserveCount",
          "variants",
        ] satisfies (keyof CampaignExperimentResults)[]
      ).sort(),
    );
    expect(
      keys(
        messaging.schemas.CampaignExperimentResults?.properties?.variants
          ?.items,
      ),
    ).toEqual(
      (
        [
          "assigned",
          "delivered",
          "key",
          "label",
          "outcomeRate",
          "read",
          "replied",
          "sent",
          "weight",
        ] satisfies (keyof CampaignExperimentVariantResult)[]
      ).sort(),
    );
    expect(keys(platform.schemas.PlatformCampaignAnalytics)).toEqual(
      (
        [
          "averageResponseTimeMs",
          "campaignId",
          "deliveredCount",
          "experiment",
          "failedCount",
          "maxResponseTimeMs",
          "minResponseTimeMs",
          "readCount",
          "recipientCount",
          "respondedCount",
          "responseRate",
          "sentCount",
          "skippedCount",
        ] satisfies (keyof PlatformCampaignAnalytics)[]
      ).sort(),
    );
  });

  it("types the request, response and analytics fields", () => {
    expect(Object.keys(messaging.fields).sort()).toEqual([
      "Campaign.experimentOutcome",
      "Campaign.variantStrategy",
      "Campaign.variants",
      "CampaignAnalytics.experiment",
      "CreateCampaignRequest.variantStrategy",
      "CreateCampaignRequest.variants",
      "UpdateCampaignRequest.variantStrategy",
      "UpdateCampaignRequest.variants",
    ]);
    expect(messaging.fields["CreateCampaignRequest.variants"]).toMatchObject({
      type: "array",
      minItems: 2,
      maxItems: 4,
    });

    type Variants = readonly CampaignVariant[] | null | undefined;
    expectTypeOf<Campaign["variants"]>().toEqualTypeOf<Variants>();
    expectTypeOf<CreateCampaignRequest["variants"]>().toEqualTypeOf<Variants>();
    expectTypeOf<
      UpdatePlatformCampaignRequest["variants"]
    >().toEqualTypeOf<Variants>();
    expectTypeOf<
      CreatePlatformCampaignRequest["variantStrategy"]
    >().toEqualTypeOf<CampaignVariantStrategy | undefined>();
    expectTypeOf<Campaign["experimentOutcome"]>().toEqualTypeOf<
      CampaignExperimentOutcome | null | undefined
    >();
    expectTypeOf<CampaignAnalytics["experiment"]>().toEqualTypeOf<
      CampaignExperimentResults | null | undefined
    >();
    // Turning a draft back into a broadcast is a valid Messaging update.
    expectTypeOf<{
      variants: null;
      variantStrategy: null;
    }>().toMatchTypeOf<UpdateCampaignRequest>();
  });
});
