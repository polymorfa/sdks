import type { DirectHistorySyncPayload } from "@polymorfa/sdk";
import type { HistorySyncChunk } from "./history-types.js";

const own = (v: object, k: string) =>
  Object.prototype.hasOwnProperty.call(v, k);
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === "object" &&
  Object.prototype.toString.call(v) === "[object Object]";
const text = (v: unknown) => typeof v === "string" && v.length > 0;
const integer = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;
function datetime(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m =
    /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/.exec(
      v,
    );
  if (!m) return false;
  const y = Number(m[1]),
    month = Number(m[2]),
    day = Number(m[3]);
  return (
    day >= 1 &&
    day <=
      [
        31,
        y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ][month - 1]!
  );
}
function ids(v: unknown): boolean {
  return (
    record(v) &&
    Object.keys(v).length > 0 &&
    Object.entries(v).every(
      ([k, value]) =>
        ["linked_devices", "official_api"].includes(k) &&
        text(value) &&
        (value as string).length <= 512,
    )
  );
}
export function descriptorIntent(v: unknown): boolean {
  return record(v) && own(v, "delivery");
}
/** Validate known projected fields. Unknown event fields stay forward compatible. */
export function historyDescriptor(v: unknown): DirectHistorySyncPayload {
  const fail = () => {
    throw new Error("Invalid history descriptor.");
  };
  if (!record(v)) return fail();
  if (
    v.delivery !== "descriptor" ||
    !ids(v.whatsapp_ids) ||
    !text(v.syncType) ||
    !integer(v.fileLength)
  )
    return fail();
  for (const k of ["whatsapp_id", "original_whatsapp_id"]) {
    if (own(v, k) && (!text(v[k]) || (v[k] as string).length > 512))
      return fail();
  }
  if (own(v, "original_whatsapp_ids") && !ids(v.original_whatsapp_ids))
    return fail();
  if (own(v, "chunkOrder") && !integer(v.chunkOrder)) return fail();
  if (
    own(v, "progress") &&
    (!integer(v.progress) || (v.progress as number) > 100)
  )
    return fail();
  if (
    own(v, "peerDataRequestSessionId") &&
    typeof v.peerDataRequestSessionId !== "string"
  )
    return fail();
  if (own(v, "oldestMessageAt") && !datetime(v.oldestMessageAt)) return fail();
  if (own(v, "media") === own(v, "inline")) return fail();
  if (own(v, "media")) {
    const d = v.media;
    if (
      !record(d) ||
      d.type !== "md-msg-hist" ||
      ![d.directPath, d.mediaKey, d.fileSha256, d.fileEncSha256].every(text) ||
      (own(d, "encHandle") && typeof d.encHandle !== "string")
    )
      return fail();
  } else {
    const d = v.inline;
    if (!record(d) || d.encoding !== "zlib-base64-protobuf" || !text(d.data))
      return fail();
  }
  return v as unknown as DirectHistorySyncPayload;
}
/** This checks the storage projection, not completeness of a protobuf schema. */
export function decodedHistoryChunk(v: unknown): HistorySyncChunk {
  if (
    !record(v) ||
    [
      "conversations",
      "statusV3Messages",
      "pushnames",
      "pastParticipants",
      "phoneNumberToLidMappings",
    ].some(
      (k) =>
        v[k] !== undefined &&
        v[k] !== null &&
        (!Array.isArray(v[k]) || !(v[k] as unknown[]).every(record)),
    ) ||
    (v.syncType !== undefined &&
      v.syncType !== null &&
      typeof v.syncType !== "string" &&
      typeof v.syncType !== "number")
  )
    throw new Error("Invalid decoded history descriptor chunk.");
  return v as HistorySyncChunk;
}
