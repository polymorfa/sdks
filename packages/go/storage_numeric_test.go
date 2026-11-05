package polymorfa_test

import (
	"context"
	"encoding/json"
	"fmt"
	s "github.com/polymorfa/sdks/packages/go/storage"
	"math"
	"os"
	"testing"
)

func TestNumericStoragePublicProducerParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/numeric-storage/fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Strings []struct {
			Input string
			Bits  *string
		}
		Histories []struct {
			Name       string
			Chunk      map[string]any
			Operations []s.Operation
			Rows       map[string][]s.Row
			Cleanup    []struct {
				Operations []s.Operation
				Rows       map[string][]s.Row
			}
		}
	}
	if err = json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	for _, v := range f.Strings {
		b, err := s.ReduceHistoryChunk(s.HistoryInput{SessionID: "numeric", Chunk: map[string]any{"syncType": 3.0, "chunkOrder": 16.0, "progress": v.Input}})
		if err != nil {
			t.Fatal(err)
		}
		var got *string
		for _, op := range b.Operations {
			if op.Entity == "history_progress" {
				if w, ok := op.Fields["progress"]; ok {
					bits := fmt.Sprintf("%016x", math.Float64bits(w.Value.(float64)))
					got = &bits
				}
			}
		}
		if (got == nil) != (v.Bits == nil) || (got != nil && *got != *v.Bits) {
			t.Fatalf("public input%q got%v want%v", v.Input, got, v.Bits)
		}
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
	assertRows := func(e *s.Engine, expected map[string][]s.Row) {
		t.Helper()
		for entity, rows := range expected {
			d, _ := s.DefinitionOf(entity)
			for _, want := range rows {
				key := map[string]any{}
				for _, k := range d.Key {
					key[k] = want[k]
				}
				got, err := e.Get(context.Background(), entity, key)
				if err != nil {
					t.Fatal(err)
				}
				a := canonical(got)
				b := canonical(want)
				if a != b {
					t.Fatalf("%s got%s want%s", entity, a, b)
				}
			}
		}
	}
	for _, h := range f.Histories {
		a, _ := s.NewMemoryAdapter(1000)
		e, _ := s.NewEngine(a, s.EngineOptions{})
		id := h.Name
		b, err := s.ReduceHistoryChunk(s.HistoryInput{SessionID: "numeric", Chunk: h.Chunk, ChunkID: &id})
		if err != nil {
			t.Fatal(err)
		}
		actual := canonical(b.Operations)
		expected := canonical(h.Operations)
		if actual != expected {
			t.Fatalf("operations %s\ngot%s\nwant%s", h.Name, actual, expected)
		}
		if _, err = e.Apply(context.Background(), b); err != nil {
			t.Fatal(err)
		}
		assertRows(e, h.Rows)
		result, err := e.Apply(context.Background(), b)
		if err != nil || result.Applied {
			t.Fatal("replay", err)
		}
		for i, c := range h.Cleanup {
			if _, err = e.Apply(context.Background(), s.Batch{SessionID: "numeric", Operations: c.Operations}); err != nil {
				t.Fatal(err)
			}
			id = fmt.Sprint(h.Name, "late", i)
			b.EventID = &id
			if _, err = e.Apply(context.Background(), b); err != nil {
				t.Fatal(err)
			}
			assertRows(e, c.Rows)
		}
	}
}
