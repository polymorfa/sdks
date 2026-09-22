import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type {
  CreateCustomerPairingLinkRequest,
  CreateCustomerRequest,
  CreateQuickLinkRequest,
  Customer,
  CustomerSummary,
  EmbeddedSignupRequest,
  QuickLink,
  QuickLinkStatus,
  HybridRoutingPolicy,
  SetHybridRoutingPolicyRequest,
  HybridLinkState,
  HybridQuickLinkAvailability,
  MessageOperation,
  MessageReceipt,
  MessageTransport,
  MessageRoutingReason,
  EditMessageRequest,
  ProjectQuickLinkSettings,
  UpdateCustomerRequest,
  UpdateQuickLinkSettingsInput,
} from "../src/index.js";

interface Schema {
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly enum?: readonly unknown[];
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

    expect(
      keys<CreateCustomerRequest>({
        projectId: true,
        name: true,
        externalCustomerId: true,
      }),
    ).toEqual(properties(platform, "CreateCustomerRequest"));
    expect(
      keys<UpdateCustomerRequest>({
        projectId: true,
        name: true,
        externalCustomerId: true,
      }),
    ).toEqual(properties(platform, "UpdateCustomerRequest"));
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
        purpose: true,
        connectionGoal: true,
        session: true,
        addConnection: true,
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

  it("keeps Hybrid ownership, progress, policy, and recovery shapes aligned", () => {
    expect(
      keys<QuickLink>({
        purpose: true,
        connectionGoal: true,
        addConnection: true,
        id: true,
        url: true,
        session: true,
        expiresAt: true,
      }),
    ).toEqual(properties(messaging, "QuickLink"));
    expect(
      keys<QuickLinkStatus>({
        purpose: true,
        connectionGoal: true,
        addConnection: true,
        hybridPhase: true,
        onboarding: true,
        id: true,
        status: true,
        session: true,
        expiresAt: true,
        openedAt: true,
        connectedAt: true,
        phone: true,
        errorCode: true,
      }),
    ).toEqual(properties(messaging, "QuickLinkStatus"));
    expect(
      keys<HybridRoutingPolicy>({
        scope: true,
        revision: true,
        prefer: true,
        allowedTransports: true,
      }),
    ).toEqual(properties(messaging, "HybridRoutingPolicy"));
    expect(
      keys<SetHybridRoutingPolicyRequest>({
        expectedRevision: true,
        prefer: true,
        allowedTransports: true,
      }),
    ).toEqual(properties(messaging, "SetHybridRoutingPolicy"));
    expect(
      keys<HybridLinkState>({
        revision: true,
        paused: true,
        connections: true,
      }),
    ).toEqual(properties(messaging, "HybridLinkState"));
    expect(
      keys<MessageOperation>({
        operationId: true,
        status: true,
        transport: true,
        receipt: true,
      }),
    ).toEqual(properties(messaging, "MessageOperation"));
    expect(
      keys<HybridQuickLinkAvailability>({
        allowed: true,
        addConnection: true,
        connections: true,
        resumeQuickLinkId: true,
      }),
    ).toEqual(
      properties(
        {
          Availability:
            messaging.HybridQuickLinkAvailabilityResponse!.properties!.data!,
        },
        "Availability",
      ),
    );
  });

  it("preserves transport choices and selected-provider receipt metadata", () => {
    const transports: Record<MessageTransport, true> = {
      auto: true,
      linked_devices: true,
      official_api: true,
    };
    expect(Object.keys(transports).sort()).toEqual(
      [...messaging.SendMessageRequest!.properties!.transport!.enum!].sort(),
    );
    const reasons: Record<MessageRoutingReason, true> = {
      explicit_transport: true,
      template: true,
      target_reference: true,
      only_eligible_transport: true,
      session_rule: true,
      project_rule: true,
      team_rule: true,
      default_linked_devices: true,
    };
    expect(Object.keys(reasons).sort()).toEqual(
      [...messaging.MessageReceipt!.properties!.routingReason!.enum!].sort(),
    );
    expect(
      keys<MessageReceipt>({
        id: true,
        whatsapp_ids: true,
        conversation: true,
        timestamp: true,
        status: true,
        transport: true,
        routingReason: true,
        operationId: true,
      }),
    ).toEqual(properties(messaging, "MessageReceipt"));
    expect(keys<EditMessageRequest>({ text: true, transport: true })).toEqual(
      properties(messaging, "EditMessageRequest"),
    );
  });
});
