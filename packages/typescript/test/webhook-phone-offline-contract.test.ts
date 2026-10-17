import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PHONE_OFFLINE_START_DAY,
  type CreateProjectWebhookInput,
  type CreateWebhookRequest,
  type OrganizationWebhook,
  type ProjectWebhook,
  type UpdateOrganizationWebhookInput,
  type UpdateWebhookRequest,
  type Webhook,
} from "../src/index.js";

interface Supplement {
  readonly sourceCommit: string;
  readonly schemas: Readonly<
    Record<
      string,
      {
        readonly family: "platform" | "messaging";
        readonly required: boolean;
        readonly property: {
          readonly type: string;
          readonly minimum: number;
          readonly maximum: number;
          readonly default?: number;
        };
      }
    >
  >;
}

// Pinned to the exact API source revision that adds the field.
const supplement = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../contracts/webhook-phone-offline.json",
    ),
    "utf8",
  ),
) as Supplement;

describe("webhook phoneOfflineStartDay contract", () => {
  it("matches the API bounds and default", () => {
    for (const schema of Object.values(supplement.schemas)) {
      expect(schema.property.type).toBe("integer");
      expect(schema.property.minimum).toBe(PHONE_OFFLINE_START_DAY.min);
      expect(schema.property.maximum).toBe(PHONE_OFFLINE_START_DAY.max);
    }
    expect(supplement.schemas.CreateProjectWebhookInput?.property.default).toBe(
      PHONE_OFFLINE_START_DAY.default,
    );
  });

  it("covers every API schema that carries the field", () => {
    expect(Object.keys(supplement.schemas).sort()).toEqual([
      "CreateOrganizationWebhookInput",
      "CreateProjectWebhookInput",
      "CreateWebhookRequest",
      "OrganizationWebhook",
      "ProjectWebhook",
      "UpdateOrganizationWebhookInput",
      "UpdateProjectWebhookInput",
      "UpdateWebhookRequest",
      "Webhook",
    ]);
  });

  it("types the field as required only where the API always returns it", () => {
    expect(supplement.schemas.ProjectWebhook?.required).toBe(true);
    expect(supplement.schemas.OrganizationWebhook?.required).toBe(true);
    expectTypeOf<
      ProjectWebhook["phoneOfflineStartDay"]
    >().toEqualTypeOf<number>();
    expectTypeOf<
      OrganizationWebhook["phoneOfflineStartDay"]
    >().toEqualTypeOf<number>();
    for (const name of [
      "CreateProjectWebhookInput",
      "UpdateOrganizationWebhookInput",
      "Webhook",
      "CreateWebhookRequest",
      "UpdateWebhookRequest",
    ]) {
      expect(supplement.schemas[name]?.required).toBe(false);
    }
    expectTypeOf<
      CreateProjectWebhookInput["phoneOfflineStartDay"]
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<
      UpdateOrganizationWebhookInput["phoneOfflineStartDay"]
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<Webhook["phoneOfflineStartDay"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<CreateWebhookRequest["phoneOfflineStartDay"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<UpdateWebhookRequest["phoneOfflineStartDay"]>().toEqualTypeOf<
      number | undefined
    >();
  });
});
