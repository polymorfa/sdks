#[allow(dead_code)]
mod support;
use polymorfa_sdk::{organization_controls::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn organization_optout_keyword_settings_and_legacy_open_objects_native_wire() {
    let single: PlatformPayload = [("phone".into(), json!("+15551234567"))].into();
    let batch: PlatformPayload = [("phones".into(), json!(["+15551234567"]))].into();
    wire_organization!(
        client,
        "GET",
        "/platform/optouts",
        None,
        json!({"data":{"entries":[{"phone":"+15551234567"}]}}),
        client.opt_outs().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/optouts",
        Some(json!({"phone":"+15551234567"})),
        json!({"data":{"created":true}}),
        client
            .opt_outs()
            .create(Some(&single), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/optouts/batch",
        Some(json!({"phones":["+15551234567"]})),
        json!({"data":{"added":1}}),
        client
            .opt_outs()
            .create_batch(Some(&batch), RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/optouts/%2B15551234567",
        None,
        json!({"data":{"deleted":true}}),
        client
            .opt_outs()
            .delete("+15551234567", RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/optouts/settings",
        None,
        json!({"data":{"enabled":true,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":null}}),
        client.opt_outs().get_settings(RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/optouts/settings",
        Some(json!({"enabled":true,"optOutKeywords":["STOP"],"optInKeywords":["START"]})),
        json!({"data":{"enabled":true,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":1000}}),
        client.opt_outs().update_settings(
            &UpdateOptOutSettingsRequest {
                enabled: true,
                opt_out_keywords: vec!["STOP".into()],
                opt_in_keywords: vec!["START".into()]
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn platform_media_and_session_ban_metadata_native_wire() {
    let body: PlatformPayload = [
        ("filename".into(), json!("file.pdf")),
        ("contentType".into(), json!("application/pdf")),
    ]
    .into();
    wire_organization!(
        client,
        "GET",
        "/platform/media/media",
        None,
        json!({"data":{"id":"media","contentType":"application/pdf","filename":"file.pdf"}}),
        client.media().retrieve("media", RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/media/media",
        None,
        json!({"data":{"deleted":true}}),
        client.media().delete("media", RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/media/uploads",
        Some(json!({"filename":"file.pdf","contentType":"application/pdf"})),
        json!({"data":{"uploadUrl":"https://storage.example.com/upload","storageId":"storage"}}),
        client
            .media()
            .create_upload(Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bans",
        None,
        json!({"data":[{"id":"ban","sessionName":"support","banCode":403,"banReason":"restricted","banExpiresAt":null,"occurredAt":1000,"status":"active"}]}),
        client.session_bans().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bans/active",
        None,
        json!({"data":[{"id":"ban","sessionName":"support","banCode":403,"banReason":"restricted","banExpiresAt":2000,"occurredAt":1000,"status":"active"}]}),
        client.session_bans().list_active(RequestOptions::default())
    );
}
