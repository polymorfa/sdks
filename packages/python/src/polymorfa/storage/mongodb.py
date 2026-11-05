"""PyMongo asynchronous multi-document transactions, scoped to a trusted namespace."""

from __future__ import annotations

from collections.abc import Sequence
from importlib import import_module
from typing import Any, cast

from .core import (
    ENTITY_NAMES,
    CommitResult,
    EntityName,
    IndexQuery,
    RowPut,
    RowWrite,
    StorageCapabilities,
    StoredRow,
    entity_definition,
    filter_rows,
    index_of,
    validate_commit,
)
from .core import (
    namespace as validate_namespace,
)


class _Conflict(Exception):
    def __init__(self, identity: str) -> None:
        self.identity = identity


class MongodbAdapter:
    name = "mongodb"
    capabilities = StorageCapabilities(True, 500)

    def __init__(
        self,
        client: object,
        database: object,
        *,
        namespace: str,
        create_indexes: bool = True,
        close_client: bool = False,
        max_query_rows: int = 100000,
    ) -> None:
        if not 1 <= max_query_rows <= 100000:
            raise ValueError("Invalid storage query read bound")
        self._client, self._database = cast(Any, client), cast(Any, database)
        self._prefix = "polymorfa_" + validate_namespace(namespace) + "_"
        self._create, self._close, self._bound = create_indexes, close_client, max_query_rows

    def _collection(self, entity: EntityName) -> Any:
        entity_definition(entity)
        return self._database[self._prefix + entity]

    async def setup(self) -> None:
        if self._create:
            for entity in ENTITY_NAMES:
                for index in entity_definition(entity)["indexes"]:
                    await self._collection(entity).create_index(
                        [(field, 1) for field in (*index["equals"], index["sort"], "_id")],
                        name=index["name"],
                    )

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identity")
        result = {}
        for offset in range(0, len(ids), 1000):
            cursor = self._collection(entity).find(
                {"_id": {"$in": list(ids[offset : offset + 1000])}}
            )
            async for raw in cursor:
                row = StoredRow.from_wire(entity, raw)
                if row.id not in ids:
                    raise ValueError("MongoDB returned an unrequested row")
                result[row.id] = row
        return result

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 500)
        if not writes:
            return CommitResult(True)

        async def body(session: Any) -> None:
            for write in writes:
                identity = write.row.id if isinstance(write, RowPut) else write.id
                collection = self._collection(write.entity)
                current = await collection.find_one({"_id": identity}, session=session)
                if isinstance(write, RowPut):
                    if write.expected_rev is None:
                        if current is not None:
                            raise _Conflict(identity)
                        await collection.insert_one(write.row.wire(), session=session)
                    else:
                        result = await collection.replace_one(
                            {"_id": identity, "_rev": write.expected_rev},
                            write.row.wire(),
                            session=session,
                        )
                        if result.matched_count != 1:
                            raise _Conflict(identity)
                else:
                    if write.expected_rev is not None and (
                        current is None or current.get("_rev") != write.expected_rev
                    ):
                        raise _Conflict(identity)
                    condition: dict[str, object] = {"_id": identity}
                    if write.expected_rev is not None:
                        condition["_rev"] = write.expected_rev
                    result = await collection.delete_one(condition, session=session)
                    if write.expected_rev is not None and result.deleted_count != 1:
                        raise _Conflict(identity)

        concerns = import_module("pymongo.read_concern"), import_module("pymongo.write_concern")
        try:
            async with self._client.start_session() as session:
                await session.with_transaction(
                    body,
                    read_concern=concerns[0].ReadConcern("snapshot"),
                    write_concern=concerns[1].WriteConcern("majority"),
                )
            return CommitResult(True)
        except _Conflict as error:
            return CommitResult(False, (error.identity,))
        except Exception as error:
            if getattr(error, "code", None) == 11000:
                return CommitResult(
                    False,
                    tuple(
                        write.row.id if isinstance(write, RowPut) else write.id for write in writes
                    ),
                )
            raise

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        cursor = (
            self._collection(entity)
            .find({field: query.equals[field] for field in index["equals"]})
            .limit(self._bound + 1)
        )
        rows: list[StoredRow] = []
        async for raw in cursor:
            if len(rows) == self._bound:
                raise ValueError("The storage index query exceeds the configured read bound")
            rows.append(StoredRow.from_wire(entity, raw))
        return filter_rows(entity, rows, query)

    async def close(self) -> None:
        if self._close:
            await self._client.close()


def mongodb_adapter(
    client: object,
    database: object,
    *,
    namespace: str,
    create_indexes: bool = True,
    close_client: bool = False,
    max_query_rows: int = 100000,
) -> MongodbAdapter:
    """Borrow a PyMongo AsyncMongoClient and its database. Replica-set transactions are required."""
    return MongodbAdapter(
        client,
        database,
        namespace=namespace,
        create_indexes=create_indexes,
        close_client=close_client,
        max_query_rows=max_query_rows,
    )
