use polymorfa_sdk::storage::{
    memory::MemoryAdapter,
    merge::{canonical_json, public_row},
    reducer::history::{proto_number, reduce_history_chunk, HistoryChunkInput, ProtoInt},
    schema::ALL_ENTITIES,
    *,
};
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Arc};
fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/numeric-storage/fixture.json")).unwrap()
}
#[test]
fn public_numeric_string_bits() {
    for v in fixture()["strings"].as_array().unwrap() {
        let n = proto_number(&ProtoInt::Decimal(v["input"].as_str().unwrap().into()));
        assert_eq!(
            n.map(|n| format!("{:016x}", n.to_bits())),
            v["bits"].as_str().map(str::to_owned),
            "input {:?}",
            v["input"]
        );
    }
}
#[tokio::test]
async fn public_numeric_reducer_memory_rows_replay_watermarks_and_strict_schema() {
    for h in fixture()["histories"].as_array().unwrap() {
        let a = Arc::new(MemoryAdapter::new());
        let s = Storage::new(a.clone(), Default::default()).unwrap();
        let b = reduce_history_chunk(&HistoryChunkInput {
            session_id: "numeric".into(),
            chunk: serde_json::from_value(h["chunk"].clone()).unwrap(),
            identities: None,
            chunk_id: Some(h["name"].as_str().unwrap().into()),
        });
        assert_eq!(
            canonical_json(&serde_json::to_value(&b.operations).unwrap()),
            canonical_json(&h["operations"])
        );
        assert!(s.apply(&b).await.unwrap().applied);
        snapshot(&a, &h["rows"]);
        assert!(!s.apply(&b).await.unwrap().applied);
        for (i, c) in h["cleanup"].as_array().unwrap().iter().enumerate() {
            let ops = serde_json::from_value(c["operations"].clone()).unwrap();
            s.apply(&OperationBatch {
                session_id: "numeric".into(),
                operations: ops,
                event_id: None,
                event_type: None,
            })
            .await
            .unwrap();
            let mut late = b.clone();
            late.event_id = Some(format!("late{i}"));
            s.apply(&late).await.unwrap();
            snapshot(&a, &c["rows"]);
        }
    }
    let a = Arc::new(MemoryAdapter::new());
    let s = Storage::new(a, Default::default()).unwrap();
    let key = RowKey::from([
        ("sessionId".into(), "numeric".into()),
        ("messageId".into(), "strict".into()),
    ]);
    let b = OperationBatch {
        session_id: "numeric".into(),
        event_id: None,
        event_type: None,
        operations: vec![StorageOperation::Upsert {
            entity: Entity::Messages,
            key,
            fields: BTreeMap::from([(
                "timestamp".into(),
                FieldWrite {
                    value: json!("16"),
                    version: 1.,
                },
            )]),
            guard: None,
        }],
    };
    assert!(s.apply(&b).await.is_err());
    assert!(
        serde_json::from_value::<StoredRow>(json!({"_id":"strict","_rev":"16","_v":{}})).is_err()
    );
}
fn snapshot(a: &MemoryAdapter, expected: &Value) {
    for e in ALL_ENTITIES {
        if matches!(e, Entity::Leases | Entity::Events) {
            continue;
        }
        let mut actual = a
            .rows(e)
            .iter()
            .map(|r| canonical_json(&serde_json::to_value(public_row(e, r)).unwrap()))
            .collect::<Vec<_>>();
        let mut want = expected[e.definition().name]
            .as_array()
            .unwrap()
            .iter()
            .map(canonical_json)
            .collect::<Vec<_>>();
        actual.sort();
        want.sort();
        assert_eq!(actual, want, "entity {}", e.definition().name);
    }
}
