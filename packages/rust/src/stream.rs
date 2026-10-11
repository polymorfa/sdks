//! Reconnecting project event streams. Persist a cursor only after processing.
use crate::{
    models::EventRecord, transport::HttpTransport, webhooks::WebhookEnvelope, Error, ErrorKind,
    RequestOptions, Result,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    pin::Pin,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Default)]
pub struct EventStreamOptions {
    pub project_id: Option<String>,
    pub types: Vec<String>,
    pub since: Option<String>,
    pub manual_acknowledgements: bool,
    pub initial_delay: Option<Duration>,
    pub max_delay: Option<Duration>,
    pub request_options: RequestOptions,
    pub on_gap: Option<Arc<dyn Fn(EventStreamGap) + Send + Sync>>,
    pub on_reconnect: Option<Arc<dyn Fn(Duration) + Send + Sync>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStreamGap {
    pub reason: String,
    pub missed_events: u64,
    pub requested_cursor: Option<String>,
}
#[derive(Clone, Debug)]
pub struct EventStreamItem {
    pub event: EventRecord,
    pub webhook: Option<WebhookEnvelope>,
    pub stream_id: String,
    pub sequence: u64,
    pub cursor: String,
}
pub struct EventStream {
    http: HttpTransport,
    path: String,
    params: EventStreamOptions,
    cursor: Arc<Mutex<Option<String>>>,
}
impl EventStream {
    pub(crate) fn new(http: HttpTransport, path: String, params: EventStreamOptions) -> Self {
        Self {
            http,
            path,
            cursor: Arc::new(Mutex::new(params.since.clone())),
            params,
        }
    }
    pub fn cursor(&self) -> Option<String> {
        self.cursor
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
    pub fn into_stream(self) -> Pin<Box<dyn Stream<Item = Result<EventStreamItem>> + Send>> {
        let stream = async_stream::try_stream! {
            let cancellation=self.params.request_options.cancellation.clone().unwrap_or_default();
            let initial=self.params.initial_delay.unwrap_or(Duration::from_secs(1));
            let maximum=self.params.max_delay.unwrap_or(Duration::from_secs(30));
            let mut attempt=0u32;
            while !cancellation.is_cancelled() {
                let mut options=self.params.request_options.clone();
                if let Some(cursor)=self.cursor() { options.headers.insert("last-event-id".into(),cursor); }
                let mut query=Vec::new();
                if !self.params.types.is_empty() { query.push(("types",self.params.types.join(","))); }
                if self.params.manual_acknowledgements { query.push(("ack","manual".into())); }
                let opened=self.http.open(reqwest::Method::GET,&self.path,&query,None,&options,"text/event-stream").await;
                let mut server_delay=None;
                match opened {
                    Err(error) => {
                        if cancellation.is_cancelled() { break; }
                        server_delay=error.metadata.as_ref().and_then(|m|m.headers.get("retry-after")).and_then(|v|v.parse::<u64>().ok()).map(Duration::from_secs);
                        if terminal(&error) { Err(error)?; }
                    }
                    Ok((response,_)) => {
                        if !response.headers().get("content-type").and_then(|v|v.to_str().ok()).is_some_and(|v|v.starts_with("text/event-stream")) { Err(Error::local(ErrorKind::Server,"Event stream returned an invalid content type.","invalid_response"))?; }
                        let mut bytes=response.bytes_stream();
                        let mut parser=SseParser::default();
                        let mut heartbeat=Duration::from_secs(15);
                        let mut reconnect=false;
                        while !reconnect {
                            let next=tokio::select! {
                                _=cancellation.cancelled()=>break,
                                result=tokio::time::timeout(heartbeat.saturating_mul(2),bytes.next())=>result,
                            };
                            let chunk=match next { Ok(Some(Ok(chunk)))=>chunk, _=>break };
                            for message in parser.feed(&chunk)? {
                                let value: serde_json::Value=serde_json::from_str(&message.data).map_err(|_|Error::local(ErrorKind::Server,"Malformed event stream frame.","invalid_response"))?;
                                match value["type"].as_str().unwrap_or("") {
                                    "ready"=>if let Some(ms)=value["heartbeatIntervalMs"].as_u64().filter(|v|*v>0) { heartbeat=Duration::from_millis(ms); },
                                    "event"=>{
                                        let event: EventRecord=serde_json::from_value(value["event"].clone()).map_err(|_|Error::local(ErrorKind::Server,"Malformed event stream event.","invalid_response"))?;
                                        let webhook=match &event.payload {
                                            None=>None,
                                            Some(payload)=>{
                                                let body=STANDARD.decode(&payload.data).map_err(|_|Error::local(ErrorKind::Server,"Malformed event stream payload.","invalid_response"))?;
                                                Some(serde_json::from_slice(&body).map_err(|_|Error::local(ErrorKind::Server,"Malformed event stream webhook.","invalid_response"))?)
                                            }
                                        };
                                        let cursor=value["cursor"].as_str().ok_or_else(||Error::local(ErrorKind::Server,"Event stream cursor is missing.","invalid_response"))?.to_owned();
                                        let stream_id=value["streamId"].as_str().ok_or_else(||Error::local(ErrorKind::Server,"Event stream id is missing.","invalid_response"))?.to_owned();
                                        let sequence=value["sequence"].as_u64().ok_or_else(||Error::local(ErrorKind::Server,"Event stream sequence is missing.","invalid_response"))?;
                                        *self.cursor.lock().unwrap_or_else(|p|p.into_inner())=Some(cursor.clone());
                                        attempt=0;
                                        yield EventStreamItem { event,webhook,cursor,stream_id,sequence };
                                    }
                                    "checkpoint"=>if let Some(cursor)=value["cursor"].as_str() { *self.cursor.lock().unwrap_or_else(|p|p.into_inner())=Some(cursor.into()); },
                                    "gap"=>{
                                        if value["reason"]=="retention_exceeded" {
                                            if let Some(callback)=&self.params.on_gap { callback(EventStreamGap { reason:"retention_exceeded".into(),missed_events:value["missedEvents"].as_u64().unwrap_or(0),requested_cursor:value["requestedCursor"].as_str().map(str::to_owned) }); }
                                        } else { reconnect=true; break; }
                                    }
                                    "expiry"=>{ attempt=0; reconnect=true; break; },
                                    "dropped"=>{ reconnect=true; break; },
                                    "revoked"=>Err(Error::local(ErrorKind::Authorization,"Event stream was revoked.","stream_revoked"))?,
                                    _=>{},
                                }
                            }
                        }
                    }
                }
                if cancellation.is_cancelled() { break; }
                let ceiling=initial.saturating_mul(2u32.pow(attempt.min(20))).min(maximum);
                let delay=server_delay.unwrap_or_else(||ceiling.mul_f64(0.5+rand::random::<f64>()*0.5)).min(maximum);
                attempt=attempt.saturating_add(1);
                if let Some(callback)=&self.params.on_reconnect { callback(delay); }
                tokio::select! { _=cancellation.cancelled()=>break, _=tokio::time::sleep(delay)=>{} }
            }
        };
        Box::pin(stream)
    }
}
fn terminal(error: &Error) -> bool {
    matches!(
        error.kind,
        ErrorKind::Authentication
            | ErrorKind::Authorization
            | ErrorKind::NotFound
            | ErrorKind::Validation
    ) || error.status == Some(410)
        || error.code.as_deref() == Some("stream_revoked")
}

#[derive(Clone, Debug, PartialEq)]
pub struct SseMessage {
    pub event: String,
    pub data: String,
    pub id: Option<String>,
}
#[derive(Default)]
pub struct SseParser {
    line: Vec<u8>,
    event: String,
    data: Vec<String>,
    id: Option<String>,
    carriage_return: bool,
}
impl SseParser {
    pub fn feed(&mut self, bytes: &[u8]) -> Result<Vec<SseMessage>> {
        let mut messages = Vec::new();
        for byte in bytes {
            if self.carriage_return {
                self.carriage_return = false;
                if *byte == b'\n' {
                    continue;
                }
            }
            if matches!(byte, b'\r' | b'\n') {
                self.carriage_return = *byte == b'\r';
                let bytes = std::mem::take(&mut self.line);
                let line = String::from_utf8(bytes).map_err(|_| {
                    Error::local(
                        ErrorKind::Server,
                        "Event stream contains invalid UTF-8.",
                        "invalid_response",
                    )
                })?;
                if line.is_empty() {
                    if !self.data.is_empty() {
                        messages.push(SseMessage {
                            event: if self.event.is_empty() {
                                "message".into()
                            } else {
                                std::mem::take(&mut self.event)
                            },
                            data: self.data.join("\n"),
                            id: self.id.take(),
                        });
                    }
                    self.event.clear();
                    self.data.clear();
                    self.id = None;
                } else if !line.starts_with(':') {
                    let (key, value) = line.split_once(':').unwrap_or((&line, ""));
                    let value = value.strip_prefix(' ').unwrap_or(value);
                    match key {
                        "event" => self.event = value.into(),
                        "data" => self.data.push(value.into()),
                        "id" if !value.contains('\0') => self.id = Some(value.into()),
                        _ => {}
                    }
                }
            } else {
                self.line.push(*byte);
            }
        }
        Ok(messages)
    }
}
