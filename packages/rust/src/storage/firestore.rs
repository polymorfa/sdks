//! Customer-owned Firestore through the community native driver. The caller owns authentication.
use super::{memory, schema, *};
use ::firestore::errors::{BackoffError, FirestoreError, FirestoreErrorInTransaction};
use ::firestore::{
    FirestoreDb, FirestoreGetByIdSupport, FirestoreQueryFilter, FirestoreQueryFilterCompare,
    FirestoreQueryFilterComposite, FirestoreQueryFilterCompositeOperator, FirestoreQueryParams,
    FirestoreQuerySupport, FirestoreTransactionOps, FirestoreValue,
};
use futures_util::TryStreamExt as _;
use gcloud_sdk::google::firestore::v1::{
    precondition::ConditionType, value::ValueType, write::Operation, ArrayValue, Document,
    MapValue, Precondition, Value as NativeValue, Write,
};
use std::collections::{BTreeSet, HashSet};
#[derive(Clone)]
pub struct FirestoreStorageOptions {
    pub namespace: String,
    pub max_query_rows: usize,
}
impl FirestoreStorageOptions {
    pub fn new(namespace: impl Into<String>) -> Self {
        Self {
            namespace: namespace.into(),
            max_query_rows: 100000,
        }
    }
}
#[derive(Clone)]
pub struct FirestoreStorageAdapter {
    database: FirestoreDb,
    options: FirestoreStorageOptions,
    prefix: String,
}
impl FirestoreStorageAdapter {
    pub fn new(database: FirestoreDb, options: FirestoreStorageOptions) -> StorageResult<Self> {
        schema::namespace(&options.namespace)?;
        if options.max_query_rows == 0
            || options
                .max_query_rows
                .checked_add(1)
                .and_then(|v| i32::try_from(v).ok())
                .is_none()
        {
            return Err(invalid());
        }
        let prefix = format!("polymorfa_{}_", options.namespace);
        Ok(Self {
            database,
            options,
            prefix,
        })
    }
    fn collection(&self, entity: Entity) -> String {
        format!("{}{}", self.prefix, entity.definition().name)
    }
    fn path(&self, entity: Entity, id: &str) -> StorageResult<String> {
        valid_id(id)?;
        Ok(format!(
            "{}/{}/{}",
            self.database.get_documents_path(),
            self.collection(entity),
            id
        ))
    }
    fn decode(&self, entity: Entity, document: Document) -> StorageResult<StoredRow> {
        let row: StoredRow = serde_json::from_value(from_native(NativeValue {
            value_type: Some(ValueType::MapValue(MapValue {
                fields: document.fields,
            })),
        })?)
        .map_err(|_| provider())?;
        memory::validate_commit(
            &[RowWrite::Put {
                entity,
                row: row.clone(),
                expected_revision: None,
            }],
            1,
        )
        .map_err(|_| provider())?;
        if document.name != self.path(entity, &row.id).map_err(|_| provider())? {
            return Err(provider());
        }
        Ok(row)
    }
    async fn read(
        &self,
        database: &FirestoreDb,
        entity: Entity,
        ids: &[String],
    ) -> Result<BTreeMap<String, StoredRow>, ReadError> {
        let ids = ids
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        for id in &ids {
            self.path(entity, id)?;
        }
        let mut result = BTreeMap::new();
        for chunk in ids.chunks(250) {
            let wanted = chunk.iter().collect::<HashSet<_>>();
            let mut seen = HashSet::new();
            let mut stream = database
                .batch_stream_get_docs_with_errors(&self.collection(entity), chunk.to_vec(), None)
                .await
                .map_err(ReadError::Native)?;
            while let Some((id, document)) = stream.try_next().await.map_err(ReadError::Native)? {
                if !wanted.contains(&id) || !seen.insert(id.clone()) {
                    return Err(ReadError::Storage(provider()));
                }
                if let Some(document) = document {
                    let row = self.decode(entity, document)?;
                    if row.id != id || result.insert(id, row).is_some() {
                        return Err(ReadError::Storage(provider()));
                    }
                }
            }
            if seen.len() != wanted.len() {
                return Err(ReadError::Storage(provider()));
            }
        }
        Ok(result)
    }
}
enum ReadError {
    Storage(StorageError),
    Native(FirestoreError),
}
impl From<StorageError> for ReadError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}
fn valid_id(id: &str) -> StorageResult<()> {
    if id.is_empty() || matches!(id, "." | "..") || id.contains('/') || id.len() > 1500 {
        Err(invalid())
    } else {
        Ok(())
    }
}
fn to_native(value: Value) -> StorageResult<NativeValue> {
    Ok(NativeValue {
        value_type: Some(match value {
            Value::Null => ValueType::NullValue(0),
            Value::Bool(value) => ValueType::BooleanValue(value),
            Value::String(value) => ValueType::StringValue(value),
            Value::Number(value) => {
                if let Some(integer) = value.as_i64() {
                    ValueType::IntegerValue(integer)
                } else {
                    ValueType::DoubleValue(
                        value
                            .as_f64()
                            .filter(|v| v.is_finite())
                            .ok_or_else(invalid)?,
                    )
                }
            }
            Value::Array(values) => ValueType::ArrayValue(ArrayValue {
                values: values
                    .into_iter()
                    .map(to_native)
                    .collect::<StorageResult<_>>()?,
            }),
            Value::Object(values) => ValueType::MapValue(MapValue {
                fields: values
                    .into_iter()
                    .map(|(k, v)| Ok((k, to_native(v)?)))
                    .collect::<StorageResult<_>>()?,
            }),
        }),
    })
}
fn from_native(value: NativeValue) -> StorageResult<Value> {
    Ok(match value.value_type.ok_or_else(provider)? {
        ValueType::NullValue(0) => Value::Null,
        ValueType::BooleanValue(value) => Value::Bool(value),
        ValueType::StringValue(value) => Value::String(value),
        ValueType::IntegerValue(value) => Value::Number(value.into()),
        ValueType::DoubleValue(value) => Value::Number(
            if value.is_finite() && value.fract() == 0. && value.abs() <= 9007199254740991. {
                (value as i64).into()
            } else {
                serde_json::Number::from_f64(value).ok_or_else(provider)?
            },
        ),
        ValueType::ArrayValue(value) => Value::Array(
            value
                .values
                .into_iter()
                .map(from_native)
                .collect::<StorageResult<_>>()?,
        ),
        ValueType::MapValue(value) => Value::Object(
            value
                .fields
                .into_iter()
                .map(|(k, v)| Ok((k, from_native(v)?)))
                .collect::<StorageResult<_>>()?,
        ),
        _ => return Err(provider()),
    })
}
struct NativeWrite(Write);
impl TryFrom<NativeWrite> for Write {
    type Error = FirestoreError;
    fn try_from(write: NativeWrite) -> Result<Self, Self::Error> {
        Ok(write.0)
    }
}
#[derive(Debug)]
struct ConditionalConflict(String);
impl std::fmt::Display for ConditionalConflict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Customer Firestore revision changed.")
    }
}
impl std::error::Error for ConditionalConflict {}
fn conflict(error: &FirestoreError) -> Option<String> {
    let mut current: &(dyn std::error::Error + 'static) = error;
    for _ in 0..10 {
        if let Some(value) = current.downcast_ref::<ConditionalConflict>() {
            return Some(value.0.clone());
        }
        current = current.source()?;
    }
    None
}
impl StorageAdapter for FirestoreStorageAdapter {
    fn name(&self) -> &str {
        "firestore"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 250,
        }
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            self.read(&self.database, entity, ids)
                .await
                .map_err(|error| match error {
                    ReadError::Storage(error) => error,
                    ReadError::Native(_) => provider(),
                })
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, 250)?;
            if writes.is_empty() {
                return Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                });
            }
            let writes = writes.to_vec();
            let mut encoded = Vec::new();
            for write in &writes {
                let (entity, id) = match write {
                    RowWrite::Put { entity, row, .. } => (*entity, &row.id),
                    RowWrite::Delete { entity, id, .. } => (*entity, id),
                };
                let name = self.path(entity, id)?;
                encoded.push(match write {
                    RowWrite::Put {
                        row,
                        expected_revision,
                        ..
                    } => {
                        if row.versions.values().any(|version| !version.is_finite()) {
                            return Err(invalid());
                        }
                        let Some(ValueType::MapValue(fields)) =
                            to_native(serde_json::to_value(row).map_err(|_| invalid())?)?
                                .value_type
                        else {
                            return Err(invalid());
                        };
                        Write {
                            operation: Some(Operation::Update(Document {
                                name,
                                fields: fields.fields,
                                ..Default::default()
                            })),
                            current_document: expected_revision.is_none().then_some(Precondition {
                                condition_type: Some(ConditionType::Exists(false)),
                            }),
                            ..Default::default()
                        }
                    }
                    RowWrite::Delete { .. } => Write {
                        operation: Some(Operation::Delete(name)),
                        ..Default::default()
                    },
                });
            }
            let adapter = self.clone();
            let result =
                self.database
                    .run_transaction(move |database, transaction| {
                        let writes = writes.clone();
                        let encoded = encoded.clone();
                        let adapter = adapter.clone();
                        Box::pin(async move {
                            let mut groups: BTreeMap<Entity, Vec<String>> = BTreeMap::new();
                            for write in &writes {
                                let (entity, id) = match write {
                                    RowWrite::Put { entity, row, .. } => (*entity, row.id.clone()),
                                    RowWrite::Delete { entity, id, .. } => (*entity, id.clone()),
                                };
                                groups.entry(entity).or_default().push(id);
                            }
                            let mut current = BTreeMap::new();
                            // All transaction-bound reads finish before any queued native write.
                            for (entity, ids) in groups {
                                let rows = adapter.read(&database, entity, &ids).await.map_err(
                                    |error| match error {
                                        ReadError::Native(FirestoreError::DatabaseError(error))
                                            if error.retry_possible =>
                                        {
                                            FirestoreErrorInTransaction::transient(
                                                transaction,
                                                provider(),
                                            )
                                        }
                                        ReadError::Storage(error) => {
                                            FirestoreErrorInTransaction::permanent(
                                                transaction,
                                                error,
                                            )
                                        }
                                        ReadError::Native(_) => {
                                            FirestoreErrorInTransaction::permanent(
                                                transaction,
                                                provider(),
                                            )
                                        }
                                    },
                                )?;
                                for (id, row) in rows {
                                    current.insert((entity, id), row);
                                }
                            }
                            for write in &writes {
                                let (entity, id, expected, create) = match write {
                                    RowWrite::Put {
                                        entity,
                                        row,
                                        expected_revision,
                                    } => (
                                        *entity,
                                        &row.id,
                                        *expected_revision,
                                        expected_revision.is_none(),
                                    ),
                                    RowWrite::Delete {
                                        entity,
                                        id,
                                        expected_revision,
                                    } => (*entity, id, *expected_revision, false),
                                };
                                let row = current.get(&(entity, id.clone()));
                                if (create && row.is_some())
                                    || expected
                                        .is_some_and(|rev| row.map(|r| r.revision) != Some(rev))
                                {
                                    return Err(FirestoreErrorInTransaction::permanent(
                                        transaction,
                                        ConditionalConflict(id.clone()),
                                    ));
                                }
                            }
                            for write in encoded {
                                transaction
                                    .add(NativeWrite(write))
                                    .map_err(BackoffError::permanent)?;
                            }
                            Ok(())
                        })
                    })
                    .await;
            match result {
                Ok(()) => Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                }),
                Err(error) => {
                    if let Some(id) = conflict(&error) {
                        Ok(CommitResult {
                            ok: false,
                            conflicts: vec![id],
                        })
                    } else {
                        Err(provider())
                    }
                }
            }
        })
    }
    fn query<'a>(
        &'a self,
        entity: Entity,
        query: &'a IndexQuery,
    ) -> StorageFuture<'a, Vec<StoredRow>> {
        Box::pin(async move {
            let index = memory::validate_query(entity, query)?;
            if query.limit == 0 {
                return Ok(vec![]);
            }
            let filters = index
                .equals
                .iter()
                .map(|field| {
                    FirestoreQueryFilter::Compare(Some(FirestoreQueryFilterCompare::Equal(
                        (*field).into(),
                        FirestoreValue::from(NativeValue {
                            value_type: Some(ValueType::StringValue(query.equals[*field].clone())),
                        }),
                    )))
                })
                .collect();
            let params = FirestoreQueryParams::new(self.collection(entity).as_str().into())
                .with_limit((self.options.max_query_rows + 1) as u32)
                .with_filter(FirestoreQueryFilter::Composite(
                    FirestoreQueryFilterComposite::new(
                        filters,
                        FirestoreQueryFilterCompositeOperator::And,
                    ),
                ));
            let documents = self
                .database
                .query_doc(params)
                .await
                .map_err(|_| provider())?;
            if documents.len() > self.options.max_query_rows {
                return Err(provider());
            }
            let mut seen = HashSet::new();
            let mut rows = Vec::new();
            for document in documents {
                let row = self.decode(entity, document)?;
                if !seen.insert(row.id.clone())
                    || index.equals.iter().any(|field| {
                        row.fields.get(*field).and_then(Value::as_str)
                            != query.equals.get(*field).map(String::as_str)
                    })
                {
                    return Err(provider());
                }
                rows.push(row);
            }
            memory::filter_rows(entity, rows, query)
        })
    }
}
fn invalid() -> StorageError {
    StorageError::Invalid("Invalid customer Firestore configuration or operation.")
}
fn provider() -> StorageError {
    StorageError::Provider("Customer Firestore operation failed; a write outcome may be uncertain.")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn json_is_literal_and_native_types_are_refused() {
        let value = serde_json::json!({"$date":"literal","$binary":{"base64":"x"},"empty":[],"map":{},"null":null});
        assert_eq!(
            from_native(to_native(value.clone()).unwrap()).unwrap(),
            value
        );
        assert!(from_native(NativeValue {
            value_type: Some(ValueType::ReferenceValue(
                "synthetic-private-reference".into()
            ))
        })
        .is_err());
        assert!(from_native(NativeValue {
            value_type: Some(ValueType::DoubleValue(f64::NAN))
        })
        .is_err());
        // gcloud's service-account JWT path must have a crypto provider on MSRV 1.85.
        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &serde_json::json!({"sub":"synthetic-auth-proof"}),
            &jsonwebtoken::EncodingKey::from_secret(b"synthetic-only"),
        );
        assert!(token.is_ok());
    }
}
