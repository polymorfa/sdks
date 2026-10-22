package polymorfa

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestOpaqueCredentialShapes(t *testing.T) {
	raw, err := os.ReadFile("../../contracts/machine-credentials.v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Opaque []struct{ Kind, Token string }
		Client struct {
			Cases      []struct{ Token string }
			Rejections []struct{ Token string }
		}
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, v := range fixture.Opaque {
		kind := OrganizationAPIKey
		if v.Kind == "project" {
			kind = ProjectToken
		}
		c := Credential{kind, v.Token}
		if err = validateCredential(c, false); err != nil {
			t.Fatal(err)
		}
		for _, bad := range []string{strings.Replace(v.Token, "_A", "_B", 1), v.Token + "=", v.Token + "\n", v.Token[:len(v.Token)-1] + "!"} {
			if validateCredential(Credential{kind, bad}, false) == nil {
				t.Fatal("malformed accepted")
			}
		}
	}
	for _, v := range append(fixture.Client.Cases, fixture.Client.Rejections...) {
		if err = validateCredential(Credential{ClientToken, v.Token}, true); err != nil {
			t.Fatal(err)
		}
	}
	for _, size := range []int{400, 13000} {
		raw := make([]byte, size+4)
		binary.BigEndian.PutUint32(raw[size:], crc32.ChecksumIEEE(raw[:size]))
		body := base64.RawURLEncoding.EncodeToString(raw)
		for _, c := range []Credential{{OrganizationAPIKey, "pmfa_" + body}, {ProjectToken, "pmfa_pt_" + body}, {ClientToken, "pmfa_ct_" + base64.RawURLEncoding.EncodeToString(raw[:size])}} {
			if len(c.Value) <= 512 {
				t.Fatal("growth probe too short")
			}
			if err = validateCredential(c, true); err != nil {
				t.Fatal(err)
			}
			if strings.Contains(fmt.Sprintf("%#v", c), c.Value) {
				t.Fatal("credential leaked")
			}
		}
	}
	token := fixture.Client.Cases[0].Token
	signed, _ := base64.RawURLEncoding.DecodeString(token[8:])
	signed[len(signed)-1] ^= 1
	if validateCredential(Credential{ClientToken, "pmfa_ct_" + base64.RawURLEncoding.EncodeToString(signed)}, true) != nil {
		t.Fatal("SDK authenticated signature")
	}
}

func TestCredentialDiagnosticGrowth(t *testing.T) {
	secret := "pmfa_ct_" + strings.Repeat("A", 17000)
	v := redactCredentialDiagnostic(map[string]any{"message": secret, "details": map[string]any{"apiKey": "synthetic", "projectToken": secret, "nested": []any{secret}}})
	encoded, _ := json.Marshal(v)
	if strings.Contains(string(encoded), secret) || strings.Contains(string(encoded), "synthetic") {
		t.Fatal("credential leaked")
	}
}

func TestCredentialWireReflection(t *testing.T) {
	raw, _ := os.ReadFile("../../contracts/machine-credentials.v1.json")
	var fixture struct {
		Opaque []struct{ Kind, Token string }
		Client struct{ Cases []struct{ Token string } }
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	var credentials []Credential
	for _, v := range fixture.Opaque {
		kind := OrganizationAPIKey
		if v.Kind == "project" {
			kind = ProjectToken
		}
		credentials = append(credentials, Credential{kind, v.Token})
	}
	for _, v := range fixture.Client.Cases {
		credentials = append(credentials, Credential{ClientToken, v.Token})
	}
	credentials = append(credentials, Credential{ClientToken, "pmfa_ct_" + base64.RawURLEncoding.EncodeToString(make([]byte, 600))})
	for _, c := range credentials {
		func() {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer "+c.Value {
					t.Error("credential changed")
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(401)
				json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": "unauthorized", "message": c.Value, "details": map[string]any{"apiKey": "synthetic", "projectToken": c.Value}}})
			}))
			defer server.Close()
			client, err := NewMessagingClient(Config{Credential: c, BaseURL: server.URL})
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.Profile().Get(context.Background(), "s")
			var failure *Error
			if !errors.As(err, &failure) || failure.Code != "unauthorized" || strings.Contains(failure.Message, c.Value) || strings.Contains(string(failure.Details), c.Value) || strings.Contains(string(failure.Details), "synthetic") {
				t.Fatal("credential diagnostic failed")
			}
		}()
	}
}
