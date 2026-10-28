package polymorfa

import (
	"encoding/json"
	"testing"
)

func TestBanCreditWaiverVerdictsAndEvidence(t *testing.T) {
	for _, tc := range []struct {
		verdict  string
		evidence string
		linked   bool
		referral bool
	}{
		{"linked_device_interactive", `{"attributionRuleVersion":3,"linkedDeviceInteractive":true,"referralGroupSend":false}`, true, false},
		{"referral_group_send", `{"attributionRuleVersion":3,"linkedDeviceInteractive":false,"referralGroupSend":true}`, false, true},
	} {
		var claim BanSafeClaim
		if err := json.Unmarshal([]byte(`{"status":"denied","amountCents":0,"verdict":"`+tc.verdict+`","evidence":`+tc.evidence+`}`), &claim); err != nil {
			t.Fatal(err)
		}
		if claim.Verdict != tc.verdict || claim.Evidence.AttributionRuleVersion == nil || *claim.Evidence.AttributionRuleVersion != 3 {
			t.Fatalf("decoded %+v", claim)
		}
		if claim.Evidence.LinkedDeviceInteractive != tc.linked || claim.Evidence.ReferralGroupSend != tc.referral {
			t.Fatalf("evidence %+v", claim.Evidence)
		}
		encoded, err := json.Marshal(claim.Evidence)
		if err != nil {
			t.Fatal(err)
		}
		var round map[string]any
		if err := json.Unmarshal(encoded, &round); err != nil || round["linkedDeviceInteractive"] != tc.linked || round["referralGroupSend"] != tc.referral {
			t.Fatalf("round trip %s", encoded)
		}
		var payload BanSafeClaimPayload
		if err := json.Unmarshal([]byte(`{"verdict":"`+tc.verdict+`"}`), &payload); err != nil || payload.Verdict != tc.verdict {
			t.Fatalf("webhook payload %+v %v", payload, err)
		}
	}
}
