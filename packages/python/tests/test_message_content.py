import json
from typing import get_type_hints

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, RequestOptions
from polymorfa.message_content import SendMessage

AMOUNT = {"value": 1000, "offset": 100}
CONTENTS = [
    {"text": "Hello"},
    {
        "image": {
            "url": "https://example.invalid/image",
            "mimeType": "image/jpeg",
            "caption": "Hello",
        }
    },
    {"video": {"base64": "Zml4dHVyZQ==", "mimeType": "video/mp4", "caption": "Hello"}},
    {
        "file": {
            "base64": "Zml4dHVyZQ==",
            "mimeType": "application/pdf",
            "filename": "example.pdf",
            "caption": "Hello",
        }
    },
    {"voice": {"url": "https://example.invalid/audio", "mimeType": "audio/ogg", "ptt": True}},
    {"poll": {"title": "Pick one", "options": ["A", "B"], "multiSelect": False}},
    {"location": {"lat": -23.5, "long": -46.6, "address": "Example"}},
    {"contact": {"vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD"}},
    {"requestPhoneNumber": {}},
    {
        "product": {
            "businessOwnerId": "owner_1",
            "id": "product_1",
            "title": "Product",
            "description": "Example",
            "currencyCode": "BRL",
            "priceAmount1000": 1000.5,
            "salePriceAmount1000": 900.5,
            "retailerId": "sku_1",
            "url": "https://example.invalid/product",
            "imageCount": 1,
            "image": {"base64": "Zml4dHVyZQ==", "mimeType": "image/jpeg"},
            "body": "Product",
            "footer": "Example",
        }
    },
    {
        "productList": {
            "businessOwnerId": "owner_1",
            "title": "Products",
            "description": "Example",
            "buttonText": "View",
            "footer": "Example",
            "sections": [{"title": "First", "productIds": ["product_1"]}],
        }
    },
    {
        "order": {
            "id": "order_1",
            "thumbnailBase64": "Zml4dHVyZQ==",
            "itemCount": 1,
            "status": "inquiry",
            "message": "Hello",
            "title": "Order",
            "sellerId": "seller_1",
            "token": "fixture_only",
            "totalAmount1000": 1000.5,
            "totalCurrencyCode": "BRL",
            "catalogType": "catalog",
        }
    },
    {
        "list": {
            "title": "Options",
            "description": "Example",
            "buttonText": "Select",
            "footer": "Example",
            "sections": [
                {
                    "title": "First",
                    "rows": [{"id": "row_1", "title": "First", "description": "Example"}],
                }
            ],
        }
    },
    {
        "buttons": {
            "title": "Actions",
            "body": "Choose",
            "footer": "Example",
            "buttons": [
                {"type": "url", "text": "Visit", "url": "https://example.invalid"},
                {"type": "call", "text": "Call", "phoneNumber": "+15551234567"},
                {"type": "reply", "text": "Reply", "id": "reply_1"},
                {"type": "copy", "text": "Copy", "copyCode": "CODE"},
                {
                    "type": "catalog",
                    "text": "Catalog",
                    "businessPhoneNumber": "+15551234567",
                    "catalogProductId": "product_1",
                },
            ],
        }
    },
    {
        "addressMessage": {
            "body": "Where",
            "buttonText": "Address",
            "footer": "Example",
            "country": "BR",
        }
    },
    {
        "flow": {
            "body": "Open",
            "buttonText": "Survey",
            "footer": "Example",
            "id": "flow_1",
            "token": "fixture_only",
            "action": "navigate",
            "screen": "WELCOME",
            "dataJson": "{}",
        }
    },
    {
        "flow": {
            "body": "Open",
            "buttonText": "Survey",
            "id": "flow_1",
            "token": "fixture_only",
            "action": "data_exchange",
        }
    },
    {"callPermissionRequest": {"body": "May we call?"}},
    {
        "orderDetails": {
            "referenceId": "ref_1",
            "type": "physical-goods",
            "body": "Your order",
            "footer": "Example",
            "currency": "BRL",
            "totalAmount": AMOUNT,
            "paymentSettings": {
                "pixDynamicCode": {
                    "code": "fixture_only",
                    "merchantName": "Example",
                    "key": "fixture_only",
                    "keyType": "EVP",
                },
                "paymentLink": {"uri": "https://example.invalid/pay"},
                "boleto": {"digitableLine": "1" * 47},
            },
            "order": {
                "catalogId": "catalog_1",
                "expiration": {"timestamp": 2000000000, "description": "Expires"},
                "items": [
                    {
                        "retailerId": "sku_1",
                        "name": "Product",
                        "amount": AMOUNT,
                        "quantity": 1,
                        "saleAmount": AMOUNT,
                    }
                ],
                "subtotal": AMOUNT,
                "tax": {"value": 0, "offset": 100, "description": "Tax"},
                "shipping": {"value": 0, "offset": 100, "description": "Shipping"},
                "discount": {
                    "value": 0,
                    "offset": 100,
                    "description": "Discount",
                    "programName": "Offer",
                },
            },
            "headerImageUrl": "https://example.invalid/image",
        }
    },
    {
        "orderDetails": {
            "referenceId": "ref_2",
            "type": "digital-goods",
            "body": "Your order",
            "currency": "BRL",
            "totalAmount": AMOUNT,
            "paymentSettings": {"paymentLink": {"uri": "https://example.invalid/pay"}},
        }
    },
    {
        "orderStatus": {
            "referenceId": "ref_1",
            "body": "Paid",
            "footer": "Example",
            "order": {"status": "processing", "description": "Packing"},
            "payment": {"status": "captured", "timestamp": 2000000000},
        }
    },
    {"orderStatus": {"referenceId": "ref_2", "body": "Paid", "payment": {"status": "captured"}}},
    {
        "template": {
            "name": "hello",
            "language": "en",
            "components": [{"type": "body", "parameters": [{"type": "text", "text": "Ada"}]}],
        }
    },
]


@pytest.mark.parametrize("content", CONTENTS)
@pytest.mark.parametrize("client_token", [False, True])
async def test_public_send_all_composed_variants_context_and_response(content, client_token):
    body = {
        "conversation": {
            "id": "conversation_1",
            "phoneNumber": "+15551234567",
            "bsuid": "business_1",
            "username": "ada",
        },
        "content": content,
        "transport": "linked_devices",
        "isForwarded": True,
        "mentions": ["user_1"],
        "quotedMessage": {"id": "quoted_1", "type": "text", "text": "Earlier"},
    }
    data = {
        "success": True,
        "data": {
            "id": "message_1",
            "whatsapp_ids": {"linked_devices": "wa_1", "official_api": "wamid_1"},
            "conversation": {
                "id": "conversation_1",
                "phoneNumber": "+15551234567",
                "bsuid": "business_1",
                "username": "ada",
            },
            "timestamp": "2026-10-11T00:00:00Z",
            "status": "sent",
            "type": "future",
            "content": content,
            "mediaId": "media_1",
            "transport": "linked_devices",
            "routingReason": "explicit_transport",
            "operationId": "op_1",
        },
    }

    def handler(request):
        assert request.method == "POST" and request.url.path == "/messaging/support/messages/send"
        assert (
            json.loads(request.content) == body
            and request.headers["idempotency-key"] == "explicit_key"
        )
        return httpx.Response(
            200, json=data, headers={"x-request-id": "req_send", "x-polymorfa-operation-id": "op_1"}
        )

    credential = (
        Credential("client_token", "pmfa_ct_fixture_only")
        if client_token
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    async with AsyncMessagingClient(
        credential, http_transport=httpx.MockTransport(handler)
    ) as client:
        response = await client.messages.send(
            "support", body, options=RequestOptions(idempotency_key="explicit_key")
        )
        assert (
            response.data == data
            and response.metadata.request_id == "req_send"
            and response.metadata.operation_id == "op_1"
        )


def test_composed_request_names_are_typed_and_replace_obsolete_reply_to():
    hints = get_type_hints(SendMessage)
    assert "quotedMessage" in hints and "isForwarded" in hints and "mentions" in hints
    assert "replyTo" not in hints and hints["content"] is not dict
