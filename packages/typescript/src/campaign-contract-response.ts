import { PolymorfaServerError } from "./errors.js";
import type { HttpTransport } from "./transport/http.js";
import type { ApiResponse, RawRequest } from "./transport/types.js";

type Shape = (value: unknown) => boolean;
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string: Shape = (v) => typeof v === "string";
const number: Shape = (v) => typeof v === "number" && Number.isFinite(v);
const integer: Shape = (v) => typeof v === "number" && Number.isSafeInteger(v);
const boolean: Shape = (v) => typeof v === "boolean";
const nullable =
  (shape: Shape): Shape =>
  (v) =>
    v === null || shape(v);
const one =
  (...values: readonly unknown[]): Shape =>
  (v) =>
    values.includes(v);
const list =
  (shape: Shape): Shape =>
  (v) =>
    Array.isArray(v) && v.every(shape);
const map =
  (shape: Shape): Shape =>
  (v) =>
    record(v) && Object.values(v).every(shape);
// Response extensions remain available. Request-only closed fields and byte
// quotas must not reject normalized server responses.
const object =
  (
    fields: Readonly<Record<string, Shape>>,
    optional: readonly string[] = [],
  ): Shape =>
  (v) =>
    record(v) &&
    Object.entries(fields).every(([key, shape]) =>
      own(v, key) ? shape(v[key]) : optional.includes(key),
    );
const source = one("api", "csv", "form");
const provenance = { source, reference: string };
const scalar: Shape = (v) => v === null || string(v) || number(v) || boolean(v);
const profile = object({
  id: string,
  phone: string,
  revision: integer,
  tags: list(string),
  attributes: map(scalar),
  provenance: nullable(object(provenance)),
  createdAt: integer,
  updatedAt: integer,
});
const consent = object({
  ...provenance,
  purpose: one("campaigns"),
  allowed: boolean,
  assertedAt: integer,
  id: string,
  profileRevision: integer,
  createdAt: integer,
});
const branch =
  (shapes: Readonly<Record<string, Shape>>): Shape =>
  (v) =>
    record(v) &&
    typeof v.kind === "string" &&
    own(shapes, v.kind) &&
    (shapes[v.kind]?.(v) ?? false);
const send = branch({
  text: object({ kind: one("text"), text: string }),
  buttons: object(
    {
      kind: one("buttons"),
      body: string,
      footer: string,
      buttons: list(object({ id: string, text: string })),
    },
    ["footer"],
  ),
  list: object(
    {
      kind: one("list"),
      body: string,
      buttonText: string,
      footer: string,
      rows: list(
        object({ id: string, title: string, description: string }, [
          "description",
        ]),
      ),
    },
    ["footer"],
  ),
  flow_form: object(
    {
      kind: one("flow_form"),
      flowId: string,
      body: string,
      buttonText: string,
      footer: string,
      screen: string,
    },
    ["footer"],
  ),
});
const match = branch({
  choice: object({
    kind: one("choice"),
    replyKind: one("button", "list"),
    id: string,
  }),
  keyword: object({
    kind: one("keyword"),
    value: (value) =>
      string(value) &&
      (value as string).length >= 1 &&
      (value as string).length <= 64,
  }),
  flow_submission: object({ kind: one("flow_submission") }),
});

const models = {
  custody: object({
    signalModeDefault: nullable(one("standard", "zero_knowledge")),
    effectiveSignalMode: one("standard", "zero_knowledge"),
    revision: integer,
  }),
  replyFlow: object({
    id: string,
    flowKey: string,
    revision: integer,
    name: string,
    createdAt: integer,
    definition: object({
      entryNodeId: string,
      nodes: list(
        object(
          { id: string, send, edges: list(object({ match, to: string })) },
          ["send"],
        ),
      ),
    }),
  }),
  assignment: object({ campaignId: string, replyFlowId: nullable(string) }),
  testSend: object({
    id: string,
    campaignId: string,
    status: one("sent"),
    from: object({ sessionId: string, phone: string }),
    to: string,
    messageId: nullable(string),
    variables: map(string),
    createdAt: integer,
  }),
  links: list(
    object({
      key: string,
      url: string,
      uniqueOpens: integer,
      totalOpens: integer,
    }),
  ),
  approvals: list(
    object({
      id: string,
      campaignId: string,
      action: one("launch", "resume", "reschedule"),
      status: one("pending", "approved", "rejected", "superseded", "expired"),
      reasons: list(one("audience_threshold", "agent_request")),
      recipientCount: integer,
      scheduledAt: nullable(integer),
      requestedBy: object({ type: string, id: string }),
      requestedAt: integer,
      expiresAt: integer,
      decidedBy: nullable(string),
      decidedAt: nullable(integer),
      operationId: nullable(string),
    }),
  ),
  settings: object({
    launchApproval: object({ recipientThreshold: nullable(integer) }),
  }),
  profile,
  profiles: list(profile),
  consents: list(consent),
  profileDelete: object({
    deleted: one(true),
    phone: string,
    revision: integer,
  }),
  import: object({
    id: string,
    state: one("queued", "completed", "cancelled"),
    totalValid: integer,
    invalidCount: integer,
    invalidSamples: list(object({ row: integer, reason: string })),
    conflictSamples: list(
      object({ row: integer, reason: one("quota", "revision_conflict") }),
    ),
    processedValid: integer,
    createdCount: integer,
    updatedCount: integer,
    conflictCount: integer,
    createdAt: integer,
    updatedAt: integer,
    completedAt: nullable(integer),
  }),
  retarget: object({
    id: string,
    name: string,
    source: one("campaign"),
    recipientCount: integer,
    fileId: nullable(string),
    columns: nullable(list(string)),
    sampleRow: nullable(map(string)),
    mapping: nullable(map(() => true)),
    createdAt: integer,
    updatedAt: integer,
    sourceCampaignId: string,
    outcome: one(
      "delivered",
      "not_delivered",
      "read",
      "not_read",
      "replied",
      "not_replied",
      "failed",
    ),
    matchedCount: integer,
    optedOutCount: integer,
  }),
  stopSettings: object({
    teamId: string,
    enabled: boolean,
    locale: nullable(one("en", "pt-BR", "es")),
    revision: integer,
    textRevision: one(1),
    acknowledgement: nullable(string),
    updatedAt: nullable(integer),
  }),
  stopSummary: object({
    enabled: boolean,
    counts: object({
      queued: integer,
      admitted: integer,
      completed: integer,
      failed: integer,
      unknown: integer,
    }),
  }),
  groupCapabilities: object({
    status: one("synced", "unknown"),
    syncedAt: nullable(string),
    checkedAt: nullable(string),
    capabilities: list(
      object({
        key: string,
        kind: one("feature"),
        unit: one(null),
        value: nullable(boolean),
        source: nullable(one("server", "client_default")),
      }),
    ),
  }),
} satisfies Record<string, Shape>;

/** @internal Successful supplement JSON is checked before typed exposure. */
export async function requestContract<T>(
  transport: HttpTransport,
  request: RawRequest,
  model: keyof typeof models,
  messaging = false,
  page = false,
): Promise<ApiResponse<T>> {
  const response = await transport.request<unknown>(request);
  const value = response.data;
  if (
    response.metadata.status !== 200 ||
    response.metadata.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json" ||
    !record(value) ||
    !own(value, "data") ||
    !models[model](value.data) ||
    (messaging && value.success !== true) ||
    (page &&
      !object({
        page: object({ nextCursor: nullable(string), hasMore: boolean }),
      })(value))
  ) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid response structure.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        ...(response.metadata.requestId === undefined
          ? {}
          : { requestId: response.metadata.requestId }),
        metadata: response.metadata,
      },
    );
  }
  return response as ApiResponse<T>;
}

const phoneModels = {
  phone: object({
    session: string,
    phone: string,
    online: boolean,
    devices: list(object({ deviceId: integer })),
  }),
  send: object({ session: string, to: string, messageId: nullable(string) }),
  unlink: object({ session: string, deviceId: integer, unlinked: one(true) }),
};
/** @internal Testing-phone endpoints return bare JSON, including accepted202. */
export async function requestPhone<T>(
  transport: HttpTransport,
  request: RawRequest,
  model: keyof typeof phoneModels,
  status = 200,
): Promise<ApiResponse<T>> {
  const response = await transport.request<unknown>(request);
  if (
    response.metadata.status !== status ||
    response.metadata.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json" ||
    !phoneModels[model](response.data)
  ) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid phone result.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        ...(response.metadata.requestId === undefined
          ? {}
          : { requestId: response.metadata.requestId }),
        metadata: response.metadata,
      },
    );
  }
  return response as ApiResponse<T>;
}
