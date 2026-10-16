import copy
import json
import os
import secrets
from dataclasses import replace
from pathlib import Path

import pytest

from polymorfa.storage import (
    FieldWrite,
    IndexQuery,
    OperationBatch,
    RowPut,
    Storage,
    Upsert,
    encode_key,
)
from polymorfa.storage.core import empty_row
from polymorfa.storage.reduce_events import reduce_event
from polymorfa.storage.reduce_history import reduce_history_chunk
from polymorfa.storage.sql import (
    libsql_adapter,
    mysql_adapter,
    postgres_adapter,
    sql_schema_statements,
)
from polymorfa.storage.supabase import supabase_preset
from polymorfa.webhooks import WebhookEvent

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/storage/conformance-fixtures.json").read_text())
ARTIFACTS = Path(
    os.environ.get(
        "SDK_TEST_ARTIFACT_DIR",
        str(Path.home() / ".polymorfa-agent-work/zk-program-20261014/python-storage-tests"),
    )
)
ARTIFACTS = ARTIFACTS / "storage-sql"


@pytest.fixture(params=["postgres", "mysql", "libsql"])
async def native_sql(request):
    if not os.getenv("POLYMORFA_TEST_NATIVE_SQL"):
        pytest.skip("Requires application-owned native SQL fixtures and optional drivers")
    prefix = "python_" + secrets.token_hex(8) + "_"
    if request.param == "postgres":
        import asyncpg

        client = await asyncpg.create_pool(
            host="127.0.0.1",
            port=int(os.environ["POLYMORFA_TEST_POSTGRES_PORT"]),
            user="postgres",
            database="postgres",
        )
        native = postgres_adapter(client, table_prefix=prefix)
    elif request.param == "mysql":
        import aiomysql

        client = await aiomysql.create_pool(
            host="127.0.0.1",
            port=int(os.environ["POLYMORFA_TEST_MYSQL_PORT"]),
            user="root",
            db="storage",
            autocommit=True,
        )
        native = mysql_adapter(client, table_prefix=prefix)
    else:
        import libsql_client

        path = ARTIFACTS / (prefix + ".sqlite")
        client = libsql_client.create_client("file:" + str(path))
        native = libsql_adapter(client, table_prefix=prefix)
    await native.setup()
    yield native
    await native.close()
    # Adapter borrows the driver; teardown belongs to this test's application.
    if request.param == "mysql":
        client.close()
        await client.wait_closed()
    else:
        await client.close()
    if request.param == "libsql":
        path.unlink(missing_ok=True)


@pytest.mark.parametrize("kind", ["events", "history"])
async def test_actual_native_sql_independent_schema2_conformance(native_sql, kind):
    storage = Storage(native_sql)
    if kind == "events":
        for value in FIXTURE["events"]:
            event = WebhookEvent(
                value["id"],
                value["session"],
                value["timestamp"],
                value["event"],
                value["payload"],
                value,
                True,
            )
            await storage.apply(reduce_event(event))
        expected = FIXTURE["eventRows"]
    else:
        batch = reduce_history_chunk("portable-fixture", FIXTURE["history"], chunk_id="chunk")
        assert (await storage.apply(batch)).applied
        assert not (await storage.apply(batch)).applied
        expected = FIXTURE["historyRows"]
    for entity, rows in expected.items():
        current = await native_sql.get(entity, [encode_key(entity, row) for row in rows])
        assert [row.values for row in sorted(current.values(), key=lambda row: row.id)] == sorted(
            rows, key=lambda row: encode_key(entity, row)
        )


async def test_actual_native_sql_atomic_rollback_and_conditional_delete(native_sql):
    one = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    two = replace(empty_row("messages", {"sessionId": "s", "messageId": "two"}), revision=1)
    assert (await native_sql.commit([RowPut("messages", one, None)])).ok
    result = await native_sql.commit(
        [RowPut("messages", two, None), RowPut("messages", replace(one, revision=2), 8)]
    )
    assert not result.ok and two.id not in await native_sql.get("messages", [two.id])
    assert (await native_sql.get("messages", [one.id]))[one.id].revision == 1
    duplicate = await native_sql.commit(
        [RowPut("messages", two, None), RowPut("messages", one, None)]
    )
    assert not duplicate.ok and two.id not in await native_sql.get("messages", [two.id])
    storage = Storage(native_sql)
    await storage.apply(
        OperationBatch(
            "s",
            [
                Upsert(
                    "messages",
                    {"sessionId": "s", "messageId": "one"},
                    {"text": FieldWrite("edited", 2)},
                )
            ],
        )
    )
    assert (await storage.get("messages", {"sessionId": "s", "messageId": "one"}))[
        "text"
    ] == "edited"


async def test_actual_native_sql_history_2000(native_sql):
    chunk = copy.deepcopy(FIXTURE["history"])
    template = chunk["conversations"][0]["messages"][0]
    for chat_index, conversation in enumerate(chunk["conversations"]):
        conversation["messages"] = []
        for index in range(100):
            message = copy.deepcopy(template)
            message["message"]["key"]["id"] = f"large-{chat_index}-{index}"
            message["message"]["key"]["remoteJid"] = conversation["id"]
            conversation["messages"].append(message)
    storage = Storage(native_sql)
    assert (await storage.apply(reduce_history_chunk("s", chunk, chunk_id="large"))).applied
    total = 0
    for conversation in chunk["conversations"]:
        page = await storage.query(
            "messages",
            IndexQuery("by_chat", {"sessionId": "s", "chatId": "wa:" + conversation["id"]}, 1000),
        )
        total += len(page.rows)
    assert total == 2000


@pytest.mark.parametrize("dialect", ["postgres", "mysql", "sqlite"])
def test_sql_naming_rejects_untrusted_identifiers(dialect):
    with pytest.raises(ValueError):
        sql_schema_statements(dialect, table_prefix='bad"; DROP TABLE messages;')
    if dialect != "postgres":
        with pytest.raises(ValueError):
            sql_schema_statements(dialect, schema="public")


def test_supabase_force_rls_and_live_membership_select_only():
    sql = supabase_preset()
    assert sql.count("FORCE ROW LEVEL SECURITY") == 18
    assert sql.count('FOR SELECT TO "authenticated"') == 18
    assert "m.subject=auth.uid()" in sql
    assert "GRANT SELECT,INSERT,UPDATE,DELETE" in sql
    assert "DO UPDATE SET version" not in sql
    for role in ("authenticated", "anon", "public"):
        with pytest.raises(ValueError):
            supabase_preset(server_role=role)


async def test_actual_postgres_supabase_live_rls_and_distinct_writer():
    if not os.getenv("POLYMORFA_TEST_NATIVE_SQL"):
        pytest.skip("Requires the application-owned PostgreSQL fixture")
    import uuid

    import asyncpg

    pool = await asyncpg.create_pool(
        host="127.0.0.1",
        port=int(os.environ["POLYMORFA_TEST_POSTGRES_PORT"]),
        user="postgres",
        database="postgres",
    )
    suffix = secrets.token_hex(8)
    schema, writer, reader = "rls_" + suffix, "writer_" + suffix, "reader_" + suffix
    subject = str(uuid.uuid4())
    native = postgres_adapter(pool, schema=schema)
    try:
        async with pool.acquire() as connection:
            await connection.execute(
                f'CREATE ROLE "{writer}" NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE "{reader}" NOLOGIN NOSUPERUSER NOBYPASSRLS'
            )
            await connection.execute(
                "CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$"
            )
            await connection.execute(f'GRANT USAGE ON SCHEMA auth TO "{reader}"')
            await connection.execute(
                supabase_preset(schema=schema, server_role=writer, reader_role=reader)
            )
            await connection.execute(f'SET ROLE "{writer}"')
            # The writer can inspect schema version, but cannot alter it or memberships as a reader.
            assert (
                await connection.fetchval(
                    f'SELECT version FROM "{schema}".polymorfa_storage_schema'
                )
                == 2
            )
            await connection.execute(
                f'INSERT INTO "{schema}".polymorfa_storage_memberships(session_id,subject) VALUES($1,$2::uuid)',
                "s",
                subject,
            )
            await connection.execute("RESET ROLE")
        await native.setup()
        one = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
        two = replace(
            empty_row("messages", {"sessionId": "foreign", "messageId": "two"}), revision=1
        )
        assert (
            await native.commit([RowPut("messages", one, None), RowPut("messages", two, None)])
        ).ok
        async with pool.acquire() as connection:
            await connection.execute(f'SET ROLE "{reader}"')
            await connection.fetchval(
                "SELECT set_config('request.jwt.claim.sub',$1,false)", subject
            )
            assert len(await connection.fetch(f'SELECT * FROM "{schema}".polymorfa_messages')) == 1
            for statement in (
                f'DELETE FROM "{schema}".polymorfa_messages',
                f'DELETE FROM "{schema}".polymorfa_storage_memberships',
            ):
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await connection.execute(statement)
            await connection.execute("RESET ROLE")
            await connection.execute(
                f'DELETE FROM "{schema}".polymorfa_storage_memberships WHERE session_id=$1', "s"
            )
            await connection.execute(f'SET ROLE "{reader}"')
            assert not await connection.fetch(f'SELECT * FROM "{schema}".polymorfa_messages')
            await connection.execute("RESET ROLE")
    finally:
        await native.close()
        await pool.close()
