package polymorfa

import (
	"strings"
	"testing"
)

func TestContentDispositionAndGraphHeaders(t *testing.T) {
	for _, f := range []struct{ header, want string }{
		{`attachment; filename="dir/file.txt"`, "file.txt"},
		{`attachment; filename="fallback.txt"; filename*=UTF-8''caf%C3%A9.txt`, "café.txt"},
		{`attachment; filename*=iso-8859-1''caf%E9.txt`, "café.txt"},
		{`attachment; filename*=UTF-8''%FF; filename=plain.txt`, "plain.txt"},
		{`attachment; filename=first; filename=second`, "first"},
		{"attachment; filename=../\x00name.txt", "name.txt"},
		{`attachment; filename=".."`, ""},
		{`attachment; filename="dir/"`, ""},
		{strings.Repeat("x", 8193), ""},
	} {
		if actual := ParseContentDispositionFilename(f.header); actual != f.want {
			t.Fatal(f.header, actual, f.want)
		}
	}
	h := GraphTransportHeaders(TransportOfficialAPI)
	if h.Get("X-Polymorfa-Transport") != "official_api" {
		t.Fatal(h)
	}
}
