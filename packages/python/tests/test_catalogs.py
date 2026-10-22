"""Compare handwritten immutable catalogs with the pinned public SDK source."""

import re
from pathlib import Path

import pytest

import polymorfa
from polymorfa import catalogs
from polymorfa.media import MAX_BYTES

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize(
    "name,module",
    [
        ("VOICE_AUDIO_STATUSES", "typescript/src/platform/voice.ts"),
        ("VOICE_AUDIO_SOURCES", "typescript/src/platform/voice.ts"),
        ("VOICE_AUDIO_FAILURE_REASONS", "typescript/src/platform/voice.ts"),
        ("VOICE_AUDIO_FORMATS", "typescript/src/platform/voice.ts"),
        ("VOICE_PROVIDERS", "typescript/src/platform/voice.ts"),
        ("VOICE_KEY_SOURCES", "typescript/src/platform/voice.ts"),
        ("VOICE_PROVIDER_CREDENTIAL_STATUSES", "typescript/src/platform/voice.ts"),
        ("VOICE_PROVIDER_CREDENTIAL_ERRORS", "typescript/src/platform/voice.ts"),
        ("VOICE_AUDIO_UPLOAD_CONTENT_TYPES", "typescript/src/platform/voice.ts"),
        ("ELEVENLABS_TTS_MODELS", "typescript/src/platform/voice.ts"),
        ("OPENAI_TTS_MODELS", "typescript/src/platform/voice.ts"),
        ("OPENAI_TTS_VOICES", "typescript/src/platform/voice.ts"),
        ("TEST_EVENT_FIXTURES", "typescript/src/messaging/testing-configuration.ts"),
        ("CALL_REACTION_EMOJI", "calls/src/protocol.ts"),
    ],
)
def test_public_catalog_matches_reference_order(name, module):
    source = (ROOT / "packages" / module).read_text()
    declaration = re.search(rf"export const {name} = \[(.*?)\] as const;", source, re.DOTALL)
    assert declaration is not None
    value = getattr(polymorfa, name)
    assert isinstance(value, tuple)
    assert value == tuple(re.findall(r'"([^\"]*)"', declaration[1]))


def test_privacy_known_values_match_reference_and_are_frozen():
    source = (ROOT / "packages/typescript/src/messaging/types.ts").read_text()
    declaration = re.search(r"PRIVACY_SETTING_VALUES = \{(.*?)\} as const;", source, re.DOTALL)
    assert declaration is not None
    expected = {
        key: tuple(re.findall(r'"([^\"]*)"', items))
        for key, items in re.findall(r"([a-z]+): \[(.*?)\]", declaration[1])
    }
    assert dict(polymorfa.PRIVACY_SETTING_VALUES) == expected
    with pytest.raises(TypeError):
        polymorfa.PRIVACY_SETTING_VALUES["online"] = ("all",)


def test_public_byte_limits_and_sample_rate_match_reference_defaults():
    assert catalogs.DEFAULT_WHATSAPP_MEDIA_MAX_BYTES == MAX_BYTES == 256 * 1024 * 1024
    assert catalogs.VOICE_AUDIO_MAX_UPLOAD_BYTES == 16_777_216
    assert catalogs.DEFAULT_SAMPLE_RATE == 16_000
