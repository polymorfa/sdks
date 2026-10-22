package polymorfa_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	polymorfa "github.com/polymorfa/sdks/packages/go"
	s "github.com/polymorfa/sdks/packages/go/storage"
)

// Historical MESSAGE_EDIT upserts must honor chat.clear/chat.delete watermarks
// exactly as the TypeScript producer does (testdata/history-edit-guard).
func TestHistoryEditGuardPublicProducerParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/history-edit-guard/fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name  string
			Steps []struct {
				History *struct {
					SessionID string         `json:"sessionId"`
					ChunkID   string         `json:"chunkId"`
					Chunk     map[string]any `json:"chunk"`
				}
				Event      *polymorfa.WebhookEvent
				Operations json.RawMessage
				Applied    bool
			}
			Expect []struct {
				Entity string
				Key    map[string]any
				Text   *string
			}
			Rows map[string][]s.Row
		}
	}
	if err = json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) != 13 {
		t.Fatalf("cases %d", len(f.Cases))
	}
	canonical := func(v any) string {
		t.Helper()
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		var data any
		if err = json.Unmarshal(raw, &data); err != nil {
			t.Fatal(err)
		}
		out, err := s.CanonicalJSON(data)
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	show := func(v *string) string {
		if v == nil {
			return "absent"
		}
		return *v
	}
	ctx := context.Background()
	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			a, _ := s.NewMemoryAdapter(1000)
			e, _ := s.NewEngine(a, s.EngineOptions{})
			var mismatches []string
			for i, step := range c.Steps {
				var b s.Batch
				var err error
				if step.History != nil {
					id := step.History.ChunkID
					b, err = s.ReduceHistoryChunk(s.HistoryInput{SessionID: step.History.SessionID, Chunk: step.History.Chunk, ChunkID: &id})
				} else {
					b, err = s.ReduceEvent(*step.Event)
				}
				if err != nil {
					t.Fatal(err)
				}
				var want any
				if err = json.Unmarshal(step.Operations, &want); err != nil {
					t.Fatal(err)
				}
				if got, exp := canonical(b.Operations), canonical(want); got != exp {
					mismatches = append(mismatches, fmt.Sprintf("step %d operations\ngot%s\nwant%s", i, got, exp))
				}
				result, err := e.Apply(ctx, b)
				if err != nil {
					t.Fatal(err)
				}
				if result.Applied != step.Applied {
					t.Fatalf("step %d applied %v", i, result.Applied)
				}
			}
			for _, x := range c.Expect {
				row, err := e.Get(ctx, x.Entity, x.Key)
				if err != nil {
					t.Fatal(err)
				}
				var got *string
				if row != nil {
					if v, ok := row["text"].(string); ok {
						got = &v
					}
				}
				if (got == nil) != (x.Text == nil) || (got != nil && *got != *x.Text) {
					t.Fatalf("text got %s want %s", show(got), show(x.Text))
				}
			}
			if len(mismatches) > 0 {
				t.Fatal(mismatches[0])
			}
			for entity, rows := range c.Rows {
				d, _ := s.DefinitionOf(entity)
				for _, want := range rows {
					key := map[string]any{}
					for _, k := range d.Key {
						key[k] = want[k]
					}
					got, err := e.Get(ctx, entity, key)
					if err != nil {
						t.Fatal(err)
					}
					if a, b := canonical(got), canonical(want); a != b {
						t.Fatalf("%s got%s want%s", entity, a, b)
					}
				}
			}
		})
	}
}
