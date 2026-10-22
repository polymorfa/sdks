// Package storage implements customer-owned schema2 storage boundaries.
// Database adapters persist rows; shared merge/reducer/lease planning belongs
// above this interface. No Polymorfa API credential or Signal core key is used.
package storage

import (
	_ "embed"
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

const SchemaVersion = 2
const SourceSDKCommit = "3bacf46f9c4213426314001586f5bae43aaa77de"
const D1BridgeSourceCommit = "9ae35e671f7f4868a67c1562422c5af9284b95c1"

//go:embed schema2.json
var schemaBytes []byte
var schema map[string]Definition

func init() {
	if json.Unmarshal(schemaBytes, &schema) != nil {
		panic("Invalid bundled storage schema.")
	}
}

type Index struct {
	Name   string   `json:"name"`
	Equals []string `json:"equals"`
	Sort   string   `json:"sort"`
}
type Definition struct {
	Name    string            `json:"name"`
	Key     []string          `json:"key"`
	Fields  map[string]string `json:"fields"`
	Indexes []Index           `json:"indexes"`
}
type Row map[string]any
type Write struct {
	Kind        string `json:"kind"`
	Entity      string `json:"entity"`
	Row         Row    `json:"row,omitempty"`
	ID          string `json:"id,omitempty"`
	ExpectedRev *int64 `json:"expectedRev"`
}

// A put always serializes expectedRev (null means absent); a delete can omit it.
func (w Write) MarshalJSON() ([]byte, error) {
	type plain Write
	if w.Kind == "delete" && w.ExpectedRev == nil {
		return json.Marshal(struct {
			Kind   string `json:"kind"`
			Entity string `json:"entity"`
			ID     string `json:"id"`
		}{w.Kind, w.Entity, w.ID})
	}
	return json.Marshal(plain(w))
}

type Cursor struct {
	Sort float64 `json:"sort"`
	ID   string  `json:"id"`
}
type Query struct {
	Index  string             `json:"index"`
	Equals map[string]string  `json:"equals"`
	Range  map[string]float64 `json:"range,omitempty"`
	Order  string             `json:"order,omitempty"`
	Limit  int                `json:"limit"`
	After  *Cursor            `json:"after,omitempty"`
}
type CommitResult struct {
	OK        bool     `json:"ok"`
	Conflicts []string `json:"conflicts,omitempty"`
}
type Capabilities struct {
	AtomicCommit  bool
	MaxCommitSize int
}
type Error struct{ Code string }

func (e *Error) Error() string { return "Customer-owned storage operation failed (" + e.Code + ")." }
func invalid() error           { return &Error{Code: "invalid_storage_data"} }
func DefinitionOf(entity string) (Definition, error) {
	v, ok := schema[entity]
	if !ok {
		return Definition{}, invalid()
	}
	data, _ := json.Marshal(v)
	var copy Definition
	json.Unmarshal(data, &copy)
	return copy, nil
}
func EncodeKey(entity string, key map[string]any) (string, error) {
	d, ok := schema[entity]
	if !ok {
		return "", invalid()
	}
	parts := []string{}
	const hex = "0123456789ABCDEF"
	for _, name := range d.Key {
		value, ok := key[name].(string)
		if !ok || value == "" || len(value) > 4096 || !utf8.ValidString(value) {
			return "", invalid()
		}
		var encoded strings.Builder
		for _, b := range []byte(value) {
			if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || strings.ContainsRune("-_!~*'()", rune(b)) {
				encoded.WriteByte(b)
			} else {
				encoded.WriteByte('%')
				encoded.WriteByte(hex[b>>4])
				encoded.WriteByte(hex[b&15])
			}
		}
		parts = append(parts, encoded.String())
	}
	return "k" + strings.Join(parts, ":"), nil
}
func number(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, !math.IsNaN(v) && !math.IsInf(v, 0)
	case int:
		return float64(v), true
	case int64:
		return float64(v), v >= -9007199254740991 && v <= 9007199254740991
	case uint32:
		return float64(v), true
	case json.Number:
		n, e := v.Float64()
		return n, e == nil && !math.IsNaN(n) && !math.IsInf(n, 0)
	}
	return 0, false
}
func revision(value any) (int64, bool) {
	n, ok := number(value)
	return int64(n), ok && n >= 1 && n <= 9007199254740991 && math.Trunc(n) == n
}
func validateJSON(value any, depth int, count *int) error {
	*count++
	if depth > 64 || *count > 200000 {
		return invalid()
	}
	switch v := value.(type) {
	case nil, bool:
	case string:
		if !utf8.ValidString(v) {
			return invalid()
		}
	case float64, int, int64, uint32, json.Number:
		if _, ok := number(v); !ok {
			return invalid()
		}
	case map[string]any:
		for key, item := range v {
			if !utf8.ValidString(key) {
				return invalid()
			}
			if err := validateJSON(item, depth+1, count); err != nil {
				return err
			}
		}
	case []any:
		for _, item := range v {
			if err := validateJSON(item, depth+1, count); err != nil {
				return err
			}
		}
	default:
		return invalid()
	}
	return nil
}
func ValidateRow(entity string, row Row) error {
	d, ok := schema[entity]
	if !ok {
		return invalid()
	}
	key, err := EncodeKey(entity, row)
	if err != nil || row["_id"] != key {
		return invalid()
	}
	if _, ok := revision(row["_rev"]); !ok {
		return invalid()
	}
	versions, ok := row["_v"].(map[string]any)
	if !ok {
		return invalid()
	}
	allowed := map[string]bool{"_id": true, "_rev": true, "_v": true}
	for _, key := range d.Key {
		allowed[key] = true
	}
	for field, kind := range d.Fields {
		allowed[field] = true
		v := row[field]
		if v == nil {
			continue
		}
		switch kind {
		case "string":
			if _, ok := v.(string); !ok {
				return invalid()
			}
		case "number":
			if _, ok := number(v); !ok {
				return invalid()
			}
		case "boolean":
			if _, ok := v.(bool); !ok {
				return invalid()
			}
		}
	}
	for field, version := range versions {
		if _, ok := d.Fields[field]; !ok {
			return invalid()
		}
		if _, ok := number(version); !ok {
			return invalid()
		}
	}
	for field := range row {
		if !allowed[field] {
			return invalid()
		}
	}
	count := 0
	return validateJSON(map[string]any(row), 0, &count)
}
func ValidateWrites(writes []Write, max int) error {
	if len(writes) > max {
		return invalid()
	}
	seen := map[string]bool{}
	for _, w := range writes {
		if _, ok := schema[w.Entity]; !ok {
			return invalid()
		}
		id := w.ID
		if w.Kind == "put" {
			if w.ID != "" || ValidateRow(w.Entity, w.Row) != nil {
				return invalid()
			}
			id = w.Row["_id"].(string)
		} else if w.Kind != "delete" || w.Row != nil || id == "" || len(id) > 4096 || !utf8.ValidString(id) {
			return invalid()
		}
		if w.ExpectedRev != nil && (*w.ExpectedRev < 1 || *w.ExpectedRev > 9007199254740991) {
			return invalid()
		}
		slot := w.Entity + ":" + id
		if seen[slot] {
			return invalid()
		}
		seen[slot] = true
	}
	return nil
}
func validateQuery(entity string, q Query, max int) (Index, error) {
	d, ok := schema[entity]
	if !ok {
		return Index{}, invalid()
	}
	var idx *Index
	for _, index := range d.Indexes {
		if index.Name == q.Index {
			copy := index
			idx = &copy
			break
		}
	}
	if idx == nil || q.Limit < 0 || q.Limit > max || (q.Order != "" && q.Order != "asc" && q.Order != "desc") || len(q.Equals) != len(idx.Equals) {
		return Index{}, invalid()
	}
	for _, field := range idx.Equals {
		if q.Equals[field] == "" || len(q.Equals[field]) > 4096 || !utf8.ValidString(q.Equals[field]) {
			return Index{}, invalid()
		}
	}
	for field, value := range q.Range {
		if field != "gt" && field != "gte" && field != "lt" && field != "lte" || math.IsNaN(value) || math.IsInf(value, 0) {
			return Index{}, invalid()
		}
	}
	if q.After != nil && (q.After.ID == "" || !utf8.ValidString(q.After.ID) || math.IsNaN(q.After.Sort) || math.IsInf(q.After.Sort, 0)) {
		return Index{}, invalid()
	}
	return *idx, nil
}

var authorityPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.:-]{0,127}$`)
var prefixPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)
