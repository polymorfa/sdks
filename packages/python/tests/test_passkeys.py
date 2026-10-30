import asyncio
import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, RequestOptions, errors

F = json.loads(
    (Path(__file__).parents[3] / "contracts/fixtures/passkeys.candidate.json").read_text()
)


def test_passkey_five_wire():
    asyncio.run(_wire())


async def _wire():
    expected = [
        ("POST", "/challenge", F["issue"], F["ticket"]),
        ("GET", "/challenge/ticket%2F%3F", None, F["ticket"]),
        ("POST", "/assertion", F["assertion"], F["assertionResult"]),
        ("GET", "/confirmation", None, {"status": "code_available", "skipHandoffUX": False}),
        ("POST", "/confirmation", F["confirm"], {"status": "waiting_for_pairing"}),
    ]
    for i, (method, path, body, reply) in enumerate(expected):

        def handler(request, method=method, path=path, body=body, reply=reply):
            assert request.method == method
            assert request.url.raw_path.decode() == "/messaging/desk%2F1/passkey" + path
            assert request.headers["authorization"].startswith("Bearer pmfa_")
            assert request.headers["polymorfa-version"] == "2026-09-22"
            assert (json.loads(request.content) if request.content else None) == body
            return httpx.Response(200, json={"success": True, "data": reply})

        async with AsyncMessagingClient(
            credential=Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
            http_transport=httpx.MockTransport(handler),
        ) as c:
            p = c.passkeys
            if i == 0:
                r = await p.issue_challenge(F["session"], F["issue"])
            elif i == 1:
                r = await p.get_challenge(F["session"], F["ticketId"])
            elif i == 2:
                r = await p.submit_assertion(F["session"], F["assertion"])
            elif i == 3:
                r = await p.get_confirmation(F["session"])
            else:
                r = await p.confirm(F["session"], F["confirm"])
            assert r.data == {"success": True, "data": reply}


def test_passkey_writes_are_not_retried():
    asyncio.run(_once())


async def _once():
    for kind in ("issue", "assertion", "confirm"):
        count = 0

        def handler(request):
            nonlocal count
            count += 1
            return httpx.Response(
                503,
                json={"error": {"code": "future_passkey_failure", "message": "Unknown outcome"}},
            )

        async with AsyncMessagingClient(
            credential=Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
            max_network_retries=3,
            http_transport=httpx.MockTransport(handler),
        ) as c:
            opts = RequestOptions(max_network_retries=3, idempotency_key="caller-key")
            with pytest.raises(Exception) as error:
                if kind == "issue":
                    await c.passkeys.issue_challenge("s", F["issue"], options=opts)
                elif kind == "assertion":
                    await c.passkeys.submit_assertion("s", F["assertion"], options=opts)
                else:
                    await c.passkeys.confirm("s", F["confirm"], options=opts)
            assert error.value.code == "future_passkey_failure"
            assert count == 1


def test_passkey_outcomes_refusals_omission_and_bounds():
    asyncio.run(_boundaries())


async def _boundaries():
    key = Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k")
    for status in F["statuses"]:
        async with AsyncMessagingClient(
            key,
            http_transport=httpx.MockTransport(
                lambda r, status=status: httpx.Response(
                    200, json={"success": True, "data": {"status": status, "skipHandoffUX": False}}
                )
            ),
        ) as c:
            assert (await c.passkeys.get_confirmation("s")).data["data"] == {
                "status": status,
                "skipHandoffUX": False,
            }
    for status in F["errors"]:
        count = 0

        def refuse(request, status=status):
            nonlocal count
            count += 1
            return httpx.Response(
                status, json={"error": {"code": "future_passkey", "message": "refused"}}
            )

        async with AsyncMessagingClient(key, http_transport=httpx.MockTransport(refuse)) as c:
            with pytest.raises(errors.PolymorfaError) as e:
                await c.passkeys.confirm(
                    "s",
                    F["confirm"],
                    options=RequestOptions(max_network_retries=3, idempotency_key="caller"),
                )
            assert e.value.status == status and e.value.code == "future_passkey" and count == 1
    for mode in ("non-json", "network"):
        for kind in ("issue", "assertion", "confirm"):
            count = 0

            def broken(request, mode=mode):
                nonlocal count
                count += 1
                if mode == "network":
                    raise httpx.ReadError("connection lost after upload", request=request)
                return httpx.Response(
                    502, text="<html>unavailable</html>", headers={"content-type": "text/html"}
                )

            async with AsyncMessagingClient(key, http_transport=httpx.MockTransport(broken)) as c:
                expected = errors.ConnectionError if mode == "network" else errors.ServerError
                with pytest.raises(expected):
                    o = RequestOptions(max_network_retries=3, idempotency_key="caller")
                    if kind == "issue":
                        await c.passkeys.issue_challenge("s", F["issue"], options=o)
                    elif kind == "assertion":
                        await c.passkeys.submit_assertion("s", F["assertion"], options=o)
                    else:
                        await c.passkeys.confirm("s", F["confirm"], options=o)
                assert count == 1
    bodies = []

    def capture(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"success": True, "data": {"status": "none"}})

    async with AsyncMessagingClient(key, http_transport=httpx.MockTransport(capture)) as c:
        await c.passkeys.issue_challenge("s")
        await c.passkeys.confirm("s", {"ticketId": "ticket"})
        assert bodies == [{}, {"ticketId": "ticket"}]
        bad = json.loads(json.dumps(F["assertion"]))
        bad["assertion"]["id"] = "x" * 1365
        with pytest.raises(errors.ValidationError):
            await c.passkeys.submit_assertion("s", bad)
        bad["assertion"]["id"] = "x" * 1364
        bad["assertion"]["rawIdB64Url"] = "x" * 1364
        bad["assertion"]["response"]["userHandleB64"] = "x" * 86
        await c.passkeys.submit_assertion("s", bad)
        assert bodies[-1] == bad
        bad["assertion"]["response"]["signatureB64"] = "x" * 1048576
        with pytest.raises(errors.ValidationError):
            await c.passkeys.submit_assertion("s", bad)
        assert len(bodies) == 3
        assert not hasattr(c.passkeys, "verify") and not hasattr(
            c.passkeys, "submit_quicklink_passkey"
        )
    async with AsyncMessagingClient(
        Credential("client_token", "pmfa_ct_Zml4dHVyZQ"),
        http_transport=httpx.MockTransport(capture),
    ) as c:
        with pytest.raises(errors.ConfigurationError):
            await c.passkeys.get_confirmation("s")
        assert len(bodies) == 3
