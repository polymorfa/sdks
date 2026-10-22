//! Shared schema-2 SQL definitions; contains no driver or credentials.
use super::*;
use schema::{FieldType, ALL_ENTITIES};
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
    #[cfg_attr(not(feature = "storage-sql"), allow(dead_code))]
    pub create_tables: bool,
    #[cfg_attr(not(feature = "storage-sql"), allow(dead_code))]
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
#[derive(Clone)]
pub(super) struct Column {
    pub(super) field: String,
    pub(super) kind: FieldType,
    pub(super) revision: bool,
}
pub(super) fn columns(entity: Entity) -> Vec<Column> {
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
pub(super) fn identifier(value: &str) -> StorageResult<()> {
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
pub(super) fn column_name(field: &str) -> String {
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
    pub(super) fn quote(self, name: &str) -> StorageResult<String> {
        identifier(name)?;
        if self == Self::Postgres && name.len() > 63 || self == Self::MySql && name.len() > 64 {
            return Err(StorageError::Invalid(
                "Derived SQL identifier exceeds the selected database limit.",
            ));
        }
        let q = if self == Self::MySql { '`' } else { '"' };
        Ok(format!("{q}{name}{q}"))
    }
    pub(super) fn kind(self, kind: FieldType) -> &'static str {
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
    pub(super) fn key_type(self, id: bool) -> &'static str {
        match self {
            Self::Postgres if id => "text COLLATE \"C\"",
            Self::Postgres | Self::Sqlite => "text",
            Self::MySql if id => "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin",
            Self::MySql => "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin",
        }
    }
    pub(super) fn mark(self, index: usize, column: Option<&Column>) -> String {
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
pub(super) fn table(
    dialect: SqlDialect,
    options: &SqlStorageOptions,
    name: &str,
) -> StorageResult<String> {
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

pub(super) fn sql_value(column: &Column, value: &Value) -> StorageResult<Value> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    if column.kind == FieldType::Json {
        return serde_json::to_string(value)
            .map(Value::String)
            .map_err(|_| StorageError::Provider("Customer SQL storage operation failed."));
    }
    if column.kind == FieldType::Number && !column.revision {
        return value
            .as_f64()
            .map(|v| serde_json::json!(v))
            .ok_or(StorageError::Invalid("Invalid SQL numeric field."));
    }
    Ok(value.clone())
}
