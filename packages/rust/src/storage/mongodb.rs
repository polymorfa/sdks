//! Customer-owned MongoDB through the official driver. Replica-set/sharded transactions are required.
use super::{memory, schema, *};
use ::mongodb::{
    bson::{doc, Bson, Document, RawDocumentBuf},
    error::{Error as MongoError, ErrorKind as MongoErrorKind, WriteFailure},
    options::{Acknowledgment, IndexOptions, ReadConcern, WriteConcern},
    Collection, Database, IndexModel,
};
use futures_util::TryStreamExt as _;
use std::collections::HashSet;
#[derive(Clone)]
pub struct MongoStorageOptions {
    pub namespace: String,
    pub create_indexes: bool,
    pub max_query_rows: usize,
}
impl MongoStorageOptions {
    pub fn new(namespace: impl Into<String>) -> Self {
        Self {
            namespace: namespace.into(),
            create_indexes: true,
            max_query_rows: 100000,
        }
    }
}
#[derive(Clone)]
pub struct MongoStorageAdapter {
    database: Database,
    options: MongoStorageOptions,
    prefix: String,
}
struct ConditionalConflict(String);
impl MongoStorageAdapter {
    pub fn new(database: Database, options: MongoStorageOptions) -> StorageResult<Self> {
        schema::namespace(&options.namespace)?;
        if options.max_query_rows == 0
            || options
                .max_query_rows
                .checked_add(1)
                .and_then(|v| i64::try_from(v).ok())
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
    fn collection(&self, entity: Entity) -> Collection<Document> {
        self.database
            .collection(&format!("{}{}", self.prefix, entity.definition().name))
    }
    fn raw_collection(&self, entity: Entity) -> Collection<RawDocumentBuf> {
        // Document's serde decoder recognizes extended-JSON tag keys. Reading raw
        // BSON keeps customer JSON objects such as {"$date":"literal"} unchanged.
        self.database
            .collection(&format!("{}{}", self.prefix, entity.definition().name))
    }
    fn encode(row: &StoredRow) -> StorageResult<Document> {
        match to_bson(serde_json::to_value(row).map_err(|_| invalid())?)? {
            Bson::Document(row) => Ok(row),
            _ => Err(invalid()),
        }
    }
    fn decode(entity: Entity, row: Document) -> StorageResult<StoredRow> {
        let row: StoredRow =
            serde_json::from_value(from_bson(Bson::Document(row))?).map_err(|_| provider())?;
        memory::validate_commit(
            &[RowWrite::Put {
                entity,
                row: row.clone(),
                expected_revision: None,
            }],
            1,
        )
        .map_err(|_| provider())?;
        Ok(row)
    }
}
fn to_bson(value: Value) -> StorageResult<Bson> {
    Ok(match value {
        Value::Null => Bson::Null,
        Value::Bool(v) => Bson::Boolean(v),
        Value::String(v) => Bson::String(v),
        Value::Number(v) => {
            if let Some(integer) = v.as_i64() {
                Bson::Int64(integer)
            } else {
                Bson::Double(v.as_f64().filter(|v| v.is_finite()).ok_or_else(invalid)?)
            }
        }
        Value::Array(values) => Bson::Array(
            values
                .into_iter()
                .map(to_bson)
                .collect::<StorageResult<_>>()?,
        ),
        Value::Object(values) => Bson::Document(
            values
                .into_iter()
                .map(|(k, v)| {
                    if k.contains('\0') {
                        return Err(invalid());
                    }
                    Ok((k, to_bson(v)?))
                })
                .collect::<StorageResult<_>>()?,
        ),
    })
}
fn from_bson(value: Bson) -> StorageResult<Value> {
    Ok(match value {
        Bson::Null => Value::Null,
        Bson::Boolean(v) => Value::Bool(v),
        Bson::String(v) => Value::String(v),
        Bson::Int32(v) => Value::Number(v.into()),
        Bson::Int64(v) => Value::Number(v.into()),
        Bson::Double(v) => Value::Number(
            if v.is_finite() && v.fract() == 0. && v.abs() <= 9007199254740991. {
                (v as i64).into()
            } else {
                serde_json::Number::from_f64(v).ok_or_else(provider)?
            },
        ),
        Bson::Array(values) => Value::Array(
            values
                .into_iter()
                .map(from_bson)
                .collect::<StorageResult<_>>()?,
        ),
        Bson::Document(values) => Value::Object(
            values
                .into_iter()
                .map(|(k, v)| Ok((k, from_bson(v)?)))
                .collect::<StorageResult<_>>()?,
        ),
        _ => return Err(provider()),
    })
}
fn duplicate(error: &MongoError) -> bool {
    matches!(&*error.kind,MongoErrorKind::Write(WriteFailure::WriteError(write))if write.code==11000)
        || matches!(&*error.kind,MongoErrorKind::Command(command)if command.code==11000)
}
impl StorageAdapter for MongoStorageAdapter {
    fn name(&self) -> &str {
        "mongodb"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 500,
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            let hello = self
                .database
                .run_command(doc! {"hello":1})
                .await
                .map_err(|_| provider())?;
            if (!hello.get_str("setName").is_ok_and(|v| !v.is_empty())
                && hello.get_str("msg") != Ok("isdbgrid"))
                || !hello.contains_key("logicalSessionTimeoutMinutes")
            {
                return Err(provider());
            }
            if self.options.create_indexes {
                for entity in schema::ALL_ENTITIES {
                    for index in entity.definition().indexes {
                        let keys = index
                            .equals
                            .iter()
                            .copied()
                            .chain([index.sort, "_id"])
                            .map(|key| (key.to_owned(), Bson::Int32(1)))
                            .collect::<Document>();
                        let model = IndexModel::builder()
                            .keys(keys)
                            .options(IndexOptions::builder().name(index.name.to_owned()).build())
                            .build();
                        self.collection(entity)
                            .create_index(model)
                            .await
                            .map_err(|_| provider())?;
                    }
                }
            }
            Ok(())
        })
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            let ids = ids
                .iter()
                .cloned()
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect::<Vec<_>>();
            let mut result = BTreeMap::new();
            for chunk in ids.chunks(1000) {
                let expected = chunk.iter().collect::<HashSet<_>>();
                let mut cursor = self
                    .raw_collection(entity)
                    .find(doc! {"_id":{"$in":chunk}})
                    .await
                    .map_err(|_| provider())?;
                while let Some(row) = cursor.try_next().await.map_err(|_| provider())? {
                    let row = Self::decode(entity, row.to_document().map_err(|_| provider())?)?;
                    if !expected.contains(&row.id) || result.insert(row.id.clone(), row).is_some() {
                        return Err(provider());
                    }
                }
            }
            Ok(result)
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, 500)?;
            if writes.is_empty() {
                return Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                });
            }
            // Validate/encode all caller values before the first provider request and retries.
            let documents = writes
                .iter()
                .map(|write| match write {
                    RowWrite::Put { row, .. } => Self::encode(row).map(Some),
                    _ => Ok(None),
                })
                .collect::<StorageResult<Vec<_>>>()?;
            let mut session = self
                .database
                .client()
                .start_session()
                .await
                .map_err(|_| provider())?;
            let transaction_adapter = self.clone();
            let transaction_writes = writes.to_vec();
            let result = session
                .start_transaction()
                .read_concern(ReadConcern::snapshot())
                .write_concern(WriteConcern::builder().w(Acknowledgment::Majority).build())
                .and_run2(async move |session: &mut ::mongodb::ClientSession| {
                    for (write, document) in transaction_writes.iter().zip(&documents) {
                        let (entity, id, expected) = match write {
                            RowWrite::Put {
                                entity,
                                row,
                                expected_revision,
                            } => (*entity, row.id.as_str(), *expected_revision),
                            RowWrite::Delete {
                                entity,
                                id,
                                expected_revision,
                            } => (*entity, id.as_str(), *expected_revision),
                        };
                        let collection = transaction_adapter.collection(entity);
                        let current = collection
                            .find_one(doc! {"_id":id})
                            .projection(doc! {"_rev":1})
                            .session(&mut *session)
                            .await?;
                        let revision = current.as_ref().and_then(|row| match row.get("_rev") {
                            Some(Bson::Int64(v)) => u64::try_from(*v).ok(),
                            Some(Bson::Int32(v)) => u64::try_from(*v).ok(),
                            Some(Bson::Double(v))
                                if v.is_finite()
                                    && v.fract() == 0.
                                    && *v >= 1.
                                    && *v <= 9007199254740991. =>
                            {
                                Some(*v as u64)
                            }
                            _ => None,
                        });
                        let conflict =
                            if matches!(write, RowWrite::Put { .. }) && expected.is_none() {
                                current.is_some()
                            } else {
                                expected.is_some_and(|expected| revision != Some(expected))
                            };
                        if conflict {
                            return Err(MongoError::custom(ConditionalConflict(id.into())));
                        }
                        match write {
                            RowWrite::Put { .. } => {
                                let document = document.clone().unwrap();
                                if let Some(revision) = expected {
                                    let result = collection
                                        .replace_one(
                                            doc! {"_id":id,"_rev":revision as i64},
                                            document,
                                        )
                                        .session(&mut *session)
                                        .await?;
                                    if result.matched_count != 1 {
                                        return Err(MongoError::custom(ConditionalConflict(
                                            id.into(),
                                        )));
                                    }
                                } else {
                                    collection
                                        .insert_one(document)
                                        .session(&mut *session)
                                        .await?;
                                }
                            }
                            RowWrite::Delete { .. } => {
                                let mut filter = doc! {"_id":id};
                                if let Some(revision) = expected {
                                    filter.insert("_rev", revision as i64);
                                }
                                let deleted =
                                    collection.delete_one(filter).session(&mut *session).await?;
                                if expected.is_some() && deleted.deleted_count != 1 {
                                    return Err(MongoError::custom(ConditionalConflict(id.into())));
                                }
                            }
                        }
                    }
                    Ok(())
                })
                .await;
            match result {
                Ok(()) => Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                }),
                Err(error) => {
                    if let Some(ConditionalConflict(id)) = error.get_custom::<ConditionalConflict>()
                    {
                        return Ok(CommitResult {
                            ok: false,
                            conflicts: vec![id.clone()],
                        });
                    }
                    if duplicate(&error) {
                        return Ok(CommitResult {
                            ok: false,
                            conflicts: writes
                                .iter()
                                .map(|write| match write {
                                    RowWrite::Put { row, .. } => row.id.clone(),
                                    RowWrite::Delete { id, .. } => id.clone(),
                                })
                                .collect(),
                        });
                    }
                    Err(provider())
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
            let filter = index
                .equals
                .iter()
                .map(|field| ((*field).into(), Bson::String(query.equals[*field].clone())))
                .collect::<Document>();
            let mut cursor = self
                .raw_collection(entity)
                .find(filter)
                .limit((self.options.max_query_rows + 1) as i64)
                .await
                .map_err(|_| provider())?;
            let mut rows = Vec::new();
            let mut seen = HashSet::new();
            while let Some(row) = cursor.try_next().await.map_err(|_| provider())? {
                let row = Self::decode(entity, row.to_document().map_err(|_| provider())?)?;
                if rows.len() >= self.options.max_query_rows || !seen.insert(row.id.clone()) {
                    return Err(provider());
                }
                rows.push(row);
            }
            memory::filter_rows(entity, rows, query)
        })
    }
}
fn invalid() -> StorageError {
    StorageError::Invalid("Invalid customer MongoDB configuration or operation.")
}
fn provider() -> StorageError {
    StorageError::Provider("Customer MongoDB operation failed; a write outcome may be uncertain.")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn literal_extended_json_keys_survive_binary_bson() {
        let value = serde_json::json!({"$date":"literal", "$binary":{"base64":"literal","subType":"zz"}, "$numberLong":"not a number"});
        let Bson::Document(document) = to_bson(value.clone()).unwrap() else {
            panic!("Expected a JSON document")
        };
        let bytes = ::mongodb::bson::to_vec(&document).unwrap();
        let raw = ::mongodb::bson::RawDocumentBuf::from_bytes(bytes).unwrap();
        assert_eq!(
            from_bson(Bson::Document(raw.to_document().unwrap())).unwrap(),
            value
        );
    }
}
