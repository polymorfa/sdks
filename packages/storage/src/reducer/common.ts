import { FINAL_VERSION } from "../merge.js";
import type { EntityName } from "../schema.js";
import type {
  ChatWatermarkGuard,
  FieldValue,
  FieldWrite,
  RowKey,
  UpsertOperation,
} from "../types.js";

/** Sender ID used for this account's own messages, reactions and votes. */
export const SELF_ID = "self";

/** Message delivery states, in the order a message can reach them. */
export const MESSAGE_STATUS_RANK = {
  pending: 1,
  failed: 2,
  sent: 3,
  delivered: 4,
  read: 5,
  played: 6,
} as const;

export type MessageStatus = keyof typeof MESSAGE_STATUS_RANK;

/** Message fields replaced together by an edit and cleared by a revoke. */
export const CONTENT_FIELDS = [
  "text",
  "caption",
  "mimeType",
  "fileName",
  "latitude",
  "longitude",
  "displayName",
  "title",
  "pollOptions",
  "extra",
] as const;

/** Media fields cleared when the message is revoked or deleted. */
export const MEDIA_SECRET_FIELDS = [
  "mediaKey",
  "descriptor",
  "directPath",
  "downloadUrl",
  "fileSha256",
  "fileEncSha256",
] as const;

export type Fields = Record<string, FieldWrite>;

export function put(
  fields: Fields,
  name: string,
  value: FieldValue | undefined,
  version: number,
): void {
  if (value === undefined) return;
  fields[name] = { value, version };
}

export function upsert(
  entity: EntityName,
  key: RowKey,
  fields: Fields,
  guard?: ChatWatermarkGuard,
): UpsertOperation {
  return guard
    ? { kind: "upsert", entity, key, fields, guard }
    : { kind: "upsert", entity, key, fields };
}

/** Converts Unix seconds or milliseconds to milliseconds. */
export function toMillis(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(value))
    return undefined;
  if (value <= 0) return undefined;
  return value < 100_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

export function isoMillis(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Writes that clear message content permanently (revoke, delete for me). */
export function clearedContent(): Fields {
  const fields: Fields = {};
  for (const field of CONTENT_FIELDS)
    fields[field] = { value: null, version: FINAL_VERSION };
  return fields;
}

export function clearedMedia(): Fields {
  const fields: Fields = {};
  for (const field of MEDIA_SECRET_FIELDS)
    fields[field] = { value: null, version: FINAL_VERSION };
  return fields;
}

export function statusWrites(
  fields: Fields,
  status: MessageStatus,
  at: number | undefined,
): void {
  const rank = MESSAGE_STATUS_RANK[status];
  fields.status = { value: status, version: rank };
  if (at !== undefined) fields.statusAt = { value: at, version: rank };
}

export function chatKind(
  jidOrHint: string | undefined,
  isGroup?: boolean,
): "direct" | "group" | "channel" | "broadcast" | undefined {
  if (isGroup === true) return "group";
  if (!jidOrHint) return isGroup === false ? "direct" : undefined;
  if (jidOrHint.endsWith("@g.us")) return "group";
  if (jidOrHint.endsWith("@newsletter")) return "channel";
  if (jidOrHint.endsWith("@broadcast")) return "broadcast";
  if (
    jidOrHint.endsWith("@s.whatsapp.net") ||
    jidOrHint.endsWith("@lid") ||
    jidOrHint.endsWith("@c.us")
  )
    return "direct";
  return isGroup === false ? "direct" : undefined;
}

export function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
