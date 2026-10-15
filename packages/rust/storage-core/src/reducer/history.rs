//! Explicit decoded-history types and pure reduction. No raw-protobuf or descriptor decoding.
use super::common::*;
use crate::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProtoInt {
    Signed(i64),
    Unsigned(u64),
    Number(f64),
    Decimal(String),
}
impl From<u64> for ProtoInt {
    fn from(n: u64) -> Self {
        Self::Unsigned(n)
    }
}
impl From<i64> for ProtoInt {
    fn from(n: i64) -> Self {
        Self::Signed(n)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProtoBytes {
    Base64(String),
    Bytes(Vec<u8>),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProtoEnum {
    Number(f64),
    Name(String),
}
macro_rules! model {($name:ident {$($field:ident:$kind:ty),*$(,)?})=>{
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct $name {$(#[serde(default,skip_serializing_if="Option::is_none")]pub $field:Option<$kind>),*}
};}
model!(HistoryMessageKey {
    remote_jid: String,
    from_me: bool,
    id: String,
    participant: String
});
model!(HistoryContextInfo {
    stanza_id: String,
    participant: String
});
model!(HistoryMediaMessage {
    url: String,
    mimetype: String,
    caption: String,
    file_sha256: ProtoBytes,
    file_length: ProtoInt,
    media_key: ProtoBytes,
    file_enc_sha256: ProtoBytes,
    direct_path: String,
    media_key_timestamp: ProtoInt,
    file_name: String,
    title: String,
    ptt: bool,
    context_info: HistoryContextInfo
});
model!(HistoryExtendedText {
    text: String,
    context_info: HistoryContextInfo
});
model!(HistoryLocation {
    degrees_latitude: f64,
    degrees_longitude: f64,
    name: String,
    context_info: HistoryContextInfo
});
model!(HistoryContact {
    display_name: String,
    context_info: HistoryContextInfo
});
model!(HistoryPollOption {
    option_name: String
});
model!(HistoryPollCreation{name:String,options:Vec<HistoryPollOption>,context_info:HistoryContextInfo});
model!(HistoryReaction {
    key: HistoryMessageKey,
    text: String,
    sender_timestamp_ms: ProtoInt
});
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryProtocolMessage {
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<ProtoEnum>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<HistoryMessageKey>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edited_message: Option<Box<HistoryMessageContent>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<ProtoInt>,
}
model!(HistoryWrapper{message:Box<HistoryMessageContent>});
model!(HistoryMessageContent {
    conversation: String,
    extended_text_message: HistoryExtendedText,
    image_message: HistoryMediaMessage,
    video_message: HistoryMediaMessage,
    ptv_message: HistoryMediaMessage,
    audio_message: HistoryMediaMessage,
    document_message: HistoryMediaMessage,
    sticker_message: HistoryMediaMessage,
    location_message: HistoryLocation,
    contact_message: HistoryContact,
    poll_creation_message: HistoryPollCreation,
    poll_creation_message_v2: HistoryPollCreation,
    poll_creation_message_v3: HistoryPollCreation,
    reaction_message: HistoryReaction,
    protocol_message: HistoryProtocolMessage,
    ephemeral_message: HistoryWrapper,
    view_once_message: HistoryWrapper,
    view_once_message_v2: HistoryWrapper,
    document_with_caption_message: HistoryWrapper,
    edited_message: HistoryWrapper
});
model!(HistoryUserReceipt {
    user_jid: String,
    receipt_timestamp: ProtoInt,
    read_timestamp: ProtoInt,
    played_timestamp: ProtoInt
});
model!(WebMessageInfo{key:HistoryMessageKey,message:HistoryMessageContent,message_timestamp:ProtoInt,status:ProtoEnum,participant:String,push_name:String,starred:bool,message_stub_type:ProtoEnum,revoke_message_timestamp:ProtoInt,user_receipt:Vec<HistoryUserReceipt>,reactions:Vec<HistoryReaction>});
model!(HistoryGroupParticipant {
    user_jid: String,
    rank: ProtoEnum
});
model!(HistoryMessageEntry {
    message: WebMessageInfo,
    msg_order_id: ProtoInt
});
model!(HistoryConversation{id:String,messages:Vec<HistoryMessageEntry>,new_jid:String,last_msg_timestamp:ProtoInt,unread_count:f64,read_only:bool,ephemeral_expiration:f64,conversation_timestamp:ProtoInt,name:String,display_name:String,archived:bool,marked_as_unread:bool,participant:Vec<HistoryGroupParticipant>,pinned:ProtoInt,mute_end_time:ProtoInt,created_at:ProtoInt,created_by:String,description:String,pn_jid:String,lid_jid:String,username:String});
model!(HistoryPushname {
    id: String,
    pushname: String
});
model!(HistoryPastParticipant {
    user_jid: String,
    leave_reason: ProtoEnum,
    leave_ts: ProtoInt
});
model!(HistoryPastGroup{group_jid:String,past_participants:Vec<HistoryPastParticipant>});
model!(HistoryPhoneMapping {
    pn_jid: String,
    lid_jid: String
});
model!(HistorySyncChunk{sync_type:ProtoEnum,conversations:Vec<HistoryConversation>,status_v3_messages:Vec<WebMessageInfo>,chunk_order:ProtoInt,progress:ProtoInt,pushnames:Vec<HistoryPushname>,past_participants:Vec<HistoryPastGroup>,phone_number_to_lid_mappings:Vec<HistoryPhoneMapping>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessageIdentity {
    pub native_id: String,
    pub id: String,
    pub chat_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_me: Option<bool>,
}
model!(HistoryIdentityIndex{conversations:BTreeMap<String,String>,contacts:BTreeMap<String,String>,messages:Vec<HistoryMessageIdentity>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChunkInput {
    pub session_id: String,
    pub chunk: HistorySyncChunk,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identities: Option<HistoryIdentityIndex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_id: Option<String>,
}
pub const HISTORY_SYNC_TYPES: &[(&str, u8)] = &[
    ("INITIAL_BOOTSTRAP", 0),
    ("INITIAL_STATUS_V3", 1),
    ("FULL", 2),
    ("RECENT", 3),
    ("PUSH_NAME", 4),
    ("NON_BLOCKING_DATA", 5),
    ("ON_DEMAND", 6),
];
pub fn history_sync_type_name(v: &Value) -> String {
    if let Some(n) = number(v) {
        return HISTORY_SYNC_TYPES
            .iter()
            .find(|(_, i)| f64::from(*i) == n)
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| merge::canonical_json(&json!(n)));
    }
    if let Some(s) = text(v) {
        let up = s.to_uppercase();
        return if HISTORY_SYNC_TYPES.iter().any(|(s, _)| *s == up) {
            up
        } else {
            s.into()
        };
    }
    "UNKNOWN".into()
}
pub fn proto_number(v: &ProtoInt) -> Option<f64> {
    numeric(&serde_json::to_value(v).ok()?)
}
fn enumeration(v: &Value, names: &[(&str, i32)]) -> Option<f64> {
    number(v).or_else(|| {
        v.as_str().and_then(|s| {
            names
                .iter()
                .find(|(k, _)| *k == s.to_uppercase())
                .map(|(_, n)| f64::from(*n))
        })
    })
}
fn bytes(v: &Value) -> Option<Value> {
    if let Some(s) = text(v) {
        return Some(json!(s));
    }
    let list = v.as_array()?;
    if list.is_empty() {
        return None;
    }
    let bytes = list
        .iter()
        .map(|v| v.as_u64().and_then(|n| u8::try_from(n).ok()))
        .collect::<Option<Vec<_>>>()?;
    Some(json!(STANDARD.encode(bytes)))
}
pub fn normalize_jid(jid: &str) -> String {
    if let Some((user, server)) = jid.split_once('@') {
        format!(
            "{}@{}",
            user.split(':')
                .next()
                .unwrap_or("")
                .split('_')
                .next()
                .unwrap_or(""),
            server
        )
        .to_lowercase()
    } else {
        jid.to_lowercase()
    }
}
#[derive(Clone, Default)]
pub struct HistoryProgressInput {
    pub sync_type: String,
    pub chunk_order: Option<f64>,
    pub progress: Option<f64>,
    pub conversation_count: Option<f64>,
    pub message_count: Option<f64>,
    pub pushname_count: Option<f64>,
}
pub fn history_progress_operations(s: &str, p: &HistoryProgressInput) -> Vec<StorageOperation> {
    let mut ops = vec![];
    if let Some(order) = p.chunk_order {
        let mut f = FieldWrites::new();
        for (n, v) in [
            ("progress", p.progress),
            ("conversationCount", p.conversation_count),
            ("messageCount", p.message_count),
            ("pushnameCount", p.pushname_count),
        ] {
            put(&mut f, n, v.map(|v| json!(v)), 0.);
        }
        ops.push(upsert(
            Entity::HistoryChunks,
            s,
            &[
                ("syncType", &p.sync_type),
                ("chunkOrder", &merge::canonical_json(&json!(order))),
            ],
            f,
            None,
        ));
    }
    let mut f = FieldWrites::new();
    put(
        &mut f,
        "progress",
        p.progress.map(|v| json!(v)),
        p.progress.unwrap_or(0.),
    );
    put(
        &mut f,
        "lastChunkOrder",
        p.chunk_order.map(|v| json!(v)),
        p.chunk_order.unwrap_or(0.),
    );
    ops.push(upsert(
        Entity::HistoryProgress,
        s,
        &[("syncType", &p.sync_type)],
        f,
        None,
    ));
    ops
}
pub fn history_identity_index(payload: &Value) -> HistoryIdentityIndex {
    HistoryIdentityIndex {
        messages: Some(
            array(&payload["messages"])
                .iter()
                .filter_map(|m| {
                    Some(HistoryMessageIdentity {
                        native_id: text(&m["whatsapp_ids"]["linked_devices"])?.into(),
                        id: text(&m["id"])?.into(),
                        chat_id: text(&m["conversation"]["id"])?.into(),
                        from_me: m["fromMe"].as_bool(),
                    })
                })
                .collect(),
        ),
        ..Default::default()
    }
}
pub struct HistoryKeys {
    conversations: BTreeMap<String, String>,
    contacts: BTreeMap<String, String>,
    messages: BTreeMap<String, Vec<HistoryMessageIdentity>>,
}
impl HistoryKeys {
    pub fn new(index: Option<&HistoryIdentityIndex>, chunk: Option<&HistorySyncChunk>) -> Self {
        let mut keys = Self {
            conversations: BTreeMap::new(),
            contacts: BTreeMap::new(),
            messages: BTreeMap::new(),
        };
        if let Some(i) = index {
            for (k, v) in i.conversations.iter().flatten() {
                keys.conversations.insert(normalize_jid(k), v.clone());
            }
            for (k, v) in i.contacts.iter().flatten() {
                keys.contacts.insert(normalize_jid(k), v.clone());
            }
            for m in i.messages.iter().flatten() {
                keys.messages
                    .entry(m.native_id.clone())
                    .or_default()
                    .push(m.clone());
            }
        }
        if let Some(chunk) = chunk {
            for c in chunk.conversations.iter().flatten() {
                let Some(jid) = c.id.as_deref().filter(|s| !s.is_empty()) else {
                    continue;
                };
                if keys.conversations.contains_key(&normalize_jid(jid)) {
                    continue;
                }
                let mut found = BTreeSet::new();
                for e in c.messages.iter().flatten() {
                    if let Some(k) = e.message.as_ref().and_then(|m| m.key.as_ref()) {
                        if let Some(id) = k.id.as_ref() {
                            for cand in keys.messages.get(id).into_iter().flatten() {
                                if cand.from_me.is_none()
                                    || k.from_me.is_none()
                                    || cand.from_me == k.from_me
                                {
                                    found.insert(cand.chat_id.clone());
                                }
                            }
                        }
                    }
                }
                if found.len() == 1 {
                    keys.conversations
                        .insert(normalize_jid(jid), found.into_iter().next().unwrap());
                }
            }
        }
        keys
    }
    pub fn chat_id(&self, jid: &str) -> String {
        let bare = normalize_jid(jid);
        self.conversations
            .get(&bare)
            .cloned()
            .unwrap_or_else(|| format!("wa:{bare}"))
    }
    pub fn contact_id(&self, jid: &str) -> String {
        let bare = normalize_jid(jid);
        self.contacts
            .get(&bare)
            .or_else(|| {
                if chat_kind(Some(&bare), None) == Some("direct") {
                    self.conversations.get(&bare)
                } else {
                    None
                }
            })
            .cloned()
            .unwrap_or_else(|| format!("wa:{bare}"))
    }
    fn message_value(&self, key: &Value, chat: &str) -> Option<String> {
        let native = text(&key["id"])?;
        let jid = normalize_jid(text(&key["remoteJid"]).unwrap_or(chat));
        let from_me = key["fromMe"] == true;
        let chat = self.chat_id(&jid);
        let candidates = self
            .messages
            .get(native)
            .into_iter()
            .flatten()
            .filter(|m| m.chat_id == chat && (m.from_me.is_none() || m.from_me == Some(from_me)))
            .collect::<Vec<_>>();
        if candidates.len() == 1 {
            return Some(candidates[0].id.clone());
        }
        let sender = if !from_me && chat_kind(Some(&jid), None) == Some("group") {
            text(&key["participant"])
                .map(normalize_jid)
                .unwrap_or_default()
        } else {
            String::new()
        };
        Some(format!("wa:{jid}:{}:{sender}:{native}", u8::from(from_me)))
    }
    pub fn message_id(&self, key: &HistoryMessageKey, chat: &str) -> Option<String> {
        self.message_value(&serde_json::to_value(key).ok()?, chat)
    }
}
fn unwrap_content(mut p: &Value) -> &Value {
    for _ in 0..5 {
        let inner = [
            "ephemeralMessage",
            "viewOnceMessage",
            "viewOnceMessageV2",
            "documentWithCaptionMessage",
            "editedMessage",
        ]
        .iter()
        .find_map(|n| p[*n].get("message").filter(|v| !v.is_null()));
        if let Some(inner) = inner {
            p = inner;
        } else {
            break;
        }
    }
    p
}
struct Mapped<'a> {
    kind: &'static str,
    fields: FieldWrites,
    quoted: Option<String>,
    media: Option<(&'static str, &'a Value)>,
}
fn mapped(content: &Value, version: f64) -> Option<Mapped<'_>> {
    let mut f = FieldWrites::new();
    let mut quoted = None;
    let mut media = None;
    let kind;
    if text(&content["conversation"]).is_some() {
        kind = "text";
        set(&mut f, "text", content["conversation"].clone(), version);
    } else if !content["extendedTextMessage"].is_null() {
        kind = "text";
        set(
            &mut f,
            "text",
            string(&content["extendedTextMessage"]["text"]).unwrap_or(Value::Null),
            version,
        );
        quoted =
            text(&content["extendedTextMessage"]["contextInfo"]["stanzaId"]).map(str::to_string);
    } else if let Some((name, k)) = [
        ("imageMessage", "image"),
        ("videoMessage", "video"),
        ("ptvMessage", "video"),
        ("audioMessage", "audio"),
        ("documentMessage", "document"),
        ("stickerMessage", "sticker"),
    ]
    .into_iter()
    .find(|(n, _)| !content[*n].is_null())
    {
        kind = k;
        let m = &content[name];
        for (out, input) in [
            ("caption", "caption"),
            ("mimeType", "mimetype"),
            ("fileName", "fileName"),
            ("title", "title"),
        ] {
            set(
                &mut f,
                out,
                string(&m[input]).unwrap_or(Value::Null),
                version,
            );
        }
        set(
            &mut f,
            "extra",
            if m["ptt"] == true {
                json!({"ptt":true})
            } else {
                Value::Null
            },
            version,
        );
        quoted = text(&m["contextInfo"]["stanzaId"]).map(str::to_string);
        media = Some((kind, m));
    } else if !content["locationMessage"].is_null() {
        kind = "location";
        for (out, input) in [
            ("latitude", "degreesLatitude"),
            ("longitude", "degreesLongitude"),
        ] {
            set(
                &mut f,
                out,
                content["locationMessage"][input].clone(),
                version,
            );
        }
        set(
            &mut f,
            "title",
            string(&content["locationMessage"]["name"]).unwrap_or(Value::Null),
            version,
        );
        quoted = text(&content["locationMessage"]["contextInfo"]["stanzaId"]).map(str::to_string);
    } else if !content["contactMessage"].is_null() {
        kind = "contact";
        set(
            &mut f,
            "displayName",
            string(&content["contactMessage"]["displayName"]).unwrap_or(Value::Null),
            version,
        );
    } else {
        let poll = [
            "pollCreationMessage",
            "pollCreationMessageV2",
            "pollCreationMessageV3",
        ]
        .into_iter()
        .find_map(|n| content.get(n).filter(|v| !v.is_null()))?;
        kind = "poll";
        set(
            &mut f,
            "title",
            string(&poll["name"]).unwrap_or(Value::Null),
            version,
        );
        set(
            &mut f,
            "pollOptions",
            json!(array(&poll["options"])
                .iter()
                .filter_map(|o| text(&o["optionName"]).map(|n| json!({"name":n})))
                .collect::<Vec<_>>()),
            version,
        );
        quoted = text(&poll["contextInfo"]["stanzaId"]).map(str::to_string);
    }
    for name in CONTENT_FIELDS {
        if !f.contains_key(*name) {
            set(&mut f, name, Value::Null, version);
        }
    }
    Some(Mapped {
        kind,
        fields: f,
        quoted,
        media,
    })
}
fn media_fields(kind: &str, p: &Value, chat: &str, version: f64) -> FieldWrites {
    let mut f = FieldWrites::new();
    set(&mut f, "chatId", chat, 0.);
    set(&mut f, "kind", kind, 0.);
    for (out, input) in [
        ("mimeType", "mimetype"),
        ("fileName", "fileName"),
        ("directPath", "directPath"),
    ] {
        str_field(&mut f, out, p, input, version);
    }
    put(
        &mut f,
        "fileLength",
        numeric(&p["fileLength"]).map(|v| json!(v)),
        version,
    );
    for name in ["fileSha256", "fileEncSha256", "mediaKey"] {
        put(&mut f, name, bytes(&p[name]), version);
    }
    put(
        &mut f,
        "mediaKeyTimestamp",
        to_millis(numeric(&p["mediaKeyTimestamp"])).map(|v| json!(v)),
        version,
    );
    f
}
pub fn reduce_web_message_info(
    info: &WebMessageInfo,
    session: &str,
    keys: &HistoryKeys,
    chat_jid: Option<&str>,
) -> Vec<StorageOperation> {
    reduce_web(
        &serde_json::to_value(info).unwrap_or(Value::Null),
        session,
        keys,
        chat_jid,
    )
}
fn reduce_web(
    info: &Value,
    s: &str,
    keys: &HistoryKeys,
    chat_jid: Option<&str>,
) -> Vec<StorageOperation> {
    let key = &info["key"];
    let Some(jid) = text(&key["remoteJid"]).or(chat_jid) else {
        return vec![];
    };
    let Some(id) = keys.message_value(key, jid) else {
        return vec![];
    };
    let chat = keys.chat_id(jid);
    let from_me = key["fromMe"] == true;
    let group = chat_kind(Some(&normalize_jid(jid)), None) == Some("group");
    let sender_jid = if from_me {
        None
    } else {
        text(&key["participant"])
            .or_else(|| text(&info["participant"]))
            .or_else(|| (!group).then_some(jid))
    };
    let sender = if from_me {
        Some(SELF_ID.into())
    } else {
        sender_jid.map(|jid| keys.contact_id(jid))
    };
    let timestamp = to_millis(numeric(&info["messageTimestamp"]));
    let g = guard(s, &chat, timestamp);
    let content = unwrap_content(&info["message"]);
    let protocol = &content["protocolMessage"];
    if !protocol.is_null() {
        let Some(target) = keys.message_value(&protocol["key"], jid) else {
            return vec![];
        };
        let kind = enumeration(&protocol["type"], &[("REVOKE", 0), ("MESSAGE_EDIT", 14)]);
        if kind == Some(0.) {
            let mut f = clear(CONTENT_FIELDS);
            set(&mut f, "chatId", chat.clone(), 0.);
            set(
                &mut f,
                "revokedAt",
                timestamp.unwrap_or(0.),
                merge::FINAL_VERSION,
            );
            return vec![
                upsert(Entity::Messages, s, &[("messageId", &target)], f, None),
                upsert(
                    Entity::Media,
                    s,
                    &[("messageId", &target)],
                    clear(MEDIA_SECRET_FIELDS),
                    None,
                ),
            ];
        }
        if kind == Some(14.) && !protocol["editedMessage"].is_null() {
            let version = to_millis(numeric(&protocol["timestampMs"]))
                .or(timestamp)
                .unwrap_or(0.);
            if let Some(mut mapped) = mapped(unwrap_content(&protocol["editedMessage"]), version) {
                set(&mut mapped.fields, "chatId", chat.clone(), 0.);
                set(&mut mapped.fields, "editedAt", version, version);
                return vec![upsert(
                    Entity::Messages,
                    s,
                    &[("messageId", &target)],
                    mapped.fields,
                    None,
                )];
            }
        }
        return vec![];
    }
    let reaction = &content["reactionMessage"];
    if !reaction.is_null() {
        let (Some(target), Some(sender)) =
            (keys.message_value(&reaction["key"], jid), sender.as_ref())
        else {
            return vec![];
        };
        let version = to_millis(numeric(&reaction["senderTimestampMs"]))
            .or(timestamp)
            .unwrap_or(0.);
        let mut f = FieldWrites::new();
        set(&mut f, "chatId", chat.clone(), 0.);
        set(
            &mut f,
            "emoji",
            reaction["text"].as_str().unwrap_or(""),
            version,
        );
        set(&mut f, "timestamp", version, version);
        return vec![upsert(
            Entity::Reactions,
            s,
            &[("messageId", &target), ("senderId", sender)],
            f,
            None,
        )];
    }
    let mut f = FieldWrites::new();
    set(&mut f, "chatId", chat.clone(), 0.);
    set(&mut f, "fromMe", from_me, 0.);
    put(&mut f, "senderId", sender.map(|s| json!(s)), 0.);
    put(
        &mut f,
        "senderJid",
        sender_jid.map(|jid| json!(normalize_jid(jid))),
        0.,
    );
    set(&mut f, "timestamp", timestamp.unwrap_or(0.), 0.);
    str_field(&mut f, "waMessageId", key, "id", 0.);
    if !from_me {
        str_field(&mut f, "pushName", info, "pushName", 0.);
    }
    if let Some(starred) = info["starred"].as_bool() {
        set(&mut f, "starred", starred, 0.);
    }
    let state = enumeration(
        &info["status"],
        &[
            ("ERROR", 0),
            ("PENDING", 1),
            ("SERVER_ACK", 2),
            ("DELIVERY_ACK", 3),
            ("READ", 4),
            ("PLAYED", 5),
        ],
    )
    .and_then(|n| match n {
        0. => Some(MessageStatus::Failed),
        1. => Some(MessageStatus::Pending),
        2. => Some(MessageStatus::Sent),
        3. => Some(MessageStatus::Delivered),
        4. => Some(MessageStatus::Read),
        5. => Some(MessageStatus::Played),
        _ => None,
    });
    if from_me {
        if let Some(state) = state {
            status(&mut f, state, None);
        }
    }
    let mut ops = vec![];
    let mut media = None;
    if enumeration(&info["messageStubType"], &[("REVOKE", 1)]) == Some(1.) {
        f.extend(clear(CONTENT_FIELDS));
        set(
            &mut f,
            "revokedAt",
            to_millis(numeric(&info["revokeMessageTimestamp"]))
                .or(timestamp)
                .unwrap_or(0.),
            merge::FINAL_VERSION,
        );
        ops.push(upsert(
            Entity::Media,
            s,
            &[("messageId", &id)],
            clear(MEDIA_SECRET_FIELDS),
            None,
        ));
    } else if !content.is_null() {
        if let Some(mapped) = mapped(content, 0.) {
            set(&mut f, "type", mapped.kind, 0.);
            put(&mut f, "quotedId", mapped.quoted.map(|v| json!(v)), 0.);
            f.extend(mapped.fields);
            media = mapped.media;
        } else {
            set(&mut f, "type", "unknown", 0.);
        }
    }
    ops.push(upsert(
        Entity::Messages,
        s,
        &[("messageId", &id)],
        f,
        g.clone(),
    ));
    if let Some((kind, p)) = media {
        ops.push(upsert(
            Entity::Media,
            s,
            &[("messageId", &id)],
            media_fields(kind, p, &chat, 0.),
            g.clone(),
        ));
    }
    for receipt in array(&info["userReceipt"]) {
        let Some(user) = text(&receipt["userJid"]) else {
            continue;
        };
        let state = [
            ("playedTimestamp", MessageStatus::Played),
            ("readTimestamp", MessageStatus::Read),
            ("receiptTimestamp", MessageStatus::Delivered),
        ]
        .into_iter()
        .find_map(|(n, state)| to_millis(numeric(&receipt[n])).map(|n| (state, n)));
        let Some((state, at)) = state else { continue };
        let mut f = FieldWrites::new();
        set(&mut f, "chatId", chat.clone(), 0.);
        status(&mut f, state, Some(at));
        if let Some(v) = f.remove("statusAt") {
            f.insert("timestamp".into(), v);
        }
        ops.push(upsert(
            Entity::Receipts,
            s,
            &[("messageId", &id), ("recipientId", &keys.contact_id(user))],
            f,
            g.clone(),
        ));
    }
    for r in array(&info["reactions"]) {
        let key = &r["key"];
        let reactor = if key["fromMe"] == true {
            Some(SELF_ID)
        } else {
            text(&key["participant"]).or_else(|| (!group).then_some(jid))
        };
        let Some(reactor) = reactor else { continue };
        let reactor = if reactor == SELF_ID {
            SELF_ID.into()
        } else {
            keys.contact_id(reactor)
        };
        let version = to_millis(numeric(&r["senderTimestampMs"]))
            .or(timestamp)
            .unwrap_or(0.);
        let mut f = FieldWrites::new();
        set(&mut f, "chatId", chat.clone(), 0.);
        set(&mut f, "emoji", r["text"].as_str().unwrap_or(""), version);
        set(&mut f, "timestamp", version, version);
        ops.push(upsert(
            Entity::Reactions,
            s,
            &[("messageId", &id), ("senderId", &reactor)],
            f,
            g.clone(),
        ));
    }
    if !from_me {
        if let (Some(jid), Some(name), Some(at)) = (sender_jid, text(&info["pushName"]), timestamp)
        {
            let mut f = FieldWrites::new();
            set(&mut f, "jid", normalize_jid(jid), 0.);
            set(&mut f, "pushName", name, at);
            ops.push(upsert(
                Entity::Contacts,
                s,
                &[("contactId", &keys.contact_id(jid))],
                f,
                None,
            ));
        }
    }
    ops
}
fn conversation(s: &str, c: &Value, keys: &HistoryKeys) -> Vec<StorageOperation> {
    let Some(jid) = text(&c["id"]) else {
        return vec![];
    };
    let bare = normalize_jid(jid);
    let chat = keys.chat_id(&bare);
    let kind = chat_kind(Some(&bare), None);
    let last = to_millis(numeric(&c["lastMsgTimestamp"]));
    let snapshot = to_millis(numeric(&c["conversationTimestamp"]))
        .unwrap_or(0.)
        .max(last.unwrap_or(0.));
    let mut f = FieldWrites::new();
    set(&mut f, "jid", bare.clone(), 0.);
    put(&mut f, "kind", kind.map(|v| json!(v)), 0.);
    put(
        &mut f,
        "name",
        string(&c["name"]).or_else(|| string(&c["displayName"])),
        snapshot,
    );
    str_field(&mut f, "username", c, "username", snapshot);
    if kind == Some("direct") {
        if let Some(pn) = text(&c["pnJid"]) {
            set(
                &mut f,
                "phoneNumber",
                format!("+{}", normalize_jid(pn).split('@').next().unwrap_or("")),
                snapshot,
            );
        }
    }
    for (out, input) in [
        ("archived", "archived"),
        ("markedUnread", "markedAsUnread"),
        ("unreadCount", "unreadCount"),
        ("readOnly", "readOnly"),
        ("ephemeralExpiration", "ephemeralExpiration"),
    ] {
        put(
            &mut f,
            out,
            c.get(input).filter(|v| !v.is_null()).cloned(),
            snapshot,
        );
    }
    if let Some(pin) = numeric(&c["pinned"]) {
        set(&mut f, "pinned", pin > 0., snapshot);
    }
    if let Some(end) = numeric(&c["muteEndTime"]) {
        set(&mut f, "muted", end != 0., snapshot);
        set(
            &mut f,
            "muteEndAt",
            if end > 0. {
                to_millis(Some(end))
                    .map(|v| json!(v))
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            },
            snapshot,
        );
    }
    if let Some(last) = last {
        set(&mut f, "lastMessageAt", last, last);
    }
    let mut ops = vec![upsert(Entity::Chats, s, &[("chatId", &chat)], f, None)];
    if kind == Some("group") {
        let mut f = FieldWrites::new();
        set(&mut f, "jid", bare.clone(), 0.);
        str_field(&mut f, "subject", c, "name", snapshot);
        str_field(&mut f, "description", c, "description", snapshot);
        put(
            &mut f,
            "createdAt",
            to_millis(numeric(&c["createdAt"])).map(|v| json!(v)),
            0.,
        );
        put(
            &mut f,
            "createdBy",
            text(&c["createdBy"]).map(|v| json!(normalize_jid(v))),
            0.,
        );
        ops.push(upsert(Entity::Groups, s, &[("groupId", &chat)], f, None));
        for p in array(&c["participant"]) {
            let Some(jid) = text(&p["userJid"]) else {
                continue;
            };
            let rank = enumeration(
                &p["rank"],
                &[("REGULAR", 0), ("ADMIN", 1), ("SUPERADMIN", 2)],
            )
            .unwrap_or(0.);
            let mut f = FieldWrites::new();
            set(&mut f, "jid", normalize_jid(jid), 0.);
            set(
                &mut f,
                "role",
                if rank == 1. {
                    "admin"
                } else if rank == 2. {
                    "superadmin"
                } else {
                    "member"
                },
                snapshot,
            );
            set(&mut f, "active", true, snapshot);
            set(&mut f, "changedAt", snapshot, snapshot);
            ops.push(upsert(
                Entity::GroupParticipants,
                s,
                &[("groupId", &chat), ("participantId", &keys.contact_id(jid))],
                f,
                None,
            ));
        }
    }
    for entry in array(&c["messages"]) {
        if !entry["message"].is_null() {
            ops.extend(reduce_web(&entry["message"], s, keys, Some(&bare)));
        }
    }
    ops
}
pub fn reduce_history_chunk(input: &HistoryChunkInput) -> OperationBatch {
    let keys = HistoryKeys::new(input.identities.as_ref(), Some(&input.chunk));
    let chunk = serde_json::to_value(&input.chunk).unwrap_or(Value::Null);
    let s = &input.session_id;
    let mut ops = vec![];
    for c in array(&chunk["conversations"]) {
        ops.extend(conversation(s, c, &keys));
    }
    for p in array(&chunk["pushnames"]) {
        if let (Some(jid), Some(name)) = (text(&p["id"]), text(&p["pushname"])) {
            if chat_kind(Some(&normalize_jid(jid)), None) == Some("direct") {
                let mut f = FieldWrites::new();
                set(&mut f, "jid", normalize_jid(jid), 0.);
                set(&mut f, "pushName", name, 0.);
                ops.push(upsert(
                    Entity::Contacts,
                    s,
                    &[("contactId", &keys.contact_id(jid))],
                    f,
                    None,
                ));
            }
        }
    }
    for m in array(&chunk["phoneNumberToLidMappings"]) {
        if let (Some(pn), Some(lid)) = (text(&m["pnJid"]), text(&m["lidJid"])) {
            let phone = format!("+{}", normalize_jid(pn).split('@').next().unwrap_or(""));
            for jid in [pn, lid] {
                let mut f = FieldWrites::new();
                set(&mut f, "phoneNumber", phone.clone(), 0.);
                set(&mut f, "lidJid", normalize_jid(lid), 0.);
                ops.push(upsert(
                    Entity::Contacts,
                    s,
                    &[("contactId", &keys.contact_id(jid))],
                    f,
                    None,
                ));
            }
        }
    }
    for p in array(&chunk["pastParticipants"]) {
        let Some(group) = text(&p["groupJid"]) else {
            continue;
        };
        let group = keys.chat_id(group);
        for member in array(&p["pastParticipants"]) {
            let Some(jid) = text(&member["userJid"]) else {
                continue;
            };
            let at = to_millis(numeric(&member["leaveTs"])).unwrap_or(0.);
            let reason = enumeration(&member["leaveReason"], &[("LEFT", 0), ("REMOVED", 1)]);
            let mut f = FieldWrites::new();
            set(&mut f, "jid", normalize_jid(jid), 0.);
            set(&mut f, "active", false, at);
            set(
                &mut f,
                "leaveReason",
                if reason == Some(1.) {
                    "removed"
                } else {
                    "left"
                },
                at,
            );
            set(&mut f, "changedAt", at, at);
            ops.push(upsert(
                Entity::GroupParticipants,
                s,
                &[
                    ("groupId", &group),
                    ("participantId", &keys.contact_id(jid)),
                ],
                f,
                None,
            ));
        }
    }
    ops.extend(history_progress_operations(
        s,
        &HistoryProgressInput {
            sync_type: history_sync_type_name(&chunk["syncType"]),
            chunk_order: numeric(&chunk["chunkOrder"]),
            progress: numeric(&chunk["progress"]),
            conversation_count: Some(array(&chunk["conversations"]).len() as f64),
            message_count: Some(
                array(&chunk["conversations"])
                    .iter()
                    .map(|c| array(&c["messages"]).len())
                    .sum::<usize>() as f64,
            ),
            pushname_count: Some(array(&chunk["pushnames"]).len() as f64),
        },
    ));
    OperationBatch {
        session_id: s.clone(),
        event_id: input.chunk_id.as_ref().map(|id| format!("history:{id}")),
        event_type: Some("history.chunk".into()),
        operations: ops,
    }
}
