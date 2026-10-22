"""DynamoDB conditional transactions through an application-owned aioboto3 client."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping, Sequence
from decimal import Decimal
from importlib import import_module
from typing import Any, cast

from ..transport import Json
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


def _decimal(value: Json) -> object:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: _decimal(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_decimal(item) for item in value]
    return value


def _json(value: object) -> Json:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {key: _json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json(item) for item in value]
    return cast(Json, value)


class DynamodbAdapter:
    name = "dynamodb"
    capabilities = StorageCapabilities(True, 100)

    def __init__(
        self,
        client: object,
        *,
        namespace: str,
        table_name: str,
        create_table: bool = False,
        close_client: bool = False,
        max_query_rows: int = 100000,
    ) -> None:
        if (
            re.fullmatch(r"[a-zA-Z0-9_.-]{3,255}", table_name) is None
            or not 1 <= max_query_rows <= 100000
        ):
            raise ValueError("Invalid DynamoDB table or read bound")
        self._client = cast(Any, client)
        self._owner, self._table = validate_namespace(namespace), table_name
        self._create, self._close, self._bound = create_table, close_client, max_query_rows
        types = import_module("boto3.dynamodb.types")
        self._serializer, self._deserializer = types.TypeSerializer(), types.TypeDeserializer()

    def _serialize(self, value: Mapping[str, Json]) -> dict[str, object]:
        return {key: self._serializer.serialize(_decimal(item)) for key, item in value.items()}

    def _partition(self, entity: EntityName) -> str:
        entity_definition(entity)
        return self._owner + ":" + entity

    def _key(self, entity: EntityName, identity: str) -> dict[str, object]:
        return self._serialize({"pk": self._partition(entity), "sk": identity})

    def _row(self, entity: EntityName, value: Mapping[str, object]) -> StoredRow:
        decoded = {key: _json(self._deserializer.deserialize(item)) for key, item in value.items()}
        row = StoredRow.from_wire(entity, decoded.get("row"))
        if decoded.get("pk") != self._partition(entity) or decoded.get("sk") != row.id:
            raise ValueError("DynamoDB returned a foreign storage row")
        return row

    async def setup(self) -> None:
        try:
            result = await self._client.describe_table(TableName=self._table)
        except Exception as error:
            response = getattr(error, "response", {})
            if (
                response.get("Error", {}).get("Code") != "ResourceNotFoundException"
                or not self._create
            ):
                raise
            await self._client.create_table(
                TableName=self._table,
                KeySchema=[
                    {"AttributeName": "pk", "KeyType": "HASH"},
                    {"AttributeName": "sk", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "pk", "AttributeType": "S"},
                    {"AttributeName": "sk", "AttributeType": "S"},
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            await self._client.get_waiter("table_exists").wait(TableName=self._table)
            result = await self._client.describe_table(TableName=self._table)
        table = result.get("Table", {})
        keys = {
            (item.get("AttributeName"), item.get("KeyType")) for item in table.get("KeySchema", [])
        }
        kinds = {
            item.get("AttributeName"): item.get("AttributeType")
            for item in table.get("AttributeDefinitions", [])
        }
        if (
            keys != {("pk", "HASH"), ("sk", "RANGE")}
            or kinds.get("pk") != "S"
            or kinds.get("sk") != "S"
        ):
            raise ValueError("DynamoDB storage requires string pk/sk keys")

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        entity_definition(entity)
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identity")
        result = {}
        for offset in range(0, len(ids), 100):
            pending = {
                self._table: {
                    "Keys": [
                        self._key(entity, identity)
                        for identity in dict.fromkeys(ids[offset : offset + 100])
                    ],
                    "ConsistentRead": True,
                }
            }
            for attempt in range(8):
                if not pending:
                    break
                response = await self._client.batch_get_item(RequestItems=pending)
                for raw in response.get("Responses", {}).get(self._table, []):
                    row = self._row(entity, raw)
                    if row.id not in ids:
                        raise ValueError("DynamoDB returned an unrequested row")
                    result[row.id] = row
                pending = response.get("UnprocessedKeys", {})
                if pending:
                    await asyncio.sleep(min(0.5, 0.01 * 2**attempt))
            if pending:
                raise RuntimeError("DynamoDB left storage reads unprocessed")
        return result

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 100)
        operations = []
        for write in writes:
            identity = write.row.id if isinstance(write, RowPut) else write.id
            body: dict[str, object] = {"TableName": self._table}
            if isinstance(write, RowPut) and write.expected_rev is None:
                body["ConditionExpression"] = "attribute_not_exists(pk)"
            elif write.expected_rev is not None:
                body.update(
                    ConditionExpression="#row.#rev = :rev",
                    ExpressionAttributeNames={"#row": "row", "#rev": "_rev"},
                    ExpressionAttributeValues=self._serialize({":rev": write.expected_rev}),
                )
            if isinstance(write, RowPut):
                body["Item"] = self._serialize(
                    {"pk": self._partition(write.entity), "sk": identity, "row": write.row.wire()}
                )
                operations.append({"Put": body})
            else:
                body["Key"] = self._key(write.entity, identity)
                operations.append({"Delete": body})
        if not operations:
            return CommitResult(True)
        try:
            await self._client.transact_write_items(TransactItems=operations)
            return CommitResult(True)
        except Exception as error:
            response = getattr(error, "response", {})
            if response.get("Error", {}).get("Code") == "TransactionCanceledException" and any(
                reason.get("Code") in ("ConditionalCheckFailed", "TransactionConflict")
                for reason in response.get("CancellationReasons", [])
            ):
                return CommitResult(
                    False,
                    tuple(
                        write.row.id if isinstance(write, RowPut) else write.id for write in writes
                    ),
                )
            raise

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index_of(entity, query)
        rows: list[StoredRow] = []
        cursor = None
        while True:
            options: dict[str, object] = {"ExclusiveStartKey": cursor} if cursor else {}
            response = await self._client.query(
                TableName=self._table,
                KeyConditionExpression="pk = :pk",
                ExpressionAttributeValues=self._serialize({":pk": self._partition(entity)}),
                ConsistentRead=True,
                **options,
            )
            for raw in response.get("Items", []):
                if len(rows) == self._bound:
                    raise ValueError("The storage index query exceeds the configured read bound")
                rows.append(self._row(entity, raw))
            cursor = response.get("LastEvaluatedKey")
            if not cursor:
                return filter_rows(entity, rows, query)

    async def close(self) -> None:
        if self._close:
            await self._client.close()


def dynamodb_adapter(
    client: object,
    *,
    namespace: str,
    table_name: str,
    create_table: bool = False,
    close_client: bool = False,
    max_query_rows: int = 100000,
) -> DynamodbAdapter:
    return DynamodbAdapter(
        client,
        namespace=namespace,
        table_name=table_name,
        create_table=create_table,
        close_client=close_client,
        max_query_rows=max_query_rows,
    )
