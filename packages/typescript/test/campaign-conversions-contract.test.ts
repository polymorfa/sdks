import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CampaignConversion,
  CampaignConversionReport,
  CampaignConversionValue,
  RecordCampaignConversionRequest,
} from "../src/index.js";

type Schema = { properties: Record<string, unknown>; required?: string[] };
const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/campaign-conversions.json", import.meta.url),
    "utf8",
  ),
) as {
  commit: string;
  path: string;
  operations: Record<string, { operationId: string; "x-required-scope": string }>;
  schemas: Record<string, Schema>;
};

// One key of each SDK type, so a renamed or added contract field fails here.
const sdkKeys: Record<string, readonly string[]> = {
  RecordCampaignConversionRequest: [
    "projectId", "recipientId", "eventId", "eventType", "occurredAt", "value",
  ] satisfies readonly (keyof RecordCampaignConversionRequest)[],
  CampaignConversionValue: ["amountMinor", "currency"] satisfies readonly (keyof CampaignConversionValue)[],
  CampaignConversion: [
    "id", "campaignId", "recipientId", "eventType", "occurredAt", "value",
    "evidence", "attribution", "recordedAt", "replayed",
  ] satisfies readonly (keyof CampaignConversion)[],
  CampaignConversionReport: [
    "campaignId", "model", "sentCount", "conversions", "convertedRecipients",
    "conversionRate", "values",
  ] satisfies readonly (keyof CampaignConversionReport)[],
};

describe("campaign conversion contract supplement", () => {
  it("pins the merged API source and the two beta operations", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(contract.path).toBe("/platform/campaigns/{campaignId}/conversions");
    expect(contract.operations).toEqual({
      GET: { operationId: "getCampaignConversions", "x-required-scope": "campaigns:read" },
      POST: { operationId: "recordCampaignConversion", "x-required-scope": "campaigns:manage" },
    });
  });

  it.each(Object.entries(sdkKeys))("%s matches the contract fields", (name, keys) => {
    const schema = contract.schemas[name]!;
    expect([...keys].sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it("keeps amounts as integer minor units and sums as decimal strings", () => {
    expectTypeOf<CampaignConversionValue["amountMinor"]>().toEqualTypeOf<number>();
    expectTypeOf<
      CampaignConversionReport["values"][number]["attributedAmountMinor"]
    >().toEqualTypeOf<string>();
    expect(contract.schemas.CampaignConversionValue!.properties.amountMinor).toMatchObject({ type: "integer" });
  });
});
