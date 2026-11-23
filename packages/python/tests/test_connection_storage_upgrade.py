"""Existing customer storage is rejected before schema-3 initialization writes."""

import sqlite3
from contextlib import asynccontextmanager

import pytest

from polymorfa.storage.sql import SqlAdapter, SqlResult
from polymorfa.storage.sqlite import sqlite_adapter


class SQLiteDriver:
    dialect = "sqlite"

    def __init__(self, db):
        self.db = db

    @asynccontextmanager
    async def connection(self, *, transaction=False):
        db = self.db

        class Connection:
            async def run(self, statement, params):
                cursor = db.execute(statement, params)
                names = [column[0] for column in cursor.description or []]
                return SqlResult(
                    [dict(zip(names, row, strict=True)) for row in cursor.fetchall()],
                    cursor.rowcount,
                )

        if transaction:
            db.execute("BEGIN")
        try:
            yield Connection()
            if transaction:
                db.commit()
        except BaseException:
            if transaction:
                db.rollback()
            raise

    def is_conflict(self, error):
        return isinstance(error, sqlite3.IntegrityError)

    async def close(self):
        pass


@pytest.fixture(params=["sqlite", "sql-driver"])
def database(request):
    db = sqlite3.connect(":memory:", isolation_level=None)
    adapter = (
        sqlite_adapter(db)
        if request.param == "sqlite"
        else SqlAdapter("sqlite-driver", SQLiteDriver(db))
    )
    yield db, adapter
    db.close()


@pytest.mark.parametrize("version", [2, 4])
async def test_rejected_version_keeps_metadata_rows_and_catalog_unchanged(database, version):
    db, adapter = database
    db.executescript(
        f"CREATE TABLE polymorfa_storage_schema(id text PRIMARY KEY, version integer); INSERT INTO polymorfa_storage_schema VALUES('storage',{version}); CREATE TABLE polymorfa_sessions(_id text, session_id text); INSERT INTO polymorfa_sessions VALUES('retained','unchanged-selector');"
    )
    before = db.execute("SELECT name,sql FROM sqlite_master ORDER BY name").fetchall()
    with pytest.raises(ValueError):
        await adapter.setup()
    assert db.execute("SELECT name,sql FROM sqlite_master ORDER BY name").fetchall() == before
    assert db.execute("SELECT * FROM polymorfa_storage_schema").fetchall() == [("storage", version)]
    assert db.execute("SELECT * FROM polymorfa_sessions").fetchall() == [
        ("retained", "unchanged-selector")
    ]


async def test_unversioned_existing_tables_are_not_blessed_as_fresh_storage(database):
    db, adapter = database
    db.execute("CREATE TABLE polymorfa_messages(_id text)")
    with pytest.raises(ValueError):
        await adapter.setup()
    assert db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall() == [
        ("polymorfa_messages",)
    ]


async def test_an_open_adapter_refuses_reads_after_the_marker_changes(database):
    db, adapter = database
    await adapter.setup()
    db.execute("UPDATE polymorfa_storage_schema SET version=4")
    with pytest.raises(ValueError):
        await adapter.get("connections", [])
    assert db.execute("SELECT version FROM polymorfa_storage_schema").fetchone() == (4,)
