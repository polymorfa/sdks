//! Customer-owned libSQL/Turso through a caller-owned native libsql connection.
use super::sql_schema::{column_name, columns, sql_value, table, SqlDialect, SqlStorageOptions};
use super::*;
use schema::FieldType;

#[derive(Clone)]
pub struct LibsqlStorageOptions {
    pub table_prefix: String,
    pub create_tables: bool,
}
impl Default for LibsqlStorageOptions {
    fn default() -> Self {
        Self {
            table_prefix: "polymorfa_".into(),
            create_tables: true,
        }
    }
}
/// Schema-2 DDL shared with the SQL adapters and TypeScript storage producer.
pub fn schema_statements(options: &LibsqlStorageOptions) -> StorageResult<Vec<String>> {
    super::sql_schema::schema_statements(SqlDialect::Sqlite, &sql_options(options))
}
fn sql_options(options: &LibsqlStorageOptions) -> SqlStorageOptions {
    SqlStorageOptions {
        table_prefix: options.table_prefix.clone(),
        create_tables: options.create_tables,
        ..Default::default()
    }
}
pub struct LibsqlStorageAdapter {
    connection: ::libsql::Connection,
    options: LibsqlStorageOptions,
    dialect: SqlDialect,
}
impl LibsqlStorageAdapter {
    /// Retains a native connection. The caller owns its independent customer credentials
    /// and database lifetime. No Polymorfa API client or credential is accepted.
    ///
    /// ```rust,no_run
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// use polymorfa_sdk::storage::libsql::{LibsqlStorageAdapter, LibsqlStorageOptions};
    /// let database = ::libsql::Builder::new_remote(
    ///     std::env::var("CUSTOMER_LIBSQL_URL")?,
    ///     std::env::var("CUSTOMER_LIBSQL_TOKEN")?,
    /// ).build().await?;
    /// let adapter = LibsqlStorageAdapter::new(database.connect()?, LibsqlStorageOptions::default())?;
    /// # let _ = adapter;
    /// # Ok(()) }
    /// ```
    pub fn new(
        connection: ::libsql::Connection,
        options: LibsqlStorageOptions,
    ) -> StorageResult<Self> {
        schema_statements(&options)?;
        Ok(Self {
            connection,
            options,
            dialect: SqlDialect::Sqlite,
        })
    }
    fn table(&self, entity: Entity) -> StorageResult<String> {
        table(
            self.dialect,
            &sql_options(&self.options),
            entity.definition().name,
        )
    }
    fn q(&self, field: &str) -> StorageResult<String> {
        self.dialect.quote(&column_name(field))
    }
    fn projection(&self, entity: Entity) -> StorageResult<String> {
        columns(entity)
            .iter()
            .map(|c| self.q(&c.field))
            .collect::<StorageResult<Vec<_>>>()
            .map(|v| v.join(","))
    }
    fn decode(&self, entity: Entity, raw: ::libsql::Row) -> StorageResult<StoredRow> {
        let mut value = serde_json::Map::new();
        for (i, c) in columns(entity).into_iter().enumerate() {
            let cell = raw.get_value(i as i32).map_err(|_| provider())?;
            let v = match cell {
                ::libsql::Value::Null => Value::Null,
                ::libsql::Value::Integer(v) if c.revision => serde_json::json!(v),
                ::libsql::Value::Integer(v) if c.kind == FieldType::Number => {
                    serde_json::json!(v as f64)
                }
                ::libsql::Value::Real(v) if c.kind == FieldType::Number && v.is_finite() => {
                    serde_json::json!(v)
                }
                ::libsql::Value::Integer(v) if c.kind == FieldType::Boolean => Value::Bool(v != 0),
                ::libsql::Value::Text(v) if c.kind == FieldType::String => Value::String(v),
                ::libsql::Value::Text(v) if c.kind == FieldType::Json => {
                    serde_json::from_str(&v).map_err(|_| provider())?
                }
                _ => return Err(provider()),
            };
            value.insert(c.field, v);
        }
        let row: StoredRow =
            serde_json::from_value(Value::Object(value)).map_err(|_| provider())?;
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
    async fn fetch(
        &self,
        entity: Entity,
        sql: &str,
        values: Vec<Value>,
    ) -> StorageResult<Vec<StoredRow>> {
        let mut rows = self
            .connection
            .query(sql, params(values)?)
            .await
            .map_err(|_| provider())?;
        let mut result = Vec::new();
        while let Some(row) = rows.next().await.map_err(|_| provider())? {
            result.push(self.decode(entity, row)?);
        }
        Ok(result)
    }
}
fn params(values: Vec<Value>) -> StorageResult<Vec<::libsql::Value>> {
    values
        .into_iter()
        .map(|value| {
            Ok(match value {
                Value::Null => ::libsql::Value::Null,
                Value::String(v) => ::libsql::Value::Text(v),
                Value::Bool(v) => ::libsql::Value::Integer(i64::from(v)),
                Value::Number(v) => {
                    if let Some(i) = v.as_i64() {
                        ::libsql::Value::Integer(i)
                    } else {
                        ::libsql::Value::Real(
                            v.as_f64()
                                .ok_or(StorageError::Invalid("Invalid libSQL number."))?,
                        )
                    }
                }
                _ => return Err(StorageError::Invalid("Invalid libSQL parameter.")),
            })
        })
        .collect()
}
fn provider() -> StorageError {
    StorageError::Provider(
        "Customer libSQL storage operation failed; a commit outcome may be unknown.",
    )
}
fn write_ids(writes: &[RowWrite]) -> Vec<String> {
    writes
        .iter()
        .map(|w| match w {
            RowWrite::Put { row, .. } => row.id.clone(),
            RowWrite::Delete { id, .. } => id.clone(),
        })
        .collect()
}
fn conflict(error: &::libsql::Error) -> bool {
    match error {
        ::libsql::Error::SqliteFailure(code, _)
        | ::libsql::Error::RemoteSqliteFailure(code, _, _) => matches!(*code, 5 | 6 | 1555 | 2067),
        _ => false,
    }
}
impl StorageAdapter for LibsqlStorageAdapter {
    fn name(&self) -> &str {
        "libsql"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 500,
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            if self.options.create_tables {
                for statement in schema_statements(&self.options)? {
                    self.connection
                        .execute(&statement, ())
                        .await
                        .map_err(|_| provider())?;
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
            let mut result = BTreeMap::new();
            for group in ids.chunks(500) {
                let marks = vec!["?"; group.len()].join(",");
                let sql = format!(
                    "SELECT {} FROM {} WHERE {} IN ({marks})",
                    self.projection(entity)?,
                    self.table(entity)?,
                    self.q("_id")?
                );
                for row in self
                    .fetch(
                        entity,
                        &sql,
                        group.iter().cloned().map(Value::String).collect(),
                    )
                    .await?
                {
                    result.insert(row.id.clone(), row);
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
            let transaction = match self
                .connection
                .transaction_with_behavior(::libsql::TransactionBehavior::Immediate)
                .await
            {
                Ok(transaction) => transaction,
                Err(error) if conflict(&error) => {
                    return Ok(CommitResult {
                        ok: false,
                        conflicts: write_ids(writes),
                    })
                }
                Err(_) => return Err(provider()),
            };
            for write in writes {
                let (entity, id, expected) = match write {
                    RowWrite::Put {
                        entity,
                        row,
                        expected_revision,
                    } => (*entity, &row.id, *expected_revision),
                    RowWrite::Delete {
                        entity,
                        id,
                        expected_revision,
                    } => (*entity, id, *expected_revision),
                };
                let (sql, values) = match write {
                    RowWrite::Put { row, .. } => {
                        let columns = columns(entity);
                        let raw = serde_json::to_value(row).map_err(|_| provider())?;
                        if expected.is_none() {
                            let fields = columns
                                .iter()
                                .map(|c| self.q(&c.field))
                                .collect::<StorageResult<Vec<_>>>()?
                                .join(",");
                            let marks = columns
                                .iter()
                                .enumerate()
                                .map(|(n, c)| self.dialect.mark(n + 1, Some(c)))
                                .collect::<Vec<_>>()
                                .join(",");
                            (
                                format!(
                                    "INSERT INTO {} ({fields}) VALUES ({marks})",
                                    self.table(entity)?
                                ),
                                columns
                                    .iter()
                                    .map(|c| sql_value(c, &raw[&c.field]))
                                    .collect::<StorageResult<Vec<_>>>()?,
                            )
                        } else {
                            let columns = columns
                                .into_iter()
                                .filter(|c| c.field != "_id")
                                .collect::<Vec<_>>();
                            let sets = columns
                                .iter()
                                .enumerate()
                                .map(|(n, c)| {
                                    Ok(format!(
                                        "{}={}",
                                        self.q(&c.field)?,
                                        self.dialect.mark(n + 1, Some(c))
                                    ))
                                })
                                .collect::<StorageResult<Vec<_>>>()?
                                .join(",");
                            let mut values = columns
                                .iter()
                                .map(|c| sql_value(c, &raw[&c.field]))
                                .collect::<StorageResult<Vec<_>>>()?;
                            values.push(Value::String(id.clone()));
                            values.push(serde_json::json!(expected));
                            (
                                format!(
                                    "UPDATE {} SET {sets} WHERE {}={} AND {}={}",
                                    self.table(entity)?,
                                    self.q("_id")?,
                                    self.dialect.mark(values.len() - 1, None),
                                    self.q("_rev")?,
                                    self.dialect.mark(values.len(), None)
                                ),
                                values,
                            )
                        }
                    }
                    RowWrite::Delete { .. } => {
                        let mut values = vec![Value::String(id.clone())];
                        let mut sql = format!(
                            "DELETE FROM {} WHERE {}={}",
                            self.table(entity)?,
                            self.q("_id")?,
                            self.dialect.mark(1, None)
                        );
                        if let Some(rev) = expected {
                            values.push(serde_json::json!(rev));
                            sql.push_str(&format!(
                                " AND {}={}",
                                self.q("_rev")?,
                                self.dialect.mark(2, None)
                            ));
                        }
                        (sql, values)
                    }
                };
                let result = transaction.execute(&sql, params(values)?).await;
                match result {
                    Ok(result) if expected.is_some() && result == 0 => {
                        transaction.rollback().await.map_err(|_| provider())?;
                        return Ok(CommitResult {
                            ok: false,
                            conflicts: vec![id.clone()],
                        });
                    }
                    Err(e) => {
                        let known_conflict = conflict(&e);
                        transaction.rollback().await.map_err(|_| provider())?;
                        // The remote driver's structured Hrana error is private. Re-read the
                        // failed CAS after rollback instead of matching sensitive error text.
                        let current = self.get(entity, std::slice::from_ref(id)).await?;
                        let changed = match write {
                            RowWrite::Put { .. } if expected.is_none() => current.contains_key(id),
                            _ if expected.is_some() => {
                                current.get(id).map(|row| row.revision) != expected
                            }
                            _ => false,
                        };
                        return if known_conflict || changed {
                            Ok(CommitResult {
                                ok: false,
                                conflicts: vec![id.clone()],
                            })
                        } else {
                            Err(provider())
                        };
                    }
                    _ => {}
                }
            }
            transaction.commit().await.map_err(|_| provider())?;
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
        Box::pin(async move {
            let index = memory::validate_query(entity, query)?;
            let mut values = Vec::new();
            let mut clauses = Vec::new();
            let add = |value: Value, values: &mut Vec<Value>| {
                values.push(value);
                self.dialect.mark(values.len(), None)
            };
            for name in index.equals {
                clauses.push(format!(
                    "{}={}",
                    self.q(name)?,
                    add(Value::String(query.equals[*name].clone()), &mut values)
                ));
            }
            let sort = format!("COALESCE({},0)", self.q(index.sort)?);
            if let Some(range) = &query.range {
                for (op, v) in [
                    (">", range.gt),
                    (">=", range.gte),
                    ("<", range.lt),
                    ("<=", range.lte),
                ] {
                    if let Some(v) = v {
                        clauses.push(format!(
                            "{sort}{op}{}",
                            add(serde_json::json!(v), &mut values)
                        ));
                    }
                }
            }
            let descending = query.order.as_deref() == Some("desc");
            if let Some(after) = &query.after {
                let op = if descending { "<" } else { ">" };
                let a = add(serde_json::json!(after.sort), &mut values);
                let b = add(serde_json::json!(after.sort), &mut values);
                let c = add(Value::String(after.id.clone()), &mut values);
                clauses.push(format!(
                    "({sort}{op}{a} OR ({sort}={b} AND {}{op}{c}))",
                    self.q("_id")?
                ));
            }
            let order = if descending { "DESC" } else { "ASC" };
            let sql = format!(
                "SELECT {} FROM {} WHERE {} ORDER BY {sort} {order},{} {order} LIMIT {}",
                self.projection(entity)?,
                self.table(entity)?,
                clauses.join(" AND "),
                self.q("_id")?,
                query.limit
            );
            self.fetch(entity, &sql, values).await
        })
    }
}
