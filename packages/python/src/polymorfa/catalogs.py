"""Known catalog values from the pinned TypeScript public server and Calls exports."""

from types import MappingProxyType
from typing import Final

VOICE_AUDIO_STATUSES: Final = ("pending_upload", "uploaded", "transcoding", "ready", "failed")
VOICE_AUDIO_SOURCES: Final = ("upload", "tts")
VOICE_AUDIO_FAILURE_REASONS: Final = (
    "unsupported_format",
    "too_large",
    "too_long",
    "decode_failed",
    "silent",
    "tts_failed",
    "processing_failed",
)
VOICE_AUDIO_FORMATS: Final = ("mp3", "wav", "ogg", "m4a")
VOICE_PROVIDERS: Final = ("elevenlabs", "openai")
VOICE_KEY_SOURCES: Final = ("managed", "customer")
VOICE_PROVIDER_CREDENTIAL_STATUSES: Final = ("unverified", "valid", "invalid")
VOICE_PROVIDER_CREDENTIAL_ERRORS: Final = (
    "unauthorized",
    "quota_exceeded",
    "forbidden_scope",
    "provider_unavailable",
)
VOICE_AUDIO_UPLOAD_CONTENT_TYPES: Final = (
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
)
ELEVENLABS_TTS_MODELS: Final = (
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_turbo_v2_5",
)
OPENAI_TTS_MODELS: Final = ("gpt-4o-mini-tts", "tts-1", "tts-1-hd")
OPENAI_TTS_VOICES: Final = (
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
)
VOICE_AUDIO_MAX_UPLOAD_BYTES: Final = 16_777_216
DEFAULT_WHATSAPP_MEDIA_MAX_BYTES: Final = 256 * 1024 * 1024
DEFAULT_SAMPLE_RATE: Final = 16_000
CALL_REACTION_EMOJI: Final = ("", "👍", "❤️", "😂", "😮", "😢", "🙏")
TEST_EVENT_FIXTURES: Final = (
    "message.received",
    "message.ack",
    "message.failed",
    "call.received",
    "call.missed",
    "call.ended",
    "session.status",
    "session.restriction_updated",
    "template.status",
)
PRIVACY_SETTING_VALUES: Final = MappingProxyType(
    {
        "groupadd": ("all", "contacts", "contact_blacklist", "none"),
        "last": ("all", "contacts", "contact_blacklist", "none"),
        "status": ("all", "contacts", "contact_blacklist", "none"),
        "profile": ("all", "contacts", "contact_blacklist", "none"),
        "readreceipts": ("all", "none"),
        "online": ("all", "match_last_seen"),
        "calladd": ("all", "known"),
        "messages": ("all", "contacts"),
        "defense": ("on_standard", "off"),
        "stickers": ("contacts", "contact_allowlist", "none"),
    }
)

PRESENCE_STATES: Final = ("available", "unavailable")
PRESENCE_OBSERVATION_STATUSES: Final = ("unknown", "fresh", "stale")
PRESENCE_UNKNOWN_REASONS: Final = ("disabled", "not_observed", "suspended")
PRESENCE_CHAT_STATES: Final = ("composing", "paused")
