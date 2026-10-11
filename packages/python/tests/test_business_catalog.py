import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential

VECTORS = json.loads((Path(__file__).parent / "fixtures/business.json").read_text())
PRODUCT, MUTATION, ORDER = (VECTORS[key] for key in ("product", "mutation", "order"))
COLLECTION = {
    "id": "collection_1",
    "name": "Summer",
    "products": [PRODUCT],
    "status": {
        "status": "approved",
        "canAppeal": False,
        "commerceUrl": "https://example.com/summer",
        "rejectReason": "",
    },
}
CATALOG_PARAMS = {"id": "user_1", "after": "after_1", "limit": 25, "width": 256, "height": 128}
COLLECTION_PARAMS = {
    "id": "user_1",
    "after": "after_1",
    "collectionLimit": 10,
    "itemLimit": 25,
    "width": 256,
    "height": 128,
}
CASES = [
    (
        "GET",
        "/catalog",
        CATALOG_PARAMS,
        None,
        {"products": [PRODUCT], "next": "after_2", "previous": "after_0"},
        lambda r: r.get_catalog("support", CATALOG_PARAMS),
    ),
    ("POST", "/catalog", {}, None, {"success": True}, lambda r: r.create_catalog("support")),
    (
        "PATCH",
        "/catalog/cart",
        {},
        {"enabled": True},
        {"success": True},
        lambda r: r.set_cart_enabled("support", {"enabled": True}),
    ),
    (
        "GET",
        "/products/product_1",
        {"id": "user_1"},
        None,
        PRODUCT,
        lambda r: r.get_product("support", "product_1", {"id": "user_1"}),
    ),
    ("POST", "/products", {}, MUTATION, PRODUCT, lambda r: r.create_product("support", MUTATION)),
    (
        "PUT",
        "/products/product_1",
        {},
        MUTATION,
        PRODUCT,
        lambda r: r.update_product("support", "product_1", MUTATION),
    ),
    (
        "DELETE",
        "/products/product_1",
        {},
        None,
        {"deletedCount": 1},
        lambda r: r.delete_product("support", "product_1"),
    ),
    (
        "PATCH",
        "/products/product_1/visibility",
        {},
        {"hidden": True},
        {"success": True},
        lambda r: r.set_product_visibility("support", "product_1", {"hidden": True}),
    ),
    (
        "POST",
        "/products/product_1/appeal",
        {},
        {"reason": "Review requested"},
        {"success": True},
        lambda r: r.appeal_product("support", "product_1", {"reason": "Review requested"}),
    ),
    (
        "GET",
        "/collections",
        COLLECTION_PARAMS,
        None,
        {"collections": [COLLECTION], "next": "after_2"},
        lambda r: r.list_collections("support", COLLECTION_PARAMS),
    ),
    (
        "GET",
        "/collections/collection_1",
        CATALOG_PARAMS,
        None,
        COLLECTION,
        lambda r: r.get_collection("support", "collection_1", CATALOG_PARAMS),
    ),
    (
        "POST",
        "/collections",
        {},
        {"name": "Summer", "productIds": ["product_1"]},
        {"id": "collection_1", "reviewStatus": "pending"},
        lambda r: r.create_collection("support", {"name": "Summer", "productIds": ["product_1"]}),
    ),
    (
        "PATCH",
        "/collections/collection_1",
        {},
        {"name": "Autumn", "addProductIds": ["product_2"], "removeProductIds": ["product_1"]},
        {"id": "collection_1", "reviewStatus": "pending"},
        lambda r: r.update_collection(
            "support",
            "collection_1",
            {"name": "Autumn", "addProductIds": ["product_2"], "removeProductIds": ["product_1"]},
        ),
    ),
    (
        "DELETE",
        "/collections/collection_1",
        {},
        None,
        {"success": True},
        lambda r: r.delete_collection("support", "collection_1"),
    ),
    (
        "POST",
        "/collections/reorder",
        {},
        {"moves": [{"collectionId": "collection_1", "fromIndex": 0, "toIndex": 1}]},
        {"success": True},
        lambda r: r.reorder_collections(
            "support", {"moves": [{"collectionId": "collection_1", "fromIndex": 0, "toIndex": 1}]}
        ),
    ),
    (
        "POST",
        "/collections/collection_1/appeal",
        {},
        {"reason": "Review requested"},
        {"success": True},
        lambda r: r.appeal_collection("support", "collection_1", {"reason": "Review requested"}),
    ),
    (
        "POST",
        "/orders/order_1/lookup",
        {},
        {"token": "order_lookup_fixture"},
        ORDER,
        lambda r: r.get_order("support", "order_1", {"token": "order_lookup_fixture"}),
    ),
]


@pytest.mark.parametrize("method,suffix,query,body,data,invoke", CASES)
async def test_typed_catalog_operations(method, suffix, query, body, data, invoke):
    for accepted in [False] if method == "GET" else [False, True]:
        fixture = {"success": True, "data": {"requestId": "rpc_1"} if accepted else data}

        def handler(request, accepted=accepted, fixture=fixture):
            assert (
                request.method == method
                and request.url.path == "/messaging/support/business" + suffix
            )
            assert dict(request.url.params) == {key: str(value) for key, value in query.items()}
            assert (json.loads(request.content) if request.content else None) == body
            return httpx.Response(
                202 if accepted else 200, json=fixture, headers={"x-request-id": "req_catalog"}
            )

        async with AsyncMessagingClient(
            Credential("organization_api_key", "pmfa_" + "a" * 72),
            http_transport=httpx.MockTransport(handler),
        ) as client:
            response = await invoke(client.business)
            assert response.data == fixture and response.metadata.request_id == "req_catalog"
