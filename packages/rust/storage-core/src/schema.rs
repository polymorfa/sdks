//! Schema 3 from storage producer d80b581c9df122411e9149a7e39a33700a51571c.
use super::{StorageError, StorageResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Entity {
    Connections,
    Chats,
    Messages,
    Reactions,
    Receipts,
    PollVotes,
    Contacts,
    Groups,
    GroupParticipants,
    Media,
    Labels,
    LabelAssociations,
    HistoryChunks,
    HistoryProgress,
    Checkpoints,
    Events,
    Leases,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FieldType {
    String,
    Number,
    Boolean,
    Json,
}
pub struct IndexDefinition {
    pub name: &'static str,
    pub equals: &'static [&'static str],
    pub sort: &'static str,
}
pub struct EntityDefinition {
    pub entity: Entity,
    pub name: &'static str,
    pub key: &'static [&'static str],
    pub fields: &'static [(&'static str, FieldType)],
    pub indexes: &'static [IndexDefinition],
}
pub const SCHEMA_VERSION: u32 = 3;
pub const SOURCE_STORAGE_COMMIT: &str = "d80b581c9df122411e9149a7e39a33700a51571c";
pub const ALL_ENTITIES: [Entity; 17] = [
    Entity::Connections,
    Entity::Chats,
    Entity::Messages,
    Entity::Reactions,
    Entity::Receipts,
    Entity::PollVotes,
    Entity::Contacts,
    Entity::Groups,
    Entity::GroupParticipants,
    Entity::Media,
    Entity::Labels,
    Entity::LabelAssociations,
    Entity::HistoryChunks,
    Entity::HistoryProgress,
    Entity::Checkpoints,
    Entity::Events,
    Entity::Leases,
];
impl Entity {
    pub fn definition(self) -> EntityDefinition {
        use FieldType::{Boolean as B, Json as J, Number as N, String as S};
        type DefinitionParts = (
            &'static str,
            &'static [&'static str],
            &'static [(&'static str, FieldType)],
            &'static [IndexDefinition],
        );
        let (name, key, fields, indexes): DefinitionParts = match self {
            Self::Connections => (
                "connections",
                &["connectionId"],
                &[
                    ("phoneNumber", S),
                    ("waId", S),
                    ("pushName", S),
                    ("phonePlatform", S),
                    ("accountType", S),
                    ("businessName", S),
                    ("connected", B),
                    ("status", S),
                    ("statusReason", S),
                    ("loggedOutReason", S),
                    ("loggedOutCode", N),
                ],
                &[],
            ),
            Self::Chats => (
                "chats",
                &["connectionId", "chatId"],
                &[
                    ("jid", S),
                    ("kind", S),
                    ("phoneNumber", S),
                    ("bsuid", S),
                    ("username", S),
                    ("name", S),
                    ("archived", B),
                    ("pinned", B),
                    ("muted", B),
                    ("muteEndAt", N),
                    ("markedUnread", B),
                    ("unreadCount", N),
                    ("readOnly", B),
                    ("ephemeralExpiration", N),
                    ("lastMessageAt", N),
                    ("clearedAt", N),
                    ("deletedAt", N),
                ],
                &[IndexDefinition {
                    name: "by_activity",
                    equals: &["connectionId"],
                    sort: "lastMessageAt",
                }],
            ),
            Self::Messages => (
                "messages",
                &["connectionId", "messageId"],
                &[
                    ("chatId", S),
                    ("waMessageId", S),
                    ("cloudMessageId", S),
                    ("fromMe", B),
                    ("senderId", S),
                    ("senderJid", S),
                    ("pushName", S),
                    ("timestamp", N),
                    ("type", S),
                    ("text", S),
                    ("caption", S),
                    ("mimeType", S),
                    ("fileName", S),
                    ("latitude", N),
                    ("longitude", N),
                    ("displayName", S),
                    ("title", S),
                    ("quotedId", S),
                    ("pollOptions", J),
                    ("extra", J),
                    ("editedAt", N),
                    ("revokedAt", N),
                    ("deletedAt", N),
                    ("starred", B),
                    ("status", S),
                    ("statusAt", N),
                ],
                &[IndexDefinition {
                    name: "by_chat",
                    equals: &["connectionId", "chatId"],
                    sort: "timestamp",
                }],
            ),
            Self::Reactions => (
                "reactions",
                &["connectionId", "messageId", "senderId"],
                &[("chatId", S), ("emoji", S), ("timestamp", N)],
                &[IndexDefinition {
                    name: "by_message",
                    equals: &["connectionId", "messageId"],
                    sort: "timestamp",
                }],
            ),
            Self::Receipts => (
                "receipts",
                &["connectionId", "messageId", "recipientId"],
                &[("chatId", S), ("status", S), ("timestamp", N)],
                &[IndexDefinition {
                    name: "by_message",
                    equals: &["connectionId", "messageId"],
                    sort: "timestamp",
                }],
            ),
            Self::PollVotes => (
                "poll_votes",
                &["connectionId", "messageId", "voterId"],
                &[("chatId", S), ("selectedHashes", J), ("timestamp", N)],
                &[IndexDefinition {
                    name: "by_message",
                    equals: &["connectionId", "messageId"],
                    sort: "timestamp",
                }],
            ),
            Self::Contacts => (
                "contacts",
                &["connectionId", "contactId"],
                &[
                    ("jid", S),
                    ("lidJid", S),
                    ("phoneNumber", S),
                    ("bsuid", S),
                    ("username", S),
                    ("fullName", S),
                    ("firstName", S),
                    ("pushName", S),
                    ("businessName", S),
                    ("pictureId", S),
                    ("blocked", B),
                ],
                &[],
            ),
            Self::Groups => (
                "groups",
                &["connectionId", "groupId"],
                &[
                    ("jid", S),
                    ("subject", S),
                    ("description", S),
                    ("createdAt", N),
                    ("createdBy", S),
                    ("inviteLink", S),
                    ("joinApprovalRequired", B),
                    ("lastAction", S),
                ],
                &[],
            ),
            Self::GroupParticipants => (
                "group_participants",
                &["connectionId", "groupId", "participantId"],
                &[
                    ("jid", S),
                    ("phoneNumber", S),
                    ("role", S),
                    ("active", B),
                    ("changedAt", N),
                    ("leaveReason", S),
                ],
                &[IndexDefinition {
                    name: "by_group",
                    equals: &["connectionId", "groupId"],
                    sort: "changedAt",
                }],
            ),
            Self::Media => (
                "media",
                &["connectionId", "messageId"],
                &[
                    ("chatId", S),
                    ("kind", S),
                    ("mimeType", S),
                    ("fileName", S),
                    ("fileLength", N),
                    ("fileSha256", S),
                    ("fileEncSha256", S),
                    ("directPath", S),
                    ("mediaKey", S),
                    ("mediaKeyTimestamp", N),
                    ("descriptor", S),
                    ("downloadUrl", S),
                    ("archiveLocation", S),
                    ("archiveContentType", S),
                    ("archiveSize", N),
                    ("archiveSha256", S),
                    ("archivedAt", N),
                ],
                &[],
            ),
            Self::Labels => (
                "labels",
                &["connectionId", "labelId"],
                &[("name", S), ("color", N), ("orderIndex", N), ("deleted", B)],
                &[],
            ),
            Self::LabelAssociations => (
                "label_associations",
                &["connectionId", "labelId", "targetKind", "targetId"],
                &[("labeled", B), ("changedAt", N)],
                &[],
            ),
            Self::HistoryChunks => (
                "history_chunks",
                &["connectionId", "syncType", "chunkOrder"],
                &[
                    ("progress", N),
                    ("conversationCount", N),
                    ("messageCount", N),
                    ("pushnameCount", N),
                ],
                &[],
            ),
            Self::HistoryProgress => (
                "history_progress",
                &["connectionId", "syncType"],
                &[("progress", N), ("lastChunkOrder", N)],
                &[],
            ),
            Self::Checkpoints => (
                "checkpoints",
                &["connectionId", "stream"],
                &[("cursor", S), ("position", J), ("updatedAt", N)],
                &[],
            ),
            Self::Events => ("events", &["connectionId", "eventId"], &[("type", S)], &[]),
            Self::Leases => (
                "leases",
                &["connectionId"],
                &[("owner", S), ("expiresAt", N)],
                &[],
            ),
        };
        EntityDefinition {
            entity: self,
            name,
            key,
            fields,
            indexes,
        }
    }
}
pub fn encode_key(entity: Entity, key: &BTreeMap<String, String>) -> StorageResult<String> {
    let values = entity
        .definition()
        .key
        .iter()
        .map(|name| {
            key.get(*name)
                .filter(|s| !s.is_empty())
                .map(|s| encode_component(s))
                .ok_or(StorageError::Invalid("Missing storage key"))
        })
        .collect::<StorageResult<Vec<_>>>()?;
    Ok(format!("k{}", values.join(":")))
}
fn encode_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_!~*'()".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}
pub fn namespace(value: &str) -> StorageResult<String> {
    if value.is_empty()
        || value.len() > 64
        || !value.as_bytes()[0].is_ascii_alphabetic()
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(StorageError::Invalid("Invalid customer-owned namespace"));
    }
    Ok(value.into())
}
