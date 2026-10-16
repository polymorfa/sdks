//! Customer-owned PostgreSQL, MySQL and SQLite through SQLx's maintained drivers.
use super::sql_schema::{column_name, columns, sql_value, table};
pub use super::sql_schema::{schema_statements, SqlDialect, SqlStorageOptions};
use super::*;
use schema::{FieldType, ALL_ENTITIES};
use sqlx::{
    any::{AnyPoolOptions, AnyRow},
    Any, AnyPool, Row, ValueRef as _,
};
pub struct SqlStorageAdapter {
    pool: AnyPool,
    dialect: SqlDialect,
    options: SqlStorageOptions,
}
impl SqlStorageAdapter {
    pub async fn connect(
        dialect: SqlDialect,
        connection_url: &str,
        options: SqlStorageOptions,
    ) -> StorageResult<Self> {
        schema_statements(dialect, &options)?;
        let expected = match dialect {
            SqlDialect::Postgres => ["postgres:", "postgresql:"].as_slice(),
            SqlDialect::MySql => ["mysql:"].as_slice(),
            SqlDialect::Sqlite => ["sqlite:"].as_slice(),
        };
        if !expected
            .iter()
            .any(|scheme| connection_url.starts_with(scheme))
            || options.max_connections == 0
        {
            return Err(StorageError::Invalid(
                "SQL connection does not match its selected driver.",
            ));
        }
        sqlx::any::install_default_drivers();
        let pool = AnyPoolOptions::new()
            .max_connections(
                if dialect == SqlDialect::Sqlite && connection_url.contains(":memory:") {
                    1
                } else {
                    options.max_connections
                },
            )
            .connect(connection_url)
            .await
            .map_err(|_| provider())?;
        Ok(Self {
            pool,
            dialect,
            options,
        })
    }
    pub async fn close(&self) {
        self.pool.close().await;
    }
    fn table(&self, entity: Entity) -> StorageResult<String> {
        table(self.dialect, &self.options, entity.definition().name)
    }
    fn q(&self, field: &str) -> StorageResult<String> {
        self.dialect.quote(&column_name(field))
    }
    fn projection(&self, entity: Entity) -> StorageResult<String> {
        columns(entity)
            .iter()
            .map(|c| {
                let q = self.q(&c.field)?;
                Ok(
                    if self.dialect == SqlDialect::MySql && c.kind == FieldType::Boolean {
                        format!("CAST({q} AS SIGNED) AS {q}")
                    } else if self.dialect == SqlDialect::MySql && c.kind == FieldType::String {
                        format!("CAST({q} AS CHAR) AS {q}")
                    } else if c.kind == FieldType::Json {
                        match self.dialect {
                            SqlDialect::Postgres => format!("{q}::text AS {q}"),
                            SqlDialect::MySql => format!("CAST({q} AS CHAR) AS {q}"),
                            _ => q,
                        }
                    } else {
                        q
                    },
                )
            })
            .collect::<StorageResult<Vec<_>>>()
            .map(|v| v.join(", "))
    }
    fn decode(&self, entity: Entity, raw: AnyRow) -> StorageResult<StoredRow> {
        let mut value = serde_json::Map::new();
        for c in columns(entity) {
            let name = column_name(&c.field);
            let cell = raw.try_get_raw(name.as_str()).map_err(|_| provider())?;
            let v = if cell.is_null() {
                Value::Null
            } else if c.revision {
                serde_json::json!(raw
                    .try_get::<i64, _>(name.as_str())
                    .map_err(|_| provider())?)
            } else {
                match c.kind {
                    FieldType::String => Value::String(sql_text(&raw, name.as_str())?),
                    FieldType::Json => {
                        serde_json::from_str::<Value>(&sql_text(&raw, name.as_str())?)
                            .map_err(|_| provider())?
                    }
                    FieldType::Number => serde_json::json!(raw
                        .try_get::<f64, _>(name.as_str())
                        .map_err(|_| provider())?),
                    FieldType::Boolean => Value::Bool(if self.dialect == SqlDialect::Postgres {
                        raw.try_get::<bool, _>(name.as_str())
                            .map_err(|_| provider())?
                    } else {
                        raw.try_get::<i64, _>(name.as_str())
                            .or_else(|_| raw.try_get::<i32, _>(name.as_str()).map(i64::from))
                            .map_err(|_| provider())?
                            != 0
                    }),
                }
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
    fn bind<'q>(
        &self,
        mut query: sqlx::query::Query<'q, Any, sqlx::any::AnyArguments<'q>>,
        values: Vec<Value>,
    ) -> StorageResult<sqlx::query::Query<'q, Any, sqlx::any::AnyArguments<'q>>> {
        for value in values {
            query = match value {
                Value::Null => query.bind(Option::<String>::None),
                Value::String(s) => query.bind(s),
                Value::Bool(b) => {
                    if self.dialect == SqlDialect::Postgres {
                        query.bind(b)
                    } else {
                        query.bind(i64::from(b))
                    }
                }
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else {
                        query.bind(
                            n.as_f64()
                                .ok_or(StorageError::Invalid("Invalid SQL number."))?,
                        )
                    }
                }
                v => query.bind(serde_json::to_string(&v).map_err(|_| provider())?),
            };
        }
        Ok(query)
    }
}
fn sql_text(raw: &AnyRow, name: &str) -> StorageResult<String> {
    if let Ok(text) = raw.try_get::<String, _>(name) {
        return Ok(text);
    }
    let bytes = raw.try_get::<Vec<u8>, _>(name).map_err(|_| provider())?;
    String::from_utf8(bytes).map_err(|_| provider())
}
fn provider() -> StorageError {
    StorageError::Provider("Customer SQL storage operation failed.")
}
fn conflict(error: &sqlx::Error) -> bool {
    error.as_database_error().is_some_and(|e| {
        e.is_unique_violation()
            || e.code().is_some_and(|c| {
                matches!(
                    c.as_ref(),
                    "40001" | "40P01" | "1213" | "1205" | "5" | "6" | "2067" | "1555"
                )
            })
    })
}
impl StorageAdapter for SqlStorageAdapter {
    fn name(&self) -> &str {
        match self.dialect {
            SqlDialect::Postgres => "postgres",
            SqlDialect::MySql => "mysql",
            SqlDialect::Sqlite => "sqlite",
        }
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: if self.dialect == SqlDialect::Sqlite {
                500
            } else {
                1000
            },
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            if self.options.create_tables {
                for statement in schema_statements(self.dialect, &self.options)? {
                    sqlx::query(&statement)
                        .execute(&self.pool)
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
            let mut rows = BTreeMap::new();
            for group in ids.chunks(500) {
                let marks = (1..=group.len())
                    .map(|n| self.dialect.mark(n, None))
                    .collect::<Vec<_>>()
                    .join(",");
                let sql = format!(
                    "SELECT {} FROM {} WHERE {} IN ({marks})",
                    self.projection(entity)?,
                    self.table(entity)?,
                    self.q("_id")?
                );
                let query = self.bind(
                    sqlx::query(&sql),
                    group.iter().cloned().map(Value::String).collect(),
                )?;
                for raw in query.fetch_all(&self.pool).await.map_err(|_| provider())? {
                    let row = self.decode(entity, raw)?;
                    rows.insert(row.id.clone(), row);
                }
            }
            Ok(rows)
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, self.capabilities().max_commit_size)?;
            if writes.is_empty() {
                return Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                });
            }
            let mut transaction = self.pool.begin().await.map_err(|_| provider())?;
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
                let result = self
                    .bind(sqlx::query(&sql), values)?
                    .execute(&mut *transaction)
                    .await;
                match result {
                    Ok(result) if expected.is_some() && result.rows_affected() == 0 => {
                        transaction.rollback().await.map_err(|_| provider())?;
                        return Ok(CommitResult {
                            ok: false,
                            conflicts: vec![id.clone()],
                        });
                    }
                    Err(e) => {
                        let conditional = conflict(&e);
                        transaction.rollback().await.map_err(|_| provider())?;
                        return if conditional {
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
            self.bind(sqlx::query(&sql), values)?
                .fetch_all(&self.pool)
                .await
                .map_err(|_| provider())?
                .into_iter()
                .map(|raw| self.decode(entity, raw))
                .collect()
        })
    }
}

/// Customer-installed Supabase schema and forced-RLS policies; never installed by adapter setup.
/// Browser reads require Supabase's trusted JWT-to-auth.uid() boundary and live membership.
/// The writer role is a separate trusted server principal, never a browser credential.
#[derive(Clone)]
pub struct SupabasePresetOptions {
    pub sql: SqlStorageOptions,
    pub server_role: String,
    pub reader_role: String,
}
impl Default for SupabasePresetOptions {
    fn default() -> Self {
        Self {
            sql: SqlStorageOptions {
                schema: Some("public".into()),
                ..Default::default()
            },
            server_role: "polymorfa_storage_writer".into(),
            reader_role: "authenticated".into(),
        }
    }
}
pub fn supabase_preset(options: &SupabasePresetOptions) -> StorageResult<String> {
    let mut sql = options.sql.clone();
    let schema = sql.schema.get_or_insert_with(|| "public".into()).clone();
    let q = |name: &str| SqlDialect::Postgres.quote(name);
    if options
        .server_role
        .eq_ignore_ascii_case(&options.reader_role)
        || [&options.server_role, &options.reader_role]
            .iter()
            .any(|role| role.eq_ignore_ascii_case("public"))
    {
        return Err(StorageError::Invalid(
            "Storage reader and server roles must be distinct named roles.",
        ));
    }
    let writer = q(&options.server_role)?;
    let reader = q(&options.reader_role)?;
    let members = format!(
        "{}.{}",
        q(&schema)?,
        q(&format!("{}storage_memberships", sql.table_prefix))?
    );
    let mut statements = schema_statements(SqlDialect::Postgres, &sql)?;
    statements.extend([
        format!("CREATE TABLE IF NOT EXISTS {members} (session_id text NOT NULL, subject uuid NOT NULL, PRIMARY KEY (session_id, subject))"),
        format!("ALTER TABLE {members} ENABLE ROW LEVEL SECURITY"),format!("ALTER TABLE {members} FORCE ROW LEVEL SECURITY"),format!("REVOKE ALL ON {members} FROM PUBLIC"),
        format!("GRANT USAGE ON SCHEMA {} TO {reader}, {writer}",q(&schema)?),format!("GRANT SELECT ON {members} TO {reader}"),format!("GRANT SELECT, INSERT, UPDATE, DELETE ON {members} TO {writer}"),
        format!("CREATE POLICY {} ON {members} FOR SELECT TO {reader} USING (subject = auth.uid())",q(&format!("{}members_self",sql.table_prefix))?),
        format!("CREATE POLICY {} ON {members} TO {writer} USING (true) WITH CHECK (true)",q(&format!("{}members_writer",sql.table_prefix))?),
    ]);
    for entity in ALL_ENTITIES {
        let d = entity.definition();
        let target = table(SqlDialect::Postgres, &sql, d.name)?;
        statements.extend([format!("ALTER TABLE {target} ENABLE ROW LEVEL SECURITY"),format!("ALTER TABLE {target} FORCE ROW LEVEL SECURITY"),format!("REVOKE ALL ON {target} FROM PUBLIC"),format!("GRANT SELECT ON {target} TO {reader}"),format!("GRANT SELECT, INSERT, UPDATE, DELETE ON {target} TO {writer}"),
            format!("CREATE POLICY {} ON {target} FOR SELECT TO {reader} USING (EXISTS (SELECT 1 FROM {members} m WHERE m.session_id = {target}.session_id AND m.subject = auth.uid()))",q(&format!("{}{}_reader",sql.table_prefix,d.name))?),
            format!("CREATE POLICY {} ON {target} TO {writer} USING (true) WITH CHECK (true)",q(&format!("{}{}_writer",sql.table_prefix,d.name))?),
        ]);
    }
    Ok(statements.join(";\n") + ";\n")
}
