import hashlib
import hmac
import json
from dataclasses import replace
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from polymorfa import ConfigurationError, Credential, MediaIntegrityError
from polymorfa.media import (
    MediaDescriptor,
    decode_whatsapp_media,
    decrypt_whatsapp_media,
    derive_whatsapp_media_keys,
)


@pytest.mark.parametrize("prefix", ["pt", "ct", "ls", "at", "wst", "sd"])
def test_reject_wrong_principal_even_at_organization_length(prefix):
    key = f"pmfa_{prefix}_" + "a" * (72 - len(prefix) - 1)
    with pytest.raises(ConfigurationError):
        Credential("organization_api_key", key)


def test_media_integrity_before_release():
    key, plaintext = bytes(range(32)), b"A verified private attachment"
    iv, cipher_key, mac_key = derive_whatsapp_media_keys(key, "image")
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()
    cipher = Cipher(algorithms.AES(cipher_key), modes.CBC(iv)).encryptor()
    ciphertext = cipher.update(padded) + cipher.finalize()
    encrypted = ciphertext + hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()[:10]
    descriptor = MediaDescriptor(
        "image",
        key,
        file_sha256=hashlib.sha256(plaintext).digest(),
        file_enc_sha256=hashlib.sha256(encrypted).digest(),
        file_length=len(plaintext),
    )
    assert decrypt_whatsapp_media(encrypted, descriptor) == plaintext
    with pytest.raises(MediaIntegrityError) as caught:
        decrypt_whatsapp_media(encrypted[:-1] + bytes([encrypted[-1] ^ 1]), descriptor)
    assert caught.value.code == "media_enc_hash_mismatch"
    with pytest.raises(MediaIntegrityError) as caught:
        decrypt_whatsapp_media(encrypted, replace(descriptor, file_sha256=b"x" * 32))
    assert caught.value.code == "media_hash_mismatch"
    with pytest.raises(MediaIntegrityError) as caught:
        decrypt_whatsapp_media(encrypted, descriptor, max_bytes=1)
    assert caught.value.code == "media_too_large"


@pytest.mark.parametrize(
    "vector",
    json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/fixtures/whatsapp-media.json").read_text()
    )["fixtures"],
)
def test_independent_shipped_media_vectors(vector):
    descriptor = decode_whatsapp_media(vector["descriptor"], vector["kind"])
    assert descriptor.media_kind == vector["kind"]
    iv, key, mac = derive_whatsapp_media_keys(descriptor.media_key, descriptor.media_kind)
    assert (iv.hex(), key.hex(), mac.hex()) == (vector["iv"], vector["cipherKey"], vector["macKey"])
    assert decrypt_whatsapp_media(bytes.fromhex(vector["encrypted"]), descriptor) == bytes.fromhex(
        vector["plaintext"]
    )


async def test_cdn_download_fallback_and_safe_redirects():
    import httpx

    from polymorfa.media import download_whatsapp_media, is_whatsapp_media_url, whatsapp_media_urls

    vectors = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/fixtures/whatsapp-media.json").read_text()
    )["fixtures"]
    vector = vectors[0]
    descriptor = decode_whatsapp_media(vector["descriptor"], "image")
    requests = []

    def handler(request):
        requests.append(request)
        assert "authorization" not in request.headers and "polymorfa-version" not in request.headers
        assert request.headers["origin"] == "https://web.whatsapp.com"
        assert request.headers["referer"] == "https://web.whatsapp.com/"
        if len(requests) == 1:
            return httpx.Response(404)
        if len(requests) == 2:
            assert dict(request.url.params)["mms-type"] == "image"
            return httpx.Response(302, headers={"location": "https://cdn.whatsapp.net/verified"})
        return httpx.Response(200, content=bytes.fromhex(vector["encrypted"]))

    assert await download_whatsapp_media(
        descriptor, http_transport=httpx.MockTransport(handler)
    ) == bytes.fromhex(vector["plaintext"])
    assert len(requests) == 3 and len(whatsapp_media_urls(descriptor)) == 2
    assert not is_whatsapp_media_url("https://mmg.whatsapp.com/file")
    assert not is_whatsapp_media_url("https://mmg.whatsapp.net:444/file")

    def unsafe(request):
        return httpx.Response(302, headers={"location": "https://evil.test/file"})

    with pytest.raises(MediaIntegrityError):
        await download_whatsapp_media(descriptor, http_transport=httpx.MockTransport(unsafe))
    with pytest.raises(MediaIntegrityError):
        await download_whatsapp_media(
            replace(descriptor, file_sha256=None), http_transport=httpx.MockTransport(handler)
        )
