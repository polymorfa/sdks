package polymorfa

import (
	"strings"
	"testing"
)

func TestSignedV2CredentialShapes(t *testing.T) {
	for _, c := range []Credential{{OrganizationAPIKey, "pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8"}, {ProjectToken, "pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL"}} {
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
