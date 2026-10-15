package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"
)

func engineFor(t *testing.T, adapter Adapter, options EngineOptions) *Engine {
	t.Helper()
	e, err := NewEngine(adapter, options)
	if err != nil {
		t.Fatal(err)
	}
	return e
}
func memoryFor(t *testing.T, size int) *MemoryAdapter {
	t.Helper()
	m, err := NewMemoryAdapter(size)
	if err != nil {
		t.Fatal(err)
	}
	return m
}
func str(v string) *string { return &v }
func upsert(entity, session string, key map[string]any, values map[string]any, version float64) Operation {
	keyCopy := map[string]any{"sessionId": session}
	for k, v := range key {
		keyCopy[k] = v
	}
	fields := Fields{}
	for k, v := range values {
		fields[k] = FieldWrite{v, version}
	}
	return Operation{Kind: "upsert", Entity: entity, Key: keyCopy, Fields: fields}
}
func TestCanonicalNumbersUTF16AndTypedMerge(t *testing.T) {
	for _, tc := range []struct {
		value any
		want  string
	}{{1e-6, "0.000001"}, {1e-7, "1e-7"}, {1e21, "1e+21"}, {1e20, "100000000000000000000"}, {map[string]any{"\ue000": 1, "😀": 2, "<": []any{nil, false, "\u2028"}}, "{\"<\":[null,false,\"\u2028\"],\"😀\":2,\"\ue000\":1}"}} {
		got, err := CanonicalJSON(tc.value)
		if err != nil || got != tc.want {
			t.Fatalf("canonical got%q want%q: %v", got, tc.want, err)
		}
	}
	key := map[string]any{"sessionId": "s", "messageId": "m"}
	base, _ := EmptyRow("messages", key)
	left, _, err := MergeFields("messages", base, Fields{"text": {Value: "a", Version: 0}})
	if err != nil {
		t.Fatal(err)
	}
	right, _, _ := MergeFields("messages", base, Fields{"text": {Value: "b", Version: 0}})
	left, _, _ = MergeFields("messages", left, Fields{"text": {Value: "b", Version: 0}})
	right, _, _ = MergeFields("messages", right, Fields{"text": {Value: "a", Version: 0}})
	a, _ := CanonicalJSON(left)
	b, _ := CanonicalJSON(right)
	if a != b {
		t.Fatal("equal version merge not commutative")
	}
	left, _, _ = MergeFields("messages", left, Fields{"text": {nil, FinalVersion}})
	left, _, _ = MergeFields("messages", left, Fields{"text": {"old", 1}})
	if left["text"] != nil {
		t.Fatal("old history resurrected final content")
	}
}
func TestEngineClearAllChildrenAndLateWatermark(t *testing.T) {
	ctx := context.Background()
	e := engineFor(t, memoryFor(t, 3), EngineOptions{ClearPageSize: 1})
	session := "clear"
	guard := &Watermark{session, "chat", 100}
	ops := []Operation{upsert("chats", session, map[string]any{"chatId": "chat"}, map[string]any{"lastMessageAt": 100}, 0), upsert("messages", session, map[string]any{"messageId": "m"}, map[string]any{"chatId": "chat", "timestamp": 100, "text": "private"}, 0), upsert("media", session, map[string]any{"messageId": "m"}, map[string]any{"mediaKey": "private"}, 0)}
	for _, tc := range []struct{ entity, key string }{{"reactions", "senderId"}, {"receipts", "recipientId"}, {"poll_votes", "voterId"}} {
		ops = append(ops, upsert(tc.entity, session, map[string]any{"messageId": "m", tc.key: "peer"}, map[string]any{"timestamp": 100}, 0))
	}
	for i := 1; i < len(ops); i++ {
		ops[i].Guard = guard
	}
	if _, err := e.Apply(ctx, Batch{SessionID: session, EventID: str("first"), Operations: ops}); err != nil {
		t.Fatal(err)
	}
	clear := []Operation{upsert("chats", session, map[string]any{"chatId": "chat"}, map[string]any{"clearedAt": 100}, 100), {Kind: "clearChat", SessionID: session, ChatID: "chat", UpTo: 100}}
	if _, err := e.Apply(ctx, Batch{SessionID: session, Operations: clear}); err != nil {
		t.Fatal(err)
	}
	for _, entity := range []string{"messages", "media", "reactions", "receipts", "poll_votes"} {
		m := e.adapter.(*MemoryAdapter)
		if len(m.rows[entity]) != 0 {
			t.Fatal("clear retained child", entity)
		}
	}
	if _, err := e.Apply(ctx, Batch{SessionID: session, EventID: str("late"), Operations: ops[1:]}); err != nil {
		t.Fatal(err)
	}
	if len(e.adapter.(*MemoryAdapter).rows["messages"]) != 0 {
		t.Fatal("equal timestamp resurrected")
	}
}
func TestCheckpointCASDurableLeaseGenerationAndForeignRefusal(t *testing.T) {
	ctx := context.Background()
	m := memoryFor(t, 3)
	e := engineFor(t, m, EngineOptions{})
	session := "checkpoint"
	op := Operation{Kind: "checkpoint", SessionID: session, Stream: "events", Cursor: "c1", ExpectedCursor: &ExpectedCursor{}}
	if _, err := e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{op}}); err != nil {
		t.Fatal(err)
	}
	id, _ := EncodeKey("leases", map[string]any{"sessionId": session})
	before, _ := revision(m.rows["leases"][id]["_rev"])
	if _, err := e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{op}}); err == nil {
		t.Fatal("explicit null accepted existing cursor")
	}
	op.ExpectedCursor = &ExpectedCursor{str("c1")}
	op.Cursor = "c2"
	if _, err := e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{op}}); err != nil {
		t.Fatal(err)
	}
	after, _ := revision(m.rows["leases"][id]["_rev"])
	if after <= before || m.rows["leases"][id]["owner"] != nil {
		t.Fatal("lease generation reused/release deleted")
	}
	saved, err := e.GetCheckpoint(ctx, session, "events")
	if err != nil || saved.Cursor != "c2" {
		t.Fatal("checkpoint", err)
	}
	for _, op := range []Operation{upsert("messages", "foreign", map[string]any{"messageId": "m"}, nil, 0), upsert("leases", session, nil, map[string]any{"owner": "bad"}, 0)} {
		if _, err := e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{op}}); err == nil {
			t.Fatal("foreign/lease write accepted")
		}
	}
	latest, _ := revision(m.rows["leases"][id]["_rev"])
	if latest != after {
		t.Fatal("invalid batch acquired lease")
	}
}

type failAdapter struct {
	Adapter
	fail  bool
	empty bool
	later bool
}

func (f *failAdapter) Commit(ctx context.Context, w []Write) (CommitResult, error) {
	for _, write := range w {
		if write.Entity == "messages" && write.Kind == "put" {
			if write.Row["messageId"] == "m0" && f.fail {
				f.fail = false
				ids := []string{write.Row["_id"].(string)}
				if f.empty {
					ids = nil
				}
				return CommitResult{Conflicts: ids}, nil
			}
			if write.Row["messageId"] == "m4" {
				f.later = true
			}
		}
	}
	return f.Adapter.Commit(ctx, w)
}
func TestFirstFailedChunkCannotWriteLaterRowsOrEventMarker(t *testing.T) {
	for _, empty := range []bool{false, true} {
		t.Run(fmt.Sprint(empty), func(t *testing.T) {
			ctx := context.Background()
			m := memoryFor(t, 3)
			fault := &failAdapter{Adapter: m, fail: true, empty: empty}
			zero := 0
			e := engineFor(t, fault, EngineOptions{MaxRetries: &zero})
			ops := []Operation{}
			for i := 0; i < 5; i++ {
				ops = append(ops, upsert("messages", "fault", map[string]any{"messageId": fmt.Sprint("m", i)}, map[string]any{"chatId": "chat", "timestamp": i}, 0))
			}
			batch := Batch{SessionID: "fault", EventID: str("event"), Operations: ops}
			if _, err := e.Apply(ctx, batch); err == nil {
				t.Fatal("failed status accepted")
			}
			marker, _ := e.HasEvent(ctx, "fault", "event")
			if marker || fault.later {
				t.Fatal("later chunk/event marker committed past failure")
			}
			if _, err := e.Apply(ctx, batch); err != nil {
				t.Fatal(err)
			}
			if len(m.rows["messages"]) != 5 {
				t.Fatal("replay lost rows")
			}
			result, err := e.Apply(ctx, batch)
			if err != nil || result.Applied {
				t.Fatal("dedup replay", err)
			}
		})
	}
}
func TestConcurrentEnginesFenceEachChunk(t *testing.T) {
	ctx := context.Background()
	m := memoryFor(t, 3)
	a, b := engineFor(t, m, EngineOptions{}), engineFor(t, m, EngineOptions{})
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			e := a
			if i%2 == 0 {
				e = b
			}
			_, err := e.Apply(ctx, Batch{SessionID: "concurrent", EventID: str(fmt.Sprint(i)), Operations: []Operation{upsert("messages", "concurrent", map[string]any{"messageId": "m"}, map[string]any{"text": fmt.Sprintf("%02d", i)}, float64(i))}})
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	row, err := a.Get(ctx, "messages", map[string]any{"sessionId": "concurrent", "messageId": "m"})
	if err != nil || row["text"] != "11" {
		t.Fatal("concurrent merge", row, err)
	}
}
func exerciseEngineRows(t *testing.T, adapter Adapter, session string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	e := engineFor(t, adapter, EngineOptions{})
	raw, err := os.ReadFile("testdata/conformance-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		EventRows   map[string][]Row `json:"eventRows"`
		HistoryRows map[string][]Row `json:"historyRows"`
	}
	if json.Unmarshal(raw, &fixture) != nil {
		t.Fatal("fixture")
	}
	ops := []Operation{}
	expected := map[string][]Row{}
	for entity, rows := range fixture.HistoryRows {
		d, _ := DefinitionOf(entity)
		for _, row := range rows {
			row = cloneRow(row)
			row["sessionId"] = session
			key := map[string]any{}
			values := map[string]any{}
			for _, f := range d.Key {
				key[f] = row[f]
			}
			for f := range d.Fields {
				values[f] = row[f]
			}
			ops = append(ops, upsert(entity, session, key, values, 0))
			expected[entity] = append(expected[entity], row)
		}
	}
	for i := 0; i < 2000; i++ {
		ops = append(ops, upsert("messages", session, map[string]any{"messageId": fmt.Sprintf("scale-%04d", i)}, map[string]any{"chatId": "scale-chat", "timestamp": float64(1800000000000 + i), "text": fmt.Sprint("row", i)}, 0))
	}
	if _, err := e.Apply(ctx, Batch{SessionID: session, EventID: str("history"), Operations: ops}); err != nil {
		t.Fatal(err)
	}
	for entity, rows := range expected {
		d, _ := DefinitionOf(entity)
		for _, want := range rows {
			key := map[string]any{}
			for _, f := range d.Key {
				key[f] = want[f]
			}
			got, err := e.Get(ctx, entity, key)
			if err != nil {
				t.Fatal(err)
			}
			a, _ := CanonicalJSON(got)
			b, _ := CanonicalJSON(want)
			if a != b {
				t.Fatalf("fixture entity%s mismatch", entity)
			}
		}
	}
	page, err := e.Query(ctx, "messages", Query{Index: "by_chat", Equals: map[string]string{"sessionId": session, "chatId": "scale-chat"}, Order: "asc", Limit: 257})
	if err != nil || len(page.Rows) != 257 || page.Next == nil {
		t.Fatal("paging", err)
	}
	count := len(page.Rows)
	for page.Next != nil {
		page, err = e.Query(ctx, "messages", Query{Index: "by_chat", Equals: map[string]string{"sessionId": session, "chatId": "scale-chat"}, Order: "asc", Limit: 257, After: page.Next})
		if err != nil {
			t.Fatal(err)
		}
		count += len(page.Rows)
	}
	if count != 2000 {
		t.Fatal("history row count", count)
	}
	if _, err := e.Apply(ctx, Batch{SessionID: session, EventID: str("history"), Operations: ops}); err != nil {
		t.Fatal(err)
	}
}
func TestMemoryPortableEngine2000History(t *testing.T) {
	exerciseEngineRows(t, memoryFor(t, 50), "memory-history")
}
func TestActualD1Engine2000History(t *testing.T) {
	endpoint := os.Getenv("POLYMORFA_D1_BRIDGE_FIXTURE_URL")
	if endpoint == "" {
		t.Skip("Requires actual bundled Worker/Miniflare D1 fixture")
	}
	ctx := context.Background()
	adapter, err := NewD1Adapter(ctx, fixtureOptions(t, endpoint))
	if err != nil {
		t.Fatal(err)
	}
	if err := adapter.Setup(ctx); err != nil {
		t.Fatal(err)
	}
	exerciseEngineRows(t, adapter, fmt.Sprint("go-engine-", time.Now().UnixNano()))
}
func TestMemoryAtomicRollbackAndCopyIsolation(t *testing.T) {
	ctx := context.Background()
	m := memoryFor(t, 3)
	first := newFixtureRow(t, "messages", "copy", map[string]any{"messageId": "a", "text": "before"})
	result, err := m.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: first}})
	if err != nil || !result.OK {
		t.Fatal(err)
	}
	first["text"] = "mutated"
	rows, _ := m.Get(ctx, "messages", []string{first["_id"].(string)})
	if rows[first["_id"].(string)]["text"] != "before" {
		t.Fatal("input alias")
	}
	rows[first["_id"].(string)]["text"] = "output mutation"
	wrong := int64(9)
	other := newFixtureRow(t, "messages", "copy", map[string]any{"messageId": "b"})
	result, err = m.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: other}, {Kind: "delete", Entity: "messages", ID: first["_id"].(string), ExpectedRev: &wrong}})
	if err != nil || result.OK {
		t.Fatal("atomic conflict", err)
	}
	if len(m.rows["messages"]) != 1 || m.rows["messages"][first["_id"].(string)]["text"] != "before" {
		t.Fatal("partial commit/output alias")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := m.Commit(cancelled, nil); !errors.Is(err, context.Canceled) {
		t.Fatal("cancel", err)
	}
}

func TestNilJSONContainersRemainNullAndIdempotent(t *testing.T) {
	for _, value := range []any{map[string]any(nil), []any(nil), Row(nil)} {
		got, err := CanonicalJSON(value)
		if err != nil || got != "null" {
			t.Fatal("nil JSON semantics", got, err)
		}
		cmp, err := CompareValues(value, nil)
		if err != nil || cmp != 0 {
			t.Fatal("nil JSON tie ordering", err)
		}
		row, _ := EmptyRow("messages", map[string]any{"sessionId": "nil", "messageId": "m"})
		row, _, err = MergeFields("messages", row, Fields{"extra": {Value: nil, Version: 1}})
		if err != nil {
			t.Fatal(err)
		}
		_, changed, err := MergeFields("messages", row, Fields{"extra": {Value: value, Version: 1}})
		if err != nil || changed {
			t.Fatal("replay of JSON null changed row", err)
		}
	}
	for _, value := range []any{map[string]any{}, []any{}} {
		got, err := CanonicalJSON(value)
		if err != nil || got == "null" {
			t.Fatal("empty JSON object/array lost", got, err)
		}
	}
}
