import { d1Adapter, type D1DatabaseLike } from "./adapters/d1.js";
import {
  validateCommit,
  validateQuery,
  validateRows,
} from "./adapters/validation.js";
import {
  ENTITY_NAMES,
  entityDefinition,
  STORAGE_SCHEMA_VERSION,
  type EntityName,
} from "./schema.js";
import type { IndexQuery, RowWrite } from "./types.js";

/** Independent of the API revision; only schema-2 storage operations cross this boundary. */
export const D1_BRIDGE_CONTRACT = "polymorfa-d1-storage-v1";
export const D1_BRIDGE_HEADERS = Object.freeze({
  nonce: "Polymorfa-Storage-Nonce",
  signature: "Polymorfa-Storage-Signature",
  authority: "Polymorfa-Storage-Authority",
  prefix: "Polymorfa-Storage-Prefix",
});
const MAX_BODY = 8 * 1024 * 1024;
const encoder = new TextEncoder();

export interface D1StorageBridgeOptions {
  readonly database: D1DatabaseLike;
  /** Fixed by the customer's Worker configuration, never selected by requests. */
  readonly authority: string;
  readonly tablePrefix: string;
  /** Separate customer-owned application secret, not a Polymorfa credential. */
  readonly secret: string;
  /** Permit idempotent schema creation through /setup. Default false. */
  readonly allowSetup?: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid storage request.");
  return value as Record<string, unknown>;
}
function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError("Invalid storage request.");
}
function entity(value: unknown): EntityName {
  if (
    typeof value !== "string" ||
    !(ENTITY_NAMES as readonly string[]).includes(value)
  )
    throw new TypeError("Invalid storage entity.");
  return value as EntityName;
}
function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string" || id === "" || id.length > 4096)
  )
    throw new TypeError("Invalid storage identities.");
  return value as string[];
}
function positive(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function rowWrites(value: unknown): RowWrite[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new TypeError("Invalid atomic storage commit.");
  for (const raw of value) {
    const write = record(raw);
    const definition = entityDefinition(entity(write.entity));
    if (write.kind === "put") {
      exact(write, ["kind", "entity", "row", "expectedRev"]);
      if (write.expectedRev !== null && !positive(write.expectedRev))
        throw new TypeError("Invalid storage revision.");
      const row = record(write.row);
      exact(row, [
        "_id",
        "_rev",
        "_v",
        ...definition.key,
        ...Object.keys(definition.fields),
      ]);
      if (
        definition.key.some(
          (key) =>
            typeof row[key] !== "string" ||
            row[key] === "" ||
            (row[key] as string).length > 4096,
        )
      )
        throw new TypeError("Invalid storage key.");
      if (
        Object.entries(record(row._v)).some(
          ([field, revision]) =>
            !Object.hasOwn(definition.fields, field) ||
            typeof revision !== "number" ||
            !Number.isFinite(revision),
        )
      )
        throw new TypeError("Invalid field versions.");
      for (const [field, type] of Object.entries(definition.fields)) {
        const fieldValue = row[field];
        if (
          fieldValue !== undefined &&
          fieldValue !== null &&
          type !== "json" &&
          (typeof fieldValue !== type ||
            (type === "number" && !Number.isFinite(fieldValue)))
        )
          throw new TypeError("Invalid storage field.");
      }
      validateRows(definition.name, [row]);
    } else if (write.kind === "delete") {
      exact(write, ["kind", "entity", "id", "expectedRev"]);
      ids([write.id]);
      // Clear-chat child deletes share a CAS lease fence in the atomic batch.
      if (write.expectedRev === undefined) {
        const scope = "k" + (write.id as string).slice(1).split(":", 1)[0];
        const fenced = value.some((candidate: unknown) => {
          const fence = record(candidate);
          if (
            fence.kind !== "put" ||
            fence.entity !== "leases" ||
            !positive(fence.expectedRev)
          )
            return false;
          const row = record(fence.row);
          return (
            row._id === scope && row._rev === (fence.expectedRev as number) + 1
          );
        });
        if (!fenced)
          throw new TypeError(
            "Remote deletes require a revision or an atomic session fence.",
          );
      } else if (!positive(write.expectedRev))
        throw new TypeError("Invalid storage revision.");
    } else throw new TypeError("Invalid storage write.");
  }
  const writes = value as RowWrite[];
  validateCommit(writes, 50);
  return writes;
}
function indexQuery(value: unknown, name: EntityName): IndexQuery {
  const query = record(value);
  exact(query, ["index", "equals", "range", "order", "limit", "after"]);
  const definition = entityDefinition(name);
  const index = definition.indexes.find((index) => index.name === query.index);
  if (!index) throw new TypeError("Invalid storage index.");
  exact(record(query.equals), index.equals);
  if (
    query.order !== undefined &&
    query.order !== "asc" &&
    query.order !== "desc"
  )
    throw new TypeError("Invalid storage order.");
  if (query.range !== undefined)
    exact(record(query.range), ["gt", "gte", "lt", "lte"]);
  if (query.after !== undefined) exact(record(query.after), ["sort", "id"]);
  validateQuery(name, query as unknown as IndexQuery);
  if ((query.limit as number) > 1000)
    throw new RangeError("Storage bridge queries must be paged at 1000 rows.");
  return query as unknown as IndexQuery;
}
function validateJson(value: unknown): void {
  let count = 0;
  const visit = (node: unknown, depth: number): void => {
    if (++count > 200000 || depth > 64)
      throw new TypeError("Storage JSON exceeds structural limits.");
    if (typeof node === "number" && !Number.isFinite(node))
      throw new TypeError("Storage JSON requires finite numbers.");
    if (node && typeof node === "object")
      for (const child of Object.values(node)) visit(child, depth + 1);
  };
  visit(value, 0);
}
async function boundedBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY)
        throw new RangeError("Storage request exceeds the size limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function hmac(key: CryptoKey, content: string): Promise<string> {
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(content)),
  );
  return (
    "v1=" +
    Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++)
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

/**
 * A customer-hosted Worker bridge to the atomic D1 binding. It stores rows only:
 * reducers, merge decisions, leases, dedupe and checkpoint planning stay native.
 * Each instance has one immutable authority/prefix/secret and exposes no SQL,
 * credentials, truncate endpoint, caller-selected tenant or CORS access.
 */
export function createD1StorageBridge(options: D1StorageBridgeOptions): {
  fetch(request: Request): Promise<Response>;
} {
  const { authority, tablePrefix, secret, allowSetup = false } = options;
  if (
    !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(authority) ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(tablePrefix) ||
    !/^[!-~]{32,256}$/.test(secret)
  )
    throw new TypeError(
      "A fixed storage authority, SQL prefix and independent application secret are required.",
    );
  const adapter = d1Adapter(options.database, {
    tablePrefix,
    createTables: allowSetup,
  });
  const signingKey = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const nonce = request.headers.get(D1_BRIDGE_HEADERS.nonce) ?? "";
      const reject = (status: number) =>
        new Response(
          JSON.stringify({ error: "Storage bridge request rejected." }),
          {
            status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      if (
        request.headers.has("Origin") ||
        !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
        !equal(request.headers.get("Authorization") ?? "", `Bearer ${secret}`)
      )
        return reject(403);
      if (
        request.headers.get(D1_BRIDGE_HEADERS.authority) !== authority ||
        request.headers.get(D1_BRIDGE_HEADERS.prefix) !== tablePrefix
      )
        return reject(403);
      if (
        url.search ||
        !["/handshake", "/setup", "/get", "/commit", "/query"].includes(
          url.pathname,
        )
      )
        return reject(404);
      if (request.method !== (url.pathname === "/handshake" ? "GET" : "POST"))
        return reject(405);
      let body: string;
      try {
        body = await boundedBody(request);
      } catch {
        return reject(400);
      }
      const key = await signingKey;
      const signature = await hmac(
        key,
        `${nonce}.${request.method}.${url.pathname}.${body}`,
      );
      if (
        !equal(
          signature,
          request.headers.get(D1_BRIDGE_HEADERS.signature) ?? "",
        )
      )
        return reject(403);
      const respond = async (status: number, data: unknown) => {
        const raw = JSON.stringify({
          contract: D1_BRIDGE_CONTRACT,
          schemaVersion: STORAGE_SCHEMA_VERSION,
          authority,
          tablePrefix,
          data,
        });
        if (encoder.encode(raw).length > MAX_BODY) return reject(413);
        return new Response(raw, {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            [D1_BRIDGE_HEADERS.nonce]: nonce,
            [D1_BRIDGE_HEADERS.signature]: await hmac(
              key,
              `${nonce}.${status}.${raw}`,
            ),
          },
        });
      };
      try {
        let data: unknown;
        if (url.pathname === "/handshake") {
          if (body !== "") throw new TypeError("Handshake has no body.");
          data = {
            atomicCommit: true,
            maxCommitSize: 50,
            maxGetSize: 1000,
            maxQuerySize: 1000,
            maxBodyBytes: MAX_BODY,
            conditionalDeletes: true,
            setupAllowed: allowSetup,
          };
        } else {
          if (
            request.headers
              .get("Content-Type")
              ?.split(";", 1)[0]
              ?.trim()
              .toLowerCase() !== "application/json"
          )
            throw new TypeError("JSON is required.");
          const decoded: unknown = JSON.parse(body);
          validateJson(decoded);
          const payload = record(decoded);
          if (url.pathname === "/setup") {
            exact(payload, []);
            if (!allowSetup)
              return respond(403, { error: "Schema setup is disabled." });
            await adapter.setup?.();
            data = { ok: true };
          } else if (url.pathname === "/get") {
            exact(payload, ["entity", "ids"]);
            data = [
              ...(
                await adapter.get(entity(payload.entity), ids(payload.ids))
              ).values(),
            ];
          } else if (url.pathname === "/commit") {
            exact(payload, ["writes"]);
            data = await adapter.commit(rowWrites(payload.writes));
          } else {
            exact(payload, ["entity", "query"]);
            const name = entity(payload.entity);
            data = await adapter.query(name, indexQuery(payload.query, name));
          }
        }
        return respond(200, data);
      } catch (error) {
        return respond(
          error instanceof TypeError || error instanceof RangeError ? 400 : 500,
          { error: "Storage operation failed." },
        );
      }
    },
  });
}
