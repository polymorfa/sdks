import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  Campaign,
  CampaignAnalytics,
  CampaignFollowUp,
  CampaignFollowUpReport,
  CampaignFollowUpStatus,
  CampaignFollowUpSummary,
  CampaignRecipient,
  CreateCampaignRequest,
  CreatePlatformCampaignRequest,
  PlatformCampaignAnalytics,
  UpdateCampaignRequest,
  UpdatePlatformCampaignRequest,
} from "../src/index.js";

type Schema = {
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
  allOf?: Schema[];
  oneOf?: Schema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  $ref?: string;
  [key: string]: unknown;
};
const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/campaign-follow-ups.json", import.meta.url),
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
      fields: Record<string, Schema>;
    }
  >;
};
const messaging = contract.sources.messaging;
const platform = contract.sources.platform;
const keys = (schema: Schema | undefined) =>
  Object.keys(schema?.properties ?? {}).sort();

const summaryKeys = [
  "anchorKind",
  "commandId",
  "deliveredAt",
  "dueAt",
  "expiresAt",
  "firstDeliveredAt",
  "firstReadAt",
  "id",
  "numberId",
  "readAt",
  "reason",
  "repliedAt",
  "sentAt",
  "status",
] satisfies (keyof CampaignFollowUpSummary)[];
const reportKeys = [
  "cancelled",
  "delivered",
  "expired",
  "failed",
  "nextDueAt",
  "read",
  "replied",
  "scheduled",
  "sending",
  "sent",
  "total",
  "unknown",
  "waiting",
] satisfies (keyof CampaignFollowUpReport)[];
const statuses = [
  "waiting_receipt",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "expired",
  "failed",
  "outcome_unknown",
] satisfies CampaignFollowUpStatus[];

describe("campaign follow-up contract supplement", () => {
  it("pins the merged API source for both audiences", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(messaging.sourcePath).toBe("apps/api/docs/openapi.json");
    expect(platform.sourcePath).toBe("apps/api/docs/openapi.management.json");
    for (const source of [messaging, platform])
      expect(source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the follow-up configuration, bounds and defaults", () => {
    const config = platform.schemas.CampaignFollowUp!;
    expect(keys(config)).toEqual(["delaySeconds", "expirySeconds", "message"]);
    expect(config.required).toEqual(["message"]);
    expect(config.properties!.delaySeconds).toMatchObject({
      minimum: 60,
      maximum: 604800,
      default: 86400,
    });
    expect(config.properties!.expirySeconds).toMatchObject({
      minimum: 86400,
      maximum: 2592000,
      default: 604800,
    });
    const messages = config.properties!.message!.oneOf!;
    expect(messages.map((message) => message.properties!.type!.enum)).toEqual([
      ["text"],
      ["template"],
    ]);
    expect(keys(messaging.fields["Campaign.followUp"])).toEqual([
      "delaySeconds",
      "expirySeconds",
      "message",
    ]);
    for (const field of [
      "CreateCampaignRequest.followUp",
      "UpdateCampaignRequest.followUp",
    ])
      expect(messaging.fields[field]!.nullable).toBe(true);
    expectTypeOf<CampaignFollowUp["message"]["type"]>().toEqualTypeOf<
      "text" | "template"
    >();
    // Responses require only the message, so the timing fields stay optional.
    expect(messaging.fields["Campaign.followUp"]!.required).toEqual([
      "message",
    ]);
    expectTypeOf<
      NonNullable<Campaign["followUp"]>["delaySeconds"]
    >().toEqualTypeOf<number | undefined>();
  });

  it("matches the recipient summary and its statuses", () => {
    expect(keys(platform.schemas.CampaignFollowUpSummary)).toEqual(
      [...summaryKeys].sort(),
    );
    expect(keys(messaging.fields["CampaignRecipient.followUp"])).toEqual(
      [...summaryKeys].sort(),
    );
    expect(
      platform.schemas.CampaignFollowUpSummary!.properties!.status!.enum,
    ).toEqual(statuses);
    expect(platform.fields["CampaignRecipient.followUp"]!.nullable).toBe(true);
    expectTypeOf<
      NonNullable<CampaignRecipient["followUp"]>
    >().toEqualTypeOf<CampaignFollowUpSummary>();
  });

  it("matches the analytics report on both audiences", () => {
    expect(keys(messaging.schemas.CampaignFollowUpReport)).toEqual(
      [...reportKeys].sort(),
    );
    expect(keys(platform.schemas.CampaignFollowUpReport)).toEqual(
      [...reportKeys].sort(),
    );
    expect(messaging.fields["CampaignAnalytics.followUps"]!.$ref).toBe(
      "#/components/schemas/CampaignFollowUpReport",
    );
    expect(platform.fields["PlatformCampaignAnalytics.followUps"]!.$ref).toBe(
      "#/components/schemas/CampaignFollowUpReport",
    );
    expectTypeOf<
      PlatformCampaignAnalytics["followUps"]
    >().toEqualTypeOf<CampaignFollowUpReport>();
    expectTypeOf<
      NonNullable<CampaignAnalytics["followUps"]>
    >().toEqualTypeOf<CampaignFollowUpReport>();
  });

  it("accepts follow-ups on every create and update request and clears them with null", () => {
    const followUp: CampaignFollowUp = {
      message: { type: "text", text: "Still interested?" },
    };
    const create: CreateCampaignRequest = { name: "Spring", followUp };
    const update: UpdateCampaignRequest = { followUp: null };
    const platformCreate: CreatePlatformCampaignRequest = {
      projectId: "p",
      name: "Spring",
      followUp,
    };
    const platformUpdate: UpdatePlatformCampaignRequest = {
      followUp: { message: { type: "template", templateId: "t" } },
    };
    expect([
      create.followUp,
      update.followUp,
      platformCreate.followUp,
      platformUpdate.followUp,
    ]).toHaveLength(4);
    expectTypeOf<
      NonNullable<Campaign["followUp"]>
    >().toEqualTypeOf<CampaignFollowUp>();
  });
});
