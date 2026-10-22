package storage

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"unicode/utf8"
)

type ProviderOptions struct {
	Namespace    string
	Create       bool
	OwnsClient   bool
	MaxQueryRows int
}

var namespacePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)

func providerOptions(o ProviderOptions) (ProviderOptions, error) {
	if !namespacePattern.MatchString(o.Namespace) {
		return o, invalid()
	}
	if o.MaxQueryRows == 0 {
		o.MaxQueryRows = 100000
	}
	if o.MaxQueryRows < 1 || o.MaxQueryRows > 100000 {
		return o, invalid()
	}
	return o, nil
}
func providerFailure(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return storageError("storage_provider_failed")
}
func providerIDs(ids []string) error {
	for _, id := range ids {
		if id == "" || len(id) > 4096 || !utf8.ValidString(id) {
			return invalid()
		}
	}
	return nil
}
func providerRow(entity string, value any) (Row, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, invalid()
	}
	var row Row
	if json.Unmarshal(raw, &row) != nil || ValidateRow(entity, row) != nil {
		return nil, invalid()
	}
	return row, nil
}
func filterProviderRows(entity string, q Query, rows []Row, bound int) ([]Row, error) {
	idx, err := validateQuery(entity, q, 10000)
	if err != nil {
		return nil, err
	}
	if len(rows) > bound {
		return nil, storageError("storage_query_bound_exceeded")
	}
	out := []Row{}
	seen := map[string]bool{}
	for _, row := range rows {
		if ValidateRow(entity, row) != nil {
			return nil, invalid()
		}
		id := row["_id"].(string)
		if seen[id] {
			return nil, invalid()
		}
		seen[id] = true
		keep := true
		for f, v := range q.Equals {
			if row[f] != v {
				keep = false
			}
		}
		n, ok := number(row[idx.Sort])
		if !ok {
			return nil, invalid()
		}
		for op, v := range q.Range {
			if op == "gt" && n <= v || op == "gte" && n < v || op == "lt" && n >= v || op == "lte" && n > v {
				keep = false
			}
		}
		if q.After != nil {
			cmp := compareText(id, q.After.ID)
			if n < q.After.Sort {
				cmp = -1
			} else if n > q.After.Sort {
				cmp = 1
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
			out = append(out, cloneRow(row))
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, _ := number(out[i][idx.Sort])
		b, _ := number(out[j][idx.Sort])
		cmp := compareText(out[i]["_id"].(string), out[j]["_id"].(string))
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
	if len(out) > q.Limit {
		out = out[:q.Limit]
	}
	return out, nil
}

type conditionalConflict struct{ ids []string }

func (*conditionalConflict) Error() string { return "Customer-owned storage conditional conflict." }
func writeID(w Write) string {
	if w.Kind == "put" {
		return w.Row["_id"].(string)
	}
	return w.ID
}
func writeConflict(w Write, current Row) bool {
	if w.ExpectedRev != nil {
		rev, ok := revision(current["_rev"])
		return !ok || rev != *w.ExpectedRev
	}
	return w.Kind == "put" && current != nil
}
