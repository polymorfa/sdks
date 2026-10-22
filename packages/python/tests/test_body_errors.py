import httpx
import pytest

from polymorfa import AsyncMessagingClient, ConnectionError, Credential, TimeoutError


class BrokenBody(httpx.AsyncByteStream):
    def __init__(self, error):
        self.error = error

    async def __aiter__(self):
        yield b'{"data":'
        raise self.error("opaque credential-bearing transport text")


@pytest.mark.parametrize(
    "failure,error_type,code",
    [
        (httpx.ReadTimeout, TimeoutError, "request_timeout"),
        (httpx.ReadError, ConnectionError, "connection_error"),
    ],
)
async def test_admitted_operation_body_failure_preserves_metadata_without_retry(
    failure, error_type, code
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            202,
            headers={
                "content-type": "application/json",
                "x-request-id": "req_body",
                "x-polymorfa-operation-id": "op_admitted",
            },
            stream=BrokenBody(failure),
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(error_type) as caught:
            await client.sessions.list()
        assert len(requests) == 1
        assert caught.value.code == code
        assert caught.value.metadata.operation_id == "op_admitted"
        assert caught.value.metadata.request_id == "req_body"
        assert caught.value.status == 202
        assert "Query operation status" in str(caught.value)
        assert "credential-bearing" not in str(caught.value)


async def test_read_body_failure_without_admission_retries_safe_get():
    requests = []

    def handler(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                stream=BrokenBody(httpx.ReadTimeout),
            )
        return httpx.Response(200, json={"data": []})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.sessions.list()
        assert len(requests) == 2 and result.metadata.attempts == 2
