#![cfg(feature = "storage-sql")]
use polymorfa_sdk::storage::{
    merge::empty_row,
    schema::ALL_ENTITIES,
    sql::{
        supabase_preset, SqlDialect, SqlStorageAdapter, SqlStorageOptions, SupabasePresetOptions,
    },
    *,
};
use sqlx::{postgres::PgPoolOptions, Row};
use std::{collections::BTreeMap, sync::Arc};
#[test]
fn preset_names_are_validated_and_roles_do_not_collapse() {
    let sql = supabase_preset(&SupabasePresetOptions::default()).unwrap();
    assert_eq!(sql.matches("FORCE ROW LEVEL SECURITY").count(), 18);
    assert!(sql.contains("auth.uid()"));
    assert!(sql.contains("storage_memberships"));
    for (role, reader) in [
        ("same", "same"),
        ("writer", "PUBLIC"),
        ("bad;GRANT ALL", "reader"),
    ] {
        assert!(supabase_preset(&SupabasePresetOptions {
            server_role: role.into(),
            reader_role: reader.into(),
            ..Default::default()
        })
        .is_err());
    }
    assert!(supabase_preset(&SupabasePresetOptions {
        sql: SqlStorageOptions {
            table_prefix: "bad;DROP".into(),
            ..Default::default()
        },
        ..Default::default()
    })
    .is_err());
}
#[tokio::test]
async fn actual_postgres_nonprivileged_roles_force_live_membership_and_read_only_browser_authority()
{
    let Ok(url) = std::env::var("POLYMORFA_STORAGE_RLS_POSTGRES_URL") else {
        eprintln!("SKIP real Supabase policy proof: set independent customer fixture database URL");
        return;
    };
    let target = url::Url::parse(&url).unwrap();
    assert!(
        matches!(target.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
            && target.path() == "/sdk_customer_rls_tests",
        "RLS integration requires its dedicated loopback fixture database"
    );
    let admin = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .unwrap();
    let id = uuid::Uuid::new_v4().simple().to_string();
    let schema = format!("rust_{id}");
    let writer = format!("writer_{id}");
    let reader = format!("reader_{id}");
    let anonymous = format!("anon_{id}");
    let owner = format!("owner_{id}");
    let prefix = "app_";
    let subject_a = uuid::Uuid::new_v4().to_string();
    let subject_b = uuid::Uuid::new_v4().to_string();
    // Only this task-owned fixture database receives the synthetic auth.uid() shim.
    sqlx::raw_sql("CREATE SCHEMA IF NOT EXISTS auth;CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth TO PUBLIC;").execute(&admin).await.unwrap();
    for role in [&writer, &reader, &anonymous, &owner] {
        sqlx::query(&format!(
            "CREATE ROLE \"{role}\" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS"
        ))
        .execute(&admin)
        .await
        .unwrap();
    }
    let naming = SqlStorageOptions {
        schema: Some(schema.clone()),
        table_prefix: prefix.into(),
        create_tables: false,
        ..Default::default()
    };
    let preset = supabase_preset(&SupabasePresetOptions {
        sql: naming.clone(),
        server_role: writer.clone(),
        reader_role: reader.clone(),
    })
    .unwrap();
    let mut setup = admin.begin().await.unwrap();
    sqlx::raw_sql(&preset).execute(&mut *setup).await.unwrap();
    setup.commit().await.unwrap();
    let role_url = |role: &str| {
        let mut parsed = url::Url::parse(&url).unwrap();
        parsed.set_username(role).unwrap();
        parsed.set_password(None).unwrap();
        parsed.to_string()
    };
    let adapter = Arc::new(
        SqlStorageAdapter::connect(SqlDialect::Postgres, &role_url(&writer), naming)
            .await
            .unwrap(),
    );
    adapter.setup().await.unwrap();
    let mut writes = Vec::new();
    for entity in ALL_ENTITIES {
        for session in ["session-a", "session-b"] {
            let keys = entity
                .definition()
                .key
                .iter()
                .map(|key| {
                    (
                        (*key).to_owned(),
                        if *key == "sessionId" {
                            session.to_owned()
                        } else {
                            "row".into()
                        },
                    )
                })
                .collect::<BTreeMap<_, _>>();
            let mut row = empty_row(entity, &keys).unwrap();
            row.revision = 1;
            writes.push(RowWrite::Put {
                entity,
                row,
                expected_revision: None,
            });
        }
    }
    assert!(adapter.commit(&writes).await.unwrap().ok);
    let members = format!("\"{schema}\".\"{prefix}storage_memberships\"");
    sqlx::query(&format!("INSERT INTO {members} (session_id,subject) VALUES ('session-a',$1::uuid),('session-b',$2::uuid)")).bind(&subject_a).bind(&subject_b).execute(&admin).await.unwrap();
    let browser = PgPoolOptions::new()
        .max_connections(1)
        .connect(&role_url(&reader))
        .await
        .unwrap();
    let mut connection = browser.acquire().await.unwrap();
    sqlx::query("SELECT set_config('request.jwt.claim.sub',$1,false)")
        .bind(&subject_a)
        .execute(&mut *connection)
        .await
        .unwrap();
    for entity in ALL_ENTITIES {
        let table = format!("\"{schema}\".\"{prefix}{}\"", entity.definition().name);
        let rows = sqlx::query(&format!("SELECT session_id FROM {table}"))
            .fetch_all(&mut *connection)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get::<String, _>("session_id"), "session-a");
    }
    assert_eq!(
        sqlx::query(&format!("SELECT count(*) AS n FROM {members}"))
            .fetch_one(&mut *connection)
            .await
            .unwrap()
            .get::<i64, _>("n"),
        1
    );
    for sql in [format!("DELETE FROM {members}"),format!("UPDATE \"{schema}\".app_messages SET text='forbidden'"),format!("INSERT INTO \"{schema}\".app_events (_id,session_id,event_id,_rev,_v) VALUES ('fake','session-a','fake',1,'{{}}')")]{let error=sqlx::query(&sql).execute(&mut *connection).await.unwrap_err();assert_eq!(error.as_database_error().unwrap().code().as_deref(),Some("42501"));}
    let guest = PgPoolOptions::new()
        .max_connections(1)
        .connect(&role_url(&anonymous))
        .await
        .unwrap();
    assert_eq!(
        sqlx::query(&format!("SELECT * FROM \"{schema}\".app_messages"))
            .fetch_all(&guest)
            .await
            .unwrap_err()
            .as_database_error()
            .unwrap()
            .code()
            .as_deref(),
        Some("42501")
    );
    // A non-superuser owner normally bypasses RLS; FORCE must keep it fenced too.
    sqlx::raw_sql(&format!("GRANT USAGE,CREATE ON SCHEMA \"{schema}\" TO \"{owner}\";ALTER TABLE \"{schema}\".app_messages OWNER TO \"{owner}\";")).execute(&admin).await.unwrap();
    let owned = PgPoolOptions::new()
        .max_connections(1)
        .connect(&role_url(&owner))
        .await
        .unwrap();
    assert_eq!(
        sqlx::query(&format!(
            "SELECT count(*) AS n FROM \"{schema}\".app_messages"
        ))
        .fetch_one(&owned)
        .await
        .unwrap()
        .get::<i64, _>("n"),
        0
    );
    let flags=sqlx::query("SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relrowsecurity AND c.relforcerowsecurity").bind(&schema).fetch_one(&admin).await.unwrap().get::<i64,_>("n");
    assert_eq!(flags, 18);
    sqlx::query(&format!(
        "DELETE FROM {members} WHERE session_id='session-a'"
    ))
    .execute(&admin)
    .await
    .unwrap();
    assert_eq!(
        sqlx::query(&format!(
            "SELECT count(*) AS n FROM \"{schema}\".app_messages"
        ))
        .fetch_one(&mut *connection)
        .await
        .unwrap()
        .get::<i64, _>("n"),
        0
    );
    sqlx::query("SELECT set_config('request.jwt.claim.sub','',false)")
        .execute(&mut *connection)
        .await
        .unwrap();
    assert_eq!(
        sqlx::query(&format!(
            "SELECT count(*) AS n FROM \"{schema}\".app_contacts"
        ))
        .fetch_one(&mut *connection)
        .await
        .unwrap()
        .get::<i64, _>("n"),
        0
    );
    let store = Storage::new(adapter.clone(), StorageOptions::default()).unwrap();
    let batch = OperationBatch {
        session_id: "server-session".into(),
        event_id: Some("writer-event".into()),
        event_type: None,
        operations: vec![],
    };
    assert!(store.apply(&batch).await.unwrap().applied);
    drop(connection);
    browser.close().await;
    guest.close().await;
    owned.close().await;
    adapter.close().await;
    sqlx::query(&format!("DROP SCHEMA \"{schema}\" CASCADE"))
        .execute(&admin)
        .await
        .unwrap();
    for role in [&writer, &reader, &anonymous, &owner] {
        sqlx::query(&format!("DROP ROLE \"{role}\""))
            .execute(&admin)
            .await
            .unwrap();
    }
    admin.close().await;
    println!("PASS actual PostgreSQL Supabase preset: all 17 entities, isolated live memberships, reader/anonymous write denial, FORCE-RLS owner fencing, revoke and missing-subject denial, native server lease/dedupe write");
}
