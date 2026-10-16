import asyncio
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from polymorfa.errors import ValidationError
from polymorfa import campaign_contract_validation as V
from test_campaign_contracts import wire

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "contracts/fixtures/audience-profile-list.v1.json"
    ).read_text()
)


def test_filter_fixture_validation():
    for params in FIXTURE["validFilters"]:
        assert V.profile_list(params) == params
    for params in FIXTURE["invalidFilters"] + [
        {"tag": None},
        {"phonePrefix": None},
        {"phonePrefix": "+1\n"},
    ]:
        with pytest.raises(ValidationError):
            V.profile_list(params)
    for cursor in FIXTURE["invalidCursors"]:
        with pytest.raises(ValidationError):
            V.profile_list({"cursor": cursor})
    with pytest.raises(ValidationError):
        V.page({"tag": "vip"})
    assert V.profile_list({"tag": "null"}) == {"tag": "null"}


def test_public_filter_wire():
    async def run():
        async with wire({"data": [], "page": {"nextCursor": None, "hasMore": False}}) as (
            client,
            requests,
        ):
            await client.audience_profiles.list({"tag": "é vip", "phonePrefix": "+44", "limit": 1})
            target = requests[0][0][1]
            assert "%2B44" in target
            assert parse_qs(urlsplit(target).query) == {
                "tag": ["é vip"],
                "phonePrefix": ["+44"],
                "limit": ["1"],
            }

    asyncio.run(run())
