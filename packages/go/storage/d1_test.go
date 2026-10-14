package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func d1Fixture(t *testing.T) map[string]any {
	t.Helper()
	raw, err := os.ReadFile("testdata/d1-bridge-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		t.Fatal("D1 fixture JSON")
	}
	return data
}
func fixtureOptions(t *testing.T, url string) D1Options {
	data := d1Fixture(t)
	return D1Options{URL: url, Authority: data["authority"].(string), TablePrefix: data["tablePrefix"].(string), Secret: data["secret"].(string)}
}
func capabilitiesData() map[string]any {
	return map[string]any{"atomicCommit": true, "maxCommitSize": 50, "maxGetSize": 1000, "maxQuerySize": 1000, "maxBodyBytes": d1MaxBody, "conditionalDeletes": true, "setupAllowed": true}
}
func TestD1IndependentSignatureVectors(t *testing.T) {
	v := d1Fixture(t)
	r := v["request"].(map[string]any)
	response := v["response"].(map[string]any)
	nonce := v["nonce"].(string)
	secret := v["secret"].(string)
	if signD1(secret, nonce+"."+r["method"].(string)+"."+r["path"].(string)+"."+r["rawBody"].(string)) != r["signature"] {
		t.Fatal("request HMAC vector")
	}
	if signD1(secret, nonce+"."+strconv.Itoa(int(response["status"].(float64)))+"."+response["rawBody"].(string)) != response["signature"] {
		t.Fatal("response HMAC vector")
	}
}
func TestD1HandshakeFailClosedAndBodyDeadline(t *testing.T) {
	for _, mode := range []string{"valid", "authority", "prefix", "schema", "capabilities", "nonce", "signature", "body", "unsigned", "redirect", "oversize", "stall"} {
		t.Run(mode, func(t *testing.T) {
			v := d1Fixture(t)
			secret := v["secret"].(string)
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				nonce := r.Header.Get("Polymorfa-Storage-Nonce")
				if len(nonce) != 43 || r.Header.Get("Authorization") != "Bearer "+secret || r.Header.Get("Origin") != "" || r.Header.Get("Cookie") != "" {
					t.Error("D1 request custody headers")
				}
				raw, _ := io.ReadAll(r.Body)
				if r.Header.Get("Polymorfa-Storage-Signature") != signD1(secret, nonce+"."+r.Method+"."+r.URL.Path+"."+string(raw)) {
					t.Error("D1 exact request signature")
				}
				if mode == "stall" {
					w.WriteHeader(200)
					w.(http.Flusher).Flush()
					<-r.Context().Done()
					return
				}
				if mode == "redirect" {
					w.Header().Set("Location", "http://127.0.0.1:1/private?capability=fixture")
					w.WriteHeader(302)
					return
				}
				env := map[string]any{"contract": D1BridgeContract, "schemaVersion": 2, "authority": v["authority"], "tablePrefix": v["tablePrefix"], "data": capabilitiesData()}
				switch mode {
				case "authority":
					env["authority"] = "other"
				case "prefix":
					env["tablePrefix"] = "other_"
				case "schema":
					env["schemaVersion"] = 3
				case "capabilities":
					env["data"].(map[string]any)["atomicCommit"] = false
				}
				body, _ := json.Marshal(env)
				if mode == "oversize" {
					body = []byte(strings.Repeat("x", d1MaxBody+1))
				}
				sig := signD1(secret, nonce+".200."+string(body))
				if mode == "nonce" {
					nonce = strings.Repeat("A", 43)
				}
				if mode == "signature" {
					sig = "v1=" + strings.Repeat("0", 64)
				}
				if mode != "unsigned" {
					w.Header().Set("Polymorfa-Storage-Nonce", nonce)
					w.Header().Set("Polymorfa-Storage-Signature", sig)
				}
				if mode == "body" {
					body = append(body, ' ')
				}
				w.Write(body)
			}))
			defer server.Close()
			options := fixtureOptions(t, server.URL)
			options.Timeout = 40 * time.Millisecond
			adapter, err := NewD1Adapter(context.Background(), options)
			if mode == "valid" {
				if err != nil || !adapter.Capabilities().AtomicCommit {
					t.Fatal("valid handshake", err)
				}
			} else {
				if err == nil {
					t.Fatal("untrusted handshake exposed adapter")
				}
				if strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "capability=") {
					t.Fatal("D1 error leaked secret URL")
				}
				if mode == "stall" {
					var typed *Error
					if !errors.As(err, &typed) || typed.Code != "storage_timeout" {
						t.Fatal("body deadline", err)
					}
				}
			}
			if calls != 1 {
				t.Fatal("D1 followed redirect/retried")
			}
		})
	}
}
func newFixtureRow(t *testing.T, entity, session string, values map[string]any) Row {
	t.Helper()
	d, err := DefinitionOf(entity)
	if err != nil {
		t.Fatal(err)
	}
	row := Row{"sessionId": session, "_rev": float64(1), "_v": map[string]any{}}
	for name := range d.Fields {
		row[name] = nil
	}
	for key, value := range values {
		row[key] = value
	}
	id, err := EncodeKey(entity, row)
	if err != nil {
		t.Fatal(err)
	}
	row["_id"] = id
	return row
}
func TestActualD1WorkerNativeConsumer(t *testing.T) {
	endpoint := os.Getenv("POLYMORFA_D1_BRIDGE_FIXTURE_URL")
	if endpoint == "" {
		t.Skip("Opt-in actual bundled Worker/Miniflare binding: set POLYMORFA_D1_BRIDGE_FIXTURE_URL.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	adapter, err := NewD1Adapter(ctx, fixtureOptions(t, endpoint))
	if err != nil {
		t.Fatal(err)
	}
	if err = adapter.Setup(ctx); err != nil {
		t.Fatal(err)
	}
	session := fmt.Sprintf("go-native-d1-%d", time.Now().UnixNano())
	raw, err := os.ReadFile("testdata/conformance-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Rows map[string][]Row `json:"eventRows"`
	}
	json.Unmarshal(raw, &fixture)
	expected := map[string]map[string]Row{}
	writes := []Write{}
	for entity, rows := range fixture.Rows {
		expected[entity] = map[string]Row{}
		for _, source := range rows {
			row := newFixtureRow(t, entity, session, source)
			row["sessionId"] = session
			id, _ := EncodeKey(entity, row)
			row["_id"] = id
			writes = append(writes, Write{Kind: "put", Entity: entity, Row: row})
			expected[entity][id] = row
		}
	}
	for start := 0; start < len(writes); start += 50 {
		end := min(start+50, len(writes))
		result, err := adapter.Commit(ctx, writes[start:end])
		if err != nil || !result.OK {
			t.Fatal("portable all-entity commit", err, result)
		}
	}
	for entity, rows := range expected {
		ids := []string{}
		for id := range rows {
			ids = append(ids, id)
		}
		got, err := adapter.Get(ctx, entity, ids)
		if err != nil || len(got) != len(rows) {
			t.Fatal("portable all-entity get", entity, err)
		}
		a, _ := json.Marshal(got)
		b, _ := json.Marshal(rows)
		if string(a) != string(b) {
			t.Fatal("portable rows changed", entity)
		}
	}
	bulk := session + "-bulk"
	all := []Write{}
	for i := 0; i < 2000; i++ {
		row := newFixtureRow(t, "messages", bulk, map[string]any{"messageId": fmt.Sprintf("m%04d", i), "chatId": "bulk-chat", "timestamp": float64(i), "text": "synthetic"})
		all = append(all, Write{Kind: "put", Entity: "messages", Row: row})
	}
	for i := 0; i < len(all); i += 50 {
		result, err := adapter.Commit(ctx, all[i:i+50])
		if err != nil || !result.OK {
			t.Fatal("2000-row commit", i, err, result)
		}
	}
	query := Query{Index: "by_chat", Equals: map[string]string{"sessionId": bulk, "chatId": "bulk-chat"}, Limit: 700}
	total := 0
	for {
		rows, err := adapter.Query(ctx, "messages", query)
		if err != nil {
			t.Fatal("ordered page", err)
		}
		if len(rows) == 0 {
			break
		}
		total += len(rows)
		last := rows[len(rows)-1]
		sort, _ := number(last["timestamp"])
		query.After = &Cursor{sort, last["_id"].(string)}
	}
	if total != 2000 {
		t.Fatal("2000-row pagination", total)
	}
	missing := newFixtureRow(t, "messages", bulk, map[string]any{"messageId": "rollback-new", "chatId": "bulk-chat", "timestamp": 3000.0})
	result, err := adapter.Commit(ctx, []Write{all[0], {Kind: "put", Entity: "messages", Row: missing}})
	if err != nil || result.OK {
		t.Fatal("CAS conflict result", err, result)
	}
	rows, err := adapter.Get(ctx, "messages", []string{missing["_id"].(string)})
	if err != nil || len(rows) != 0 {
		t.Fatal("atomic rollback failed", err)
	}
	lease := newFixtureRow(t, "leases", bulk, map[string]any{"owner": "native-fixture", "expiresAt": float64(time.Now().Add(time.Hour).UnixMilli())})
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "leases", Row: lease}})
	if err != nil || !result.OK {
		t.Fatal("lease fixture", err)
	}
	if _, err = adapter.Commit(ctx, []Write{{Kind: "delete", Entity: "messages", ID: all[0].Row["_id"].(string)}}); err == nil {
		t.Fatal("unfenced delete")
	}
	one := int64(1)
	lease["_rev"] = float64(2)
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "leases", Row: lease, ExpectedRev: &one}, {Kind: "delete", Entity: "messages", ID: all[0].Row["_id"].(string)}})
	if err != nil || !result.OK {
		t.Fatal("atomic lease-fenced delete", err, result)
	}
	checkpoint := newFixtureRow(t, "checkpoints", bulk, map[string]any{"stream": "events", "cursor": "before"})
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "checkpoints", Row: checkpoint}})
	if err != nil || !result.OK {
		t.Fatal("checkpoint create", err)
	}
	checkpoint["cursor"] = "after"
	checkpoint["_rev"] = float64(2)
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "checkpoints", Row: checkpoint, ExpectedRev: &one}})
	if err != nil || !result.OK {
		t.Fatal("checkpoint CAS", err)
	}
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "checkpoints", Row: checkpoint, ExpectedRev: &one}})
	if err != nil || result.OK {
		t.Fatal("stale checkpoint CAS", err)
	}
	t.Log("Actual native HTTP -> bundled Worker/Miniflare D1: all-entity fixture,2000 rows/paging,atomic rollback,lease-fenced delete,checkpoint CAS passed.")
}

func TestD1ZeroValueDoesNotAdvertiseAtomicity(t *testing.T) {
	var adapter D1Adapter
	if adapter.Capabilities().AtomicCommit {
		t.Fatal("unverified zero-value adapter advertised atomicity")
	}
	_, err := adapter.Get(context.Background(), "sessions", []string{"kfixture"})
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "storage_handshake_required" {
		t.Fatal("unverified adapter performed operation", err)
	}
}

func TestD1SignedMiswiredRowAndCommitResponses(t *testing.T) {
	for _, mode := range []string{"foreign-get", "foreign-query", "reordered-query", "malformed-row", "foreign-conflict"} {
		t.Run(mode, func(t *testing.T) {
			fixture := d1Fixture(t)
			secret := fixture["secret"].(string)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var data any = capabilitiesData()
				if r.URL.Path == "/get" {
					row := newFixtureRow(t, "sessions", "other", nil)
					if mode == "malformed-row" {
						row["_rev"] = float64(0)
					}
					data = []Row{row}
				}
				if r.URL.Path == "/query" {
					row := newFixtureRow(t, "messages", "other", map[string]any{"messageId": "m1", "chatId": "chat", "timestamp": 1.0})
					data = []Row{row}
					if mode == "reordered-query" {
						a := newFixtureRow(t, "messages", "expected", map[string]any{"messageId": "m2", "chatId": "chat", "timestamp": 2.0})
						b := newFixtureRow(t, "messages", "expected", map[string]any{"messageId": "m1", "chatId": "chat", "timestamp": 1.0})
						data = []Row{a, b}
					}
				}
				if r.URL.Path == "/commit" {
					data = map[string]any{"ok": false, "conflicts": []string{"foreign"}}
				}
				raw, _ := json.Marshal(map[string]any{"contract": D1BridgeContract, "schemaVersion": 2, "authority": fixture["authority"], "tablePrefix": fixture["tablePrefix"], "data": data})
				nonce := r.Header.Get("Polymorfa-Storage-Nonce")
				w.Header().Set("Polymorfa-Storage-Nonce", nonce)
				w.Header().Set("Polymorfa-Storage-Signature", signD1(secret, nonce+".200."+string(raw)))
				w.Write(raw)
			}))
			defer server.Close()
			adapter, err := NewD1Adapter(context.Background(), fixtureOptions(t, server.URL))
			if err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "foreign-get", "malformed-row":
				_, err = adapter.Get(context.Background(), "sessions", []string{"kexpected"})
			case "foreign-query", "reordered-query":
				_, err = adapter.Query(context.Background(), "messages", Query{Index: "by_chat", Equals: map[string]string{"sessionId": "expected", "chatId": "chat"}, Limit: 10})
			case "foreign-conflict":
				_, err = adapter.Commit(context.Background(), []Write{{Kind: "put", Entity: "sessions", Row: newFixtureRow(t, "sessions", "expected", nil)}})
			}
			var typed *Error
			if !errors.As(err, &typed) || typed.Code != "untrusted_storage_response" {
				t.Fatal("signed miswired adapter response trusted", err)
			}
		})
	}
}
