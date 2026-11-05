"""Schema2 customer-owned storage contract, pinned to TypeScript 3bacf46."""

from __future__ import annotations

import copy
import json
import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from importlib.resources import files
from typing import Literal, Protocol, TypeAlias, cast
from urllib.parse import quote

from typing_extensions import TypedDict

from ..transport import Json

EntityName: TypeAlias = Literal[
    "sessions",
    "chats",
    "messages",
    "reactions",
    "receipts",
    "poll_votes",
    "contacts",
    "groups",
    "group_participants",
    "media",
    "labels",
    "label_associations",
    "history_chunks",
    "history_progress",
    "checkpoints",
    "events",
    "leases",
]
FieldType = Literal["string", "number", "boolean", "json"]
STORAGE_SCHEMA_VERSION = 2
FINAL_VERSION = 2**53 - 1


class IndexDefinition(TypedDict):
    name: str
    equals: list[str]
    sort: str


class EntityDefinition(TypedDict):
    name: EntityName
    key: list[str]
    fields: dict[str, FieldType]
    indexes: list[IndexDefinition]


STORAGE_SCHEMA = cast(
    dict[EntityName, EntityDefinition],
    json.loads(files(__package__).joinpath("schema.json").read_text()),
)
ENTITY_NAMES: tuple[EntityName, ...] = tuple(STORAGE_SCHEMA)


def entity_definition(entity: EntityName) -> EntityDefinition:
    if entity not in STORAGE_SCHEMA:
        raise ValueError("Unknown storage entity")
    return STORAGE_SCHEMA[entity]


def namespace(value: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}", value) is None:
        raise ValueError("A trusted customer-owned storage namespace is required")
    return value


def encode_key(entity: EntityName, key: Mapping[str, object]) -> str:
    values = []
    for name in entity_definition(entity)["key"]:
        value = key.get(name)
        if not isinstance(value, str) or not value:
            raise ValueError("Storage keys must contain nonempty strings")
        values.append(quote(value, safe="!'()*-_").replace(".", "%2E"))
    return "k" + ":".join(values)


def canonical_json(value: Json) -> str:
    # UTF-16 ordering matches JS string comparison, including non-BMP field keys.
    if isinstance(value, dict):
        return (
            "{"
            + ",".join(
                json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
                for key in sorted(value, key=lambda item: item.encode("utf-16-be", "surrogatepass"))
            )
            + "}"
        )
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if not isinstance(value, bool) and isinstance(value, (int, float)):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError("Storage JSON numbers must be finite")
        if numeric == 0:
            return "0"
        decimal = Decimal(repr(numeric))
        if 1e-6 <= abs(numeric) < 1e21:
            text = format(decimal, "f")
            return text.rstrip("0").rstrip(".") if "." in text else text
        mantissa, exponent = format(decimal.normalize(), "e").split("e")
        exponent_number = int(exponent)
        return mantissa + "e" + ("+" if exponent_number >= 0 else "-") + str(abs(exponent_number))
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def compare_values(left: Json, right: Json) -> int:
    def rank(value: Json) -> int:
        return (
            -1
            if value is None
            else 0
            if isinstance(value, bool)
            else 1
            if isinstance(value, (int, float))
            else 2
            if isinstance(value, str)
            else 3
        )

    a, b = rank(left), rank(right)
    if a != b:
        return (a > b) - (a < b)
    if a == -1:
        return 0
    if a in (0, 1):
        av, bv = cast(float, left), cast(float, right)
        return (av > bv) - (av < bv)
    text_a = left if isinstance(left, str) else canonical_json(left)
    text_b = right if isinstance(right, str) else canonical_json(right)
    aa, bb = (
        text_a.encode("utf-16-be", "surrogatepass"),
        text_b.encode("utf-16-be", "surrogatepass"),
    )
    return (aa > bb) - (aa < bb)


def finite(value: object) -> bool:
    try:
        return (
            not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
        )
    except OverflowError:
        return False


def value_matches_type(value: Json, kind: FieldType) -> bool:
    return (
        value is None
        or kind == "json"
        or kind == "boolean"
        and isinstance(value, bool)
        or kind == "number"
        and finite(value)
        or kind == "string"
        and isinstance(value, str)
    )


@dataclass(frozen=True)
class FieldWrite:
    value: Json = field(repr=False)
    version: float


@dataclass(frozen=True)
class StoredRow:
    id: str
    revision: int
    versions: dict[str, float]
    values: dict[str, Json] = field(repr=False)

    def wire(self) -> dict[str, Json]:
        return {
            **copy.deepcopy(self.values),
            "_id": self.id,
            "_rev": self.revision,
            "_v": cast(dict[str, Json], dict(self.versions)),
        }

    @classmethod
    def from_wire(cls, entity: EntityName, value: object) -> StoredRow:
        if not isinstance(value, dict):
            raise TypeError("Storage returned an invalid row")
        identity, revision, versions = value.get("_id"), value.get("_rev"), value.get("_v")
        definition = entity_definition(entity)
        if (
            not isinstance(identity, str)
            or identity != encode_key(entity, value)
            or isinstance(revision, bool)
            or not isinstance(revision, int)
            or not 1 <= revision <= FINAL_VERSION
            or not isinstance(versions, dict)
            or any(
                name not in definition["fields"] or not finite(number)
                for name, number in versions.items()
            )
        ):
            raise ValueError("Storage returned an invalid row identity or revision")
        if set(value) - {"_id", "_rev", "_v", *definition["key"], *definition["fields"]}:
            raise ValueError("Storage returned unknown fields")
        data = cast(
            dict[str, Json],
            {name: value.get(name) for name in (*definition["key"], *definition["fields"])},
        )
        if any(
            not value_matches_type(data.get(name), kind)
            for name, kind in definition["fields"].items()
        ):
            raise ValueError("Storage returned invalid field types")
        canonical_json(data)
        return cls(identity, revision, cast(dict[str, float], versions), copy.deepcopy(data))


def empty_row(entity: EntityName, key: Mapping[str, str]) -> StoredRow:
    definition = entity_definition(entity)
    values: dict[str, Json] = {name: key[name] for name in definition["key"]}
    values.update({name: None for name in definition["fields"]})
    for index in definition["indexes"]:
        values[index["sort"]] = 0
    return StoredRow(encode_key(entity, key), 0, {}, values)


def merge_fields(entity: EntityName, row: StoredRow, fields: Mapping[str, FieldWrite]) -> StoredRow:
    values, versions = copy.deepcopy(row.values), dict(row.versions)
    definition = entity_definition(entity)
    for name, write in fields.items():
        kind = definition["fields"].get(name)
        if kind is None or not finite(write.version) or not value_matches_type(write.value, kind):
            raise ValueError("Invalid storage field write")
        canonical_json(write.value)
        prior = versions.get(name)
        if (
            prior is None
            or write.version > prior
            or write.version == prior
            and compare_values(write.value, values.get(name)) > 0
        ):
            values[name], versions[name] = copy.deepcopy(write.value), write.version
    return StoredRow(row.id, row.revision, versions, values)


@dataclass(frozen=True)
class ChatWatermarkGuard:
    session_id: str
    chat_id: str
    timestamp: float


@dataclass(frozen=True)
class Upsert:
    entity: EntityName
    key: Mapping[str, str]
    fields: Mapping[str, FieldWrite]
    guard: ChatWatermarkGuard | None = None


@dataclass(frozen=True)
class Patch(Upsert):
    pass


@dataclass(frozen=True)
class Delete:
    entity: EntityName
    key: Mapping[str, str]


@dataclass(frozen=True)
class ClearChat:
    session_id: str
    chat_id: str
    up_to: float


class Unset(Enum):
    VALUE = 0


@dataclass(frozen=True)
class Checkpoint:
    session_id: str
    stream: str
    cursor: str
    expected_cursor: str | None | Unset = Unset.VALUE
    position: Json = None
    updated_at: float | None = None


StorageOperation: TypeAlias = Upsert | Patch | Delete | ClearChat | Checkpoint


@dataclass(frozen=True)
class OperationBatch:
    session_id: str
    operations: Sequence[StorageOperation]
    event_id: str | None = None
    event_type: str | None = None


@dataclass(frozen=True)
class RowPut:
    entity: EntityName
    row: StoredRow
    expected_rev: int | None


@dataclass(frozen=True)
class RowDelete:
    entity: EntityName
    id: str
    expected_rev: int | None = None


RowWrite: TypeAlias = RowPut | RowDelete


@dataclass(frozen=True)
class CommitResult:
    ok: bool
    conflicts: tuple[str, ...] = ()


@dataclass(frozen=True)
class IndexRange:
    gt: float | None = None
    gte: float | None = None
    lt: float | None = None
    lte: float | None = None


@dataclass(frozen=True)
class QueryCursor:
    sort: float
    id: str


@dataclass(frozen=True)
class IndexQuery:
    index: str
    equals: Mapping[str, str]
    limit: int
    order: Literal["asc", "desc"] = "asc"
    range: IndexRange = field(default_factory=IndexRange)
    after: QueryCursor | None = None


@dataclass(frozen=True)
class StorageCapabilities:
    atomic_commit: bool
    max_commit_size: int


class StorageAdapter(Protocol):
    @property
    def name(self) -> str: ...
    @property
    def capabilities(self) -> StorageCapabilities: ...
    async def setup(self) -> None: ...
    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]: ...
    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult: ...
    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]: ...
    async def close(self) -> None: ...


def validate_commit(writes: Sequence[RowWrite], maximum: int) -> None:
    if len(writes) > maximum:
        raise ValueError("Atomic storage commit exceeds adapter capacity")
    seen = set()
    for write in writes:
        identity = write.row.id if isinstance(write, RowPut) else write.id
        if (write.entity, identity) in seen:
            raise ValueError("A storage commit cannot write a row twice")
        seen.add((write.entity, identity))
        entity_definition(write.entity)
        if isinstance(write, RowPut):
            StoredRow.from_wire(write.entity, write.row.wire())
        if write.expected_rev is not None and (
            isinstance(write.expected_rev, bool)
            or not isinstance(write.expected_rev, int)
            or not 1 <= write.expected_rev <= FINAL_VERSION
        ):
            raise ValueError("Invalid expected storage revision")


def index_of(entity: EntityName, query: IndexQuery) -> IndexDefinition:
    index = next(
        (item for item in entity_definition(entity)["indexes"] if item["name"] == query.index), None
    )
    if index is None or any(
        not isinstance(query.equals.get(name), str) or not query.equals[name]
        for name in index["equals"]
    ):
        raise ValueError("A storage index and all scope values are required")
    if (
        isinstance(query.limit, bool)
        or not isinstance(query.limit, int)
        or not 0 <= query.limit <= 100000
        or query.order not in ("asc", "desc")
    ):
        raise ValueError("Invalid storage query bounds")
    if (
        any(
            number is not None and not finite(number)
            for number in (query.range.gt, query.range.gte, query.range.lt, query.range.lte)
        )
        or query.after is not None
        and (
            not finite(query.after.sort)
            or not isinstance(query.after.id, str)
            or not query.after.id
        )
    ):
        raise ValueError("Invalid storage query cursor or range")
    return index


def filter_rows(
    entity: EntityName, rows: Sequence[StoredRow], query: IndexQuery
) -> list[StoredRow]:
    index = index_of(entity, query)
    result = []
    for row in rows:
        if any(row.values.get(name) != query.equals[name] for name in index["equals"]):
            continue
        number = cast(float, row.values.get(index["sort"], 0) or 0)
        bounds = query.range
        if (
            bounds.gt is not None
            and number <= bounds.gt
            or bounds.gte is not None
            and number < bounds.gte
            or bounds.lt is not None
            and number >= bounds.lt
            or bounds.lte is not None
            and number > bounds.lte
        ):
            continue
        if query.after is not None:
            comparison = (number, row.id.encode("utf-16-be"))
            previous = (query.after.sort, query.after.id.encode("utf-16-be"))
            if (
                query.order == "desc"
                and comparison >= previous
                or query.order == "asc"
                and comparison <= previous
            ):
                continue
        result.append(row)
    result.sort(
        key=lambda row: (row.values.get(index["sort"], 0) or 0, row.id.encode("utf-16-be")),
        reverse=query.order == "desc",
    )
    return copy.deepcopy(result[: query.limit])
