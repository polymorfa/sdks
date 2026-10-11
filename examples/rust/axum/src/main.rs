use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Router,
};
use polymorfa_sdk::webhooks;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let secret = std::env::var("POLYMORFA_WEBHOOK_SECRET")?;
    if secret.is_empty() {
        return Err("POLYMORFA_WEBHOOK_SECRET must be nonempty".into());
    }
    let app = Router::new()
        .route("/webhooks/polymorfa", post(webhook))
        .with_state(Arc::new(secret));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn webhook(State(secret): State<Arc<String>>, headers: HeaderMap, body: Bytes) -> StatusCode {
    let Some(signature) = headers
        .get("x-polymorfa-signature")
        .and_then(|value| value.to_str().ok())
    else {
        return StatusCode::UNAUTHORIZED;
    };
    let Ok(event) = webhooks::construct_event(&body, signature, &secret) else {
        return StatusCode::UNAUTHORIZED;
    };
    // In production, atomically deduplicate event.envelope().id and enqueue the
    // verified event before acknowledgement. Never log the raw body or secret.
    let _verified_event = event;
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn raw_body_signature_is_required_and_verified_before_acknowledgement() {
        let body=Bytes::from_static(br#"{"id":"evt_fixture","session":"support","timestamp":"2026-08-19T10:00:00Z","event":"future.ready","payload":{"capability":42}}"#);
        let mut headers = HeaderMap::new();
        assert_eq!(
            webhook(
                State(Arc::new("fixture-secret".into())),
                headers.clone(),
                body.clone()
            )
            .await,
            StatusCode::UNAUTHORIZED
        );
        headers.insert(
            "x-polymorfa-signature",
            "8b9682c1aee07cf45ce4b83983c2c224000ae4f8289c1ff38169bec4a52c6edd"
                .parse()
                .unwrap(),
        );
        assert_eq!(
            webhook(State(Arc::new("fixture-secret".into())), headers, body).await,
            StatusCode::NO_CONTENT
        );
    }
}
