import { PolymorfaConfigurationError } from "./errors.js";
import {
  contractFields,
  contractInteger,
  contractObject,
  contractString,
  contractUuid,
} from "./campaign-contract-validation.js";
import type { RequestOptions } from "./transport/types.js";

const variableName = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
function invalid(field: string): never {
  throw new PolymorfaConfigurationError(
    "Invalid campaign request field.",
    field,
  );
}
const present = (v: object, key: string): boolean => Object.hasOwn(v, key);
const enumValue = (
  v: unknown,
  values: readonly unknown[],
  field: string,
): void => {
  if (!values.includes(v)) invalid(field);
};
const text = (v: unknown, field: string, max: number): string =>
  contractString(v, field, 1, max);

/** Existing methods preserve legacy versions and retries unless new intent asks. */
export function existingOptions(
  options: RequestOptions,
  newIntent = false,
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
  if (
    present(options, "apiVersion") &&
    (typeof options.apiVersion !== "string" || options.apiVersion.length === 0)
  )
    invalid("options.apiVersion");
  return {
    ...options,
    ...(options.headers === undefined
      ? {}
      : { headers: { ...options.headers } }),
    ...(newIntent && options.apiVersion === undefined
      ? { apiVersion: "2026-10-14" }
      : {}),
  };
}

function mapping(value: unknown): void {
  const entries = Object.entries(contractObject(value, "variableMapping"));
  if (entries.length > 50) invalid("variableMapping");
  for (const [key, entry] of entries) {
    if (!variableName.test(key)) invalid("variableMapping");
    const binding = contractFields(
      entry,
      ["source", "fallback"],
      [],
      "variableMapping",
    );
    if (
      present(binding, "source") &&
      (typeof binding.source !== "string" || !variableName.test(binding.source))
    )
      invalid("variableMapping.source");
    if (
      present(binding, "fallback") &&
      !text(binding.fallback, "variableMapping.fallback", 1024).trim()
    )
      invalid("variableMapping.fallback");
  }
}
function links(value: unknown): void {
  if (value === null) return;
  if (!Array.isArray(value) || value.length > 5) invalid("trackedLinks");
  const keys = new Set<string>();
  for (const entry of value) {
    const v = contractFields(
      entry,
      ["key", "url"],
      ["key", "url"],
      "trackedLinks",
    );
    const key = text(v.key, "trackedLinks.key", 32);
    if (!/^[a-z0-9_]+$/.test(key) || keys.has(key)) invalid("trackedLinks.key");
    keys.add(key);
    const raw = text(v.url, "trackedLinks.url", 2048);
    if (
      /\s/u.test(raw) ||
      Array.from(raw).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      invalid("trackedLinks.url");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      invalid("trackedLinks.url");
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.href.length > 2048 ||
      !host.includes(".") ||
      host === "localhost" ||
      host.startsWith("[") ||
      /^[0-9.]+$/.test(host) ||
      /^[0-9]+$/.test(host.split(".").pop() ?? "") ||
      [".local", ".internal", ".localhost"].some((suffix) =>
        host.endsWith(suffix),
      )
    )
      invalid("trackedLinks.url");
  }
}
function followUp(value: unknown): void {
  if (value === null) return;
  const v = contractFields(
    value,
    ["delaySeconds", "expirySeconds", "message"],
    ["message"],
    "followUp",
  );
  const delay = present(v, "delaySeconds")
    ? contractInteger(v.delaySeconds, "delaySeconds", 60, 604800)
    : 86400;
  const expiry = present(v, "expirySeconds")
    ? contractInteger(v.expirySeconds, "expirySeconds", 86400, 2592000)
    : 604800;
  if (expiry <= delay) invalid("followUp.expirySeconds");
  const message = contractObject(v.message, "followUp.message");
  if (message.type === "text") {
    contractFields(
      message,
      ["type", "text"],
      ["type", "text"],
      "followUp.message",
    );
    if (
      /\{\{\s*link:/i.test(text(message.text, "followUp.message.text", 16384))
    )
      invalid("followUp.message.text");
  } else {
    contractFields(
      message,
      ["type", "templateId"],
      ["type", "templateId"],
      "followUp.message",
    );
    enumValue(message.type, ["template"], "followUp.message.type");
    contractUuid(message.templateId, "followUp.message.templateId");
  }
}
function composed(value: unknown): void {
  if (!Array.isArray(value) || value.length > 10) invalid("messagesArray");
  for (const item of value) {
    const v = contractObject(item, "messagesArray");
    if (present(v, "version")) enumValue(v.version, [2], "version");
    for (const key of ["source", "footer"])
      if (present(v, key)) contractString(v[key], key, 0);
    if (present(v, "delayAfterSec"))
      contractInteger(v.delayAfterSec, "delayAfterSec", 0, 86400);
    if (present(v, "media")) {
      const media = contractObject(v.media, "media");
      enumValue(
        media.kind,
        ["image", "video", "audio", "document"],
        "media.kind",
      );
      contractString(media.url, "media.url", 0);
      for (const key of ["filename", "caption"])
        if (present(media, key)) contractString(media[key], key, 0);
    }
    if (present(v, "buttons")) {
      if (!Array.isArray(v.buttons)) invalid("buttons");
      for (const b of v.buttons) {
        const button = contractObject(b, "button");
        enumValue(button.kind, ["reply", "link", "call"], "button.kind");
        contractString(button.label, "button.label", 0);
        for (const key of ["url", "phone"])
          if (present(button, key)) contractString(button[key], key, 0);
      }
    }
  }
}
function alternatives(
  value: unknown,
  variants: boolean,
  platform: boolean,
): void {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > (variants ? 4 : 5)
  )
    invalid("variants");
  let total = 0;
  const keys = new Set<string>();
  for (const item of value) {
    const v = contractFields(
      item,
      variants
        ? ["key", "label", "weight", "blueprint"]
        : ["key", "weight", "blueprint"],
      variants
        ? ["key", "label", "weight", "blueprint"]
        : ["key", "weight", "blueprint"],
      "variants",
    );
    const key = text(v.key, "key", 16);
    if (!/^[a-z][a-z0-9_-]{0,15}$/.test(key) || keys.has(key)) invalid("key");
    keys.add(key);
    if (variants) {
      const label = contractString(v.label, "label", 1);
      if (
        !(platform ? label : label.trim()).length ||
        (platform ? label : label.trim()).length > 100
      )
        invalid("label");
    }
    total += contractInteger(v.weight, "weight", 1, 99);
    const blueprint = contractObject(v.blueprint, "blueprint");
    enumValue(blueprint.version, [2], "blueprint.version");
    if (!text(blueprint.source, "blueprint.source", 4096).trim())
      invalid("blueprint.source");
  }
  if (total !== 100) invalid("weight");
}

/** Only named changes are validated; Platform PATCH stays deliberately open. */
export function validateExistingCampaign(
  value: unknown,
  platform = false,
  patch = false,
): void {
  const v = contractObject(value, "body");
  if (platform && patch)
    for (const field of ["projectId", "id"])
      if (present(v, field)) invalid(field);
  if (!platform && patch && Object.keys(v).length === 0) invalid("body");
  if (present(v, "variableMapping") && !(patch && v.variableMapping === null))
    mapping(v.variableMapping);
  if (present(v, "trackedLinks")) links(v.trackedLinks);
  if (present(v, "templateId") && patch && v.templateId !== null)
    contractUuid(v.templateId, "templateId");
  if (present(v, "followUp")) followUp(v.followUp);
  if (present(v, "messagesArray")) composed(v.messagesArray);
  for (const [key, variant] of [
    ["variants", true],
    ["messageVariations", false],
  ] as const)
    if (present(v, key) && !(v[key] === null && (!platform || patch)))
      alternatives(v[key], variant, platform);
  if (
    present(v, "variantStrategy") &&
    !(v.variantStrategy === null && (!platform || patch))
  ) {
    const strategy = contractFields(
      v.variantStrategy,
      [
        "winnerCriterion",
        "holdoutPercent",
        "testSlicePercent",
        "autoPromote",
        "testWindowMinutes",
      ],
      ["winnerCriterion", "holdoutPercent", "autoPromote", "testWindowMinutes"],
      "variantStrategy",
    );
    enumValue(
      strategy.winnerCriterion,
      ["delivery", "read", "reply"],
      "winnerCriterion",
    );
    contractInteger(strategy.holdoutPercent, "holdoutPercent", 0, 30);
    if (present(strategy, "testSlicePercent"))
      contractInteger(strategy.testSlicePercent, "testSlicePercent", 5, 50);
    enumValue(strategy.autoPromote, [true], "autoPromote");
    contractInteger(strategy.testWindowMinutes, "testWindowMinutes", 15, 1440);
  }
}
export function validateRecipientList(value: unknown, platform = false): void {
  const v = contractFields(
    value,
    ["status", "reason", "cursor", "limit", ...(platform ? ["projectId"] : [])],
    platform ? ["projectId"] : [],
    "params",
  );
  if (platform) contractUuid(v.projectId, "projectId");
  if (present(v, "reason"))
    enumValue(
      v.reason,
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
        "other",
      ],
      "reason",
    );
  if (present(v, "status"))
    enumValue(
      v.status,
      ["queued", "sending", "sent", "delivered", "read", "failed", "skipped"],
      "status",
    );
  if (present(v, "cursor")) text(v.cursor, "cursor", 256);
  if (present(v, "limit")) contractInteger(v.limit, "limit", 1, 100);
}
export function validateCampaignLaunch(value: unknown, platform = false): void {
  const v = contractFields(
    value,
    ["scheduledAt", "skipMissingVariables", ...(platform ? ["projectId"] : [])],
    platform ? ["projectId"] : [],
    "body",
  );
  if (platform) contractUuid(v.projectId, "projectId");
  if (
    present(v, "scheduledAt") &&
    (typeof v.scheduledAt !== "number" || !Number.isFinite(v.scheduledAt))
  )
    invalid("scheduledAt");
  if (
    present(v, "skipMissingVariables") &&
    typeof v.skipMissingVariables !== "boolean"
  )
    invalid("skipMissingVariables");
}
