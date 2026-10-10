import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  Campaign,
  CampaignMessageVariation,
  CampaignMessageVariationBlueprint,
  CreateCampaignRequest,
  CreatePlatformCampaignRequest,
  UpdateCampaignRequest,
  UpdatePlatformCampaignRequest,
} from "../src/index.js";

type Schema = {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};
type Field = {
  type: string;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
};
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/campaign-message-variations.json",
      import.meta.url,
    ),
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
      fields: Record<string, Field>;
    }
  >;
};
const messaging = contract.sources.messaging;
const platform = contract.sources.platform;

describe("campaign message variation contract supplement", () => {
  it("pins the merged API source for both audiences", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(messaging.sourcePath).toBe("apps/api/docs/openapi.json");
    expect(platform.sourcePath).toBe("apps/api/docs/openapi.management.json");
    for (const source of [messaging, platform])
      expect(source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the SDK variation and blueprint fields", () => {
    const variation = messaging.schemas.CampaignMessageVariation!;
    expect(Object.keys(variation.properties!).sort()).toEqual(
      (
        [
          "blueprint",
          "key",
          "weight",
        ] satisfies (keyof CampaignMessageVariation)[]
      ).sort(),
    );
    expect(variation.required!.sort()).toEqual(["blueprint", "key", "weight"]);
    const blueprint = messaging.schemas.CampaignMessageVariationBlueprint!;
    expect(Object.keys(blueprint.properties!).sort()).toEqual(
      (
        [
          "source",
          "version",
        ] satisfies (keyof CampaignMessageVariationBlueprint)[]
      ).sort(),
    );
    expect(platform.schemas.CampaignMessageVariations).toMatchObject({
      type: "array",
      minItems: 2,
      maxItems: 5,
    });
  });

  it("types every request and response field as a nullable list", () => {
    for (const field of Object.values(messaging.fields)) {
      expect(field).toMatchObject({ type: "array", nullable: true });
    }
    expect(messaging.fields.CreateCampaignRequest).toMatchObject({
      minItems: 2,
      maxItems: 5,
    });
    expect(messaging.fields.UpdateCampaignRequest).toMatchObject({
      minItems: 2,
      maxItems: 5,
    });
    expect(platform.fields.UpdatePlatformCampaignRequest).toMatchObject({
      type: "array",
      nullable: true,
    });
    expect(platform.fields.PlatformCampaign).toMatchObject({
      type: "array",
      nullable: true,
    });

    type List = readonly CampaignMessageVariation[] | null | undefined;
    expectTypeOf<Campaign["messageVariations"]>().toEqualTypeOf<List>();
    expectTypeOf<
      CreateCampaignRequest["messageVariations"]
    >().toEqualTypeOf<List>();
    expectTypeOf<
      CreatePlatformCampaignRequest["messageVariations"]
    >().toEqualTypeOf<List>();
    expectTypeOf<
      UpdatePlatformCampaignRequest["messageVariations"]
    >().toEqualTypeOf<List>();
    // Clearing alone is a valid Messaging update.
    expectTypeOf<{
      messageVariations: null;
    }>().toMatchTypeOf<UpdateCampaignRequest>();
  });
});
