import asyncio
import json
import re
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from polymorfa import (
    POLYMORFA_ERROR_CODES,
    AsyncCallRetentionClient,
    AuthorizationError,
    ConfigurationError,
    Credential,
    is_known_error_code,
)

RETENTION = {
    "policy": "custom",
    "retentionDays": 45,
    "appliesTo": ["call_records", "call_events", "client_reports", "future_data"],
    "revision": 2,
    "updatedAt": "2026-10-11T00:00:00Z",
}


@pytest.mark.parametrize(
    "kind,value",
    [("organization_api_key", "pmfa_" + "a" * 72), ("project_token", "pmfa_pt_" + "a" * 93 + "A")],
)
async def test_native_team_retention_facade_needs_no_project_id_and_keeps_metadata(kind, value):
    requests = []

    async def handle(reader, writer):
        request = await reader.readuntil(b"\r\n\r\n")
        headers = dict(
            line.split(":", 1) for line in request.decode().split("\r\n")[1:] if ":" in line
        )
        assert headers["Authorization"].strip() == "Bearer " + value
        assert headers["Polymorfa-Version"].strip() == "2026-09-22"
        method, path, _ = request.decode().split("\r\n")[0].split(" ")
        assert path == "/platform/call-retention"
        length = int(headers.get("Content-Length", "0"))
        body = json.loads(await reader.readexactly(length)) if length else None
        requests.append((method, body))
        denied = kind == "project_token" and method == "PUT"
        payload = (
            {"error": {"code": "permission_denied", "message": "A team key is required."}}
            if denied
            else {"data": RETENTION}
        )
        encoded = json.dumps(payload).encode()
        writer.write(
            f"HTTP/1.1 {'403 Forbidden' if denied else '200 OK'}\r\nContent-Type: application/json\r\nContent-Length: {len(encoded)}\r\nX-Request-ID: req_retention\r\nConnection: close\r\n\r\n".encode()
            + encoded
        )
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    async with (
        server,
        AsyncCallRetentionClient(
            Credential(kind, value),
            base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
        ) as client,
    ):
        with pytest.raises(FrozenInstanceError):
            client.call_retention = None
        result = await client.call_retention.retrieve()
        assert result.data == RETENTION and result.metadata.request_id == "req_retention"
        update = {"policy": "custom", "retentionDays": 45, "expectedRevision": 1}
        if kind == "project_token":
            with pytest.raises(AuthorizationError) as denied:
                await client.call_retention.update(update)
            assert (
                denied.value.code == "permission_denied"
                and denied.value.metadata.request_id == "req_retention"
            )
        else:
            assert (await client.call_retention.update(update)).data == RETENTION
    assert requests == [("GET", None), ("PUT", update)]


def test_client_token_refused_and_known_error_codes_match_pinned_contract():
    with pytest.raises(ConfigurationError):
        AsyncCallRetentionClient(Credential("client_token", "pmfa_ct_fixture"))
    source = (Path(__file__).resolve().parents[3] / "packages/typescript/src/errors.ts").read_text()
    block = source.split("export const POLYMORFA_ERROR_CODES = [", 1)[1].split("] as const", 1)[0]
    assert POLYMORFA_ERROR_CODES == set(re.findall('"([a-z_]+)"', block))
    assert (
        is_known_error_code("invalid_parameter")
        and not is_known_error_code("future_server_code")
        and not is_known_error_code(None)
    )
