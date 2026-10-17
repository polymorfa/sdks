import { PolymorfaConfigurationError } from "./errors.js";
import { withIdempotencyKey } from "./transport/idempotency.js";
import type { RequestOptions } from "./transport/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const encoder = new TextEncoder();
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);

function hasAsciiControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function invalid(field: string, detail: string): never {
  throw new PolymorfaConfigurationError(`${field} ${detail}.`, field);
}

export function contractObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return invalid(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function contractFields(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  field: string,
): Record<string, unknown> {
  const object = contractObject(value, field);
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) invalid(`${field}.${key}`, "is not supported");
  }
  for (const key of required) {
    if (!own(object, key) || object[key] === undefined)
      invalid(`${field}.${key}`, "is required");
  }
  return object;
}

export function contractUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    return invalid(field, "must be a UUID");
  return value;
}

export function contractString(
  value: unknown,
  field: string,
  min = 1,
  max = Infinity,
): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    return invalid(field, `must contain ${min}–${max} characters`);
  }
  return value;
}

function bytes(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  const text = contractString(value, field, min);
  const length = encoder.encode(text).length;
  if (length < min || length > max)
    invalid(field, `must contain ${min}–${max} UTF-8 bytes`);
  return text;
}

export function contractInteger(
  value: unknown,
  field: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    return invalid(field, `must be an integer between ${min} and ${max}`);
  }
  return value;
}

function oneOf(
  value: unknown,
  allowed: readonly string[],
  field: string,
): void {
  if (typeof value !== "string" || !allowed.includes(value))
    invalid(field, "has an unsupported value");
}

/** Select only request options. Callers cannot override a confined route/body. */
export function campaignContractOptions(
  options: RequestOptions,
  write = false,
  replay = false,
): RequestOptions {
  contractFields(
    options,
    [
      "apiVersion",
      "headers",
      "idempotencyKey",
      "maxNetworkRetries",
      "signal",
      "timeoutMs",
    ],
    [],
    "options",
  );
  if (options.apiVersion !== undefined)
    contractString(options.apiVersion, "options.apiVersion");
  if (options.idempotencyKey !== undefined)
    bytes(options.idempotencyKey, "options.idempotencyKey", 1, 255);
  const selected = {
    ...options,
    ...(options.headers === undefined
      ? {}
      : { headers: { ...options.headers } }),
    apiVersion: options.apiVersion ?? "2026-10-14",
    ...(write && !replay && options.maxNetworkRetries === undefined
      ? { maxNetworkRetries: 0 }
      : {}),
  };
  return replay ? withIdempotencyKey(selected) : selected;
}

/** Capture the JSON request once so retries retain the original body. */
export function campaignContractBody<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validateCampaignSelection(value: unknown): string {
  const input = contractFields(value, ["projectId"], ["projectId"], "params");
  return contractUuid(input.projectId, "params.projectId");
}

export function validateReplyFlowCreate(value: unknown, project = false): void {
  const input = contractFields(
    value,
    [
      "name",
      "definition",
      "flowKey",
      "revision",
      ...(project ? ["projectId"] : []),
    ],
    ["name", "definition", ...(project ? ["projectId"] : [])],
    "body",
  );
  bytes(input.name, "body.name", 1, 128);
  if (project) contractUuid(input.projectId, "body.projectId");
  if (input.flowKey !== undefined) contractUuid(input.flowKey, "body.flowKey");
  if (input.revision !== undefined)
    contractInteger(input.revision, "body.revision", 1, 1_000_000);
  validateReplyFlowDefinition(input.definition);
}

function nodeId(value: unknown, field: string): void {
  if (typeof value !== "string" || !NODE_ID.test(value))
    invalid(field, "must be a supported node or choice ID");
}

function messageText(
  value: unknown,
  field: string,
  max: number,
  multiline = false,
): void {
  const text = bytes(value, field, 1, max);
  if (
    (multiline && !text.trim()) ||
    /\p{Cc}/u.test(multiline ? text.replace(/[\n\r\t]/g, "") : text)
  ) {
    invalid(field, "contains unsupported control characters or blank text");
  }
}

function validateReplyFlowDefinition(value: unknown): void {
  const definition = contractFields(
    value,
    ["entryNodeId", "nodes"],
    ["entryNodeId", "nodes"],
    "body.definition",
  );
  nodeId(definition.entryNodeId, "body.definition.entryNodeId");
  if (
    !Array.isArray(definition.nodes) ||
    definition.nodes.length < 2 ||
    definition.nodes.length > 12
  ) {
    invalid("body.definition.nodes", "must contain between 2 and 12 nodes");
  }
  const ids = new Set<string>();
  for (const [index, raw] of definition.nodes.entries()) {
    const field = `body.definition.nodes[${index}]`;
    const node = contractFields(
      raw,
      ["id", "send", "edges"],
      ["id", "edges"],
      field,
    );
    nodeId(node.id, `${field}.id`);
    if (ids.has(node.id as string)) invalid(`${field}.id`, "must be unique");
    ids.add(node.id as string);
    if (node.send !== undefined) validateReplySend(node.send, `${field}.send`);
    if (!Array.isArray(node.edges) || node.edges.length > 3)
      invalid(`${field}.edges`, "must contain at most 3 edges");
    for (const [edgeIndex, rawEdge] of node.edges.entries()) {
      const edgeField = `${field}.edges[${edgeIndex}]`;
      const edge = contractFields(
        rawEdge,
        ["match", "to"],
        ["match", "to"],
        edgeField,
      );
      nodeId(edge.to, `${edgeField}.to`);
      const match = contractObject(edge.match, `${edgeField}.match`);
      if (match.kind === "choice") {
        contractFields(
          match,
          ["kind", "replyKind", "id"],
          ["kind", "replyKind", "id"],
          `${edgeField}.match`,
        );
        oneOf(
          match.replyKind,
          ["button", "list"],
          `${edgeField}.match.replyKind`,
        );
        nodeId(match.id, `${edgeField}.match.id`);
      } else if (match.kind === "keyword") {
        contractFields(
          match,
          ["kind", "value"],
          ["kind", "value"],
          `${edgeField}.match`,
        );
        messageText(match.value, `${edgeField}.match.value`, 64);
      } else if (match.kind === "flow_submission") {
        contractFields(match, ["kind"], ["kind"], `${edgeField}.match`);
      } else invalid(`${edgeField}.match.kind`, "has an unsupported value");
    }
  }
  if (encoder.encode(JSON.stringify(definition.nodes)).length > 24 * 1024)
    invalid("body.definition.nodes", "exceeds 24 KiB");
  // Reachability, offered choices, compliance keywords and launch state remain
  // server authority; no keyword normalization or graph rewrite occurs here.
}

function validateReplySend(value: unknown, field: string): void {
  const send = contractObject(value, field);
  if (send.kind === "text") {
    contractFields(send, ["kind", "text"], ["kind", "text"], field);
    messageText(send.text, `${field}.text`, 4096, true);
    return;
  }
  const extras =
    send.kind === "buttons"
      ? ["buttons"]
      : send.kind === "list"
        ? ["buttonText", "rows"]
        : send.kind === "flow_form"
          ? ["flowId", "buttonText", "screen"]
          : null;
  if (!extras) invalid(`${field}.kind`, "has an unsupported value");
  contractFields(
    send,
    ["kind", "body", "footer", ...extras],
    ["kind", "body", ...extras],
    field,
  );
  messageText(send.body, `${field}.body`, 1024, true);
  if (send.footer !== undefined)
    messageText(send.footer, `${field}.footer`, 60);
  if (send.kind !== "buttons")
    messageText(send.buttonText, `${field}.buttonText`, 20);
  if (send.kind === "flow_form") {
    contractUuid(send.flowId, `${field}.flowId`);
    const screen = contractString(send.screen, `${field}.screen`);
    if (!/^[A-Za-z0-9_]{1,64}$/.test(screen))
      invalid(`${field}.screen`, "has an unsupported value");
    return;
  }
  const list = send.kind === "buttons" ? send.buttons : send.rows;
  const key = send.kind === "buttons" ? "buttons" : "rows";
  const maximum = send.kind === "buttons" ? 3 : 10;
  if (!Array.isArray(list) || list.length < 1 || list.length > maximum)
    invalid(`${field}.${key}`, `must contain 1–${maximum} choices`);
  const ids = new Set<string>();
  for (const [index, raw] of list.entries()) {
    const itemField = `${field}.${key}[${index}]`;
    const item = contractFields(
      raw,
      send.kind === "buttons" ? ["id", "text"] : ["id", "title", "description"],
      send.kind === "buttons" ? ["id", "text"] : ["id", "title"],
      itemField,
    );
    nodeId(item.id, `${itemField}.id`);
    if (ids.has(item.id as string))
      invalid(`${itemField}.id`, "must be unique");
    ids.add(item.id as string);
    if (send.kind === "buttons")
      messageText(item.text, `${itemField}.text`, 20);
    else {
      messageText(item.title, `${itemField}.title`, 24);
      if (item.description !== undefined)
        messageText(item.description, `${itemField}.description`, 72);
    }
  }
}

export function validateCampaignTestSend(
  value: unknown,
  project = false,
): void {
  const input = contractFields(
    value,
    [
      "sessionId",
      "to",
      "sampleRecipientId",
      "variables",
      ...(project ? ["projectId"] : []),
    ],
    ["sessionId", "to", ...(project ? ["projectId"] : [])],
    "body",
  );
  contractUuid(input.sessionId, "body.sessionId");
  contractString(input.to, "body.to", 1, 32);
  if (project) contractUuid(input.projectId, "body.projectId");
  if (input.sampleRecipientId !== undefined)
    contractUuid(input.sampleRecipientId, "body.sampleRecipientId");
  if (input.variables !== undefined) {
    const entries = Object.entries(
      contractObject(input.variables, "body.variables"),
    );
    if (entries.length > 50)
      invalid("body.variables", "must contain at most 50 entries");
    for (const [key, item] of entries) {
      if (
        !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(key) ||
        !(
          typeof item === "string" ||
          typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item))
        ) ||
        String(item).length > 1024
      )
        invalid(
          `body.variables.${key}`,
          "has an unsupported name, value or length",
        );
    }
  }
}

export function validateReplyFlowAssignment(
  value: unknown,
  project = false,
): void {
  const input = contractFields(
    value,
    ["replyFlowId", ...(project ? ["projectId"] : [])],
    ["replyFlowId", ...(project ? ["projectId"] : [])],
    "body",
  );
  if (input.replyFlowId !== null)
    contractUuid(input.replyFlowId, "body.replyFlowId");
  if (project) contractUuid(input.projectId, "body.projectId");
}

export function validateRecipientExport(
  value: unknown,
  project = false,
): Record<string, string | number> {
  const input = contractFields(
    value,
    ["status", "reason", "cursor", "limit", ...(project ? ["projectId"] : [])],
    project ? ["projectId"] : [],
    "params",
  );
  if (project) contractUuid(input.projectId, "params.projectId");
  if (input.status !== undefined)
    oneOf(
      input.status,
      ["queued", "sending", "sent", "delivered", "read", "failed", "skipped"],
      "params.status",
    );
  if (input.reason !== undefined)
    oneOf(
      input.reason,
      [
        "opted_out",
        "cold_held",
        "campaign_cancelled",
        "invalid_recipient",
        "session_not_connected",
        "ack_timeout",
        "blocked_by_safety",
        "send_failed",
        "missing_variable",
        "frequency_cap",
        "other",
      ],
      "params.reason",
    );
  if (input.cursor !== undefined)
    contractString(input.cursor, "params.cursor", 1, 256);
  if (input.limit !== undefined)
    contractInteger(input.limit, "params.limit", 1, 1000);
  if (
    (input.status !== undefined || input.reason !== undefined) &&
    (input.cursor !== undefined ||
      (input.limit !== undefined && input.limit !== 1000))
  ) {
    invalid(
      "params",
      "cannot combine a filter with a cursor or a smaller limit",
    );
  }
  return Object.fromEntries(
    Object.entries(input).filter(([, item]) => item !== undefined),
  ) as Record<string, string | number>;
}

export function validateProfilePhone(value: unknown): string {
  if (typeof value !== "string" || !/^\+[1-9][0-9]{6,14}$/.test(value))
    return invalid("phone", "must be E.164");
  return value;
}

export function validateProfilePage(
  value: unknown,
): Record<string, string | number> {
  const input = contractFields(value, ["cursor", "limit"], [], "params");
  if (input.cursor !== undefined) contractUuid(input.cursor, "params.cursor");
  if (input.limit !== undefined)
    contractInteger(input.limit, "params.limit", 1, 100);
  return Object.fromEntries(
    Object.entries(input).filter(([, item]) => item !== undefined),
  ) as Record<string, string | number>;
}

export function validateProfilePut(value: unknown): void {
  const input = contractFields(
    value,
    ["tags", "attributes", "expectedRevision", "provenance", "consent"],
    ["tags", "attributes"],
    "body",
  );
  if (input.expectedRevision !== undefined)
    contractInteger(input.expectedRevision, "body.expectedRevision", 1);
  if (
    !Array.isArray(input.tags) ||
    input.tags.length > 20 ||
    new Set(input.tags).size !== input.tags.length
  )
    invalid("body.tags", "must contain at most 20 distinct tags");
  for (const tag of input.tags) {
    const text = bytes(tag, "body.tags", 1, 48);
    if (hasAsciiControl(text))
      invalid("body.tags", "must not contain control characters");
  }
  const attributes = contractObject(input.attributes, "body.attributes");
  const entries = Object.entries(attributes);
  if (entries.length > 20)
    invalid("body.attributes", "must contain at most 20 entries");
  for (const [key, item] of entries) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(key) ||
      !(
        item === null ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)) ||
        (typeof item === "string" &&
          encoder.encode(item).length <= 256 &&
          !item.includes("\0"))
      )
    ) {
      invalid(
        `body.attributes.${key}`,
        "has an unsupported name, value or length",
      );
    }
  }
  if (encoder.encode(JSON.stringify(attributes)).length > 8192)
    invalid("body.attributes", "exceeds 8192 UTF-8 bytes");
  for (const key of ["provenance", "consent"])
    if (input[key] !== undefined) {
      const consent = key === "consent";
      const fields = [
        "source",
        "reference",
        ...(consent ? ["purpose", "allowed", "assertedAt"] : []),
      ];
      const source = contractFields(input[key], fields, fields, `body.${key}`);
      oneOf(source.source, ["api", "csv", "form"], `body.${key}.source`);
      const reference = bytes(
        source.reference,
        `body.${key}.reference`,
        1,
        128,
      );
      if (hasAsciiControl(reference))
        invalid(`body.${key}.reference`, "must not contain control characters");
      if (consent) {
        if (
          source.purpose !== "campaigns" ||
          typeof source.allowed !== "boolean"
        )
          invalid(
            "body.consent",
            "requires campaigns purpose and a boolean allowed value",
          );
        contractInteger(
          source.assertedAt,
          "body.consent.assertedAt",
          0,
          8_640_000_000_000_000,
        );
      }
    }
}

export function validateProfileImport(value: unknown): void {
  const input = contractFields(
    value,
    ["replayKey", "csvBase64", "mapping"],
    ["replayKey", "csvBase64"],
    "body",
  );
  if (
    typeof input.replayKey !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(input.replayKey)
  )
    invalid("body.replayKey", "has an unsupported value");
  const csv = contractString(input.csvBase64, "body.csvBase64", 1, 13_981_016);
  if (csv.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(csv))
    invalid("body.csvBase64", "must be canonical standard base64");
  let binary: string;
  try {
    binary = atob(csv);
  } catch {
    return invalid("body.csvBase64", "must be canonical standard base64");
  }
  if (binary.length > 10 * 1024 * 1024 || btoa(binary) !== csv)
    invalid("body.csvBase64", "exceeds 10 MiB or is not canonical");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
  } catch {
    invalid("body.csvBase64", "must contain UTF-8 CSV");
  }
  if (binary.includes("\0")) invalid("body.csvBase64", "must not contain NUL");
  if (input.mapping !== undefined) {
    const mapping = contractFields(
      input.mapping,
      [
        "phone",
        "tags",
        "attributes",
        "expectedRevision",
        "provenanceReference",
        "consentAllowed",
        "consentAssertedAt",
        "consentReference",
      ],
      ["phone", "tags", "attributes"],
      "body.mapping",
    );
    const headers: string[] = [];
    for (const [key, item] of Object.entries(mapping))
      if (item !== undefined) {
        const header = bytes(item, `body.mapping.${key}`, 1, 64);
        if (
          header !== header.trim() ||
          /\p{Cc}/u.test(header) ||
          headers.includes(header)
        )
          invalid(
            `body.mapping.${key}`,
            "must be a distinct trimmed header without control characters",
          );
        headers.push(header);
      }
  }
  if (encoder.encode(JSON.stringify(input)).length > 14 * 1024 * 1024)
    invalid("body", "exceeds 14 MiB");
}

export function validateRetarget(value: unknown): void {
  const input = contractFields(
    value,
    ["name", "campaignId", "outcome", "projectId"],
    ["name", "campaignId", "outcome"],
    "body",
  );
  const name = contractString(input.name, "body.name");
  if (!name.trim() || name.trim().length > 200)
    invalid("body.name", "must contain 1–200 trimmed characters");
  contractUuid(input.campaignId, "body.campaignId");
  if (input.projectId !== undefined)
    contractUuid(input.projectId, "body.projectId");
  oneOf(
    input.outcome,
    [
      "delivered",
      "not_delivered",
      "read",
      "not_read",
      "replied",
      "not_replied",
      "failed",
    ],
    "body.outcome",
  );
}

export function validateStopConfirmation(value: unknown): void {
  const input = contractFields(
    value,
    ["teamId", "enabled", "locale", "revision"],
    ["teamId", "enabled", "locale", "revision"],
    "body",
  );
  contractUuid(input.teamId, "body.teamId");
  contractInteger(input.revision, "body.revision", 0, 2_147_483_646);
  if (typeof input.enabled !== "boolean")
    invalid("body.enabled", "must be a boolean");
  if (input.locale !== null)
    oneOf(input.locale, ["en", "pt-BR", "es"], "body.locale");
  if (input.enabled && input.locale === null)
    invalid("body.locale", "is required when confirmations are enabled");
}

export function validateCustodyUpdate(value: unknown, customer: boolean): void {
  const input = contractFields(
    value,
    ["expectedRevision", "signalModeDefault"],
    ["expectedRevision", "signalModeDefault"],
    "body",
  );
  contractInteger(input.expectedRevision, "body.expectedRevision", 0);
  if (!(customer && input.signalModeDefault === null))
    oneOf(
      input.signalModeDefault,
      ["standard", "zero_knowledge"],
      "body.signalModeDefault",
    );
}
