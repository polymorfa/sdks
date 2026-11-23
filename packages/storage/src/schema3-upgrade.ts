import { encodeKey, entityDefinition, type EntityName } from "./schema.js";
import type { StoredRow } from "./types.js";

/** Convert one exported schema-2 row. Nested data and merge versions are opaque. */
export function upgradeSchema2Row(
  entity: string,
  input: Readonly<Record<string, unknown>>,
): { entity: EntityName; row: StoredRow } {
  const current = (
    entity === "sessions" ? "connections" : entity
  ) as EntityName;
  const definition = entityDefinition(current);
  if (
    !Object.hasOwn(input, "sessionId") ||
    Object.hasOwn(input, "connectionId")
  )
    throw new TypeError("Conflicting or missing schema-2 account key.");
  const { sessionId, ...values } = input;
  const row = { ...values, connectionId: sessionId } as unknown as StoredRow;
  if (
    encodeKey(definition, row) !== input._id ||
    !Number.isSafeInteger(row._rev) ||
    row._rev < 1 ||
    row._v === null ||
    typeof row._v !== "object" ||
    Array.isArray(row._v)
  )
    throw new TypeError("Invalid schema-2 storage identity or merge metadata.");
  return { entity: current, row };
}
