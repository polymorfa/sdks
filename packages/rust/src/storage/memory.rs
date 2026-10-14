use super::*;
use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet},
    sync::Mutex,
};
pub struct MemoryAdapter {
    tables: Mutex<BTreeMap<Entity, BTreeMap<String, StoredRow>>>,
}
impl Default for MemoryAdapter {
    fn default() -> Self {
        Self {
            tables: Mutex::new(BTreeMap::new()),
        }
    }
}
impl MemoryAdapter {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn rows(&self, entity: Entity) -> Vec<StoredRow> {
        self.tables
            .lock()
            .unwrap()
            .get(&entity)
            .map(|rows| rows.values().cloned().collect())
            .unwrap_or_default()
    }
}
pub fn validate_commit(writes: &[RowWrite], maximum: usize) -> StorageResult<()> {
    if writes.len() > maximum {
        return Err(StorageError::Invalid("Commit exceeds atomic capacity"));
    }
    let mut seen = BTreeSet::new();
    for write in writes {
        let (entity, id, revision) = match write {
            RowWrite::Put {
                entity,
                row,
                expected_revision,
            } => {
                let d = entity.definition();
                if row
                    .fields
                    .keys()
                    .any(|k| matches!(k.as_str(), "_id" | "_rev" | "_v"))
                {
                    return Err(StorageError::Invalid(
                        "A row cannot override system columns",
                    ));
                }
                let key = d
                    .key
                    .iter()
                    .map(|name| {
                        Ok((
                            (*name).into(),
                            row.fields
                                .get(*name)
                                .and_then(serde_json::Value::as_str)
                                .ok_or(StorageError::Invalid("Invalid row key"))?
                                .into(),
                        ))
                    })
                    .collect::<StorageResult<RowKey>>()?;
                if super::schema::encode_key(*entity, &key)? != row.id
                    || row.revision == 0
                    || row.revision > 9007199254740991
                {
                    return Err(StorageError::Invalid("Invalid conditional row"));
                }
                (*entity, &row.id, *expected_revision)
            }
            RowWrite::Delete {
                entity,
                id,
                expected_revision,
            } => (*entity, id, *expected_revision),
        };
        if !seen.insert((entity, id)) {
            return Err(StorageError::Invalid("Commit writes the same row twice"));
        }
        if revision.is_some_and(|r| r == 0 || r > 9007199254740991) {
            return Err(StorageError::Invalid("Invalid expected revision"));
        }
    }
    Ok(())
}
pub fn validate_query(
    entity: Entity,
    query: &IndexQuery,
) -> StorageResult<&'static super::schema::IndexDefinition> {
    let d = entity.definition();
    let index = d
        .indexes
        .iter()
        .find(|i| i.name == query.index)
        .ok_or(StorageError::Invalid("Unknown storage index"))?;
    if query.limit > 100000
        || index
            .equals
            .iter()
            .any(|name| query.equals.get(*name).is_none_or(String::is_empty))
    {
        return Err(StorageError::Invalid(
            "Incomplete storage index scope or limit",
        ));
    }
    if let Some(range) = &query.range {
        if [range.gt, range.gte, range.lt, range.lte]
            .iter()
            .flatten()
            .any(|v| !v.is_finite())
        {
            return Err(StorageError::Invalid("Invalid storage index range"));
        }
    }
    if query
        .after
        .as_ref()
        .is_some_and(|a| !a.sort.is_finite() || a.id.is_empty())
    {
        return Err(StorageError::Invalid("Invalid storage cursor"));
    }
    Ok(index)
}
pub fn filter_rows(
    entity: Entity,
    rows: impl IntoIterator<Item = StoredRow>,
    query: &IndexQuery,
) -> StorageResult<Vec<StoredRow>> {
    let index = validate_query(entity, query)?;
    let descending = query.order.as_deref() == Some("desc");
    let mut result = Vec::new();
    for row in rows {
        if index.equals.iter().any(|name| {
            row.fields.get(*name).and_then(serde_json::Value::as_str)
                != query.equals.get(*name).map(String::as_str)
        }) {
            continue;
        }
        let sort = row
            .fields
            .get(index.sort)
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.);
        if let Some(range) = &query.range {
            if range.gt.is_some_and(|n| sort <= n)
                || range.gte.is_some_and(|n| sort < n)
                || range.lt.is_some_and(|n| sort >= n)
                || range.lte.is_some_and(|n| sort > n)
            {
                continue;
            }
        }
        if let Some(after) = &query.after {
            let cmp = compare_sort(sort, &row.id, after.sort, &after.id);
            if (descending && cmp != Ordering::Less) || (!descending && cmp != Ordering::Greater) {
                continue;
            }
        }
        result.push(row);
    }
    result.sort_by(|a, b| {
        let cmp = compare_sort(
            a.fields
                .get(index.sort)
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.),
            &a.id,
            b.fields
                .get(index.sort)
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.),
            &b.id,
        );
        if descending {
            cmp.reverse()
        } else {
            cmp
        }
    });
    result.truncate(query.limit);
    Ok(result)
}
fn compare_sort(a: f64, aid: &str, b: f64, bid: &str) -> Ordering {
    let cmp = a.partial_cmp(&b).unwrap();
    if cmp == Ordering::Equal {
        aid.encode_utf16().cmp(bid.encode_utf16())
    } else {
        cmp
    }
}
impl StorageAdapter for MemoryAdapter {
    fn name(&self) -> &str {
        "memory"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 10000,
        }
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            let tables = self.tables.lock().unwrap();
            Ok(ids
                .iter()
                .filter_map(|id| {
                    tables
                        .get(&entity)
                        .and_then(|rows| rows.get(id))
                        .map(|row| (id.clone(), row.clone()))
                })
                .collect())
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            validate_commit(writes, 10000)?;
            let mut tables = self.tables.lock().unwrap();
            let mut conflicts = Vec::new();
            for write in writes {
                let (entity, id, expected, is_put) = match write {
                    RowWrite::Put {
                        entity,
                        row,
                        expected_revision,
                    } => (*entity, &row.id, *expected_revision, true),
                    RowWrite::Delete {
                        entity,
                        id,
                        expected_revision,
                    } => (*entity, id, *expected_revision, false),
                };
                let current = tables.get(&entity).and_then(|table| table.get(id));
                let conflict = if is_put && expected.is_none() {
                    current.is_some()
                } else {
                    expected.is_some_and(|r| current.map(|row| row.revision) != Some(r))
                };
                if conflict {
                    conflicts.push(id.clone());
                }
            }
            if !conflicts.is_empty() {
                return Ok(CommitResult {
                    ok: false,
                    conflicts,
                });
            }
            for write in writes {
                match write {
                    RowWrite::Put { entity, row, .. } => {
                        tables
                            .entry(*entity)
                            .or_default()
                            .insert(row.id.clone(), row.clone());
                    }
                    RowWrite::Delete { entity, id, .. } => {
                        if let Some(table) = tables.get_mut(entity) {
                            table.remove(id);
                        }
                    }
                }
            }
            Ok(CommitResult {
                ok: true,
                conflicts: vec![],
            })
        })
    }
    fn query<'a>(
        &'a self,
        entity: Entity,
        query: &'a IndexQuery,
    ) -> StorageFuture<'a, Vec<StoredRow>> {
        Box::pin(async move { filter_rows(entity, self.rows(entity), query) })
    }
}
