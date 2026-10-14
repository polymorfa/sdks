//! Customer-owned PostgreSQL, MySQL and SQLite through SQLx's maintained drivers.
use super::*;
use schema::{FieldType, ALL_ENTITIES};
use sqlx::{
    any::{AnyPoolOptions, AnyRow},
    Any, AnyPool, Row, ValueRef as _,
};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SqlDialect {
    Postgres,
    MySql,
    Sqlite,
}
#[derive(Clone)]
pub struct SqlStorageOptions {
    pub table_prefix: String,
    pub schema: Option<String>,
    pub create_tables: bool,
    pub max_connections: u32,
}
impl Default for SqlStorageOptions {
    fn default() -> Self {
        Self {
            table_prefix: "polymorfa_".into(),
            schema: None,
            create_tables: true,
            max_connections: 5,
        }
    }
}
pub struct SqlStorageAdapter {
    pool: AnyPool,
    dialect: SqlDialect,
    options: SqlStorageOptions,
}
#[derive(Clone)]
struct Column {
    field: String,
    kind: FieldType,
    revision: bool,
}
fn columns(entity: Entity) -> Vec<Column> {
    let d = entity.definition();
    std::iter::once(Column {
        field: "_id".into(),
        kind: FieldType::String,
        revision: false,
    })
    .chain(d.key.iter().map(|f| Column {
        field: (*f).into(),
        kind: FieldType::String,
        revision: false,
    }))
    .chain(d.fields.iter().map(|(f, k)| Column {
        field: (*f).into(),
        kind: *k,
        revision: false,
    }))
    .chain([
        Column {
            field: "_rev".into(),
            kind: FieldType::Number,
            revision: true,
        },
        Column {
            field: "_v".into(),
            kind: FieldType::Json,
            revision: false,
        },
    ])
    .collect()
}
fn identifier(value: &str) -> StorageResult<()> {
    if value.is_empty()
        || !value
            .bytes()
            .next()
            .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_')
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err(StorageError::Invalid("Invalid customer SQL identifier."));
    }
    Ok(())
}
fn column_name(field: &str) -> String {
    if field.starts_with('_') {
        return field.into();
    }
    let mut name = String::new();
    for c in field.chars() {
        if c.is_ascii_uppercase() {
            name.push('_');
            name.push(c.to_ascii_lowercase());
        } else {
            name.push(c);
        }
    }
    name
}
impl SqlDialect {
    fn quote(self, name: &str) -> StorageResult<String> {
        identifier(name)?;
        if self == Self::Postgres && name.len() > 63 || self == Self::MySql && name.len() > 64 {
            return Err(StorageError::Invalid(
                "Derived SQL identifier exceeds the selected database limit.",
            ));
        }
        let q = if self == Self::MySql { '`' } else { '"' };
        Ok(format!("{q}{name}{q}"))
    }
    fn kind(self, kind: FieldType) -> &'static str {
        match (self, kind) {
            (Self::Postgres, FieldType::String) => "text",
            (Self::Postgres, FieldType::Number) => "double precision",
            (Self::Postgres, FieldType::Boolean) => "boolean",
            (Self::Postgres, FieldType::Json) => "jsonb",
            (Self::MySql, FieldType::String) => "mediumtext",
            (Self::MySql, FieldType::Number) => "double",
            (Self::MySql, FieldType::Boolean) => "tinyint(1)",
            (Self::MySql, FieldType::Json) => "json",
            (_, FieldType::String | FieldType::Json) => "text",
            (_, FieldType::Number) => "real",
            (_, FieldType::Boolean) => "integer",
        }
    }
    fn key_type(self, id: bool) -> &'static str {
        match self {
            Self::Postgres if id => "text COLLATE \"C\"",
            Self::Postgres | Self::Sqlite => "text",
            Self::MySql if id => "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin",
            Self::MySql => "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin",
        }
    }
    fn mark(self, index: usize, column: Option<&Column>) -> String {
        if self != Self::Postgres {
            return "?".into();
        }
        let mut mark = format!("${index}");
        if let Some(c) = column {
            mark.push_str("::");
            mark.push_str(if c.revision {
                "bigint"
            } else {
                self.kind(c.kind)
            });
        }
        mark
    }
}
fn table(dialect: SqlDialect, options: &SqlStorageOptions, name: &str) -> StorageResult<String> {
    let t = dialect.quote(&format!("{}{name}", options.table_prefix))?;
    if dialect == SqlDialect::Postgres {
        if let Some(schema) = &options.schema {
            return Ok(format!("{}.{t}", dialect.quote(schema)?));
        }
    }
    Ok(t)
}
/// Schema-2 DDL compatible with the TypeScript storage producer. No connection secrets enter the script.
pub fn schema_statements(
    dialect: SqlDialect,
    options: &SqlStorageOptions,
) -> StorageResult<Vec<String>> {
    identifier(&options.table_prefix)?;
    if options.table_prefix.len() > 64 {
        return Err(StorageError::Invalid("SQL prefix exceeds 64 characters."));
    }
    if options.schema.is_some() && dialect != SqlDialect::Postgres {
        return Err(StorageError::Invalid("SQL schemas require PostgreSQL."));
    }
    let mut statements = Vec::new();
    if let Some(schema) = &options.schema {
        statements.push(format!(
            "CREATE SCHEMA IF NOT EXISTS {}",
            dialect.quote(schema)?
        ));
    }
    for entity in ALL_ENTITIES {
        let d = entity.definition();
        let q = |f: &str| dialect.quote(&column_name(f));
        let t = table(dialect, options, d.name)?;
        let mut fields = vec![format!(
            "{} {} NOT NULL PRIMARY KEY",
            q("_id")?,
            dialect.key_type(true)
        )];
        for key in d.key {
            fields.push(format!("{} {} NOT NULL", q(key)?, dialect.key_type(false)));
        }
        for (field, kind) in d.fields {
            let indexed = d.indexes.iter().any(|i| i.equals.contains(field));
            let kind = if dialect == SqlDialect::MySql && *kind == FieldType::String && indexed {
                dialect.key_type(false)
            } else {
                dialect.kind(*kind)
            };
            fields.push(format!("{} {kind}", q(field)?));
        }
        fields.push(format!("{} bigint NOT NULL", q("_rev")?));
        fields.push(format!(
            "{} {} NOT NULL",
            q("_v")?,
            dialect.kind(FieldType::Json)
        ));
        for index in d.indexes {
            let name = dialect.quote(&format!(
                "{}{}_{}",
                options.table_prefix, d.name, index.name
            ))?;
            let cols = index
                .equals
                .iter()
                .copied()
                .chain([index.sort, "_id"])
                .map(q)
                .collect::<StorageResult<Vec<_>>>()?
                .join(", ");
            if dialect == SqlDialect::MySql {
                fields.push(format!("KEY {name} ({cols})"));
            } else {
                statements.push(format!("CREATE INDEX IF NOT EXISTS {name} ON {t} ({cols})"));
            }
        }
        if dialect == SqlDialect::MySql {
            let cols = d
                .key
                .iter()
                .map(|f| q(f))
                .collect::<StorageResult<Vec<_>>>()?
                .join(", ");
            fields.push(format!(
                "UNIQUE KEY {} ({cols})",
                dialect.quote(&format!("{}{}_key", options.table_prefix, d.name))?
            ));
        }
        let ddl = format!(
            "CREATE TABLE IF NOT EXISTS {t} ({}){}",
            fields.join(", "),
            if dialect == SqlDialect::MySql {
                " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"
            } else {
                ""
            }
        );
        // The table must precede its indexes.
        let at = statements.len()
            - if dialect == SqlDialect::MySql {
                0
            } else {
                d.indexes.len()
            };
        statements.insert(at, ddl);
    }
    let meta = table(dialect, options, "storage_schema")?;
    let id = dialect.quote("id")?;
    let version = dialect.quote("version")?;
    statements.push(format!(
        "CREATE TABLE IF NOT EXISTS {meta} ({id} {} PRIMARY KEY, {version} integer NOT NULL)",
        dialect.key_type(false)
    ));
    statements.push(match dialect{SqlDialect::MySql=>format!("INSERT INTO {meta} ({id},{version}) VALUES ('storage',2) ON DUPLICATE KEY UPDATE {version}=VALUES({version})"),_=>format!("INSERT INTO {meta} ({id},{version}) VALUES ('storage',2) ON CONFLICT ({id}) DO UPDATE SET {version}=excluded.{version}")});
    Ok(statements)
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
fn sql_value(column: &Column, value: &Value) -> StorageResult<Value> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    if column.kind == FieldType::Json {
        return serde_json::to_string(value)
            .map(Value::String)
            .map_err(|_| provider());
    }
    if column.kind == FieldType::Number && !column.revision {
        return value
            .as_f64()
            .map(|v| serde_json::json!(v))
            .ok_or(StorageError::Invalid("Invalid SQL numeric field."));
    }
    Ok(value.clone())
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
