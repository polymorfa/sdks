use polymorfa_storage_core::{
    memory::MemoryAdapter,
    merge::{canonical_json, public_row},
    reducer::{
        events::{reduce_event, StorageEvent, STORED_EVENT_TYPES},
        history::{reduce_history_chunk, HistoryChunkInput},
    },
    schema::ALL_ENTITIES,
    *,
};
use serde_json::{json, Value};
use std::sync::Arc;
#[test]
fn timestamps_keep_positive_half_rounding_without_changing_large_integers() {
    use polymorfa_storage_core::reducer::common::to_millis;
    assert_eq!(to_millis(Some(1.0005)), Some(1001.));
    assert_eq!(
        to_millis(Some(4_503_599_627_370_497.)),
        Some(4_503_599_627_370_497.)
    );
    assert_eq!(to_millis(Some(f64::INFINITY)), None);
}
#[test]
fn exact_producer_batches_cover_all_twenty_four_events_and_decoded_history() {
    let f: Value =
        serde_json::from_str(include_str!("../fixtures/reducer-batches-3bac.json")).unwrap();
    let mut seen = std::collections::BTreeSet::new();
    for case in f["events"].as_array().unwrap() {
        let event: StorageEvent = serde_json::from_value(case["input"].clone()).unwrap();
        seen.insert(event.event.clone());
        let actual = serde_json::to_value(reduce_event(&event)).unwrap();
        assert_eq!(
            canonical_json(&actual),
            canonical_json(&case["batch"]),
            "event {}",
            event.id
        );
    }
    for event in STORED_EVENT_TYPES {
        assert!(seen.contains(*event));
    }
    for (i, case) in f["history"].as_array().unwrap().iter().enumerate() {
        let input: HistoryChunkInput = serde_json::from_value(case["input"].clone()).unwrap();
        assert_eq!(
            canonical_json(&serde_json::to_value(reduce_history_chunk(&input)).unwrap()),
            canonical_json(&case["batch"]),
            "history case {i}"
        );
    }
}
#[tokio::test]
async fn exact_portable_fixture_rows_and_replay() {
    let f: Value = serde_json::from_str(include_str!("../fixtures/storage-3bac.json")).unwrap();
    for mode in ["events", "history"] {
        let adapter = Arc::new(MemoryAdapter::new());
        let storage = Storage::new(adapter.clone(), StorageOptions::default()).unwrap();
        let batches = if mode == "events" {
            f["events"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| reduce_event(&serde_json::from_value(v.clone()).unwrap()))
                .collect::<Vec<_>>()
        } else {
            vec![reduce_history_chunk(&HistoryChunkInput {
                session_id: "portable-fixture".into(),
                chunk: serde_json::from_value(f["history"].clone()).unwrap(),
                identities: None,
                chunk_id: None,
            })]
        };
        for batch in &batches {
            storage.apply(batch).await.unwrap();
        }
        let snapshot = || -> Value {
            ALL_ENTITIES
                .into_iter()
                .filter(|e| !matches!(e, Entity::Events | Entity::Leases))
                .map(|entity| {
                    (
                        entity.definition().name.into(),
                        json!(adapter
                            .rows(entity)
                            .iter()
                            .map(|r| public_row(entity, r))
                            .collect::<Vec<_>>()),
                    )
                })
                .collect::<serde_json::Map<String, Value>>()
                .into()
        };
        let actual = normalize_rows(snapshot());
        let expected = normalize_rows(
            f[if mode == "events" {
                "eventRows"
            } else {
                "historyRows"
            }]
            .clone(),
        );
        assert!(
            canonical_json(&actual) == canonical_json(&expected),
            "{}",
            first_difference(&actual, &expected, "root")
        );
        for batch in &batches {
            assert_eq!(storage.apply(batch).await.unwrap().writes, 0);
        }
    }
}

fn first_difference(a: &Value, b: &Value, path: &str) -> String {
    if canonical_json(a) == canonical_json(b) {
        return String::new();
    }
    match (a, b) {
        (Value::Object(a), Value::Object(b)) => {
            for k in a.keys().chain(b.keys()) {
                let found = first_difference(
                    a.get(k).unwrap_or(&Value::Null),
                    b.get(k).unwrap_or(&Value::Null),
                    &format!("{path}.{k}"),
                );
                if !found.is_empty() {
                    return found;
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return format!("{path}: lengths {} / {}", a.len(), b.len());
            }
            for (i, (a, b)) in a.iter().zip(b).enumerate() {
                let found = first_difference(a, b, &format!("{path}[{i}]"));
                if !found.is_empty() {
                    return found;
                }
            }
        }
        _ => {}
    }
    format!("{path}: {a} / {b}")
}

fn normalize_rows(mut value: Value) -> Value {
    if let Some(entities) = value.as_object_mut() {
        for rows in entities.values_mut() {
            if let Some(rows) = rows.as_array_mut() {
                rows.sort_by_key(canonical_json);
            }
        }
    }
    value
}

#[path = "support/reducers_sync.rs"]
mod shared;
#[tokio::test]
async fn shared_ordered_sync_negatives() {
    shared::synchronization(Arc::new(MemoryAdapter::new())).await;
}
#[tokio::test]
async fn shared_real_reducer_and_2000_chunk() {
    shared::reducers(Arc::new(MemoryAdapter::new())).await;
}
