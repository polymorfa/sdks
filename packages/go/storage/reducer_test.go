package storage

import (
	"context"
	"encoding/json"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"os"
	"testing"
)

func portable(t *testing.T) ([]polymorfa.WebhookEvent, map[string][]Row, map[string]any, map[string][]Row) {
	t.Helper()
	raw, err := os.ReadFile("testdata/conformance-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Events      []polymorfa.WebhookEvent `json:"events"`
		EventRows   map[string][]Row         `json:"eventRows"`
		History     map[string]any           `json:"history"`
		HistoryRows map[string][]Row         `json:"historyRows"`
	}
	if json.Unmarshal(raw, &f) != nil {
		t.Fatal("fixture")
	}
	return f.Events, f.EventRows, f.History, f.HistoryRows
}
func assertFixtureRows(t *testing.T, e *Engine, expected map[string][]Row) {
	t.Helper()
	ctx := context.Background()
	for entity, rows := range expected {
		d, _ := DefinitionOf(entity)
		if memory, ok := e.Adapter().(*MemoryAdapter); ok && len(memory.rows[entity]) != len(rows) {
			t.Fatalf("entity%s rowcount got%d want%d", entity, len(memory.rows[entity]), len(rows))
		}
		for _, want := range rows {
			key := map[string]any{}
			for _, field := range d.Key {
				key[field] = want[field]
			}
			got, err := e.Get(ctx, entity, key)
			if err != nil {
				t.Fatal(err)
			}
			a, _ := CanonicalJSON(got)
			b, _ := CanonicalJSON(want)
			if a != b {
				t.Fatalf("%s fixture got%s\nwant%s", entity, a, b)
			}
		}
	}
}
func TestSharedEventReducerConformance(t *testing.T) {
	events, expected, _, _ := portable(t)
	for _, reverse := range []bool{false, true} {
		e := engineFor(t, memoryFor(t, 50), EngineOptions{})
		for pass := 0; pass < 2; pass++ {
			for i := range events {
				at := i
				if reverse {
					at = len(events) - 1 - i
				}
				batch, err := ReduceEvent(events[at])
				if err != nil {
					t.Fatal(err)
				}
				if _, err := e.Apply(context.Background(), batch); err != nil {
					t.Fatalf("event%s %v", events[at].Event, err)
				}
			}
		}
		assertFixtureRows(t, e, expected)
	}
}
func TestSharedHistoryReducerConformanceAndReplay(t *testing.T) {
	_, _, chunk, expected := portable(t)
	e := engineFor(t, memoryFor(t, 50), EngineOptions{})
	batch, err := ReduceHistoryChunk(HistoryInput{SessionID: "history-portable", Chunk: chunk, ChunkID: str("golden")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.Apply(context.Background(), batch); err != nil {
		t.Fatal(err)
	}
	result, err := e.Apply(context.Background(), batch)
	if err != nil || result.Applied {
		t.Fatal("history dedup", err)
	}
	for _, rows := range expected {
		for _, row := range rows {
			row["sessionId"] = "history-portable"
		}
	}
	assertFixtureRows(t, e, expected)
	if _, err := ReduceHistoryData("session", &polymorfa.HistorySyncData{}, nil, nil); err == nil {
		t.Fatal("minimal codec view accepted as complete")
	}
}
func TestHistoryIdentityScopesDirectionAndTargets(t *testing.T) {
	index := &HistoryIdentityIndex{Conversations: map[string]string{"111@s.whatsapp.net": "chat-a", "222@s.whatsapp.net": "chat-b"}, Messages: []HistoryMessageIdentity{{NativeID: "same", ID: "opaque-a", ChatID: "chat-a", FromMe: boolValue(false)}, {NativeID: "same", ID: "opaque-out", ChatID: "chat-a", FromMe: boolValue(true)}, {NativeID: "same", ID: "opaque-b", ChatID: "chat-b", FromMe: boolValue(false)}}}
	keys := NewHistoryKeys(index, nil)
	for _, tc := range []struct {
		jid  string
		own  bool
		want string
	}{{"111:1@s.whatsapp.net", false, "opaque-a"}, {"111@s.whatsapp.net", true, "opaque-out"}, {"222@s.whatsapp.net", false, "opaque-b"}} {
		got := keys.MessageID(map[string]any{"id": "same", "fromMe": tc.own}, tc.jid)
		if got != tc.want {
			t.Fatal("scoped identity", got, tc.want)
		}
	}
	group := NewHistoryKeys(nil, nil)
	a := group.MessageID(map[string]any{"id": "same", "participant": "111:1@lid"}, "group@g.us")
	b := group.MessageID(map[string]any{"id": "same", "participant": "222@lid"}, "group@g.us")
	if a == b || NormalizeJID("111:2@lid") == NormalizeJID("111@s.whatsapp.net") {
		t.Fatal("participant/domain conflation")
	}
	target := map[string]any{"id": "same", "remoteJid": "111@s.whatsapp.net", "fromMe": false}
	info := map[string]any{"key": map[string]any{"id": "envelope", "remoteJid": "111@s.whatsapp.net"}, "messageTimestamp": "1720000000", "message": map[string]any{"protocolMessage": map[string]any{"type": "REVOKE", "key": target}}}
	ops := ReduceWebMessageInfo(info, "session", keys, "")
	if len(ops) != 2 || ops[0].Key["messageId"] != "opaque-a" || ops[0].Fields["text"].Version != FinalVersion || ops[0].Fields["text"].Value != nil {
		t.Fatal("revoke target/finality", ops)
	}
}
func boolValue(v bool) *bool { return &v }
func TestHistoryStringsWrappersAndReceiptRank(t *testing.T) {
	keys := NewHistoryKeys(nil, nil)
	info := map[string]any{"key": map[string]any{"id": "m", "remoteJid": "111@s.whatsapp.net", "fromMe": true}, "messageTimestamp": "1720000000", "status": "READ", "message": map[string]any{"viewOnceMessageV2": map[string]any{"message": map[string]any{"ephemeralMessage": map[string]any{"message": map[string]any{"conversation": "inner"}}}}}, "userReceipt": []any{map[string]any{"userJid": "222:1@lid", "readTimestamp": "1720000002"}}}
	ops := ReduceWebMessageInfo(info, "session", keys, "")
	e := engineFor(t, memoryFor(t, 50), EngineOptions{})
	if _, err := e.Apply(context.Background(), Batch{SessionID: "session", Operations: ops}); err != nil {
		t.Fatal(err)
	}
	id := keys.MessageID(object(info["key"]), "")
	row, err := e.Get(context.Background(), "messages", map[string]any{"sessionId": "session", "messageId": id})
	if err != nil || row["text"] != "inner" || row["timestamp"] != float64(1720000000000) || row["status"] != "read" {
		t.Fatal("wrapper/int64/status", row, err)
	}
	receipt, err := e.Get(context.Background(), "receipts", map[string]any{"sessionId": "session", "messageId": id, "recipientId": "wa:222@lid"})
	if err != nil || receipt["status"] != "read" {
		t.Fatal("receipt", receipt, err)
	}
}
