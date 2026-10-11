//! Calls revision 1 JSON control frames. Unknown frame types are ignored.
use crate::calls::Participant;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrickleCandidate {
    pub candidate: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdp_mid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdp_m_line_index: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LifecycleFrame {
    Ready {
        session: Option<String>,
        participant: Option<String>,
    },
    Event {
        event: String,
        #[serde(rename = "callId")]
        call_id: String,
        payload: serde_json::Value,
        timestamp: String,
    },
    Candidate {
        #[serde(rename = "callId")]
        call_id: String,
        #[serde(rename = "connectionId")]
        connection_id: Option<String>,
        candidate: TrickleCandidate,
    },
    Error {
        code: String,
        message: String,
    },
    Pong,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ReactionOwner {
    SelfParticipant {
        #[serde(rename = "self")]
        own: bool,
    },
    Participant {
        #[serde(rename = "participantId")]
        participant_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum VideoSourceOwner {
    Connection {
        #[serde(rename = "connectionId")]
        connection_id: String,
        #[serde(rename = "connectionParticipant")]
        connection_participant: Option<String>,
    },
    Participant {
        participant: Participant,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MediaControlFrame {
    MediaState {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "audioMuted")]
        audio_muted: bool,
        #[serde(rename = "videoEnabled")]
        video_enabled: bool,
        #[serde(rename = "screenSharing")]
        screen_sharing: Option<bool>,
    },
    MediaError {
        #[serde(rename = "requestId")]
        request_id: String,
        code: String,
    },
    RemoteMedia {
        #[serde(rename = "audioMuted")]
        audio_muted: Option<bool>,
    },
    Reaction {
        emoji: String,
        #[serde(flatten)]
        owner: ReactionOwner,
    },
    HandState {
        raised: bool,
        supported: bool,
    },
    Ready {
        #[serde(rename = "callId")]
        call_id: Option<String>,
        #[serde(rename = "connectionId")]
        connection_id: Option<String>,
        #[serde(rename = "sampleRate")]
        sample_rate: u32,
        video: bool,
    },
    Pong,
    ParticipantJoined {
        participant: Participant,
    },
    ParticipantLeft {
        #[serde(rename = "participantId")]
        participant_id: String,
        reason: Option<String>,
    },
    ParticipantState {
        participant: Participant,
    },
    VideoSource {
        source: u32,
        #[serde(flatten)]
        owner: VideoSourceOwner,
    },
    VideoSourceRemoved {
        source: u32,
    },
    KeyframeRequest,
    Error {
        code: String,
        message: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaStateUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_muted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen_sharing: Option<bool>,
}
pub fn is_connection_id(id: &str) -> bool {
    (8..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
pub fn is_participant_name(id: &str) -> bool {
    (1..=128).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:@-".contains(&b))
}
pub fn create_connection_id() -> String {
    use base64::Engine;
    let bytes: [u8; 18] = rand::random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
pub fn parse_lifecycle_frame(raw: &str) -> Option<LifecycleFrame> {
    let frame: LifecycleFrame = serde_json::from_str(raw).ok()?;
    if matches!(&frame,LifecycleFrame::Candidate { connection_id:Some(id),.. } if !is_connection_id(id))
    {
        return None;
    }
    Some(frame)
}
pub fn parse_media_control(raw: &str) -> Option<MediaControlFrame> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    let frame: MediaControlFrame = serde_json::from_value(value.clone()).ok()?;
    let valid = match &frame {
        MediaControlFrame::Ready { sample_rate, .. } => *sample_rate > 0,
        MediaControlFrame::MediaState { request_id, .. }
        | MediaControlFrame::MediaError { request_id, .. } => is_connection_id(request_id),
        MediaControlFrame::Reaction { emoji, owner } => {
            ["", "👍", "❤️", "😂", "😮", "😢", "🙏"].contains(&emoji.as_str())
                && match owner {
                    ReactionOwner::SelfParticipant { own } => {
                        *own && value.get("participantId").is_none()
                    }
                    ReactionOwner::Participant { participant_id } => {
                        value.get("self").is_none()
                            && (1..=19).contains(&participant_id.len())
                            && participant_id.as_bytes()[0] != b'0'
                            && participant_id.bytes().all(|b| b.is_ascii_digit())
                    }
                }
        }
        MediaControlFrame::ParticipantJoined { participant }
        | MediaControlFrame::ParticipantState { participant } => valid_participant(participant),
        MediaControlFrame::VideoSource { source, owner } => {
            *source > 0
                && match owner {
                    VideoSourceOwner::Connection { connection_id, .. } => {
                        is_connection_id(connection_id) && value.get("participant").is_none()
                    }
                    VideoSourceOwner::Participant { participant } => {
                        valid_participant(participant)
                            && value.get("connectionId").is_none()
                            && value.get("connectionParticipant").is_none()
                    }
                }
        }
        MediaControlFrame::VideoSourceRemoved { source } => *source > 0,
        MediaControlFrame::RemoteMedia { .. } => value.get("audioMuted").is_some(),
        _ => true,
    };
    valid.then_some(frame)
}
fn valid_participant(participant: &Participant) -> bool {
    matches!(
        participant.state.as_str(),
        "invited" | "ringing" | "connected" | "left"
    )
}
