package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
)

func TestProducerProtoNumberExactBitsAndStrictRows(t *testing.T) {
	raw, err := os.ReadFile("../testdata/numeric-storage/fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Strings []struct {
			Input string
			Bits  *string
		}
	}
	if err = json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	for _, v := range f.Strings {
		n, ok := finite(v.Input)
		var got *string
		if ok {
			s := fmt.Sprintf("%016x", math.Float64bits(n))
			got = &s
		}
		if (got == nil) != (v.Bits == nil) || (got != nil && *got != *v.Bits) {
			t.Errorf("input%q got%v want%v", v.Input, got, v.Bits)
		}
	}
	if _, ok := number("16"); ok {
		t.Fatal("generic string became numeric")
	}
	for _, v := range []any{"16", true, 0, -1, 1.5, 9007199254740992.0, math.Inf(1)} {
		if _, ok := revision(v); ok {
			t.Fatalf("invalid revision%v", v)
		}
	}
}

func TestNumericSQLiteProducerRows(t *testing.T) {
	raw, err := os.ReadFile("../testdata/numeric-storage/fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Histories []struct {
			Name    string
			Chunk   map[string]any
			Rows    map[string][]Row
			Cleanup []struct {
				Operations []Operation
				Rows       map[string][]Row
			}
		}
	}
	if err = json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	for _, h := range f.Histories {
		t.Run(h.Name, func(t *testing.T) {
			e := engineFor(t, sqlAdapterFor(t, SQLite, sqliteDB(t)), EngineOptions{})
			b, err := ReduceHistoryChunk(HistoryInput{SessionID: "numeric", Chunk: h.Chunk, ChunkID: &h.Name})
			if err != nil {
				t.Fatal(err)
			}
			if _, err = e.Apply(context.Background(), b); err != nil {
				t.Fatal(err)
			}
			assertFixtureRows(t, e, h.Rows)
			for i, c := range h.Cleanup {
				if _, err = e.Apply(context.Background(), Batch{SessionID: "numeric", Operations: c.Operations}); err != nil {
					t.Fatal(err)
				}
				id := fmt.Sprint(h.Name, "late", i)
				b.EventID = &id
				if _, err = e.Apply(context.Background(), b); err != nil {
					t.Fatal(err)
				}
				assertFixtureRows(t, e, c.Rows)
			}
		})
	}
}
