//! Shared merge engine; durable lease fences are included in every adapter commit.
use super::{
    merge::{canonical_json, empty_row, merge_fields, public_row},
    schema::encode_key,
    *,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
    time::{Duration, Instant},
};
#[derive(Clone)]
pub struct StorageOptions {
    pub max_retries: usize,
    pub clear_page_size: usize,
    pub lease_duration: Duration,
    pub lease_wait: Duration,
    pub now: Arc<dyn Fn() -> f64 + Send + Sync>,
}
impl Default for StorageOptions {
    fn default() -> Self {
        Self {
            max_retries: 8,
            clear_page_size: 200,
            lease_duration: Duration::from_secs(30),
            lease_wait: Duration::from_secs(30),
            now: Arc::new(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as f64)
                    .unwrap_or(0.)
            }),
        }
    }
}
pub struct Storage {
    pub adapter: Arc<dyn StorageAdapter>,
    options: StorageOptions,
    commit_size: usize,
}
struct Lease {
    row: StoredRow,
    lost: bool,
}
pub struct ApplyResult {
    pub applied: bool,
    pub writes: usize,
}
pub struct QueryPage {
    pub rows: Vec<BTreeMap<String, Value>>,
    pub next: Option<IndexCursor>,
}
pub struct Checkpoint {
    pub cursor: String,
    pub position: Value,
    pub updated_at: Option<f64>,
}
fn key(values: &[(&str, &str)]) -> RowKey {
    values
        .iter()
        .map(|(k, v)| ((*k).into(), (*v).into()))
        .collect()
}
fn revision(row: Option<&StoredRow>) -> StorageResult<u64> {
    let next = row
        .map_or(0, |r| r.revision)
        .checked_add(1)
        .ok_or(StorageError::Invalid("Storage revision overflow"))?;
    if next > 9007199254740991 {
        return Err(StorageError::Invalid("Storage revision overflow"));
    }
    Ok(next)
}
impl Storage {
    pub fn new(adapter: Arc<dyn StorageAdapter>, options: StorageOptions) -> StorageResult<Self> {
        let capacity = adapter.capabilities();
        if !capacity.atomic_commit
            || capacity.max_commit_size < 2
            || options.max_retries > 100
            || options.clear_page_size == 0
            || options.clear_page_size > 10000
            || options.lease_duration.is_zero()
            || options.lease_duration.as_millis() > 9007199254740991
            || options.lease_wait.as_millis() > 9007199254740991
        {
            return Err(StorageError::Invalid(
                "Invalid storage capabilities or bounds",
            ));
        }
        Ok(Self {
            adapter,
            options,
            commit_size: capacity.max_commit_size - 1,
        })
    }
    async fn checked_commit(&self, writes: &[RowWrite]) -> StorageResult<CommitResult> {
        let result = self.adapter.commit(writes).await?;
        let ids = writes
            .iter()
            .map(|w| match w {
                RowWrite::Put { row, .. } => row.id.as_str(),
                RowWrite::Delete { id, .. } => id.as_str(),
            })
            .collect::<BTreeSet<_>>();
        if (result.ok && !result.conflicts.is_empty())
            || (!result.ok
                && (result.conflicts.is_empty()
                    || result.conflicts.iter().any(|id| !ids.contains(id.as_str()))))
        {
            return Err(StorageError::Provider(
                "Adapter returned an invalid conditional commit receipt",
            ));
        }
        Ok(result)
    }
    fn now(&self) -> StorageResult<f64> {
        let now = (self.options.now)();
        if !now.is_finite() {
            Err(StorageError::Invalid("Storage clock must be finite"))
        } else {
            Ok(now)
        }
    }
    async fn acquire(&self, session: &str) -> StorageResult<Lease> {
        let id = encode_key(Entity::Leases, &key(&[("sessionId", session)]))?;
        let owner = uuid::Uuid::new_v4().to_string();
        let start = Instant::now();
        loop {
            let existing = self
                .adapter
                .get(Entity::Leases, std::slice::from_ref(&id))
                .await?
                .remove(&id);
            let now = self.now()?;
            if existing.as_ref().is_none_or(|r| {
                r.fields
                    .get("owner")
                    .is_none_or(|v| v.is_null() || v.as_str() == Some(""))
                    || r.fields
                        .get("expiresAt")
                        .and_then(Value::as_f64)
                        .unwrap_or(0.)
                        <= now
            }) {
                let mut row = existing
                    .clone()
                    .unwrap_or(empty_row(Entity::Leases, &key(&[("sessionId", session)]))?);
                row.fields.insert("owner".into(), owner.clone().into());
                row.fields.insert(
                    "expiresAt".into(),
                    Value::from(now + self.options.lease_duration.as_millis() as f64),
                );
                row.revision = revision(existing.as_ref())?;
                let result = self
                    .checked_commit(&[RowWrite::Put {
                        entity: Entity::Leases,
                        row: row.clone(),
                        expected_revision: existing.as_ref().map(|r| r.revision),
                    }])
                    .await?;
                if result.ok {
                    return Ok(Lease { row, lost: false });
                }
            }
            if start.elapsed() >= self.options.lease_wait {
                return Err(StorageError::LeaseLost);
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }
    async fn fenced_commit(
        &self,
        lease: &mut Lease,
        writes: &[RowWrite],
    ) -> StorageResult<CommitResult> {
        let now = self.now()?;
        if lease.lost
            || lease
                .row
                .fields
                .get("expiresAt")
                .and_then(Value::as_f64)
                .unwrap_or(0.)
                <= now
        {
            return Err(StorageError::LeaseLost);
        }
        let mut next = lease.row.clone();
        next.fields.insert(
            "expiresAt".into(),
            Value::from(now + self.options.lease_duration.as_millis() as f64),
        );
        next.revision = revision(Some(&lease.row))?;
        let mut all = writes.to_vec();
        all.push(RowWrite::Put {
            entity: Entity::Leases,
            row: next.clone(),
            expected_revision: Some(lease.row.revision),
        });
        let result = self.checked_commit(&all).await?;
        if result.ok {
            lease.row = next;
        } else if result.conflicts.contains(&lease.row.id) {
            let current = self
                .adapter
                .get(Entity::Leases, std::slice::from_ref(&lease.row.id))
                .await?
                .remove(&lease.row.id);
            if current.as_ref().is_none_or(|row| {
                row.revision != lease.row.revision
                    || row.fields.get("owner") != lease.row.fields.get("owner")
            }) {
                lease.lost = true;
                return Err(StorageError::LeaseLost);
            }
        }
        Ok(result)
    }
    async fn renew_if_needed(&self, lease: &mut Lease) -> StorageResult<()> {
        let expires = lease
            .row
            .fields
            .get("expiresAt")
            .and_then(Value::as_f64)
            .unwrap_or(0.);
        if expires - self.now()? <= self.options.lease_duration.as_millis() as f64 / 2. {
            let result = self.fenced_commit(lease, &[]).await?;
            if !result.ok {
                return Err(StorageError::Conflict(result.conflicts));
            }
        }
        Ok(())
    }
    async fn release(&self, lease: &Lease) -> StorageResult<()> {
        let mut row = lease.row.clone();
        row.fields.insert("owner".into(), Value::Null);
        row.fields.insert("expiresAt".into(), 0.into());
        row.revision = revision(Some(&lease.row))?;
        self.checked_commit(&[RowWrite::Put {
            entity: Entity::Leases,
            row,
            expected_revision: Some(lease.row.revision),
        }])
        .await?;
        Ok(())
    }
    async fn read_many(
        &self,
        entity: Entity,
        ids: &[String],
        lease: &mut Lease,
    ) -> StorageResult<BTreeMap<String, StoredRow>> {
        let mut rows = BTreeMap::new();
        for group in ids.chunks(500) {
            self.renew_if_needed(lease).await?;
            rows.extend(self.adapter.get(entity, group).await?);
        }
        Ok(rows)
    }
    async fn plan(
        &self,
        operations: &[StorageOperation],
        lease: &mut Lease,
    ) -> StorageResult<Vec<RowWrite>> {
        let mut wanted: BTreeMap<Entity, BTreeSet<String>> = BTreeMap::new();
        for operation in operations {
            let (entity, id) = operation_slot(operation)?;
            wanted.entry(entity).or_default().insert(id);
        }
        let mut original: BTreeMap<(Entity, String), Option<StoredRow>> = BTreeMap::new();
        for (entity, ids) in wanted {
            let ids = ids.into_iter().collect::<Vec<_>>();
            let mut rows = self.read_many(entity, &ids, lease).await?;
            for id in ids {
                let row = rows.remove(&id);
                original.insert((entity, id), row);
            }
        }
        let mut stored = original.clone();
        let mut deleted = BTreeSet::new();
        for operation in operations {
            let slot = operation_slot(operation)?;
            let current = stored.get(&slot).cloned().flatten();
            match operation {
                StorageOperation::Delete { .. } => {
                    stored.insert(slot.clone(), None);
                    deleted.insert(slot);
                }
                StorageOperation::Checkpoint {
                    session_id,
                    stream,
                    cursor,
                    expected_cursor,
                    position,
                    updated_at,
                } => {
                    let old = current
                        .as_ref()
                        .and_then(|r| r.fields.get("cursor"))
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    if expected_cursor
                        .as_ref()
                        .is_some_and(|expected| *expected != old)
                    {
                        return Err(StorageError::CheckpointConflict);
                    }
                    let mut row = current.unwrap_or(empty_row(
                        Entity::Checkpoints,
                        &key(&[("sessionId", session_id), ("stream", stream)]),
                    )?);
                    row.fields.insert("cursor".into(), cursor.clone().into());
                    row.fields
                        .insert("position".into(), position.clone().unwrap_or(Value::Null));
                    row.fields.insert(
                        "updatedAt".into(),
                        updated_at.map(Value::from).unwrap_or(Value::Null),
                    );
                    stored.insert(slot.clone(), Some(row));
                    deleted.remove(&slot);
                }
                StorageOperation::Upsert {
                    entity,
                    key,
                    fields,
                    ..
                }
                | StorageOperation::Patch {
                    entity,
                    key,
                    fields,
                    ..
                } => {
                    if current.is_none() && matches!(operation, StorageOperation::Patch { .. }) {
                        continue;
                    }
                    let missing = current.is_none();
                    let base = current.unwrap_or(empty_row(*entity, key)?);
                    let (row, changed) = merge_fields(*entity, &base, fields)?;
                    if changed || missing {
                        stored.insert(slot.clone(), Some(row));
                    }
                    deleted.remove(&slot);
                }
                StorageOperation::ClearChat { .. } => {
                    return Err(StorageError::Invalid("Unexpected clear operation"))
                }
            }
        }
        let mut writes = Vec::new();
        for (slot, row) in stored {
            let before = original.get(&slot).and_then(Option::as_ref);
            let (entity, id) = slot.clone();
            match row {
                None => {
                    if deleted.contains(&slot) {
                        if let Some(before) = before {
                            writes.push(RowWrite::Delete {
                                entity,
                                id,
                                expected_revision: Some(before.revision),
                            });
                        }
                    }
                }
                Some(mut row) => {
                    if before.is_some_and(|old| same_row(entity, old, &row)) {
                        continue;
                    }
                    row.revision = revision(before)?;
                    writes.push(RowWrite::Put {
                        entity,
                        row,
                        expected_revision: before.map(|r| r.revision),
                    });
                }
            }
        }
        Ok(writes)
    }
    async fn commit_retry(
        &self,
        operations: &[StorageOperation],
        extra: &[RowWrite],
        lease: &mut Lease,
    ) -> StorageResult<usize> {
        let mut conflicts = Vec::new();
        for attempt in 0..=self.options.max_retries {
            let mut writes = self.plan(operations, lease).await?;
            writes.extend_from_slice(extra);
            if writes.is_empty() {
                return Ok(0);
            }
            let mut failed = Vec::new();
            for part in writes.chunks(self.commit_size) {
                let result = self.fenced_commit(lease, part).await?;
                if !result.ok {
                    failed.extend(result.conflicts);
                    break;
                }
            }
            if failed.is_empty() {
                return Ok(writes.len());
            }
            conflicts = failed;
            tokio::time::sleep(Duration::from_millis(
                (5u64.saturating_mul(1u64.checked_shl(attempt as u32).unwrap_or(u64::MAX)))
                    .min(200),
            ))
            .await;
        }
        Err(StorageError::Conflict(conflicts))
    }
    async fn apply_rows(
        &self,
        operations: &[StorageOperation],
        extra: &[RowWrite],
        lease: &mut Lease,
    ) -> StorageResult<usize> {
        let size = self.commit_size.max(500);
        if operations.is_empty() {
            return self.commit_retry(&[], extra, lease).await;
        }
        let mut total = 0;
        for (offset, part) in operations.chunks(size).enumerate() {
            let last = (offset + 1) * size >= operations.len();
            total += self
                .commit_retry(part, if last { extra } else { &[] }, lease)
                .await?;
        }
        Ok(total)
    }
    async fn clear_chat(
        &self,
        session: &str,
        chat: &str,
        up_to: f64,
        lease: &mut Lease,
    ) -> StorageResult<usize> {
        let mut removed = 0;
        loop {
            self.renew_if_needed(lease).await?;
            let messages = self
                .adapter
                .query(
                    Entity::Messages,
                    &IndexQuery {
                        index: "by_chat".into(),
                        equals: key(&[("sessionId", session), ("chatId", chat)]),
                        range: Some(IndexRange {
                            lte: Some(up_to),
                            ..Default::default()
                        }),
                        order: Some("asc".into()),
                        limit: self.options.clear_page_size,
                        after: None,
                    },
                )
                .await?;
            if messages.is_empty() {
                return Ok(removed);
            }
            let mut deletes = Vec::new();
            for message in messages {
                let id = message
                    .fields
                    .get("messageId")
                    .and_then(Value::as_str)
                    .ok_or(StorageError::Invalid("Invalid stored message ID"))?;
                let message_key = key(&[("sessionId", session), ("messageId", id)]);
                deletes.push(StorageOperation::Delete {
                    entity: Entity::Media,
                    key: message_key.clone(),
                });
                for entity in [Entity::Reactions, Entity::Receipts, Entity::PollVotes] {
                    loop {
                        self.renew_if_needed(lease).await?;
                        let children = self
                            .adapter
                            .query(
                                entity,
                                &IndexQuery {
                                    index: "by_message".into(),
                                    equals: message_key.clone(),
                                    range: None,
                                    order: Some("asc".into()),
                                    limit: 500,
                                    after: None,
                                },
                            )
                            .await?;
                        if children.is_empty() {
                            break;
                        }
                        let writes = children
                            .iter()
                            .map(|row| RowWrite::Delete {
                                entity,
                                id: row.id.clone(),
                                expected_revision: None,
                            })
                            .collect::<Vec<_>>();
                        for part in writes.chunks(self.commit_size) {
                            let result = self.fenced_commit(lease, part).await?;
                            if !result.ok {
                                return Err(StorageError::Conflict(result.conflicts));
                            }
                        }
                        removed += children.len();
                        if children.len() < 500 {
                            break;
                        }
                    }
                }
                deletes.push(StorageOperation::Delete {
                    entity: Entity::Messages,
                    key: message_key,
                });
            }
            removed += self.apply_rows(&deletes, &[], lease).await?;
        }
    }
    async fn watermarks(
        &self,
        operations: Vec<StorageOperation>,
        lease: &mut Lease,
    ) -> StorageResult<Vec<StorageOperation>> {
        let mut keys = BTreeSet::new();
        for op in &operations {
            if let Some(guard) = guard(op) {
                keys.insert(encode_key(
                    Entity::Chats,
                    &key(&[("sessionId", &guard.session_id), ("chatId", &guard.chat_id)]),
                )?);
            }
        }
        let chats = self
            .read_many(Entity::Chats, &keys.into_iter().collect::<Vec<_>>(), lease)
            .await?;
        operations
            .into_iter()
            .filter_map(|op| {
                let keep = guard(&op)
                    .map(|g| {
                        let id = encode_key(
                            Entity::Chats,
                            &key(&[("sessionId", &g.session_id), ("chatId", &g.chat_id)]),
                        )?;
                        let mark = chats
                            .get(&id)
                            .map(|row| {
                                row.fields
                                    .get("clearedAt")
                                    .and_then(Value::as_f64)
                                    .unwrap_or(f64::NEG_INFINITY)
                                    .max(
                                        row.fields
                                            .get("deletedAt")
                                            .and_then(Value::as_f64)
                                            .unwrap_or(f64::NEG_INFINITY),
                                    )
                            })
                            .unwrap_or(f64::NEG_INFINITY);
                        Ok(g.timestamp > mark)
                    })
                    .unwrap_or(Ok(true));
                match keep {
                    Ok(true) => Some(Ok(op)),
                    Ok(false) => None,
                    Err(e) => Some(Err(e)),
                }
            })
            .collect()
    }
    pub async fn apply(&self, batch: &OperationBatch) -> StorageResult<ApplyResult> {
        if batch.session_id.is_empty() {
            return Err(StorageError::Invalid("Storage session is required"));
        }
        for operation in &batch.operations {
            let session = match operation {
                StorageOperation::ClearChat { session_id, .. }
                | StorageOperation::Checkpoint { session_id, .. } => Some(session_id.as_str()),
                StorageOperation::Upsert { entity, key, .. }
                | StorageOperation::Patch { entity, key, .. }
                | StorageOperation::Delete { entity, key } => {
                    if *entity == Entity::Leases {
                        return Err(StorageError::Invalid("Lease rows are owned by the engine"));
                    }
                    key.get("sessionId").map(String::as_str)
                }
            };
            if session != Some(batch.session_id.as_str())
                || guard(operation).is_some_and(|g| g.session_id != batch.session_id)
            {
                return Err(StorageError::Invalid(
                    "Storage batch cannot write a foreign session",
                ));
            }
        }
        let mut lease = self.acquire(&batch.session_id).await?;
        let result = self.apply_leased(batch, &mut lease).await;
        let release = self.release(&lease).await;
        match (result, release) {
            (Err(e), _) => Err(e),
            (Ok(_), Err(e)) => Err(e),
            (Ok(r), Ok(())) => Ok(r),
        }
    }
    async fn apply_leased(
        &self,
        batch: &OperationBatch,
        lease: &mut Lease,
    ) -> StorageResult<ApplyResult> {
        let mut marker = Vec::new();
        if let Some(id) = &batch.event_id {
            self.renew_if_needed(lease).await?;
            let mut row = empty_row(
                Entity::Events,
                &key(&[("sessionId", &batch.session_id), ("eventId", id)]),
            )?;
            if self
                .adapter
                .get(Entity::Events, std::slice::from_ref(&row.id))
                .await?
                .contains_key(&row.id)
            {
                return Ok(ApplyResult {
                    applied: false,
                    writes: 0,
                });
            }
            row.fields.insert(
                "type".into(),
                batch
                    .event_type
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            );
            row.revision = 1;
            marker.push(RowWrite::Put {
                entity: Entity::Events,
                row,
                expected_revision: None,
            });
        }
        let mut plain = Vec::new();
        let mut guarded = Vec::new();
        let mut clears = Vec::new();
        for op in &batch.operations {
            if matches!(op, StorageOperation::ClearChat { .. }) {
                clears.push(op);
            } else if guard(op).is_some() {
                guarded.push(op.clone());
            } else {
                plain.push(op.clone());
            }
        }
        let mut writes = self.apply_rows(&plain, &[], lease).await?;
        for op in clears {
            if let StorageOperation::ClearChat {
                session_id,
                chat_id,
                up_to,
            } = op
            {
                writes += self.clear_chat(session_id, chat_id, *up_to, lease).await?;
            }
        }
        let kept = self.watermarks(guarded, lease).await?;
        match self.apply_rows(&kept, &marker, lease).await {
            Ok(n) => Ok(ApplyResult {
                applied: true,
                writes: writes + n,
            }),
            Err(StorageError::Conflict(ids))
                if marker.first().is_some_and(
                    |m| matches!(m,RowWrite::Put{row,..}if ids.as_slice()==[row.id.clone()]),
                ) =>
            {
                Ok(ApplyResult {
                    applied: false,
                    writes,
                })
            }
            Err(e) => Err(e),
        }
    }
    pub async fn get(
        &self,
        entity: Entity,
        key: &RowKey,
    ) -> StorageResult<Option<BTreeMap<String, Value>>> {
        let id = encode_key(entity, key)?;
        Ok(self
            .adapter
            .get(entity, std::slice::from_ref(&id))
            .await?
            .remove(&id)
            .map(|row| public_row(entity, &row)))
    }
    pub async fn query(&self, entity: Entity, query: &IndexQuery) -> StorageResult<QueryPage> {
        let index = super::memory::validate_query(entity, query)?;
        let rows = self.adapter.query(entity, query).await?;
        let next = rows
            .last()
            .filter(|_| rows.len() >= query.limit)
            .map(|row| IndexCursor {
                sort: row
                    .fields
                    .get(index.sort)
                    .and_then(Value::as_f64)
                    .unwrap_or(0.),
                id: row.id.clone(),
            });
        Ok(QueryPage {
            rows: rows.iter().map(|row| public_row(entity, row)).collect(),
            next,
        })
    }
    pub async fn checkpoint(
        &self,
        session: &str,
        stream: &str,
    ) -> StorageResult<Option<Checkpoint>> {
        Ok(self
            .get(
                Entity::Checkpoints,
                &key(&[("sessionId", session), ("stream", stream)]),
            )
            .await?
            .and_then(|row| {
                row.get("cursor")
                    .and_then(Value::as_str)
                    .map(|cursor| Checkpoint {
                        cursor: cursor.into(),
                        position: row.get("position").cloned().unwrap_or(Value::Null),
                        updated_at: row.get("updatedAt").and_then(Value::as_f64),
                    })
            }))
    }
    pub async fn has_event(&self, session: &str, id: &str) -> StorageResult<bool> {
        Ok(self
            .get(
                Entity::Events,
                &key(&[("sessionId", session), ("eventId", id)]),
            )
            .await?
            .is_some())
    }
}
fn operation_slot(op: &StorageOperation) -> StorageResult<(Entity, String)> {
    match op {
        StorageOperation::Upsert { entity, key, .. }
        | StorageOperation::Patch { entity, key, .. }
        | StorageOperation::Delete { entity, key } => Ok((*entity, encode_key(*entity, key)?)),
        StorageOperation::Checkpoint {
            session_id, stream, ..
        } => Ok((
            Entity::Checkpoints,
            encode_key(
                Entity::Checkpoints,
                &key(&[("sessionId", session_id), ("stream", stream)]),
            )?,
        )),
        _ => Err(StorageError::Invalid("Unexpected clear operation")),
    }
}
fn guard(op: &StorageOperation) -> Option<&ChatWatermarkGuard> {
    match op {
        StorageOperation::Upsert { guard, .. } | StorageOperation::Patch { guard, .. } => {
            guard.as_ref()
        }
        _ => None,
    }
}
fn same_row(entity: Entity, a: &StoredRow, b: &StoredRow) -> bool {
    a.versions == b.versions
        && entity.definition().fields.iter().all(|(field, _)| {
            canonical_json(a.fields.get(*field).unwrap_or(&Value::Null))
                == canonical_json(b.fields.get(*field).unwrap_or(&Value::Null))
        })
}
