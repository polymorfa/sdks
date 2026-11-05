import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import mysql from "mysql2/promise";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as mysqlDrizzle } from "drizzle-orm/mysql2";
import { drizzle as sqliteDrizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { libsqlAdapter } from "../src/adapters/libsql.js";
import {
  drizzlePostgresSchema,
  drizzleMysqlSchema,
  drizzleSqliteSchema,
} from "../src/orm/drizzle.js";
import { prismaSchema } from "../src/orm/prisma.js";
import { supabasePreset } from "../src/adapters/supabase.js";
import { postgresAdapter } from "../src/adapters/postgres.js";
import { mysqlAdapter } from "../src/adapters/mysql.js";
import { createStorage } from "../src/engine.js";
const native = process.env.POLYMORFA_STORAGE_NATIVE === "1";
const pgOptions = {
  host: "127.0.0.1",
  port: 55441,
  user: "postgres",
  password: "synthetic_fixture_only",
  database: "storage_fixture",
};
const batch = {
  sessionId: "orm",
  operations: [
    {
      kind: "upsert",
      entity: "contacts",
      key: { sessionId: "orm", contactId: "reader" },
      fields: { fullName: { value: "stored by engine", version: 1 } },
    },
  ],
} as const;
it("Drizzle SQLite reads rows created through the shared engine", async () => {
  const db = createClient({ url: "file::memory:" });
  const adapter = libsqlAdapter(db);
  await adapter.setup?.();
  await createStorage(adapter).apply(batch);
  const schema = drizzleSqliteSchema();
  const row = await sqliteDrizzle(db).select().from(schema.contacts!).get();
  expect(row?.fullName).toBe("stored by engine");
  expect(row?._v).toEqual({ fullName: 1 });
  db.close();
});
it("Prisma query models expose every reference entity and revision field", () => {
  for (const provider of ["postgresql", "mysql", "sqlite"] as const) {
    const schema = prismaSchema({ provider });
    expect(schema).toContain('@@map("polymorfa_leases")');
    expect(schema).toContain('rev BigInt @map("_rev")');
  }
});
describe.skipIf(!native)("real SQL preset boundaries", () => {
  it("Drizzle PostgreSQL reads actual adapter tables", async () => {
    const pool = new Pool(pgOptions);
    try {
      const adapter = postgresAdapter(pool, { tablePrefix: "ormp_" });
      await adapter.setup?.();
      await createStorage(adapter).apply(batch);
      const schema = drizzlePostgresSchema({ tablePrefix: "ormp_" });
      const rows = await pgDrizzle(pool).select().from(schema.contacts!);
      expect(rows[0]?.fullName).toBe("stored by engine");
      expect(rows[0]?._v).toEqual({ fullName: 1 });
    } finally {
      await pool.end();
    }
  });
  it("Drizzle MySQL reads actual adapter tables", async () => {
    const pool = mysql.createPool({ ...pgOptions, port: 55442, user: "root" });
    try {
      const adapter = mysqlAdapter(pool, { tablePrefix: "ormm_" });
      await adapter.setup?.();
      await createStorage(adapter).apply(batch);
      const schema = drizzleMysqlSchema({ tablePrefix: "ormm_" });
      const rows = await mysqlDrizzle(pool).select().from(schema.contacts!);
      expect(rows[0]?.fullName).toBe("stored by engine");
      expect(rows[0]?._v).toEqual({ fullName: 1 });
    } finally {
      await pool.end();
    }
  });
  it("FORCE RLS denies foreign sessions, content writes and membership writes; live revocation takes effect", async () => {
    const pool = new Pool(pgOptions);
    const client = await pool.connect();
    const schema = `zkrls_${Date.now()}`;
    const subject = "00000000-0000-0000-0000-000000000001";
    try {
      await client.query(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='zk_storage_reader') THEN CREATE ROLE zk_storage_reader NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='zk_storage_writer') THEN CREATE ROLE zk_storage_writer NOLOGIN; END IF; END $$;",
      );
      await client.query(
        "CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO zk_storage_reader;",
      );
      await client.query(
        supabasePreset({
          schema,
          tablePrefix: "s_",
          readerRole: "zk_storage_reader",
          serverRole: "zk_storage_writer",
        }),
      );
      const adapter = postgresAdapter(pool, {
        schema,
        tablePrefix: "s_",
        createTables: false,
      });
      const storage = createStorage(adapter);
      await storage.apply(batch);
      await storage.apply({
        ...batch,
        sessionId: "foreign",
        operations: [
          {
            ...batch.operations[0],
            key: { sessionId: "foreign", contactId: "secret" },
          },
        ],
      });
      await client.query("SET ROLE zk_storage_writer");
      await client.query(
        `INSERT INTO "${schema}".s_storage_memberships VALUES ('orm',$1)`,
        [subject],
      );
      await client.query("RESET ROLE");
      await client.query(
        "SELECT set_config('request.jwt.claim.sub',$1,false)",
        [subject],
      );
      await client.query("SET ROLE zk_storage_reader");
      expect(
        (await client.query(`SELECT session_id FROM "${schema}".s_contacts`))
          .rows,
      ).toEqual([{ session_id: "orm" }]);
      await expect(
        client.query(`DELETE FROM "${schema}".s_contacts`),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO "${schema}".s_storage_memberships VALUES ('foreign',$1)`,
          [subject],
        ),
      ).rejects.toThrow();
      const policies = await client.query(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname=$1 AND c.relname='s_contacts'",
        [schema],
      );
      expect(policies.rows).toEqual([
        { relrowsecurity: true, relforcerowsecurity: true },
      ]);
      await client.query("RESET ROLE; SET ROLE zk_storage_writer");
      await client.query(
        `DELETE FROM "${schema}".s_storage_memberships WHERE subject=$1`,
        [subject],
      );
      await client.query("RESET ROLE; SET ROLE zk_storage_reader");
      expect(
        (await client.query(`SELECT * FROM "${schema}".s_contacts`)).rows,
      ).toEqual([]);
    } finally {
      await client.query("RESET ROLE");
      client.release();
      await pool.end();
    }
  }, 30000);
});
