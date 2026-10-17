use super::{
    schema::FieldType, Entity, FieldWrites, RowKey, StorageError, StorageResult, StoredRow,
};
use serde_json::Value;
use std::{cmp::Ordering, collections::BTreeMap};
pub const FINAL_VERSION: f64 = 9007199254740991.;
pub fn empty_row(entity: Entity, key: &RowKey) -> StorageResult<StoredRow> {
    let definition = entity.definition();
    let mut fields = BTreeMap::new();
    for name in definition.key {
        fields.insert(
            (*name).into(),
            Value::String(
                key.get(*name)
                    .cloned()
                    .ok_or(StorageError::Invalid("Missing storage key"))?,
            ),
        );
    }
    for (name, _) in definition.fields {
        fields.insert((*name).into(), Value::Null);
    }
    for index in definition.indexes {
        fields.insert(index.sort.into(), Value::from(0));
    }
    Ok(StoredRow {
        id: super::schema::encode_key(entity, key)?,
        revision: 0,
        versions: BTreeMap::new(),
        fields,
    })
}
pub fn public_row(entity: Entity, row: &StoredRow) -> BTreeMap<String, Value> {
    let d = entity.definition();
    d.key
        .iter()
        .copied()
        .chain(d.fields.iter().map(|f| f.0))
        .map(|name| {
            (
                name.to_owned(),
                row.fields.get(name).cloned().unwrap_or(Value::Null),
            )
        })
        .collect()
}
fn rank(value: &Value) -> u8 {
    match value {
        Value::Null => 0,
        Value::Bool(_) => 1,
        Value::Number(_) => 2,
        Value::String(_) => 3,
        Value::Array(_) | Value::Object(_) => 4,
    }
}
pub fn compare_values(a: &Value, b: &Value) -> Ordering {
    let order = rank(a).cmp(&rank(b));
    if order != Ordering::Equal {
        return order;
    }
    match (a, b) {
        (Value::Null, Value::Null) => Ordering::Equal,
        (Value::Bool(a), Value::Bool(b)) => a.cmp(b),
        (Value::Number(a), Value::Number(b)) => a
            .as_f64()
            .unwrap()
            .partial_cmp(&b.as_f64().unwrap())
            .unwrap(),
        (Value::String(a), Value::String(b)) => a.encode_utf16().cmp(b.encode_utf16()),
        _ => canonical_json(a)
            .encode_utf16()
            .cmp(canonical_json(b).encode_utf16()),
    }
}
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => value.to_string(),
        Value::Number(number) => js_number(number.as_f64().unwrap()),
        Value::String(value) => serde_json::to_string(value).unwrap(),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(object) => {
            let mut keys = object.keys().collect::<Vec<_>>();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            format!(
                "{{{}}}",
                keys.into_iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical_json(&object[k])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
    }
}
fn js_number(value: f64) -> String {
    if value == 0. {
        return "0".into();
    }
    if !value.is_finite() {
        return "null".into();
    }
    let raw = serde_json::Number::from_f64(value).unwrap().to_string();
    let negative = raw.starts_with('-');
    let text = raw.trim_start_matches('-');
    let (mantissa, exponent) = text
        .split_once('e')
        .map(|(m, e)| (m, e.parse::<i32>().unwrap()))
        .unwrap_or((text, 0));
    let point = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let mut digits = mantissa.replace('.', "");
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    let effective = point + exponent;
    let sign = if negative { "-" } else { "" };
    if effective > 0 && effective <= 21 {
        if effective as usize >= digits.len() {
            format!(
                "{sign}{digits}{}",
                "0".repeat(effective as usize - digits.len())
            )
        } else {
            let (a, b) = digits.split_at(effective as usize);
            format!("{sign}{a}.{b}")
        }
    } else if effective <= 0 && effective > -6 {
        format!("{sign}0.{}{digits}", "0".repeat((-effective) as usize))
    } else {
        let first = &digits[..1];
        let rest = if digits.len() > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        let exp = effective - 1;
        format!(
            "{sign}{first}{rest}e{}{exp}",
            if exp >= 0 { "+" } else { "" }
        )
    }
}
pub fn merge_fields(
    entity: Entity,
    row: &StoredRow,
    fields: &FieldWrites,
) -> StorageResult<(StoredRow, bool)> {
    let d = entity.definition();
    let mut next = row.clone();
    let mut changed = false;
    for (name, write) in fields {
        let kind = d
            .fields
            .iter()
            .find_map(|(n, k)| (*n == name).then_some(*k))
            .ok_or(StorageError::Invalid("Unknown storage field"))?;
        if !write.version.is_finite() {
            return Err(StorageError::Invalid("Field version must be finite"));
        }
        if !matches_type(&write.value, kind) {
            return Err(StorageError::Invalid("Invalid storage field type"));
        }
        let current = next.fields.get(name).unwrap_or(&Value::Null);
        let version = next.versions.get(name);
        let take = match version {
            None => true,
            Some(old) if *old != write.version => write.version > *old,
            _ => compare_values(&write.value, current) == Ordering::Greater,
        };
        if !take {
            continue;
        }
        if version == Some(&write.version)
            && compare_values(&write.value, current) == Ordering::Equal
        {
            continue;
        }
        next.fields.insert(name.clone(), write.value.clone());
        next.versions.insert(name.clone(), write.version);
        changed = true;
    }
    Ok((next, changed))
}
fn matches_type(value: &Value, kind: FieldType) -> bool {
    value.is_null()
        || match kind {
            FieldType::String => value.is_string(),
            FieldType::Number => value.as_f64().is_some_and(f64::is_finite),
            FieldType::Boolean => value.is_boolean(),
            FieldType::Json => true,
        }
}
