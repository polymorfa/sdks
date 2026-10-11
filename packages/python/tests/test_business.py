import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential

PROFILE = {
    "id": "user_1",
    "address": "Example Street",
    "email": "contact@example.com",
    "description": "Store",
    "websites": ["https://example.com"],
    "coverPhotoId": "cover_1",
    "categories": [{"id": "cat_1", "name": "Store"}],
    "options": {"commerce": "enabled"},
    "hoursTimeZone": "UTC",
    "hours": [
        {"dayOfWeek": "mon", "mode": "specific_hours", "openTime": "09:00", "closeTime": "17:00"}
    ],
}
UPDATE = {
    "description": "Updated store",
    "hours": {
        "timeZone": "UTC",
        "days": [
            {"dayOfWeek": "mon", "mode": "specific_hours", "openTime": 540, "closeTime": 1020},
            {"dayOfWeek": "tue", "mode": "open_24h"},
        ],
    },
}
COMPLIANCE = {
    "entityName": "Example Company",
    "entityType": "PRIVATE_COMPANY",
    "isRegistered": True,
    "entityTypeCustom": "",
    "customerCare": {
        "email": "care@example.com",
        "landlineNumber": "+15551234567",
        "mobileNumber": "+15557654321",
    },
    "grievanceOfficer": {
        "name": "Ada",
        "email": "grievance@example.com",
        "landlineNumber": "+15551234567",
        "mobileNumber": "+15557654321",
    },
}
LINKED = {
    "facebookPage": {
        "id": "page_1",
        "displayName": "Store",
        "profileSync": "import",
        "profilePictureUrl": "https://example.com/image",
        "showOnProfile": True,
        "whatsAppAsPageButton": True,
        "hasActiveCTWAAd": False,
        "hasCreatedAd": True,
    },
    "facebookBusiness": {
        "id": "business_1",
        "displayName": "Store",
        "catalogId": "catalog_1",
        "catalogState": "import",
    },
    "instagramProfessional": {
        "handle": "store",
        "displayName": "Store",
        "profilePictureUrl": "https://example.com/image",
        "showOnProfile": True,
    },
    "whatsAppAdIdentity": {"id": "ad_1", "hasActiveCTWAAd": False, "hasCreatedAd": True},
}
ELIGIBILITY = {
    "features": [
        {
            "feature": "meta_verified",
            "status": "eligible",
            "expiration": 1893456000,
            "additionalParams": "",
            "showPrivacyInterstitialToNewUsers": False,
            "v1Enabled": True,
        }
    ]
}
CASES = [
    ("GET", "/profile", None, PROFILE, lambda r: r.get_profile("support")),
    ("PATCH", "/profile", UPDATE, {"status": "OK"}, lambda r: r.update_profile("support", UPDATE)),
    (
        "PUT",
        "/profile/cover-photo",
        {"url": "https://example.com/cover.jpg"},
        {"coverPhotoId": "cover_2"},
        lambda r: r.set_cover_photo("support", {"url": "https://example.com/cover.jpg"}),
    ),
    (
        "DELETE",
        "/profile/cover-photo/cover_1",
        None,
        {"status": "OK"},
        lambda r: r.delete_cover_photo("support", "cover_1"),
    ),
    ("GET", "/compliance", None, COMPLIANCE, lambda r: r.get_merchant_compliance("support")),
    (
        "PUT",
        "/compliance",
        COMPLIANCE,
        COMPLIANCE,
        lambda r: r.set_merchant_compliance("support", COMPLIANCE),
    ),
    ("GET", "/linked-accounts", None, LINKED, lambda r: r.get_linked_accounts("support")),
    ("GET", "/eligibility", None, ELIGIBILITY, lambda r: r.get_eligibility("support")),
]


@pytest.mark.parametrize(
    "method,suffix,body,data,invoke,accepted",
    [
        (*case, accepted)
        for case in CASES
        for accepted in ([False] if case[0] == "GET" else [False, True])
    ],
)
async def test_typed_business_methods(method, suffix, body, data, invoke, accepted):
    fixture = {"success": True, "data": {"requestId": "rpc_1"} if accepted else data}

    def handler(request):
        assert (
            request.method == method and request.url.path == "/messaging/support/business" + suffix
        )
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(
            202 if accepted else 200, json=fixture, headers={"x-request-id": "req_business"}
        )

    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client.business)
        assert response.data == fixture and response.metadata.request_id == "req_business"
