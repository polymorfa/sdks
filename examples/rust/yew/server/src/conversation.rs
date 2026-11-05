use super::*;
use polymorfa_sdk::{
    models::{ConversationReference, SendMessageRequest},
    webhooks::{
        self, EventConversation, KnownWebhookPayload, MessageReceivedPayload, WebhookEvent,
    },
    RequestOptions,
};
use serde_json::{json, Value};
use std::collections::VecDeque;

#[derive(Default)]
pub struct Conversation {
    pub messages: Vec<Value>,
    pub attempts: HashMap<String, (String, Option<Value>)>,
    pub peer_id: String,
    pub event_ids: VecDeque<String>,
    pub received: usize,
    pub last_event: String,
}
impl Conversation {
    fn upsert(&mut self, message: Value) {
        if let Some(prior) = self.messages.iter_mut().find(|m| m["id"] == message["id"]) {
            *prior = message;
        } else {
            self.messages.push(message);
        }
        if self.messages.len() > 100 {
            self.messages.remove(0);
        }
    }
    fn assigned(&self, peer: &str, c: &EventConversation) -> bool {
        if self.peer_id.is_empty() {
            c.phone_number
                .as_deref()
                .unwrap_or("")
                .trim_start_matches('+')
                == peer.trim_start_matches('+')
        } else {
            c.id == self.peer_id
        }
    }
}
pub async fn snapshot(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if authenticated(&app, &headers).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let s = app.conversation.lock().unwrap();
    ([(header::CACHE_CONTROL,"no-store")],Json(json!({"messages":s.messages,"peer":app.peer,"session":app.session,"receivedEvents":s.received,"lastEvent":s.last_event,"localTest":app.local_test}))).into_response()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SendInput {
    text: String,
}
pub async fn send(State(app): State<Arc<App>>, headers: HeaderMap, body: Bytes) -> Response {
    if !trusted_origin(&app, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if authenticated(&app, &headers).is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<SendInput>(&body) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if body.len() > 16384
        || input.text.trim().is_empty()
        || input.text.len() > 4096
        || key.len() != 36
        || uuid::Uuid::parse_str(key).is_err()
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(_gate) = app.send_gate.try_lock() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    {
        let mut s = app.conversation.lock().unwrap();
        if let Some((text, message)) = s.attempts.get(key) {
            if text != &input.text {
                return StatusCode::CONFLICT.into_response();
            }
            if let Some(message) = message {
                return Json(message.clone()).into_response();
            }
        } else {
            if s.attempts.len() >= 128 {
                return StatusCode::TOO_MANY_REQUESTS.into_response();
            }
            s.attempts.insert(key.into(), (input.text.clone(), None));
        }
    }
    let response = app
        .client
        .messages()
        .send(
            &app.session,
            &SendMessageRequest::text(ConversationReference::phone(&app.peer), &input.text),
            RequestOptions {
                idempotency_key: Some(key.into()),
                timeout: Some(Duration::from_secs(60)),
                ..Default::default()
            },
        )
        .await;
    let Ok(result) = response else {
        return (
            StatusCode::BAD_GATEWAY,
            "Send outcome unknown. Retry the same text and key.",
        )
            .into_response();
    };
    let receipt = result.data.data.receipt;
    if !result.data.success || receipt.id.is_empty() {
        return StatusCode::BAD_GATEWAY.into_response();
    }
    let Ok(at) = chrono::DateTime::parse_from_rfc3339(&receipt.timestamp) else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let message = json!({"id":receipt.id,"clientId":key,"text":input.text,"createdAt":at.timestamp()*1000,"direction":"outbound","status":"sent","receipt":receipt.status});
    let mut s = app.conversation.lock().unwrap();
    if !receipt.conversation.id.is_empty() {
        s.peer_id = receipt.conversation.id;
    }
    s.upsert(message.clone());
    s.attempts.get_mut(key).unwrap().1 = Some(message.clone());
    ([(header::CACHE_CONTROL, "no-store")], Json(message)).into_response()
}
fn rank(receipt: &str) -> u8 {
    match receipt {
        "read" | "played" => 3,
        "delivered" | "delivery" => 2,
        "sent" | "server" => 1,
        _ => 0,
    }
}
pub async fn webhook(State(app): State<Arc<App>>, headers: HeaderMap, body: Bytes) -> Response {
    let signature = headers
        .get("x-webhook-signature")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let Ok(event) = webhooks::construct_event(&body, signature, &app.webhook_secret) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let envelope = event.envelope();
    if envelope.session != app.session {
        return Json(json!({"received":true})).into_response();
    }
    let mut s = app.conversation.lock().unwrap();
    if s.event_ids.contains(&envelope.id) {
        return Json(json!({"received":true})).into_response();
    }
    match &event {
        WebhookEvent::MessageReceived {
            payload: MessageReceivedPayload::LinkedDevices(p),
            ..
        } => {
            let text = p.text.as_deref().unwrap_or("");
            if p.from_me
                || p.is_group
                || text.is_empty()
                || text.len() > 4096
                || p.id.is_empty()
                || !s.assigned(&app.peer, &p.conversation)
            {
                return Json(json!({"received":true})).into_response();
            }
            s.upsert(json!({"id":p.id,"text":text,"createdAt":p.timestamp.saturating_mul(1000),"direction":"inbound","status":"sent","receipt":"received"}));
        }
        WebhookEvent::Known {
            payload: KnownWebhookPayload::MessageAck(p),
            ..
        } => {
            if !s.assigned(&app.peer, &p.conversation) {
                return Json(json!({"received":true})).into_response();
            }
            for m in &mut s.messages {
                if m["direction"] == "outbound"
                    && p.messages.iter().any(|r| m["id"] == r.id)
                    && rank(&p.ack_type) > rank(m["receipt"].as_str().unwrap_or(""))
                {
                    m["receipt"] = json!(p.ack_type);
                }
            }
        }
        _ => return Json(json!({"received":true})).into_response(),
    }
    s.received += 1;
    s.last_event = envelope.event.clone();
    s.event_ids.push_back(envelope.id.clone());
    if s.event_ids.len() > 1024 {
        s.event_ids.pop_front();
    }
    Json(json!({"received":true})).into_response()
}
