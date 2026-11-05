package polymorfa

import "testing"

func TestKnownErrorCatalog(t *testing.T) {
	codes := KnownErrorCodes()
	if len(codes) != 101 || !IsKnownErrorCode("voice_unavailable") || IsKnownErrorCode("future_api_code") {
		t.Fatal("catalog boundary")
	}
	for _, code := range []string{"catalog_cache_full", "catalog_sync_cooldown", "hybrid_group_linked_devices_unavailable", "marketing_disabled_on_cloud_api", "parent_bsuid_not_supported", "whatsapp_authorization_required", "whatsapp_number_not_registered", "whatsapp_payment_method_required"} {
		if !IsKnownErrorCode(code) {
			t.Errorf("missing reviewed Official code: %s", code)
		}
	}
	codes[0] = "changed"
	if KnownErrorCodes()[0] != ErrorCampaignApprovalRequired {
		t.Fatal("catalog mutation escaped")
	}
}
