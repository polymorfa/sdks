//! Pure reducers for explicitly verified envelopes. This module does not verify trust.
use super::{
    common::*,
    history::{history_progress_operations, history_sync_type_name, HistoryProgressInput},
};
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEvent {
    pub id: String,
    pub session: String,
    pub timestamp: String,
    pub event: String,
    #[serde(default)]
    pub payload: Value,
}
pub const STORED_EVENT_TYPES: &[&str] = &[
    "blocklist.update",
    "chat.archive",
    "chat.clear",
    "chat.delete",
    "chat.mute",
    "chat.read",
    "contact.update",
    "group.participant",
    "group.update",
    "history.sync",
    "labels.update",
    "message.ack",
    "message.delete",
    "message.edited",
    "message.reaction",
    "message.received",
    "message.revoked",
    "message.sent",
    "message.update",
    "message.vote",
    "newsletter.update",
    "session.connected",
    "session.logged_out",
    "session.status",
];
pub fn reduce_event(event: &StorageEvent) -> OperationBatch {
    OperationBatch {
        session_id: event.session.clone(),
        event_id: Some(event.id.clone()),
        event_type: Some(event.event.clone()),
        operations: event_operations(
            &event.session,
            &event.event,
            &event.payload,
            iso_millis(&event.timestamp),
        ),
    }
}
pub fn ack_status(value: Option<&str>) -> Option<MessageStatus> {
    use MessageStatus::*;
    Some(match value?.to_lowercase().as_str() {
        "pending" => Pending,
        "error" | "failed" => Failed,
        "sent" | "server" | "server_ack" => Sent,
        "delivered" | "delivery" | "delivery_ack" => Delivered,
        "read" | "read-self" | "read_self" => Read,
        "played" | "played-self" => Played,
        _ => return None,
    })
}
struct Identity<'a> {
    id: &'a str,
    chat: &'a str,
    time: Option<f64>,
    from_me: bool,
    sender: Option<&'a str>,
}
fn identity(p: &Value, force_self: bool) -> Option<Identity<'_>> {
    let id = text(&p["id"])?;
    let chat = text(&p["conversation"]["id"])?;
    let from_me = force_self || p["fromMe"] == true;
    Some(Identity {
        id,
        chat,
        time: to_millis(numeric(&p["timestamp"])),
        from_me,
        sender: if from_me {
            Some(SELF_ID)
        } else {
            text(&p["conversation"]["sender"]["id"])
                .or_else(|| (p["isGroup"] != true).then_some(chat))
        },
    })
}
fn chat(
    s: &str,
    conversation: &Value,
    group: Option<bool>,
    timestamp: Option<f64>,
) -> Vec<StorageOperation> {
    let Some(id) = text(&conversation["id"]) else {
        return vec![];
    };
    let mut f = FieldWrites::new();
    put(&mut f, "kind", chat_kind(None, group).map(|s| json!(s)), 0.);
    if group != Some(true) {
        for n in ["phoneNumber", "bsuid", "username"] {
            str_field(&mut f, n, conversation, n, timestamp.unwrap_or(0.));
        }
    }
    if let Some(t) = timestamp {
        set(&mut f, "lastMessageAt", t, t);
    }
    vec![upsert(Entity::Chats, s, &[("chatId", id)], f, None)]
}
fn content(p: &Value, version: f64) -> FieldWrites {
    let mut f = FieldWrites::new();
    set(
        &mut f,
        "text",
        string(&p["text"])
            .or_else(|| string(&p["text"]["body"]))
            .unwrap_or(Value::Null),
        version,
    );
    for (out, input) in [
        ("caption", "caption"),
        ("mimeType", "mimeType"),
        ("fileName", "filename"),
        ("displayName", "displayName"),
        ("title", "title"),
    ] {
        set(
            &mut f,
            out,
            string(&p[input]).unwrap_or(Value::Null),
            version,
        );
    }
    for n in ["latitude", "longitude"] {
        set(
            &mut f,
            n,
            number(&p[n]).map(|n| json!(n)).unwrap_or(Value::Null),
            version,
        );
    }
    set(
        &mut f,
        "pollOptions",
        p.get("pollOptions").cloned().unwrap_or(Value::Null),
        version,
    );
    let extra: serde_json::Map<String, Value> = [
        "ptt",
        "nativeFlowResponse",
        "replyChoice",
        "unavailable",
        "unavailableReason",
        "interactive",
        "referral",
    ]
    .into_iter()
    .filter_map(|n| p.get(n).map(|v| (n.into(), v.clone())))
    .collect();
    set(
        &mut f,
        "extra",
        if extra.is_empty() {
            Value::Null
        } else {
            Value::Object(extra)
        },
        version,
    );
    f
}
fn received(s: &str, p: &Value, at: f64, edit: bool) -> Vec<StorageOperation> {
    let Some(i) = identity(p, false) else {
        return vec![];
    };
    match text(&p["type"]) {
        Some("reaction") => return reaction(s, p, at),
        Some("revoke") => return revoke(s, p, at),
        _ => {}
    }
    let ver = i.time.unwrap_or(at);
    let mut f = FieldWrites::new();
    set(&mut f, "chatId", i.chat, 0.);
    set(&mut f, "fromMe", i.from_me, 0.);
    put(&mut f, "senderId", i.sender.map(|s| json!(s)), 0.);
    if !edit {
        set(&mut f, "timestamp", i.time.unwrap_or(0.), 0.);
    }
    for (out, input) in [
        ("waMessageId", "linked_devices"),
        ("cloudMessageId", "official_api"),
    ] {
        str_field(&mut f, out, &p["whatsapp_ids"], input, 0.);
    }
    str_field(&mut f, "quotedId", p, "parentMessageId", 0.);
    if !i.from_me {
        put(
            &mut f,
            "pushName",
            string(&p["pushName"]).or_else(|| string(&p["senderName"])),
            0.,
        );
    }
    if edit {
        f.extend(content(p, ver));
        set(&mut f, "editedAt", ver, ver);
    } else {
        str_field(&mut f, "type", p, "type", 0.);
        f.extend(content(p, 0.));
    }
    let g = guard(s, i.chat, i.time);
    let mut ops = chat(
        s,
        &p["conversation"],
        p["isGroup"].as_bool(),
        if edit { None } else { i.time },
    );
    ops.push(upsert(
        Entity::Messages,
        s,
        &[("messageId", i.id)],
        f,
        g.clone(),
    ));
    let kind = text(&p["type"]);
    if text(&p["media"]).is_some()
        || text(&p["mediaUrl"]).is_some()
        || kind.is_some_and(|t| ["image", "video", "audio", "document", "sticker"].contains(&t))
    {
        let mut f = FieldWrites::new();
        set(&mut f, "chatId", i.chat, 0.);
        put(&mut f, "kind", kind.map(|s| json!(s)), 0.);
        for (out, input) in [
            ("mimeType", "mimeType"),
            ("fileName", "filename"),
            ("descriptor", "media"),
            ("downloadUrl", "mediaUrl"),
        ] {
            str_field(&mut f, out, p, input, if edit { ver } else { 0. });
        }
        ops.push(upsert(Entity::Media, s, &[("messageId", i.id)], f, g));
    }
    if !i.from_me {
        if let (Some(contact), Some(name), Some(t)) = (
            i.sender,
            text(&p["pushName"]).or_else(|| text(&p["senderName"])),
            i.time,
        ) {
            let mut f = FieldWrites::new();
            set(&mut f, "pushName", name, t);
            let reference = if p["isGroup"] == true {
                &p["conversation"]["sender"]
            } else {
                &p["conversation"]
            };
            str_field(&mut f, "phoneNumber", reference, "phoneNumber", t);
            ops.push(upsert(
                Entity::Contacts,
                s,
                &[("contactId", contact)],
                f,
                None,
            ));
        }
    }
    ops
}
fn sent(s: &str, p: &Value) -> Vec<StorageOperation> {
    let Some(i) = identity(p, true) else {
        return vec![];
    };
    let mut f = FieldWrites::new();
    set(&mut f, "chatId", i.chat, 0.);
    set(&mut f, "fromMe", true, 0.);
    set(&mut f, "senderId", SELF_ID, 0.);
    set(&mut f, "timestamp", i.time.unwrap_or(0.), 0.);
    str_field(&mut f, "type", p, "type", 0.);
    for (out, input) in [
        ("waMessageId", "linked_devices"),
        ("cloudMessageId", "official_api"),
    ] {
        str_field(&mut f, out, &p["whatsapp_ids"], input, 0.);
    }
    status(&mut f, MessageStatus::Sent, i.time);
    let mut ops = chat(s, &p["conversation"], None, i.time);
    ops.push(upsert(
        Entity::Messages,
        s,
        &[("messageId", i.id)],
        f,
        guard(s, i.chat, i.time),
    ));
    ops
}
fn reaction(s: &str, p: &Value, at: f64) -> Vec<StorageOperation> {
    let (Some(i), Some(target)) = (identity(p, false), text(&p["reactionTo"])) else {
        return vec![];
    };
    let Some(sender) = i.sender else {
        return vec![];
    };
    let ver = i.time.unwrap_or(at);
    let mut f = FieldWrites::new();
    set(&mut f, "chatId", i.chat, 0.);
    set(&mut f, "emoji", p["reaction"].as_str().unwrap_or(""), ver);
    set(&mut f, "timestamp", ver, ver);
    vec![upsert(
        Entity::Reactions,
        s,
        &[("messageId", target), ("senderId", sender)],
        f,
        None,
    )]
}
fn revoked(s: &str, id: &str, chat: &str, at: f64, field: &str) -> Vec<StorageOperation> {
    let mut f = clear(CONTENT_FIELDS);
    set(&mut f, "chatId", chat, 0.);
    set(&mut f, field, at, merge::FINAL_VERSION);
    vec![
        upsert(Entity::Messages, s, &[("messageId", id)], f, None),
        upsert(
            Entity::Media,
            s,
            &[("messageId", id)],
            clear(MEDIA_SECRET_FIELDS),
            None,
        ),
    ]
}
fn revoke(s: &str, p: &Value, at: f64) -> Vec<StorageOperation> {
    let (Some(i), Some(target)) = (identity(p, false), text(&p["revokedId"])) else {
        return vec![];
    };
    revoked(s, target, i.chat, i.time.unwrap_or(at), "revokedAt")
}
fn event_operations(s: &str, event: &str, p: &Value, at: f64) -> Vec<StorageOperation> {
    let mut f = FieldWrites::new();
    match event {
        "message.received" | "message.update" => received(s, p, at, p["edited"] == true),
        "message.edited" => received(s, p, at, true),
        "message.sent" => sent(s, p),
        "message.reaction" => reaction(s, p, at),
        "message.revoked" => revoke(s, p, at),
        "message.delete" => {
            if let (Some(id), Some(chat)) = (text(&p["id"]), text(&p["conversation"]["id"])) {
                revoked(s, id, chat, at, "deletedAt")
            } else {
                vec![]
            }
        }
        "message.ack" => {
            let (Some(state), Some(chat)) = (
                ack_status(p["type"].as_str()),
                text(&p["conversation"]["id"]),
            ) else {
                return vec![];
            };
            let timestamp = to_millis(number(&p["timestamp"])).unwrap_or(at);
            let recipient = text(&p["from"]["id"])
                .or_else(|| text(&p["sender"]["id"]))
                .unwrap_or(chat);
            let mut ops = vec![];
            for message in array(&p["messages"]) {
                let Some(id) = text(&message["id"]) else {
                    continue;
                };
                let mut f = FieldWrites::new();
                set(&mut f, "chatId", chat, 0.);
                status(&mut f, state, Some(timestamp));
                ops.push(upsert(
                    Entity::Messages,
                    s,
                    &[("messageId", id)],
                    f.clone(),
                    None,
                ));
                if let Some(v) = f.remove("statusAt") {
                    f.insert("timestamp".into(), v);
                }
                ops.push(upsert(
                    Entity::Receipts,
                    s,
                    &[("messageId", id), ("recipientId", recipient)],
                    f,
                    None,
                ));
            }
            ops
        }
        "message.vote" => {
            let (Some(id), Some(voter), Some(chat)) = (
                text(&p["pollMessageId"]),
                text(&p["voter"]["id"]),
                text(&p["conversation"]["id"]),
            ) else {
                return vec![];
            };
            let ver = to_millis(number(&p["timestamp"])).unwrap_or(at);
            set(&mut f, "chatId", chat, 0.);
            set(
                &mut f,
                "selectedHashes",
                json!(array(&p["selectedHashes"])),
                ver,
            );
            set(&mut f, "timestamp", ver, ver);
            vec![upsert(
                Entity::PollVotes,
                s,
                &[("messageId", id), ("voterId", voter)],
                f,
                None,
            )]
        }
        "chat.archive" | "chat.mute" | "chat.read" | "chat.clear" | "chat.delete" => {
            let Some(chat) = text(&p["from"]["id"]) else {
                return vec![];
            };
            if at == 0. {
                return vec![];
            }
            match event {
                "chat.archive" => {
                    copy(&mut f, "archived", p, "archive", at);
                    copy(&mut f, "pinned", p, "pinned", at);
                }
                "chat.mute" => {
                    copy(&mut f, "muted", p, "muted", at);
                    set(
                        &mut f,
                        "muteEndAt",
                        if p["muted"] == true {
                            to_millis(number(&p["muteEndTimestamp"]))
                                .map(|n| json!(n))
                                .unwrap_or(Value::Null)
                        } else {
                            Value::Null
                        },
                        at,
                    );
                }
                "chat.read" => {
                    set(&mut f, "markedUnread", p["read"] != true, at);
                    if p["read"] == true {
                        set(&mut f, "unreadCount", 0, at);
                    }
                }
                _ => {
                    set(
                        &mut f,
                        if event == "chat.clear" {
                            "clearedAt"
                        } else {
                            "deletedAt"
                        },
                        at,
                        at,
                    );
                    return vec![
                        upsert(Entity::Chats, s, &[("chatId", chat)], f, None),
                        StorageOperation::ClearChat {
                            session_id: s.into(),
                            chat_id: chat.into(),
                            up_to: at,
                        },
                    ];
                }
            }
            if f.is_empty() {
                vec![]
            } else {
                vec![upsert(Entity::Chats, s, &[("chatId", chat)], f, None)]
            }
        }
        "contact.update" => {
            let Some(id) = text(&p["id"]) else {
                return vec![];
            };
            for n in [
                "phoneNumber",
                "bsuid",
                "username",
                "fullName",
                "firstName",
                "pushName",
                "businessName",
            ] {
                str_field(&mut f, n, p, n, at);
            }
            if p["pictureRemoved"] == true {
                set(&mut f, "pictureId", Value::Null, at);
            } else {
                str_field(&mut f, "pictureId", p, "pictureId", at);
            }
            if f.is_empty() {
                vec![]
            } else {
                vec![upsert(Entity::Contacts, s, &[("contactId", id)], f, None)]
            }
        }
        "blocklist.update" => {
            let mut ops = vec![];
            for c in array(&p["changes"]) {
                let Some(id) = text(&c["id"]) else { continue };
                let action = c["action"].as_str().unwrap_or("").to_lowercase();
                if action != "block" && action != "unblock" {
                    continue;
                }
                let mut f = FieldWrites::new();
                set(&mut f, "blocked", action == "block", at);
                str_field(&mut f, "phoneNumber", c, "phoneNumber", at);
                ops.push(upsert(Entity::Contacts, s, &[("contactId", id)], f, None));
            }
            ops
        }
        "group.update" => {
            let Some(id) = text(&p["id"]) else {
                return vec![];
            };
            for (out, input) in [
                ("subject", "newSubject"),
                ("lastAction", "action"),
                ("inviteLink", "inviteLink"),
            ] {
                str_field(&mut f, out, p, input, at);
            }
            copy(&mut f, "description", p, "newDescription", at);
            copy(
                &mut f,
                "joinApprovalRequired",
                p,
                "joinApprovalRequired",
                at,
            );
            let mut c = FieldWrites::new();
            set(&mut c, "kind", "group", 0.);
            str_field(&mut c, "name", p, "newSubject", at);
            vec![
                upsert(Entity::Groups, s, &[("groupId", id)], f, None),
                upsert(Entity::Chats, s, &[("chatId", id)], c, None),
            ]
        }
        "group.participant" => {
            let Some(group) = text(&p["id"]) else {
                return vec![];
            };
            let mut ops = vec![upsert(Entity::Groups, s, &[("groupId", group)], f, None)];
            for kind in ["joined", "left", "promoted", "demoted"] {
                for v in array(&p[kind]) {
                    let Some(id) = text(&v["id"]) else { continue };
                    let mut f = FieldWrites::new();
                    match kind {
                        "joined" => {
                            set(&mut f, "active", true, at);
                            set(&mut f, "role", "member", at);
                            set(&mut f, "leaveReason", Value::Null, at);
                        }
                        "left" => {
                            set(&mut f, "active", false, at);
                            set(
                                &mut f,
                                "leaveReason",
                                text(&p["reason"]).unwrap_or("left"),
                                at,
                            );
                        }
                        "promoted" => set(&mut f, "role", "admin", at),
                        _ => set(&mut f, "role", "member", at),
                    }
                    str_field(&mut f, "phoneNumber", v, "phoneNumber", at);
                    set(&mut f, "changedAt", at, at);
                    ops.push(upsert(
                        Entity::GroupParticipants,
                        s,
                        &[("groupId", group), ("participantId", id)],
                        f,
                        None,
                    ));
                }
            }
            ops
        }
        "labels.update" => labels(s, p, at),
        "newsletter.update" => {
            let Some(id) = text(&p["id"]) else {
                return vec![];
            };
            set(&mut f, "kind", "channel", 0.);
            copy(&mut f, "muted", p, "muted", at);
            vec![upsert(Entity::Chats, s, &[("chatId", id)], f, None)]
        }
        "session.connected" => {
            set(&mut f, "connected", true, at);
            for (out, input) in [
                ("phoneNumber", "phoneNumber"),
                ("waId", "id"),
                ("pushName", "pushName"),
                ("phonePlatform", "phonePlatform"),
                ("accountType", "accountType"),
                ("businessName", "businessName"),
            ] {
                str_field(&mut f, out, p, input, at);
            }
            vec![upsert(Entity::Sessions, s, &[], f, None)]
        }
        "session.status" => {
            let Some(v) = p["status"].as_str() else {
                return vec![];
            };
            set(&mut f, "status", v, at);
            set(
                &mut f,
                "statusReason",
                p.get("statusReason")
                    .filter(|v| !v.is_null())
                    .cloned()
                    .unwrap_or(Value::Null),
                at,
            );
            vec![upsert(Entity::Sessions, s, &[], f, None)]
        }
        "session.logged_out" => {
            set(&mut f, "connected", false, at);
            str_field(&mut f, "loggedOutReason", p, "reason", at);
            put(
                &mut f,
                "loggedOutCode",
                number(&p["code"]).map(|n| json!(n)),
                at,
            );
            vec![upsert(Entity::Sessions, s, &[], f, None)]
        }
        "history.sync" => {
            if p["kind"] == "history" {
                vec![]
            } else {
                history_progress_operations(
                    s,
                    &HistoryProgressInput {
                        sync_type: history_sync_type_name(&p["syncType"]),
                        chunk_order: number(&p["chunkOrder"]),
                        progress: number(&p["progress"]),
                        conversation_count: number(&p["conversationCount"]),
                        message_count: number(&p["messageCount"]),
                        pushname_count: number(&p["pushNameCount"]),
                    },
                )
            }
        }
        _ => vec![],
    }
}
fn labels(s: &str, p: &Value, at: f64) -> Vec<StorageOperation> {
    let version = to_millis(number(&p["observedAt"])).unwrap_or(at);
    let label = text(&p["labelId"]);
    let mut f = FieldWrites::new();
    match p["action"].as_str() {
        Some("label_edit") => {
            let Some(id) = label else { return vec![] };
            put(
                &mut f,
                "name",
                string(&p["name"]).or_else(|| string(&p["label"])),
                version,
            );
            for n in ["color", "orderIndex"] {
                put(&mut f, n, number(&p[n]).map(|v| json!(v)), version);
            }
            set(
                &mut f,
                "deleted",
                p.get("deleted")
                    .filter(|v| !v.is_null())
                    .cloned()
                    .unwrap_or(json!(false)),
                version,
            );
            vec![upsert(Entity::Labels, s, &[("labelId", id)], f, None)]
        }
        Some(kind @ ("label_association_chat" | "label_association_message")) => {
            let (Some(id), Some(target), Some(labeled)) = (
                label,
                if kind == "label_association_chat" {
                    text(&p["from"]["id"])
                } else {
                    text(&p["messageId"])
                },
                p["labeled"].as_bool(),
            ) else {
                return vec![];
            };
            set(&mut f, "labeled", labeled, version);
            set(&mut f, "changedAt", version, version);
            vec![upsert(
                Entity::LabelAssociations,
                s,
                &[
                    ("labelId", id),
                    (
                        "targetKind",
                        if kind == "label_association_chat" {
                            "chat"
                        } else {
                            "message"
                        },
                    ),
                    ("targetId", target),
                ],
                f,
                None,
            )]
        }
        Some("star") => {
            let (Some(id), Some(starred)) = (text(&p["messageId"]), p["starred"].as_bool()) else {
                return vec![];
            };
            set(&mut f, "starred", starred, version);
            str_field(&mut f, "chatId", &p["from"], "id", 0.);
            vec![upsert(Entity::Messages, s, &[("messageId", id)], f, None)]
        }
        _ => vec![],
    }
}
