package polymorfa

import "testing"

func TestKnownErrorCatalog(t *testing.T) {
	codes := KnownErrorCodes()
	if len(codes) != 89 || !IsKnownErrorCode("voice_unavailable") || IsKnownErrorCode("future_api_code") {
		t.Fatal("catalog boundary")
	}
	codes[0] = "changed"
	if KnownErrorCodes()[0] != "invalid_parameter" {
		t.Fatal("catalog mutation escaped")
	}
}
