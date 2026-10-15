package storage

import (
	"bytes"
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const FinalVersion = float64(9007199254740991)

type FieldWrite struct {
	Value   any     `json:"value"`
	Version float64 `json:"version"`
}
type Fields map[string]FieldWrite

// CanonicalJSON matches schema2 ECMAScript key ordering and number spellings.
func CanonicalJSON(value any) (string, error) {
	var b strings.Builder
	var emit func(any) error
	emit = func(value any) error {
		if value == nil {
			b.WriteString("null")
			return nil
		}
		switch v := value.(type) {
		case bool:
			if v {
				b.WriteString("true")
			} else {
				b.WriteString("false")
			}
		case string:
			if !utf8.ValidString(v) {
				return invalid()
			}
			var out bytes.Buffer
			enc := json.NewEncoder(&out)
			enc.SetEscapeHTML(false)
			if err := enc.Encode(v); err != nil {
				return invalid()
			}
			s := strings.TrimSuffix(out.String(), "\n")
			s = strings.ReplaceAll(s, `\u2028`, "\u2028")
			s = strings.ReplaceAll(s, `\u2029`, "\u2029")
			b.WriteString(s)
		case Row:
			return emit(map[string]any(v))
		case map[string]any:
			if v == nil {
				b.WriteString("null")
				return nil
			}
			keys := make([]string, 0, len(v))
			for k := range v {
				if !utf8.ValidString(k) {
					return invalid()
				}
				keys = append(keys, k)
			}
			sort.Slice(keys, func(i, j int) bool { return compareText(keys[i], keys[j]) < 0 })
			b.WriteByte('{')
			for i, k := range keys {
				if i > 0 {
					b.WriteByte(',')
				}
				if err := emit(k); err != nil {
					return err
				}
				b.WriteByte(':')
				if err := emit(v[k]); err != nil {
					return err
				}
			}
			b.WriteByte('}')
		case []any:
			if v == nil {
				b.WriteString("null")
				return nil
			}
			b.WriteByte('[')
			for i, x := range v {
				if i > 0 {
					b.WriteByte(',')
				}
				if err := emit(x); err != nil {
					return err
				}
			}
			b.WriteByte(']')
		default:
			n, ok := number(v)
			if !ok {
				return invalid()
			}
			if n == 0 {
				b.WriteByte('0')
				break
			}
			format := byte('e')
			if math.Abs(n) >= 1e-6 && math.Abs(n) < 1e21 {
				format = 'f'
			}
			s := strconv.FormatFloat(n, format, -1, 64)
			s = strings.Replace(s, "e-0", "e-", 1)
			s = strings.Replace(s, "e+0", "e+", 1)
			b.WriteString(s)
		}
		return nil
	}
	if err := emit(value); err != nil {
		return "", err
	}
	return b.String(), nil
}
func compareText(a, b string) int {
	left, right := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(left) && i < len(right); i++ {
		if left[i] < right[i] {
			return -1
		}
		if left[i] > right[i] {
			return 1
		}
	}
	if len(left) < len(right) {
		return -1
	}
	if len(left) > len(right) {
		return 1
	}
	return 0
}
func CompareValues(a, b any) (int, error) {
	rank := func(v any) int {
		if nullJSON(v) {
			return -1
		}
		switch v.(type) {
		case bool:
			return 0
		case string:
			return 2
		case Row, map[string]any, []any:
			return 3
		default:
			if _, ok := number(v); ok {
				return 1
			}
			return 4
		}
	}
	ra, rb := rank(a), rank(b)
	if ra == 4 || rb == 4 {
		return 0, invalid()
	}
	if ra < rb {
		return -1, nil
	}
	if ra > rb {
		return 1, nil
	}
	switch ra {
	case -1:
		return 0, nil
	case 0:
		if a == b {
			return 0, nil
		}
		if a == false {
			return -1, nil
		}
		return 1, nil
	case 1:
		an, _ := number(a)
		bn, _ := number(b)
		if an < bn {
			return -1, nil
		}
		if an > bn {
			return 1, nil
		}
		return 0, nil
	case 2:
		return compareText(a.(string), b.(string)), nil
	default:
		left, e := CanonicalJSON(a)
		if e != nil {
			return 0, e
		}
		right, e := CanonicalJSON(b)
		if e != nil {
			return 0, e
		}
		return compareText(left, right), nil
	}
}
func cloneRow(row Row) Row {
	if row == nil {
		return nil
	}
	raw, _ := json.Marshal(row)
	var result Row
	json.Unmarshal(raw, &result)
	return result
}
func EmptyRow(entity string, key map[string]any) (Row, error) {
	d, err := DefinitionOf(entity)
	if err != nil {
		return nil, err
	}
	id, err := EncodeKey(entity, key)
	if err != nil {
		return nil, err
	}
	r := Row{"_id": id, "_rev": 0, "_v": map[string]any{}}
	for _, f := range d.Key {
		r[f] = key[f]
	}
	for f := range d.Fields {
		r[f] = nil
	}
	for _, idx := range d.Indexes {
		r[idx.Sort] = 0
	}
	return r, nil
}
func MergeFields(entity string, row Row, fields Fields) (Row, bool, error) {
	d, err := DefinitionOf(entity)
	if err != nil {
		return nil, false, err
	}
	next := cloneRow(row)
	versions, ok := next["_v"].(map[string]any)
	if !ok {
		return nil, false, invalid()
	}
	changed := false
	for f, w := range fields {
		if nullJSON(w.Value) {
			w.Value = nil
		}
		kind, ok := d.Fields[f]
		if !ok || math.IsNaN(w.Version) || math.IsInf(w.Version, 0) {
			return nil, false, invalid()
		}
		count := 0
		if validateJSON(w.Value, 0, &count) != nil {
			return nil, false, invalid()
		}
		if w.Value != nil {
			switch kind {
			case "string":
				if _, ok := w.Value.(string); !ok {
					return nil, false, invalid()
				}
			case "boolean":
				if _, ok := w.Value.(bool); !ok {
					return nil, false, invalid()
				}
			case "number":
				if _, ok := number(w.Value); !ok {
					return nil, false, invalid()
				}
			}
		}
		current, has := versions[f]
		version, _ := number(current)
		cmp, err := CompareValues(w.Value, next[f])
		if err != nil {
			return nil, false, err
		}
		take := !has || w.Version > version || w.Version == version && cmp > 0
		if take && (cmp != 0 || !has || version != w.Version) {
			next[f] = w.Value
			versions[f] = w.Version
			changed = true
		}
	}
	if !changed {
		return row, false, nil
	}
	return cloneRow(next), true, nil
}
func PublicRow(entity string, row Row) (Row, error) {
	d, err := DefinitionOf(entity)
	if err != nil {
		return nil, err
	}
	out := Row{}
	for _, f := range d.Key {
		out[f] = row[f]
	}
	for f := range d.Fields {
		out[f] = row[f]
	}
	return cloneRow(out), nil
}

func nullJSON(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case Row:
		return v == nil
	case map[string]any:
		return v == nil
	case []any:
		return v == nil
	}
	return false
}
