import asyncio

import pytest

from polymorfa.calls_tokens import CallsError, CallsToken, CallsTokenSource


async def test_cached_static_credential_and_expiry_skew():
    calls = []
    clock = [100]

    async def provider(request):
        calls.append(request.refresh)
        return CallsToken("pmfa_ct_" + str(len(calls)), clock[0] + 60)

    source = CallsTokenSource(provider, now=lambda: clock[0])
    first = await source.get()
    assert await source.get() is first
    clock[0] = 131
    assert (await source.get()).value == "pmfa_ct_2"
    assert calls == [False, False]
    assert "pmfa_ct_" not in repr(first)
    assert (await CallsTokenSource("static").get()).value == "static"


async def test_shared_fetch_one_waiter_cancels_without_cancelling_other():
    started, finish = asyncio.Event(), asyncio.Event()
    calls = []

    async def provider(request):
        calls.append(request.refresh)
        started.set()
        await finish.wait()
        return "token"

    source = CallsTokenSource(provider)
    first, second = asyncio.create_task(source.get()), asyncio.create_task(source.get())
    await started.wait()
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    finish.set()
    assert (await second).value == "token"
    assert calls == [False]


async def test_last_waiter_cancellation_cancels_provider():
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def provider(request):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    task = asyncio.create_task(CallsTokenSource(provider).get())
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await cancelled.wait()


async def test_refresh_does_not_take_old_pending_result_or_cache_stale_generation():
    started, release = asyncio.Event(), asyncio.Event()

    async def provider(request):
        if request.refresh:
            return "new"
        started.set()
        await release.wait()
        return "old"

    source = CallsTokenSource(provider)
    old = asyncio.create_task(source.get())
    await started.wait()
    assert (await source.get(refresh=True)).value == "new"
    release.set()
    assert (await old).value == "old"
    assert (await source.get()).value == "new"
    source.invalidate()
    assert (await source.get()).value == "old"


@pytest.mark.parametrize(
    "value,expiry", [("", None), ("x", float("nan")), ("x", True), ("x", "123")]
)
def test_invalid_tokens(value, expiry):
    with pytest.raises(CallsError, match="Invalid"):
        CallsToken(value, expiry)
