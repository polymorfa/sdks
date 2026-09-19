import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  constructWebhookEvent,
  isEvent,
  type KnownWebhookEventType,
  type ProjectWebhookDeliveryAttempt,
  type OrganizationWebhookDeliveryAttempt,
  type WebhookPayloadMap,
} from "../src/index.js";
import {
  PENDING_WEBHOOK_EVENTS,
  type PendingWebhookEvent,
} from "./support/pending-contract.js";

interface Schema {
  readonly $ref?: string;
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly nullable?: boolean;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | Schema;
  readonly items?: Schema;
  readonly allOf?: readonly Schema[];
  readonly oneOf?: readonly Schema[];
  readonly anyOf?: readonly Schema[];
}

interface OpenApiDocument {
  readonly components: { readonly schemas: Readonly<Record<string, Schema>> };
}

const root = resolve(import.meta.dirname, "../../..");
const load = (family: "messaging" | "platform") =>
  JSON.parse(
    readFileSync(resolve(root, `contracts/openapi.${family}.json`), "utf8"),
  ) as OpenApiDocument;
const messaging = load("messaging");
const platform = load("platform");

function resolveRef(document: OpenApiDocument, schema: Schema): Schema {
  if (schema.$ref === undefined) return schema;
  const name = schema.$ref.split("/").pop()!;
  const target = document.components.schemas[name];
  if (target === undefined) throw new Error(`Unresolved ${schema.$ref}`);
  return resolveRef(document, target);
}

/** Validates a value against the OpenAPI subset used by webhook schemas. */
function violations(
  document: OpenApiDocument,
  input: Schema,
  value: unknown,
  path = "$",
): string[] {
  const schema = resolveRef(document, input);
  if (value === null)
    return schema.nullable === true || schema.enum?.includes(null) === true
      ? []
      : [`${path} is null but not nullable`];
  if (schema.allOf)
    return schema.allOf.flatMap((part) =>
      violations(document, part, value, path),
    );
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives)
    return alternatives.some(
      (part) => violations(document, part, value, path).length === 0,
    )
      ? []
      : [`${path} matches no alternative`];
  if (schema.enum && !schema.enum.includes(value))
    return [`${path}=${JSON.stringify(value)} is outside the enum`];
  switch (schema.type) {
    case "string":
      return typeof value === "string" ? [] : [`${path} is not a string`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${path} is not an integer`];
    case "number":
      return typeof value === "number" ? [] : [`${path} is not a number`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path} is not a boolean`];
    case "array":
      return Array.isArray(value)
        ? value.flatMap((item, index) =>
            violations(document, schema.items ?? {}, item, `${path}[${index}]`),
          )
        : [`${path} is not an array`];
  }
  if (schema.type !== "object" && schema.properties === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value))
    return [`${path} is not an object`];
  const record = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  return [
    ...(schema.required ?? [])
      .filter((key) => !(key in record))
      .map((key) => `${path}.${key} is required`),
    ...Object.entries(record).flatMap(([key, item]) =>
      key in properties
        ? violations(document, properties[key]!, item, `${path}.${key}`)
        : schema.additionalProperties === false
          ? [`${path}.${key} is not in the contract`]
          : [],
    ),
  ];
}

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * A fixture that sets every declared property, paired with the exact list of
 * properties the TypeScript type requires. Both are checked at compile time.
 */
interface Shape<T> {
  readonly value: { readonly [K in keyof T]-?: Exclude<T[K], undefined> };
  readonly required: readonly RequiredKeys<T>[];
}

function shape<T>() {
  return <const R extends readonly RequiredKeys<T>[]>(
    value: { readonly [K in keyof T]-?: Exclude<T[K], undefined> },
    required: R & ([RequiredKeys<T>] extends [R[number]] ? unknown : never),
  ): Shape<T> => ({ value, required });
}

function expectShape(
  document: OpenApiDocument,
  schemaName: string,
  {
    value,
    required,
  }: { readonly value: object; readonly required: readonly PropertyKey[] },
): void {
  const schema = resolveRef(document, { $ref: `#/${schemaName}` });
  expect(Object.keys(value).sort(), schemaName).toEqual(
    Object.keys(schema.properties ?? {}).sort(),
  );
  expect(required.map(String).sort(), `${schemaName} required`).toEqual(
    [...(schema.required ?? [])].sort(),
  );
  expect(violations(document, schema, value), schemaName).toEqual([]);
}

const IDS = {
  event: "0b0e5b1e-0000-4000-8000-000000000001",
  organization: "0b0e5b1e-0000-4000-8000-000000000002",
  project: "0b0e5b1e-0000-4000-8000-000000000003",
  customer: "0b0e5b1e-0000-4000-8000-000000000004",
  pairingLink: "0b0e5b1e-0000-4000-8000-000000000005",
  session: "0b0e5b1e-0000-4000-8000-000000000006",
};
const AT = "2026-09-16T00:00:00.000Z";
const customer = {
  eventId: IDS.event,
  occurredAt: AT,
  organizationId: IDS.organization,
  projectId: IDS.project,
  customerId: IDS.customer,
  actorKind: "project_token",
} as const;
const customerRequired = [
  "eventId",
  "occurredAt",
  "organizationId",
  "projectId",
  "customerId",
  "actorKind",
] as const;
const campaign = { campaignId: "cmp_1" } as const;

type P = WebhookPayloadMap;
const PAYLOADS: {
  readonly [K in Exclude<
    KnownWebhookEventType,
    LegacyEventType | PendingWebhookEvent
  >]: Shape<P[K]>;
} = {
  "customer.created": shape<P["customer.created"]>()(
    customer,
    customerRequired,
  ),
  "customer.archived": shape<P["customer.archived"]>()(
    customer,
    customerRequired,
  ),
  "customer.restored": shape<P["customer.restored"]>()(
    customer,
    customerRequired,
  ),
  "customer.updated": shape<P["customer.updated"]>()(
    { ...customer, fields: ["name", "externalCustomerId"] },
    [...customerRequired, "fields"],
  ),
  "customer.enabled": shape<P["customer.enabled"]>()(
    { ...customer, migratedNumberCount: 2 },
    [...customerRequired, "migratedNumberCount"],
  ),
  "customer.archiving": shape<P["customer.archiving"]>()(
    { ...customer, blockingNumberCount: 1, revokedPairingLinkCount: 3 },
    [...customerRequired, "blockingNumberCount", "revokedPairingLinkCount"],
  ),
  "customer.pairing_link.created": shape<P["customer.pairing_link.created"]>()(
    { ...customer, pairingLinkId: IDS.pairingLink },
    [...customerRequired, "pairingLinkId"],
  ),
  "customer.pairing_link.opened": shape<P["customer.pairing_link.opened"]>()(
    { ...customer, pairingLinkId: IDS.pairingLink },
    [...customerRequired, "pairingLinkId"],
  ),
  "customer.pairing_link.expired": shape<P["customer.pairing_link.expired"]>()(
    { ...customer, pairingLinkId: IDS.pairingLink },
    [...customerRequired, "pairingLinkId"],
  ),
  "customer.pairing_link.connected": shape<
    P["customer.pairing_link.connected"]
  >()({ ...customer, pairingLinkId: IDS.pairingLink, sessionId: IDS.session }, [
    ...customerRequired,
    "pairingLinkId",
    "sessionId",
  ]),
  "customer.pairing_link.failed": shape<P["customer.pairing_link.failed"]>()(
    { ...customer, pairingLinkId: IDS.pairingLink, errorCode: "expired" },
    [...customerRequired, "pairingLinkId", "errorCode"],
  ),
  "customer.pairing_link.revoked": shape<P["customer.pairing_link.revoked"]>()(
    {
      ...customer,
      pairingLinkId: IDS.pairingLink,
      reason: "phone_mismatch_limit",
    },
    [...customerRequired, "pairingLinkId"],
  ),
  "customer.number.attached": shape<P["customer.number.attached"]>()(
    { ...customer, sessionId: IDS.session, pairingLinkId: IDS.pairingLink },
    [...customerRequired, "sessionId"],
  ),
  "customer.number.transferred": shape<P["customer.number.transferred"]>()(
    { ...customer, sessionId: IDS.session, sourceCustomerId: IDS.event },
    [...customerRequired, "sessionId", "sourceCustomerId"],
  ),
  "customer.number.disconnected": shape<P["customer.number.disconnected"]>()(
    { ...customer, sessionId: IDS.session, reason: "logged_out" },
    [...customerRequired, "sessionId", "reason"],
  ),
  "bansafe.health_threshold": shape<P["bansafe.health_threshold"]>()(
    {
      sessionId: IDS.session,
      projectId: IDS.project,
      health: 41.5,
      threshold: 45,
      healthSource: "ml_model",
      estimatorVersion: "estimator-3",
      modelVersion: null,
      evaluatedAt: AT,
      policyVersion: 4,
      episodeId: IDS.event,
      actionId: IDS.pairingLink,
    },
    [
      "sessionId",
      "projectId",
      "health",
      "threshold",
      "healthSource",
      "estimatorVersion",
      "modelVersion",
      "evaluatedAt",
      "policyVersion",
      "episodeId",
      "actionId",
    ],
  ),
  "bansafe.enforcement": shape<P["bansafe.enforcement"]>()(
    {
      phoneNumber: "+15551234567",
      kind: "temporary_ban",
      source: "runtime",
      code: 403,
      subCode: 12,
      reason: "Account restricted",
      enforcementType: "reachout_timelock",
      startedAt: AT,
      endsAt: AT,
    },
    ["phoneNumber", "kind", "source", "startedAt"],
  ),
  "bansafe.action": shape<P["bansafe.action"]>()(
    {
      phoneNumber: "+15551234567",
      action: "applied",
      scope: "number",
      rung: "throttle",
      previousRung: null,
      reason: "finding",
      health: null,
      healthBand: "unknown",
      requires: [
        {
          findingKey: "opt_out_missing",
          title: "Add an opt-out path",
          severity: "critical",
        },
      ],
      throughputPerMinute: 12,
      eligibleLiftAt: null,
      liftRequires: "Resolve the required findings.",
      appealUrl: "https://polymorfa.com/appeal",
      startedAt: AT,
      docs: "https://docs.polymorfa.com/bansafe",
    },
    [
      "phoneNumber",
      "action",
      "scope",
      "rung",
      "previousRung",
      "reason",
      "health",
      "healthBand",
      "requires",
      "throughputPerMinute",
      "eligibleLiftAt",
      "liftRequires",
      "appealUrl",
      "startedAt",
      "docs",
    ],
  ),
  "bansafe.incident": shape<P["bansafe.incident"]>()(
    {
      id: "inc_1",
      phoneNumber: "+15551234567",
      kind: "customer_report",
      source: "customer",
      startedAt: AT,
      endsAt: null,
      belief: 0.4,
      resolution: "open",
      claimId: null,
      closedAt: null,
    },
    [
      "id",
      "phoneNumber",
      "kind",
      "source",
      "startedAt",
      "endsAt",
      "belief",
      "resolution",
      "claimId",
      "closedAt",
    ],
  ),
  "bansafe.claim": shape<P["bansafe.claim"]>()(
    {
      id: "clm_1",
      incidentId: "inc_1",
      phoneNumber: "+15551234567",
      status: "approved",
      verdict: "ours",
      windowStart: AT,
      windowEnd: AT,
      measuredCents: 1250.125,
      capCents: 5000,
      amountCents: 1250.125,
      summary: "Covered",
      reason: "Runtime enforcement",
      decidedAt: AT,
      paidAt: null,
    },
    [
      "id",
      "incidentId",
      "phoneNumber",
      "status",
      "verdict",
      "windowStart",
      "windowEnd",
      "measuredCents",
      "capCents",
      "amountCents",
      "summary",
      "reason",
      "decidedAt",
      "paidAt",
    ],
  ),
  "message.failed": shape<P["message.failed"]>()(
    {
      to: { id: "usr_1", phoneNumber: "+15551234567" },
      type: "text",
      error: "blocked_by_safety",
      code: "cold_outreach_blocked",
      retryAfter: 60,
      timestamp: 1_789_000_000,
    },
    ["to", "type", "error", "timestamp"],
  ),
  "template.status": shape<P["template.status"]>()(
    {
      templateName: "order_update",
      templateId: "tpl_1",
      status: "APPROVED",
      category: "UTILITY",
      reason: "",
      qualityRating: "GREEN",
    },
    [
      "templateName",
      "templateId",
      "status",
      "category",
      "reason",
      "qualityRating",
    ],
  ),
  "campaign.paused": shape<P["campaign.paused"]>()(
    { ...campaign, sentCount: 10, remainingCount: 5, pausedAt: 1 },
    ["campaignId", "sentCount", "remainingCount", "pausedAt"],
  ),
  "campaign.completed": shape<P["campaign.completed"]>()(
    {
      ...campaign,
      sentCount: 10,
      deliveredCount: 9,
      readCount: 7,
      failedCount: 1,
      skippedCount: 0,
      responseCount: 3,
      completedAt: 2,
      durationMs: 60_000,
    },
    [
      "campaignId",
      "sentCount",
      "deliveredCount",
      "readCount",
      "failedCount",
      "skippedCount",
      "responseCount",
      "completedAt",
      "durationMs",
    ],
  ),
  "campaign.failed": shape<P["campaign.failed"]>()(
    { ...campaign, reason: "insufficient_funds", failedAt: 3 },
    ["campaignId", "reason", "failedAt"],
  ),
  "campaign.recipient_sent": shape<P["campaign.recipient_sent"]>()(
    {
      ...campaign,
      recipientId: "rcp_1",
      phone: "+15551234567",
      sessionKey: "support",
      externalMessageId: "msg_1",
      variantKey: "a",
      attempt: 1,
    },
    [
      "campaignId",
      "recipientId",
      "phone",
      "sessionKey",
      "externalMessageId",
      "variantKey",
      "attempt",
    ],
  ),
  "campaign.recipient_failed": shape<P["campaign.recipient_failed"]>()(
    {
      ...campaign,
      recipientId: "rcp_1",
      phone: "+15551234567",
      attempts: 3,
      error: "send_failed",
      failedAt: 4,
    },
    ["campaignId", "recipientId", "phone", "attempts", "error", "failedAt"],
  ),
  "campaign.recipient_skipped": shape<P["campaign.recipient_skipped"]>()(
    {
      ...campaign,
      recipientId: "rcp_1",
      phone: "+15551234567",
      reason: "opted_out",
      skippedAt: 5,
    },
    ["campaignId", "recipientId", "phone", "reason", "skippedAt"],
  ),
  "campaign.throttled": shape<P["campaign.throttled"]>()(
    {
      ...campaign,
      sessionKey: "support",
      reason: "safe_mode",
      deferredCount: 20,
      at: 6,
    },
    ["campaignId", "sessionKey", "reason", "deferredCount", "at"],
  ),
  "campaign.cap_reached": shape<P["campaign.cap_reached"]>()(
    {
      ...campaign,
      sessionKey: "support",
      phone: "+15551234567",
      capType: "daily",
      capLimit: 250,
      windowResetsAt: 8,
      at: 7,
    },
    [
      "campaignId",
      "sessionKey",
      "phone",
      "capType",
      "capLimit",
      "windowResetsAt",
      "at",
    ],
  ),
  "campaign.cold_blocked": shape<P["campaign.cold_blocked"]>()(
    {
      ...campaign,
      recipientId: "rcp_1",
      phone: "+15551234567",
      surface: "campaign",
      reason: "no_prior_conversation",
      at: 9,
    },
    ["campaignId", "recipientId", "phone", "surface", "reason", "at"],
  ),
};

/** Event families whose payload shapes webhook-event-types.test.ts pins. */
type LegacyEventType = Exclude<
  KnownWebhookEventType,
  | `customer.${string}`
  | `bansafe.${string}`
  | `campaign.${string}`
  | "message.failed"
  | "template.status"
>;

function specEvents(): Map<string, string> {
  const events = new Map<string, string>();
  for (const schema of Object.values(messaging.components.schemas)) {
    const event = schema.properties?.event;
    const payload = schema.properties?.payload;
    if (event?.enum?.length !== 1 || payload?.$ref === undefined) continue;
    events.set(String(event.enum[0]), payload.$ref.split("/").pop()!);
  }
  return events;
}

const secret = "contract-secret";
const sign = (body: Buffer) =>
  createHmac("sha256", secret).update(body).digest("hex");

describe("webhook catalog contract", () => {
  it("lists exactly the events the pinned Messaging contract defines", () => {
    const spec = [...specEvents().keys()];
    for (const type of PENDING_WEBHOOK_EVENTS) {
      // Remove the event from pending-contract.ts once a snapshot publishes it.
      expect(spec, type).not.toContain(type);
    }
    expect([...spec, ...PENDING_WEBHOOK_EVENTS].sort()).toEqual(
      [...KNOWN_WEBHOOK_EVENT_TYPES].sort(),
    );
  });

  it.each(Object.entries(PAYLOADS))(
    "%s matches its payload schema",
    (type, fixture) => {
      const schemaName = specEvents().get(type);
      expect(schemaName, type).toBeDefined();
      expectShape(messaging, schemaName!, fixture);
    },
  );

  it.each(Object.entries(PAYLOADS))(
    "%s parses from a signed delivery",
    async (type, fixture) => {
      const body = Buffer.from(
        JSON.stringify({
          id: "evt_1",
          session: "support",
          externalId: "crm-42",
          timestamp: AT,
          event: type,
          payload: fixture.value,
        }),
      );
      const event = await constructWebhookEvent(body, sign(body), secret);
      expect(event.event).toBe(type);
      expect(event.externalId).toBe("crm-42");
      expect(event.payload).toEqual(fixture.value);
    },
  );

  it("narrows BanSafe and failure payloads", async () => {
    const payload = PAYLOADS["message.failed"].value;
    const body = Buffer.from(
      JSON.stringify({
        id: "evt_2",
        session: "support",
        timestamp: AT,
        event: "message.failed",
        payload,
      }),
    );
    const event = await constructWebhookEvent(body, sign(body), secret);
    expect(isEvent(event, "message.failed")).toBe(true);
    if (isEvent(event, "message.failed")) {
      expectTypeOf(event.payload.error).toEqualTypeOf<
        | "invalid_recipient"
        | "session_not_connected"
        | "ack_timeout"
        | "send_failed"
        | "blocked_by_safety"
      >();
      expect(event.payload.retryAfter).toBe(60);
    }
    expectTypeOf<P["bansafe.action"]["previousRung"]>().toEqualTypeOf<
      "none" | "notify" | "throttle" | "block_cold" | "suspend" | null
    >();
  });
});

describe("webhook delivery attempt contract", () => {
  const base = {
    id: IDS.event,
    organizationId: IDS.organization,
    deliveryId: IDS.pairingLink,
    number: 2,
    status: "failed",
    startedAt: AT,
    completedAt: AT,
    nextRetryAt: null,
    durationMs: 120,
    statusCode: 502,
    errorCode: "http_error",
    response: {
      contentType: "text/html",
      excerpt: "<h1>Bad gateway</h1>",
      truncated: false,
    },
    metadataExpiresAt: AT,
  } as const;
  const required = [
    "id",
    "organizationId",
    "projectId",
    "deliveryId",
    "number",
    "status",
    "startedAt",
    "completedAt",
    "nextRetryAt",
    "durationMs",
    "statusCode",
    "errorCode",
    "response",
    "metadataExpiresAt",
  ] as const;

  it("matches the project attempt schema, including the response excerpt", () => {
    expectShape(
      platform,
      "ProjectWebhookDeliveryAttempt",
      shape<ProjectWebhookDeliveryAttempt>()(
        { ...base, projectId: IDS.project },
        required,
      ),
    );
  });

  it("matches the organization attempt schema with a null response", () => {
    const value = { ...base, projectId: null, response: null };
    expectShape(
      platform,
      "OrganizationWebhookDeliveryAttempt",
      shape<OrganizationWebhookDeliveryAttempt>()(value, required),
    );
    expectTypeOf<
      OrganizationWebhookDeliveryAttempt["response"]
    >().toEqualTypeOf<{
      readonly contentType: string;
      readonly excerpt: string;
      readonly truncated: boolean;
    } | null>();
  });
});
