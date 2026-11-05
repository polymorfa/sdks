//! Customer-owned DynamoDB through the official AWS SDK. No API credentials are inherited.
use super::{memory, schema, *};
use aws_sdk_dynamodb::{
    types::{
        AttributeDefinition, AttributeValue, BillingMode, Delete, KeySchemaElement, KeyType,
        KeysAndAttributes, Put, ScalarAttributeType, TransactWriteItem,
    },
    Client,
};
use std::collections::{HashMap, HashSet};
#[derive(Clone)]
pub struct DynamoStorageOptions {
    pub namespace: String,
    pub table_name: String,
    pub create_table: bool,
    pub max_query_rows: usize,
}
impl DynamoStorageOptions {
    pub fn new(namespace: impl Into<String>, table_name: impl Into<String>) -> Self {
        Self {
            namespace: namespace.into(),
            table_name: table_name.into(),
            create_table: false,
            max_query_rows: 100000,
        }
    }
}
pub struct DynamoStorageAdapter {
    client: Client,
    options: DynamoStorageOptions,
}
impl DynamoStorageAdapter {
    pub fn new(client: Client, options: DynamoStorageOptions) -> StorageResult<Self> {
        schema::namespace(&options.namespace)?;
        if options.table_name.is_empty()
            || options.table_name.len() > 1024
            || !options
                .table_name
                .bytes()
                .all(|c| (b'!'..=b'~').contains(&c))
            || options.max_query_rows == 0
        {
            return Err(invalid());
        }
        Ok(Self { client, options })
    }
    fn partition(&self, entity: Entity) -> String {
        format!("{}:{}", self.options.namespace, entity.definition().name)
    }
    fn key(&self, entity: Entity, id: &str) -> HashMap<String, AttributeValue> {
        HashMap::from([
            ("pk".into(), AttributeValue::S(self.partition(entity))),
            ("sk".into(), AttributeValue::S(id.into())),
        ])
    }
    fn decode(
        &self,
        entity: Entity,
        item: &HashMap<String, AttributeValue>,
    ) -> StorageResult<StoredRow> {
        if item.get("pk").and_then(|v| v.as_s().ok()) != Some(&self.partition(entity)) {
            return Err(provider());
        }
        let id = item
            .get("sk")
            .and_then(|v| v.as_s().ok())
            .ok_or_else(provider)?;
        let row: StoredRow =
            serde_json::from_value(from_attribute(item.get("row").ok_or_else(provider)?)?)
                .map_err(|_| provider())?;
        if &row.id != id {
            return Err(provider());
        }
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
fn to_attribute(value: Value) -> AttributeValue {
    match value {
        Value::Null => AttributeValue::Null(true),
        Value::Bool(v) => AttributeValue::Bool(v),
        Value::Number(v) => AttributeValue::N(v.to_string()),
        Value::String(v) => AttributeValue::S(v),
        Value::Array(v) => AttributeValue::L(v.into_iter().map(to_attribute).collect()),
        Value::Object(v) => {
            AttributeValue::M(v.into_iter().map(|(k, v)| (k, to_attribute(v))).collect())
        }
    }
}
fn from_attribute(value: &AttributeValue) -> StorageResult<Value> {
    Ok(match value {
        AttributeValue::Null(true) => Value::Null,
        AttributeValue::Bool(v) => Value::Bool(*v),
        AttributeValue::N(v) => Value::Number(serde_json::from_str(v).map_err(|_| provider())?),
        AttributeValue::S(v) => Value::String(v.clone()),
        AttributeValue::L(v) => {
            Value::Array(v.iter().map(from_attribute).collect::<StorageResult<_>>()?)
        }
        AttributeValue::M(v) => Value::Object(
            v.iter()
                .map(|(k, v)| Ok((k.clone(), from_attribute(v)?)))
                .collect::<StorageResult<_>>()?,
        ),
        _ => return Err(provider()),
    })
}
impl StorageAdapter for DynamoStorageAdapter {
    fn name(&self) -> &str {
        "dynamodb"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 100,
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            let found = self
                .client
                .describe_table()
                .table_name(&self.options.table_name)
                .send()
                .await;
            match found {
                Ok(response) => {
                    let table = response.table().ok_or_else(provider)?;
                    let keys = table.key_schema();
                    if keys.len() != 2
                        || !keys
                            .iter()
                            .any(|k| k.attribute_name() == "pk" && k.key_type() == &KeyType::Hash)
                        || !keys
                            .iter()
                            .any(|k| k.attribute_name() == "sk" && k.key_type() == &KeyType::Range)
                    {
                        return Err(provider());
                    }
                    Ok(())
                }
                Err(error)
                    if error
                        .as_service_error()
                        .is_some_and(|e| e.is_resource_not_found_exception())
                        && self.options.create_table =>
                {
                    self.client
                        .create_table()
                        .table_name(&self.options.table_name)
                        .billing_mode(BillingMode::PayPerRequest)
                        .key_schema(
                            KeySchemaElement::builder()
                                .attribute_name("pk")
                                .key_type(KeyType::Hash)
                                .build()
                                .map_err(|_| invalid())?,
                        )
                        .key_schema(
                            KeySchemaElement::builder()
                                .attribute_name("sk")
                                .key_type(KeyType::Range)
                                .build()
                                .map_err(|_| invalid())?,
                        )
                        .attribute_definitions(
                            AttributeDefinition::builder()
                                .attribute_name("pk")
                                .attribute_type(ScalarAttributeType::S)
                                .build()
                                .map_err(|_| invalid())?,
                        )
                        .attribute_definitions(
                            AttributeDefinition::builder()
                                .attribute_name("sk")
                                .attribute_type(ScalarAttributeType::S)
                                .build()
                                .map_err(|_| invalid())?,
                        )
                        .send()
                        .await
                        .map_err(|_| provider())?;
                    Ok(())
                }
                Err(_) => Err(provider()),
            }
        })
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            let unique = ids.iter().collect::<std::collections::BTreeSet<_>>();
            let ids = unique.into_iter().cloned().collect::<Vec<_>>();
            let mut result = BTreeMap::new();
            for chunk in ids.chunks(100) {
                let allowed = chunk.iter().collect::<HashSet<_>>();
                let keys = KeysAndAttributes::builder()
                    .consistent_read(true)
                    .set_keys(Some(chunk.iter().map(|id| self.key(entity, id)).collect()))
                    .build()
                    .map_err(|_| invalid())?;
                let mut pending = HashMap::from([(self.options.table_name.clone(), keys)]);
                for attempt in 0..8 {
                    let response = self
                        .client
                        .batch_get_item()
                        .set_request_items(Some(pending))
                        .send()
                        .await
                        .map_err(|_| provider())?;
                    if let Some(tables) = response.responses() {
                        if tables.keys().any(|table| table != &self.options.table_name) {
                            return Err(provider());
                        }
                        for item in tables.get(&self.options.table_name).into_iter().flatten() {
                            let row = self.decode(entity, item)?;
                            if !allowed.contains(&row.id)
                                || result.insert(row.id.clone(), row).is_some()
                            {
                                return Err(provider());
                            }
                        }
                    }
                    pending = response.unprocessed_keys.unwrap_or_default();
                    if pending.is_empty() {
                        break;
                    }
                    if attempt == 7 || pending.len() != 1 {
                        return Err(provider());
                    }
                    let remaining = pending.get(&self.options.table_name).ok_or_else(provider)?;
                    for key in remaining.keys() {
                        if key.get("pk").and_then(|v| v.as_s().ok())
                            != Some(&self.partition(entity))
                            || key
                                .get("sk")
                                .and_then(|v| v.as_s().ok())
                                .is_none_or(|id| !allowed.contains(id))
                        {
                            return Err(provider());
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(
                        (10u64 << attempt).min(500),
                    ))
                    .await;
                }
            }
            Ok(result)
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, 100)?;
            if writes.is_empty() {
                return Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                });
            }
            let mut transactions = Vec::with_capacity(writes.len());
            for write in writes {
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
                let condition = if matches!(write, RowWrite::Put { .. }) && expected.is_none() {
                    Some("attribute_not_exists(pk)")
                } else {
                    expected.map(|_| "#row.#rev = :rev")
                };
                let names = expected.map(|_| {
                    HashMap::from([
                        ("#row".into(), "row".into()),
                        ("#rev".into(), "_rev".into()),
                    ])
                });
                let values = expected.map(|rev| {
                    HashMap::from([(":rev".into(), AttributeValue::N(rev.to_string()))])
                });
                let item = match write {
                    RowWrite::Put { row, .. } => {
                        let mut item = self.key(entity, id);
                        item.insert(
                            "row".into(),
                            to_attribute(serde_json::to_value(row).map_err(|_| invalid())?),
                        );
                        TransactWriteItem::builder()
                            .put(
                                Put::builder()
                                    .table_name(&self.options.table_name)
                                    .set_item(Some(item))
                                    .set_condition_expression(condition.map(str::to_owned))
                                    .set_expression_attribute_names(names)
                                    .set_expression_attribute_values(values)
                                    .build()
                                    .map_err(|_| invalid())?,
                            )
                            .build()
                    }
                    RowWrite::Delete { .. } => TransactWriteItem::builder()
                        .delete(
                            Delete::builder()
                                .table_name(&self.options.table_name)
                                .set_key(Some(self.key(entity, id)))
                                .set_condition_expression(condition.map(str::to_owned))
                                .set_expression_attribute_names(names)
                                .set_expression_attribute_values(values)
                                .build()
                                .map_err(|_| invalid())?,
                        )
                        .build(),
                };
                transactions.push(item);
            }
            match self
                .client
                .transact_write_items()
                .set_transact_items(Some(transactions))
                .client_request_token(uuid::Uuid::new_v4().to_string())
                .send()
                .await
            {
                Ok(_) => Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                }),
                Err(error) => {
                    if error.as_service_error().is_some_and(|e|match e{aws_sdk_dynamodb::operation::transact_write_items::TransactWriteItemsError::TransactionCanceledException(e)=>e.cancellation_reasons().iter().any(|r|matches!(r.code(),Some("ConditionalCheckFailed"|"TransactionConflict"))),_=>false}){return Ok(CommitResult{ok:false,conflicts:writes.iter().map(|w|match w{RowWrite::Put{row,..}=>row.id.clone(),RowWrite::Delete{id,..}=>id.clone()}).collect()});}
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
            memory::validate_query(entity, query)?;
            if query.limit == 0 {
                return Ok(vec![]);
            }
            let mut rows = Vec::new();
            let mut seen = HashSet::new();
            let mut cursor = None;
            let mut last = None;
            loop {
                let response = self
                    .client
                    .query()
                    .table_name(&self.options.table_name)
                    .key_condition_expression("pk = :pk")
                    .expression_attribute_values(":pk", AttributeValue::S(self.partition(entity)))
                    .consistent_read(true)
                    .limit(1000)
                    .set_exclusive_start_key(cursor)
                    .send()
                    .await
                    .map_err(|_| provider())?;
                let page_empty = response.items().is_empty();
                for item in response.items() {
                    let row = self.decode(entity, item)?;
                    if !seen.insert(row.id.clone()) || rows.len() >= self.options.max_query_rows {
                        return Err(provider());
                    }
                    rows.push(row);
                }
                cursor = response.last_evaluated_key;
                if cursor.as_ref().is_none_or(HashMap::is_empty) {
                    break;
                }
                if page_empty {
                    return Err(provider());
                }
                let key = cursor.as_ref().unwrap();
                if key.get("pk").and_then(|v| v.as_s().ok()) != Some(&self.partition(entity)) {
                    return Err(provider());
                }
                let id = key
                    .get("sk")
                    .and_then(|v| v.as_s().ok())
                    .ok_or_else(provider)?
                    .clone();
                if last.as_ref() == Some(&id) {
                    return Err(provider());
                }
                last = Some(id);
            }
            memory::filter_rows(entity, rows, query)
        })
    }
}
fn invalid() -> StorageError {
    StorageError::Invalid("Invalid customer DynamoDB configuration or operation.")
}
fn provider() -> StorageError {
    StorageError::Provider("Customer DynamoDB operation failed; a write outcome may be uncertain.")
}
