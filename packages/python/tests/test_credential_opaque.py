import base64
import json
import zlib
from pathlib import Path

import pytest

from polymorfa import Credential
from polymorfa.errors import ConfigurationError

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/machine-credentials.v1.json").read_text()
)


def test_shared_credentials_and_growth():
    for vector in FIXTURE["opaque"]:
        kind = "organization_api_key" if vector["kind"] == "key" else "project_token"
        Credential(kind, vector["token"])
        for bad in [
            vector["token"].replace("_A", "_B", 1),
            vector["token"] + "=",
            vector["token"] + "\n",
            vector["token"][:-1] + "!",
        ]:
            with pytest.raises(ConfigurationError):
                Credential(kind, bad)
    for vector in FIXTURE["client"]["cases"] + FIXTURE["client"]["rejections"]:
        Credential("client_token", vector["token"])
    for size in [400, 13000]:
        raw = bytes(size)
        body = (
            base64.urlsafe_b64encode(raw + zlib.crc32(raw).to_bytes(4, "big")).decode().rstrip("=")
        )
        for kind, prefix in [("organization_api_key", "pmfa_"), ("project_token", "pmfa_pt_")]:
            value = prefix + body
            assert len(value) > 512
            c = Credential(kind, value)
            assert value not in repr(c)
        client = "pmfa_ct_" + base64.urlsafe_b64encode(raw).decode().rstrip("=")
        Credential("client_token", client)
    # Canonical framing is not a server signature or claim decision.
    token = FIXTURE["client"]["cases"][0]["token"]
    raw = bytearray(base64.urlsafe_b64decode(token[8:] + "=" * (-len(token[8:]) % 4)))
    raw[-1] ^= 1
    Credential("client_token", "pmfa_ct_" + base64.urlsafe_b64encode(raw).decode().rstrip("="))


def test_long_reflected_error_redaction():
    from polymorfa.errors import PolymorfaError

    secret = "pmfa_ct_" + "A" * 17000
    error = PolymorfaError(
        secret,
        code="unauthorized",
        details={"apiKey": "synthetic", "projectToken": secret, "nested": [secret]},
    )
    assert secret not in str(error)
    assert secret not in repr(error.details)
    assert "synthetic" not in repr(error.details)
    assert error.code == "unauthorized"


async def test_native_wire_reflection(unused_tcp_port):
    from aiohttp import web

    from polymorfa import AsyncMessagingClient, PolymorfaError

    values = (
        [
            ("organization_api_key" if v["kind"] == "key" else "project_token", v["token"])
            for v in FIXTURE["opaque"]
        ]
        + [("client_token", v["token"]) for v in FIXTURE["client"]["cases"]]
        + [("client_token", "pmfa_ct_" + base64.urlsafe_b64encode(bytes(600)).decode().rstrip("="))]
    )
    expected = ""

    async def handle(request):
        assert request.headers["Authorization"] == "Bearer " + expected
        return web.json_response(
            {
                "error": {
                    "code": "unauthorized",
                    "message": expected,
                    "details": {"apiKey": "synthetic", "projectToken": expected},
                }
            },
            status=401,
        )

    app = web.Application()
    app.router.add_get("/messaging/s/profile", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", unused_tcp_port).start()
    try:
        for kind, expected in values:
            async with AsyncMessagingClient(
                Credential(kind, expected),
                base_url=f"http://127.0.0.1:{unused_tcp_port}",
                max_network_retries=0,
            ) as sdk:
                with pytest.raises(PolymorfaError) as caught:
                    await sdk.profile.get("s")
                assert caught.value.code == "unauthorized"
                assert expected not in str(caught.value)
                assert expected not in repr(caught.value.details)
                assert "synthetic" not in repr(caught.value.details)
    finally:
        await runner.cleanup()
