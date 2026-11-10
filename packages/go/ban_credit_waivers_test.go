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
	}{
		{"linked_device_interactive", `{"attributionRuleVersion":3,"linkedDeviceInteractive":true}`, true},
	} {
		var claim BanSafeClaim
		if err := json.Unmarshal([]byte(`{"status":"denied","amountCents":0,"verdict":"`+tc.verdict+`","evidence":`+tc.evidence+`}`), &claim); err != nil {
			t.Fatal(err)
		}
		if claim.Verdict != tc.verdict || claim.Evidence.AttributionRuleVersion == nil || *claim.Evidence.AttributionRuleVersion != 3 {
			t.Fatalf("decoded %+v", claim)
		}
		if claim.Evidence.LinkedDeviceInteractive != tc.linked {
			t.Fatalf("evidence %+v", claim.Evidence)
		}
		encoded, err := json.Marshal(claim.Evidence)
		if err != nil {
			t.Fatal(err)
		}
		var round map[string]any
		if err := json.Unmarshal(encoded, &round); err != nil || round["linkedDeviceInteractive"] != tc.linked {
			t.Fatalf("round trip %s", encoded)
		}
		var payload BanSafeClaimPayload
		if err := json.Unmarshal([]byte(`{"verdict":"`+tc.verdict+`"}`), &payload); err != nil || payload.Verdict != tc.verdict {
			t.Fatalf("webhook payload %+v %v", payload, err)
		}
	}
}
