//! Loopback integration example. Replace the local login/session store with
//! your application's authentication and live authorization before deployment.
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use polymorfa_sdk::{
    connections::{ClientTokenTarget, MintClientTokenRequest},
    ClientOptions, Credential, MessagingClient,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tower_http::services::ServeDir;
struct App {
    client: MessagingClient,
    username_hash: [u8; 32],
    password_hash: [u8; 32],
    user_id: String,
    session: String,
    origin: String,
    users: Mutex<HashMap<String, AppSession>>,
}
struct AppSession {
    user_id: String,
    expires: Instant,
}
#[derive(Deserialize)]
struct Login {
    username: String,
    password: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserToken {
    value: String,
    audience: &'static str,
    expires_at: i64,
    scopes: Vec<&'static str>,
    grant: BrowserGrant,
}
#[derive(Serialize)]
struct BrowserGrant {
    session: String,
    conversations: Vec<String>,
    allow: Vec<&'static str>,
}
fn digest(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}
fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/polymorfa/token", post(token))
        .route("/api/polymorfa/history/conversations", get(conversations))
        .route("/api/polymorfa/connect", post(connect))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .fallback_service(ServeDir::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../dist"
        )))
        .with_state(app)
}
fn trusted_origin(app: &App, headers: &HeaderMap) -> bool {
    headers.get(header::ORIGIN).and_then(|h| h.to_str().ok()) == Some(app.origin.as_str())
}
fn authenticated(app: &App, headers: &HeaderMap) -> Option<String> {
    cookie(headers).and_then(|id| {
        app.users
            .lock()
            .unwrap()
            .get(id)
            .filter(|s| s.expires > Instant::now())
            .map(|s| s.user_id.clone())
    })
}
fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix("polymorfa_example_session="))
}
async fn login(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Login>,
) -> Response {
    if !trusted_origin(&app, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let valid = digest(&input.username).ct_eq(&app.username_hash)
        & digest(&input.password).ct_eq(&app.password_hash);
    if !bool::from(valid) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut users = app.users.lock().unwrap();
    users.retain(|_, session| session.expires > Instant::now());
    if users.len() >= 128 {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let id = uuid::Uuid::new_v4().to_string();
    let user_id = app.user_id.clone();
    users.insert(
        id.clone(),
        AppSession {
            user_id,
            expires: Instant::now() + Duration::from_secs(1800),
        },
    );
    ([(header::SET_COOKIE,format!("polymorfa_example_session={id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800")),(header::CACHE_CONTROL,"no-store".into())],StatusCode::NO_CONTENT).into_response()
}
async fn logout(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if !trusted_origin(&app, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if let Some(id) = cookie(&headers) {
        app.users.lock().unwrap().remove(id);
    }
    (
        [(
            header::SET_COOKIE,
            "polymorfa_example_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        )],
        StatusCode::NO_CONTENT,
    )
        .into_response()
}
// Empty application-owned history is a valid state. This example stores no
// WhatsApp content. Replace this source with your authorized webhook store or
// explicitly enabled HMS source when your application needs retained history.
async fn conversations(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if authenticated(&app, &headers).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    (
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"data":[],"nextCursor":null})),
    )
        .into_response()
}
async fn connect(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if !trusted_origin(&app, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if authenticated(&app, &headers).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let request = polymorfa_sdk::models::CreateQuickLinkRequest {
        session: Some(app.session.clone()),
        ..Default::default()
    };
    match app.client.quick_links().create(&request,Default::default()).await {Ok(result)=>([(header::CACHE_CONTROL,"no-store")],Json(serde_json::json!({"data":{"id":result.data.data.id,"url":result.data.data.url,"expiresAt":result.data.data.expires_at}}))).into_response(),Err(_)=>StatusCode::BAD_GATEWAY.into_response()}
}
async fn token(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    _untrusted_body: Bytes,
) -> Response {
    if !trusted_origin(&app, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let user = cookie(&headers).and_then(|id| {
        app.users
            .lock()
            .unwrap()
            .get(id)
            .filter(|s| s.expires > Instant::now())
            .map(|s| s.user_id.clone())
    });
    let Some(user) = user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    // Both identity and number assignment are server-owned. No browser body or
    // identity header chooses a session, customer, or ephemeral ID.
    let result = app
        .client
        .client_tokens()
        .mint(
            &MintClientTokenRequest {
                ephemeral_id: format!("example:{user}"),
                ttl_seconds: Some(600),
                target: ClientTokenTarget::Session {
                    session: app.session.clone(),
                },
            },
            Default::default(),
        )
        .await;
    match result {
        Ok(result) => {
            let value = result.data.data;
            if !value.token.starts_with("pmfa_ct_") || value.token.len() <= 8 {
                return StatusCode::BAD_GATEWAY.into_response();
            }
            let Ok(expiry) = chrono::DateTime::parse_from_rfc3339(&value.expires_at) else {
                return StatusCode::BAD_GATEWAY.into_response();
            };
            (
                [(header::CACHE_CONTROL, "no-store")],
                Json(BrowserToken {
                    value: value.token,
                    audience: "browser",
                    expires_at: expiry.timestamp_millis(),
                    scopes: vec!["read_messages", "connect_whatsapp"],
                    grant: BrowserGrant {
                        session: app.session.clone(),
                        conversations: Vec::new(),
                        allow: vec!["read_messages", "connect_whatsapp"],
                    },
                }),
            )
                .into_response()
        }
        Err(error) => {
            let status = if error.status.is_some_and(|s| (400..500).contains(&s)) {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::BAD_GATEWAY
            };
            status.into_response()
        }
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let username = std::env::var("EXAMPLE_APP_USERNAME")?;
    let password = std::env::var("EXAMPLE_APP_PASSWORD")?;
    let session = std::env::var("POLYMORFA_SESSION")?;
    if username.is_empty() || password.is_empty() || session.is_empty() {
        return Err("Set a nonempty example username, password, and authorized session".into());
    }
    let credential = Credential::project_token(std::env::var("POLYMORFA_PROJECT_TOKEN")?)?;
    let port: u16 = std::env::var("POLYMORFA_EXAMPLE_PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()?;
    let client_options = ClientOptions {
        base_url: std::env::var("POLYMORFA_API_BASE_URL")
            .unwrap_or_else(|_| ClientOptions::default().base_url),
        ..Default::default()
    };
    let app = Arc::new(App {
        client: MessagingClient::new(credential, client_options)?,
        username_hash: digest(&username),
        password_hash: digest(&password),
        user_id: uuid::Uuid::new_v4().to_string(),
        session,
        origin: format!("http://127.0.0.1:{port}"),
        users: Mutex::new(HashMap::new()),
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    axum::serve(listener, router(app)).await?;
    Ok(())
}
#[cfg(test)]
mod tests;
