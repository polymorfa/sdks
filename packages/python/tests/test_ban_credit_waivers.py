from typing import get_args, get_type_hints

from polymorfa.bansafe_observations import Claim, ClaimEvidence, ClaimVerdict
from polymorfa.webhook_models import BanSafeClaimPayload

WAIVERS = ("linked_device_interactive", "referral_group_send")


def test_claim_verdicts_include_the_ban_credit_waivers() -> None:
    for verdict in WAIVERS:
        assert verdict in get_args(ClaimVerdict)
        assert verdict in get_args(get_type_hints(BanSafeClaimPayload)["verdict"])
    assert get_type_hints(Claim)["verdict"] == ClaimVerdict


def test_claim_evidence_types_the_waiver_flags() -> None:
    hints = get_type_hints(ClaimEvidence)
    assert hints["linkedDeviceInteractive"] is bool
    assert hints["referralGroupSend"] is bool
    assert {"linkedDeviceInteractive", "referralGroupSend"} <= ClaimEvidence.__required_keys__
