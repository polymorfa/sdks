package storage

import (
	"context"
	"sort"
	"strings"
	"sync"
)

// MemoryAdapter is process-local storage for tests and ephemeral applications.
// It does not provide durability across process restarts.
type MemoryAdapter struct {
	mu   sync.Mutex
	rows map[string]map[string]Row
	max  int
}

func NewMemoryAdapter(maxCommitSize int) (*MemoryAdapter, error) {
	if maxCommitSize < 2 {
		return nil, invalid()
	}
	return &MemoryAdapter{rows: map[string]map[string]Row{}, max: maxCommitSize}, nil
}
func (a *MemoryAdapter) Capabilities() Capabilities { return Capabilities{true, a.max} }
func (a *MemoryAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if _, err := DefinitionOf(entity); err != nil {
		return nil, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	out := map[string]Row{}
	for _, id := range ids {
		if row := a.rows[entity][id]; row != nil {
			out[id] = cloneRow(row)
		}
	}
	return out, nil
}
func (a *MemoryAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	if err := ctx.Err(); err != nil {
		return CommitResult{}, err
	}
	if err := ValidateWrites(writes, a.max); err != nil {
		return CommitResult{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return CommitResult{}, err
	}
	conflicts := []string{}
	for _, w := range writes {
		id := w.ID
		if w.Kind == "put" {
			id = w.Row["_id"].(string)
		}
		existing := a.rows[w.Entity][id]
		rev, ok := revision(existing["_rev"])
		if w.ExpectedRev != nil {
			if !ok || rev != *w.ExpectedRev {
				conflicts = append(conflicts, id)
			}
		} else if w.Kind == "put" && existing != nil {
			conflicts = append(conflicts, id)
		} else if w.Kind == "delete" {
			fenced := false
			session := strings.Split(id, ":")[0]
			for _, f := range writes {
				if f.Kind == "put" && f.Entity == "leases" && f.ExpectedRev != nil && f.Row["_id"] == session {
					rev, ok := revision(f.Row["_rev"])
					if ok && rev == *f.ExpectedRev+1 {
						fenced = true
					}
				}
			}
			if !fenced {
				return CommitResult{}, invalid()
			}
		}
	}
	if len(conflicts) > 0 {
		return CommitResult{false, conflicts}, nil
	}
	for _, w := range writes {
		if a.rows[w.Entity] == nil {
			a.rows[w.Entity] = map[string]Row{}
		}
		if w.Kind == "delete" {
			delete(a.rows[w.Entity], w.ID)
		} else {
			a.rows[w.Entity][w.Row["_id"].(string)] = cloneRow(w.Row)
		}
	}
	return CommitResult{OK: true}, nil
}
func (a *MemoryAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	idx, err := validateQuery(entity, q, 10000)
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	rows := []Row{}
	for _, r := range a.rows[entity] {
		keep := true
		for k, v := range q.Equals {
			if r[k] != v {
				keep = false
			}
		}
		n, ok := number(r[idx.Sort])
		if !ok {
			return nil, invalid()
		}
		for op, v := range q.Range {
			if op == "lt" && n >= v || op == "lte" && n > v || op == "gt" && n <= v || op == "gte" && n < v {
				keep = false
			}
		}
		if q.After != nil {
			cmp := 0
			if n < q.After.Sort {
				cmp = -1
			} else if n > q.After.Sort {
				cmp = 1
			} else {
				cmp = compareText(r["_id"].(string), q.After.ID)
			}
			if q.Order == "desc" {
				if cmp >= 0 {
					keep = false
				}
			} else if cmp <= 0 {
				keep = false
			}
		}
		if keep {
			rows = append(rows, cloneRow(r))
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		a, _ := number(rows[i][idx.Sort])
		b, _ := number(rows[j][idx.Sort])
		cmp := compareText(rows[i]["_id"].(string), rows[j]["_id"].(string))
		if a < b {
			cmp = -1
		} else if a > b {
			cmp = 1
		}
		if q.Order == "desc" {
			return cmp > 0
		}
		return cmp < 0
	})
	if len(rows) > q.Limit {
		rows = rows[:q.Limit]
	}
	return rows, nil
}

func (*MemoryAdapter) String() string               { return "MemoryAdapter[redacted]" }
func (m *MemoryAdapter) GoString() string           { return m.String() }
func (*MemoryAdapter) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
