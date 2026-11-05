import { ENTITY_NAMES, entityDefinition, type FieldType } from "../schema.js";
import { columnName } from "../adapters/sql/dialect.js";

export interface PrismaSchemaOptions {
  readonly provider?: "postgresql" | "mysql" | "sqlite";
  readonly tablePrefix?: string;
}
/** Prisma models share the exact adapter table names and field types. Supply
 * the connection URL using the application's Prisma configuration. */
export function prismaSchema(options: PrismaSchemaOptions = {}): string {
  const provider = options.provider ?? "postgresql";
  const prefix = options.tablePrefix ?? "polymorfa_";
  const fieldType = (type: FieldType) =>
    ({ string: "String", number: "Float", boolean: "Boolean", json: "Json" })[
      type
    ];
  const models = ENTITY_NAMES.map((entity) => {
    const definition = entityDefinition(entity);
    const name = `Polymorfa${entity
      .split("_")
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join("")}`;
    const lines = [
      `model ${name} {`,
      '  id String @id @map("_id")',
      '  rev BigInt @map("_rev")',
      '  versions Json @map("_v")',
    ];
    for (const field of definition.key)
      lines.push(
        `  ${field} String @map(${JSON.stringify(columnName(field))})`,
      );
    for (const [field, type] of Object.entries(definition.fields))
      lines.push(
        `  ${field} ${fieldType(type)}? @map(${JSON.stringify(columnName(field))})`,
      );
    for (const index of definition.indexes)
      lines.push(
        `  @@index([${[...index.equals, index.sort, "id"].join(", ")}], map: ${JSON.stringify(`${prefix}${entity}_${index.name}`)})`,
      );
    lines.push(`  @@map(${JSON.stringify(prefix + entity)})`, "}");
    return lines.join("\n");
  });
  return `datasource db {\n  provider = ${JSON.stringify(provider)}\n}\n\n${models.join("\n\n")}\n`;
}
