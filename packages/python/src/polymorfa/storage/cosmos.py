"""Azure Cosmos DB atomic namespace-partition batches, with ETag-fenced tombstones."""

from __future__ import annotations

from collections.abc import Sequence
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


class CosmosAdapter:
    name = "cosmos"

    def __init__(self, container: object, *, namespace: str, max_query_rows: int = 100000) -> None:
        if not 1 <= max_query_rows <= 100000:
            raise ValueError("Invalid storage query read bound")
        self._container, self._owner = cast(Any, container), validate_namespace(namespace)
        self._bound, self._ready = max_query_rows, False

    @property
    def capabilities(self) -> StorageCapabilities:
        return StorageCapabilities(self._ready, 100 if self._ready else 0)

    async def setup(self) -> None:
        self._ready = False
        result = await self._container.read()
        if result.get("partitionKey", {}).get("paths") != ["/namespace"]:
            raise ValueError("Cosmos storage requires the /namespace partition key")
        self._ready = True

    def _check(self, entity: EntityName) -> None:
        entity_definition(entity)
        if not self._ready:
            raise ValueError("Verify the Cosmos partition key with setup() before use")

    async def _read(self, entity: EntityName, identity: str) -> dict[str, Any] | None:
        self._check(entity)
        if not isinstance(identity, str) or not identity:
            raise ValueError("Invalid storage row identity")
        try:
            doc = await self._container.read_item(
                entity + ":" + identity, partition_key=self._owner
            )
        except Exception as error:
            if getattr(error, "status_code", None) == 404:
                return None
            raise
        if (
            not isinstance(doc, dict)
            or doc.get("namespace") != self._owner
            or doc.get("entity") != entity
            or doc.get("id") != entity + ":" + identity
            or not isinstance(doc.get("deleted"), bool)
        ):
            raise ValueError("Cosmos returned a foreign storage document")
        if not doc["deleted"]:
            row = StoredRow.from_wire(entity, doc.get("row"))
            if row.id != identity:
                raise ValueError("Cosmos returned an unrequested storage row")
        return doc

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        self._check(entity)
        result = {}
        for identity in ids:
            doc = await self._read(entity, identity)
            if doc and not doc["deleted"]:
                result[identity] = StoredRow.from_wire(entity, doc["row"])
        return result

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, self.capabilities.max_commit_size)
        if not self._ready:
            raise ValueError("Verify the Cosmos partition key with setup() before use")
        operations: list[tuple[object, ...]] = []
        for write in writes:
            identity = write.row.id if isinstance(write, RowPut) else write.id
            current = await self._read(write.entity, identity)
            row = current.get("row") if current and not current["deleted"] else None
            conflict = (
                (
                    row is not None
                    if write.expected_rev is None
                    else row is None or row.get("_rev") != write.expected_rev
                )
                if isinstance(write, RowPut)
                else write.expected_rev is not None
                and (row is None or row.get("_rev") != write.expected_rev)
            )
            if conflict:
                return CommitResult(False, (identity,))
            if not current and not isinstance(write, RowPut):
                continue
            doc = {
                "id": write.entity + ":" + identity,
                "namespace": self._owner,
                "entity": write.entity,
                "row": write.row.wire() if isinstance(write, RowPut) else None,
                "deleted": not isinstance(write, RowPut),
            }
            if current:
                etag = current.get("_etag")
                if not isinstance(etag, str) or not etag:
                    raise ValueError("Cosmos did not provide an ETag for a conditional write")
                operations.append(("replace", (doc["id"], doc), {"if_match_etag": etag}))
            else:
                operations.append(("create", (doc,)))
        if not operations:
            return CommitResult(True)
        try:
            results = await self._container.execute_item_batch(
                batch_operations=operations, partition_key=self._owner
            )
        except Exception as error:
            if getattr(error, "status_code", None) in (404, 409, 412, 449):
                return CommitResult(
                    False,
                    tuple(
                        write.row.id if isinstance(write, RowPut) else write.id for write in writes
                    ),
                )
            raise
        if (
            not isinstance(results, list)
            or len(results) != len(operations)
            or any(
                not isinstance(result, dict)
                or type(result.get("statusCode")) is not int
                or not 200 <= result["statusCode"] < 300
                for result in results
            )
        ):
            raise ValueError("Cosmos rejected an atomic batch")
        return CommitResult(True)

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        self._check(entity)
        index_of(entity, query)
        iterator = self._container.query_items(
            query="SELECT * FROM c WHERE c.namespace=@namespace AND c.entity=@entity AND c.deleted=false",
            parameters=[
                {"name": "@namespace", "value": self._owner},
                {"name": "@entity", "value": entity},
            ],
            partition_key=self._owner,
        )
        rows: list[StoredRow] = []
        async for doc in iterator:
            if len(rows) == self._bound:
                raise ValueError("The storage index query exceeds the configured read bound")
            if (
                doc.get("namespace") != self._owner
                or doc.get("entity") != entity
                or doc.get("deleted") is not False
            ):
                raise ValueError("Cosmos returned a foreign storage document")
            row = StoredRow.from_wire(entity, doc.get("row"))
            if doc.get("id") != entity + ":" + row.id:
                raise ValueError("Cosmos returned an invalid storage identity")
            rows.append(row)
        return filter_rows(entity, rows, query)

    async def close(self) -> None:
        self._ready = False


def cosmos_adapter(
    container: object, *, namespace: str, max_query_rows: int = 100000
) -> CosmosAdapter:
    return CosmosAdapter(container, namespace=namespace, max_query_rows=max_query_rows)
