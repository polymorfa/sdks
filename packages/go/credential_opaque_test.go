package polymorfa

import (
	"strings"
	"testing"
)

func TestOpaqueCredentialShapes(t *testing.T) {
	for _, c := range []Credential{{OrganizationAPIKey, "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}, {ProjectToken, "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}} {
		if err := validateCredential(c, false); err != nil {
			t.Fatal(err)
		}
		for _, bad := range []string{c.Value + "=", c.Value + "\n", c.Value[:len(c.Value)-1] + "!", strings.Repeat("A", 16385)} {
			if validateCredential(Credential{c.Kind, bad}, false) == nil {
				t.Fatal("malformed shape accepted")
			}
		}
	}
	for _, c := range []Credential{{OrganizationAPIKey, "pmfa_" + strings.Repeat("A", 72)}, {ProjectToken, "pmfa_pt_" + strings.Repeat("A", 94)}} {
		if validateCredential(c, false) == nil {
			t.Fatal("v1 accepted")
		}
	}
}
