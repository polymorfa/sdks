import json

import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
)

DEFINITION = {
    "version": 1,
    "kind": "carousel",
    "category": "MARKETING",
    "language": "en_US",
    "header": {"format": "text", "text": "Hello {{name}}"},
    "body": "Hello {{name}}",
    "footer": "Example",
    "buttons": [
        {"type": "quick_reply", "text": "Yes"},
        {"type": "url", "text": "Open", "url": "https://example.com"},
        {"type": "phone", "text": "Call", "phone": "+15551234567"},
        {"type": "copy_code", "example": "123456"},
    ],
    "variables": [{"name": "name", "type": "text", "example": "Ada"}],
    "carousel": {
        "cards": [
            {
                "header": {"format": "image", "example": "https://example.com/image.jpg"},
                "body": "Card",
            }
        ]
    },
    "authentication": {
        "otpType": "copy_code",
        "codeExample": "123456",
        "addSecurityRecommendation": True,
        "codeExpirationMinutes": 10,
    },
    "limitedTimeOffer": {"text": "Offer", "hasExpiration": True},
}
DRAFT = {
    "id": "draft_1",
    "name": "welcome",
    "category": "MARKETING",
    "language": "en_US",
    "status": "draft",
    "kind": "carousel",
    "definition": DEFINITION,
    "sampleValues": {"name": "Ada"},
    "cloudLinks": [{"future": "preserved"}],
    "createdAt": 1,
    "updatedAt": 2,
}
CLOUD = {
    "id": "template_1",
    "tenantId": "org_1",
    "session": "support",
    "wabaId": "123",
    "name": "welcome",
    "language": "en_US",
    "category": "MARKETING",
    "status": "APPROVED",
    "components": [{"type": "BODY", "text": "Hello"}],
    "metaTemplateId": "456",
    "qualityScore": "GREEN",
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
}
CREATE = {"name": "welcome", "definition": DEFINITION, "sampleValues": {"name": "Ada"}}
CLOUD_CREATE = {
    "name": "welcome",
    "language": "en_US",
    "category": "MARKETING",
    "components": [{"type": "BODY", "text": "Hello"}],
}
KEY = {"business_public_key": "public-test-key", "business_public_key_signature_status": "VALID"}
CASES = [
    (
        "GET",
        "/messaging/projects/support/templates",
        None,
        {},
        {"success": True, "data": [DRAFT]},
        lambda c: c.templates.list("support"),
    ),
    (
        "POST",
        "/messaging/projects/support/templates",
        CREATE,
        {},
        {"success": True, "data": DRAFT},
        lambda c: c.templates.create("support", CREATE),
    ),
    (
        "GET",
        "/messaging/projects/support/templates/draft_1",
        None,
        {},
        {"success": True, "data": DRAFT},
        lambda c: c.templates.retrieve("support", "draft_1"),
    ),
    (
        "PATCH",
        "/messaging/projects/support/templates/draft_1",
        {"status": "draft", "sampleValues": {"name": "Ada"}},
        {},
        {"success": True, "data": DRAFT},
        lambda c: c.templates.update(
            "support", "draft_1", {"status": "draft", "sampleValues": {"name": "Ada"}}
        ),
    ),
    (
        "DELETE",
        "/messaging/projects/support/templates/draft_1",
        None,
        {},
        {"success": True},
        lambda c: c.templates.delete("support", "draft_1"),
    ),
    (
        "POST",
        "/messaging/projects/support/templates/draft_1/preview",
        {},
        {},
        {"success": True, "data": {"rendered": "Hello Ada", "future": {"surface": "sandbox"}}},
        lambda c: c.templates.preview("support", "draft_1"),
    ),
    (
        "POST",
        "/messaging/projects/support/templates/draft_1/submit",
        {"session": "support"},
        {},
        {"success": True, "data": {"accepted": True, "operationId": "op_1"}},
        lambda c: c.templates.submit("support", "draft_1", {"session": "support"}),
    ),
    (
        "GET",
        "/messaging/support/templates",
        None,
        {},
        {"success": True, "data": [CLOUD]},
        lambda c: c.cloud_templates.list("support"),
    ),
    (
        "GET",
        "/messaging/support/templates/welcome",
        None,
        {"language": "en_US"},
        {"success": True, "data": CLOUD},
        lambda c: c.cloud_templates.retrieve("support", "welcome", language="en_US"),
    ),
    (
        "POST",
        "/messaging/support/templates",
        CLOUD_CREATE,
        {},
        {"success": True, "data": CLOUD},
        lambda c: c.cloud_templates.create("support", CLOUD_CREATE),
    ),
    (
        "PATCH",
        "/messaging/support/templates/welcome",
        {"components": []},
        {"language": "en_US"},
        {"success": True, "data": {"accepted": True, "name": "welcome", "language": "en_US"}},
        lambda c: c.cloud_templates.update(
            "support", "welcome", {"components": []}, language="en_US"
        ),
    ),
    (
        "DELETE",
        "/messaging/support/templates/welcome",
        None,
        {},
        {"success": True},
        lambda c: c.cloud_templates.delete("support", "welcome"),
    ),
    (
        "GET",
        "/graph/whatsapp/v26.0/123/product_catalogs",
        None,
        {"limit": "10", "after": "cursor_1"},
        {
            "data": [{"id": "456", "name": "Catalog"}],
            "paging": {"cursors": {"before": "cursor_0", "after": "cursor_2"}},
        },
        lambda c: c.cloud_catalogs.list(
            "123", {"version": "v26.0", "limit": 10, "after": "cursor_1"}
        ),
    ),
    (
        "GET",
        "/graph/whatsapp/v26.0/123/product_catalogs/456/products",
        None,
        {},
        {
            "data": [
                {"id": "789", "retailer_id": "sku_1", "name": "Product", "availability": "in stock"}
            ]
        },
        lambda c: c.cloud_catalogs.list_products("123", "456", {"version": "v26.0"}),
    ),
    (
        "GET",
        "/graph/whatsapp/v26.0/123/marketing_messages/status",
        None,
        {},
        {
            "id": "123",
            "marketing_messages_lite_api_status": "AVAILABLE",
            "marketing_messages_onboarding_status": "ONBOARDED",
        },
        lambda c: c.cloud_marketing.status("123", version="v26.0"),
    ),
    (
        "GET",
        "/graph/whatsapp/v26.0/123/whatsapp_business_encryption",
        None,
        {},
        {"data": [KEY]},
        lambda c: c.flow_encryption.retrieve("123", version="v26.0"),
    ),
    (
        "POST",
        "/graph/whatsapp/v26.0/123/whatsapp_business_encryption",
        {"business_public_key": "public-test-key"},
        {},
        {"success": True},
        lambda c: c.flow_encryption.register(
            "123", {"businessPublicKey": "public-test-key"}, version="v26.0"
        ),
    ),
]


@pytest.mark.parametrize("method,path,body,query,fixture,invoke", CASES)
async def test_typed_templates_and_graph(method, path, body, query, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_template"})

    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == fixture
        assert result.metadata.status == 200 and result.metadata.request_id == "req_template"


@pytest.mark.parametrize(
    "invoke",
    [
        lambda c, o: c.templates.submit("support", "draft_1", {"session": "support"}, options=o),
        lambda c, o: c.cloud_templates.create("support", CLOUD_CREATE, options=o),
        lambda c, o: c.cloud_templates.update("support", "welcome", {"components": []}, options=o),
        lambda c, o: c.cloud_templates.delete("support", "welcome", options=o),
        lambda c, o: c.flow_encryption.register(
            "123", {"businessPublicKey": "public-test-key"}, version="v26.0", options=o
        ),
    ],
)
async def test_provider_write_never_retries_even_with_key(invoke):
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(
            503, json={"error": {"code": "server_error", "message": "Unavailable"}}
        )

    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ServerError):
            await invoke(
                client, RequestOptions(idempotency_key="manual-reconcile", max_network_retries=3)
            )
    assert len(attempts) == 1 and attempts[0].headers["idempotency-key"] == "manual-reconcile"


async def test_graph_server_scope_and_required_identifiers():
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_local")) as client:
        for invoke in [
            lambda: client.cloud_templates.list("support"),
            lambda: client.cloud_catalogs.list("123", {"version": "v26.0"}),
            lambda: client.cloud_marketing.status("123", version="v26.0"),
            lambda: client.flow_encryption.retrieve("123", version="v26.0"),
        ]:
            with pytest.raises(ConfigurationError):
                await invoke()
    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
    ) as client:
        for invoke in [
            lambda: client.cloud_catalogs.list(" ", {"version": "v26.0"}),
            lambda: client.cloud_catalogs.list_products("123", "１２３", {"version": "v26.0"}),
            lambda: client.cloud_marketing.status("123", version=" "),
            lambda: client.flow_encryption.retrieve(" ", version="v26.0"),
        ]:
            with pytest.raises(ConfigurationError):
                await invoke()
