#[allow(dead_code)]
mod support;
use polymorfa_sdk::{voice::*, ErrorKind, RequestOptions};
use serde_json::{json, Value};
fn asset() -> Value {
    json!({"id":"asset","projectId":"project","name":"greeting","source":"tts","status":"ready","failureReason":null,"originalFormat":null,"originalContentType":null,"sizeBytes":null,"durationMs":1000.5,"contentSha256":"abc","tts":{"provider":"future_provider","voiceId":"alloy","model":"model","text":"Hello","characters":5,"keySource":"managed","credentialId":null},"retentionDays":30,"expiresAt":"later","inUseCount":0,"revision":2,"createdAt":"then","updatedAt":"now","readyAt":"now"})
}
fn credential() -> Value {
    json!({"id":"credential","projectId":null,"provider":"openai","label":"TTS","keyFingerprint":"1234abcd","status":"future_status","verifiedAt":"now","lastError":null,"revision":2,"createdAt":"then","updatedAt":"now"})
}
#[tokio::test]
async fn audio_library_tts_preview_and_nullable_retention_native_wire() {
    let expected = json!({"data":[asset()],"page":{"nextCursor":"next","hasMore":true}});
    let (base, server) = support::wire(
        "GET",
        "/platform/voice/audio?cursor=before&limit=5&projectId=project&status=ready",
        None,
        expected,
    )
    .await;
    let client = support::organization(base);
    let page = client
        .voice()
        .audio("project")
        .unwrap()
        .list(
            &ListAudioParameters {
                status: Some(VoiceStatus::Ready),
                cursor: Some("before".into()),
                limit: Some(5),
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(
        page.items[0].tts.as_ref().unwrap().provider,
        "future_provider"
    );
    assert_eq!(page.next_cursor.as_deref(), Some("next"));
    server.await.unwrap();
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/voice/audio",
        Some(
            json!({"projectId":"project","name":"greeting","contentType":"audio/ogg","sizeBytes":100,"retentionDays":30})
        ),
        json!({"data":{"asset":asset(),"upload":{"url":"https://storage.example.com/signed","method":"POST","headers":{"content-type":"audio/ogg"},"maxBytes":16777216,"expiresAt":"later"}}}),
        client.voice().audio("project").unwrap().create_upload(
            &CreateAudioUploadRequest {
                name: "greeting".into(),
                content_type: UploadContentType::Ogg,
                size_bytes: 100,
                retention_days: Some(30)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/voice/audio/tts",
        Some(
            json!({"projectId":"project","provider":"openai","name":"greeting","text":"Hello","voiceId":"alloy","model":"gpt-4o-mini-tts"})
        ),
        json!({"data":asset()}),
        client.voice().audio("project").unwrap().synthesize(
            &SynthesizeAudioRequest::Openai {
                common: SynthesizeCommon {
                    name: "greeting".into(),
                    text: "Hello".into(),
                    credential_id: None,
                    retention_days: None
                },
                voice_id: OpenaiVoice::Alloy,
                model: Some(OpenaiModel::Gpt4oMiniTts)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/voice/audio/asset",
        None,
        json!({"data":asset()}),
        client
            .voice()
            .audio("project")
            .unwrap()
            .retrieve("asset", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/voice/audio/asset/complete",
        None,
        json!({"data":asset()}),
        client
            .voice()
            .audio("project")
            .unwrap()
            .complete("asset", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "PATCH",
        "/platform/voice/audio/asset",
        Some(json!({"expectedRevision":2,"retentionDays":null})),
        json!({"data":asset()}),
        client.voice().audio("project").unwrap().update(
            "asset",
            &UpdateAudioRequest {
                expected_revision: Some(2),
                name: None,
                retention_days: Some(None)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "DELETE",
        "/platform/voice/audio/asset",
        None,
        json!({"data":{"id":"asset","deleted":true}}),
        client
            .voice()
            .audio("project")
            .unwrap()
            .delete("asset", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/voice/audio/asset/preview",
        None,
        json!({"data":{"url":"https://storage.example.com/signed","contentType":"audio/ogg","expiresAt":"later"}}),
        client
            .voice()
            .audio("project")
            .unwrap()
            .preview_url("asset", RequestOptions::default())
    );
}
#[tokio::test]
async fn provider_credentials_write_only_key_and_future_response_values_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/voice/provider-credentials?projectId=project",
        None,
        json!({"data":[credential()]}),
        client
            .voice()
            .provider_credentials(Some("project"))
            .list(RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/voice/provider-credentials",
        Some(json!({"provider":"openai","label":"TTS","apiKey":"example-not-a-secret"})),
        json!({"data":credential()}),
        client.voice().provider_credentials(None).create(
            &CreateProviderCredentialRequest {
                provider: VoiceProvider::Openai,
                label: "TTS".into(),
                api_key: "example-not-a-secret".into()
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/voice/provider-credentials/credential",
        None,
        json!({"data":credential()}),
        client
            .voice()
            .provider_credentials(None)
            .retrieve("credential", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/voice/provider-credentials/credential/verify",
        None,
        json!({"data":credential()}),
        client
            .voice()
            .provider_credentials(None)
            .verify("credential", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "DELETE",
        "/platform/voice/provider-credentials/credential",
        None,
        json!({"data":{"id":"credential","deleted":true}}),
        client
            .voice()
            .provider_credentials(None)
            .delete("credential", RequestOptions::default())
    );
}
#[tokio::test]
async fn project_foreign_assets_and_teamwide_credential_mutations_fail_before_write() {
    let mut foreign = asset();
    foreign["projectId"] = json!("foreign");
    let (base, server) = support::wire(
        "GET",
        "/platform/voice/audio/asset",
        None,
        json!({"data":foreign}),
    )
    .await;
    let client = support::organization(base).project("project").unwrap();
    let error = client
        .voice()
        .audio()
        .delete(
            "asset",
            RequestOptions {
                idempotency_key: Some("write-key".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::NotFound);
    assert_eq!(error.status, Some(404));
    server.await.unwrap();
    let (base, server) = support::wire(
        "GET",
        "/platform/voice/provider-credentials/credential",
        None,
        json!({"data":credential()}),
    )
    .await;
    let client = support::organization(base).project("project").unwrap();
    let error = client
        .voice()
        .provider_credentials()
        .verify("credential", RequestOptions::default())
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Authorization);
    assert_eq!(error.status, Some(403));
    server.await.unwrap();
    let (base, server) = support::wire(
        "GET",
        "/platform/voice/audio/asset",
        None,
        json!({"data":asset()}),
    )
    .await;
    let client = support::organization(base).project("project").unwrap();
    let result = client
        .voice()
        .audio()
        .wait_until_ready(
            "asset",
            WaitForAudioOptions::default(),
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(result.data.status, "ready");
    server.await.unwrap();
    let client = support::organization("http://127.0.0.1:1".into());
    let token = tokio_util::sync::CancellationToken::new();
    token.cancel();
    assert_eq!(
        client
            .voice()
            .audio("project")
            .unwrap()
            .wait_until_ready(
                "asset",
                WaitForAudioOptions::default(),
                RequestOptions {
                    cancellation: Some(token),
                    ..Default::default()
                }
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
}
