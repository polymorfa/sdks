"""Google Firestore AsyncClient transactions with all reads before writes."""

from __future__ import annotations

from collections.abc import Sequence
from importlib import import_module
from typing import Any, cast

from .core import (
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


class FirestoreAdapter:
    name = "firestore"
    capabilities = StorageCapabilities(True, 250)

    def __init__(
        self,
        client: object,
        *,
        namespace: str,
        close_client: bool = False,
        max_query_rows: int = 100000,
    ) -> None:
        if not 1 <= max_query_rows <= 100000:
            raise ValueError("Invalid storage query read bound")
        self._client = cast(Any, client)
        self._prefix = "polymorfa_" + validate_namespace(namespace) + "_"
        self._close, self._bound = close_client, max_query_rows

    def _collection(self, entity: EntityName) -> Any:
        entity_definition(entity)
        return self._client.collection(self._prefix + entity)

    async def setup(self) -> None:
        pass

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        collection = self._collection(entity)
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identity")
        result = {}
        for offset in range(0, len(ids), 250):
            refs = [collection.document(identity) for identity in ids[offset : offset + 250]]
            async for snapshot in self._client.get_all(refs):
                if snapshot.exists:
                    row = StoredRow.from_wire(entity, snapshot.to_dict())
                    if row.id not in ids or row.id != snapshot.id:
                        raise ValueError("Firestore returned an unrequested storage row")
                    result[row.id] = row
        return result

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 250)
        if not writes:
            return CommitResult(True)
        refs = [
            self._collection(write.entity).document(
                write.row.id if isinstance(write, RowPut) else write.id
            )
            for write in writes
        ]

        async def body(transaction: Any) -> None:
            # Firestore does not permit a read after the first write in a transaction.
            snapshots = {
                snapshot.reference.path: snapshot
                for snapshot in [
                    snapshot
                    async for snapshot in self._client.get_all(refs, transaction=transaction)
                ]
            }
            for write, ref in zip(writes, refs, strict=True):
                identity = write.row.id if isinstance(write, RowPut) else write.id
                # Different entities can share an encoded id: bind by full document path.
                snapshot = snapshots.get(ref.path)
                current = snapshot.to_dict() if snapshot is not None and snapshot.exists else None
                conflict = (
                    (
                        current is not None
                        if write.expected_rev is None
                        else current is None or current.get("_rev") != write.expected_rev
                    )
                    if isinstance(write, RowPut)
                    else write.expected_rev is not None
                    and (current is None or current.get("_rev") != write.expected_rev)
                )
                if conflict:
                    raise _Conflict(identity)
            for write, ref in zip(writes, refs, strict=True):
                if isinstance(write, RowPut):
                    if write.expected_rev is None:
                        transaction.create(ref, write.row.wire())
                    else:
                        transaction.set(ref, write.row.wire())
                else:
                    transaction.delete(ref)

        transactional = import_module(
            "google.cloud.firestore_v1.async_transaction"
        ).async_transactional
        try:
            await transactional(body)(self._client.transaction())
            return CommitResult(True)
        except _Conflict as error:
            return CommitResult(False, (error.identity,))

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        selected = self._collection(entity)
        field_filter = import_module("google.cloud.firestore_v1.base_query").FieldFilter
        for field in index["equals"]:
            selected = selected.where(filter=field_filter(field, "==", query.equals[field]))
        rows: list[StoredRow] = []
        async for snapshot in selected.limit(self._bound + 1).stream():
            if len(rows) == self._bound:
                raise ValueError("The storage index query exceeds the configured read bound")
            rows.append(StoredRow.from_wire(entity, snapshot.to_dict()))
        return filter_rows(entity, rows, query)

    async def close(self) -> None:
        if self._close:
            self._client.close()


def firestore_adapter(
    client: object, *, namespace: str, close_client: bool = False, max_query_rows: int = 100000
) -> FirestoreAdapter:
    return FirestoreAdapter(
        client, namespace=namespace, close_client=close_client, max_query_rows=max_query_rows
    )
