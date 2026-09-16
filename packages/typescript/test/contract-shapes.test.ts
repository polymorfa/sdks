import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type {
  CreateCustomerPairingLinkRequest,
  CreateCustomerRequest,
  CreateQuickLinkRequest,
  Customer,
  CustomerSummary,
  EmbeddedSignupRequest,
  ProjectQuickLinkSettings,
  UpdateCustomerRequest,
  UpdateQuickLinkSettingsInput,
} from "../src/index.js";

interface Schema {
  readonly properties?: Readonly<Record<string, unknown>>;
}

function schemas(file: string): Readonly<Record<string, Schema>> {
  const spec = JSON.parse(
    readFileSync(
      new URL(`../../../contracts/${file}`, import.meta.url),
      "utf8",
    ),
  ) as { components: { schemas: Record<string, Schema> } };
  return spec.components.schemas;
}

const platform = schemas("openapi.platform.json");
const messaging = schemas("openapi.messaging.json");

function properties(
  source: Readonly<Record<string, Schema>>,
  name: string,
): string[] {
  const schema = source[name];
  if (schema?.properties === undefined) throw new Error(`missing ${name}`);
  return Object.keys(schema.properties).sort();
}

/** A complete key list checked by the compiler against the SDK type. */
function keys<T>(record: { readonly [K in keyof Required<T>]: true }) {
  return Object.keys(record).sort();
}

describe("SDK types match the pinned contract snapshots", () => {
  it("keeps QuickLink settings aligned with the management schema", () => {
    expect(
      keys<ProjectQuickLinkSettings>({
        id: true,
        projectId: true,
        enabled: true,
        successCallbackUrl: true,
        failureCallbackUrl: true,
        businessName: true,
        headline: true,
        description: true,
        successMessage: true,
        supportUrl: true,
        privacyUrl: true,
        termsUrl: true,
        accent: true,
        theme: true,
        hideWatermark: true,
        allowPhoneChange: true,
        shape: true,
        radiusPx: true,
        logoMode: true,
        logoStorageId: true,
        logoSourceStorageId: true,
        logoUrl: true,
        historySync: true,
        methods: true,
        defaultMethod: true,
        createdAt: true,
        updatedAt: true,
      }),
    ).toEqual(properties(platform, "QuickLinkSettings"));

    const update = keys<UpdateQuickLinkSettingsInput>({
      enabled: true,
      successCallbackUrl: true,
      failureCallbackUrl: true,
      businessName: true,
      headline: true,
      description: true,
      successMessage: true,
      supportUrl: true,
      privacyUrl: true,
      termsUrl: true,
      accent: true,
      theme: true,
      hideWatermark: true,
      allowPhoneChange: true,
      shape: true,
      radiusPx: true,
      logoMode: true,
      logoStorageId: true,
      logoSourceStorageId: true,
      historySync: true,
      methods: true,
      defaultMethod: true,
    });
    // The resource supplies projectId from its ownership context.
    expect([...update, "projectId"].sort()).toEqual(
      properties(platform, "UpdateQuickLinkSettingsRequest"),
    );
  });

  it("keeps Customer profiles free of phone data", () => {
    const customer = keys<Customer>({
      id: true,
      orgId: true,
      projectId: true,
      name: true,
      externalCustomerId: true,
      status: true,
      isDefault: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    });
    expect(customer).toEqual(properties(platform, "Customer"));
    expect(
      keys<CustomerSummary>({
        id: true,
        orgId: true,
        projectId: true,
        name: true,
        externalCustomerId: true,
        status: true,
        isDefault: true,
        archivedAt: true,
        numberCount: true,
        connectedNumberCount: true,
        activePairingLinkState: true,
        lastActivityAt: true,
        needsAttention: true,
        createdAt: true,
        updatedAt: true,
      }),
    ).toEqual(properties(platform, "CustomerSummary"));

    const profileRequest = {
      projectId: true,
      name: true,
      externalCustomerId: true,
    } as const;
    expect(keys<CreateCustomerRequest>(profileRequest)).toEqual(
      properties(platform, "CreateCustomerRequest"),
    );
    expect(keys<UpdateCustomerRequest>(profileRequest)).toEqual(
      properties(platform, "UpdateCustomerRequest"),
    );
    expect(
      keys<CreateCustomerPairingLinkRequest>({
        projectId: true,
        expectedPhone: true,
        methods: true,
        expiresInSeconds: true,
      }),
    ).toEqual(properties(platform, "CreateCustomerPairingLinkRequest"));
  });

  it("keeps QuickLink creation and Cloud onboarding request fields", () => {
    expect(
      keys<CreateQuickLinkRequest>({
        projectId: true,
        customerId: true,
        externalId: true,
        configuration: true,
      }),
    ).toEqual(properties(messaging, "CreateQuickLinkRequest"));
    expect(
      keys<EmbeddedSignupRequest>({
        quicklinkId: true,
        projectId: true,
        result: true,
      }),
    ).toEqual(properties(messaging, "EmbeddedSignupRequest"));
    expect(
      keys<NonNullable<EmbeddedSignupRequest["result"]>>({
        code: true,
        wabaId: true,
        phoneNumberId: true,
        coexistence: true,
        historySync: true,
      }),
    ).toEqual(properties(messaging, "EmbeddedSignupResult"));
  });
});
