package storage

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

const SelfID = "self"

var contentFields = []string{"text", "caption", "mimeType", "fileName", "latitude", "longitude", "displayName", "title", "pollOptions", "extra"}
var mediaSecrets = []string{"mediaKey", "descriptor", "directPath", "downloadUrl", "fileSha256", "fileEncSha256"}
var statusRank = map[string]float64{"pending": 1, "failed": 2, "sent": 3, "delivered": 4, "read": 5, "played": 6}
var StoredEventTypes = []string{"blocklist.update", "chat.archive", "chat.clear", "chat.delete", "chat.mute", "chat.read", "contact.update", "group.participant", "group.update", "history.sync", "labels.update", "message.ack", "message.delete", "message.edited", "message.reaction", "message.received", "message.revoked", "message.sent", "message.update", "message.vote", "newsletter.update", "session.connected", "session.logged_out", "session.status"}

func object(v any) map[string]any {
	if x, ok := v.(map[string]any); ok {
		return x
	}
	if x, ok := v.(Row); ok {
		return map[string]any(x)
	}
	return map[string]any{}
}
func list(v any) []any {
	if x, ok := v.([]any); ok {
		return x
	}
	return nil
}
func text(v any) string { x, _ := v.(string); return x }
func nonempty(v any) any {
	if s := text(v); s != "" {
		return s
	}
	return nil
}
func first(values ...any) any {
	for _, v := range values {
		if v != nil {
			return v
		}
	}
	return nil
}
func finite(v any) (float64, bool) {
	if s, ok := v.(string); ok {
		n, err := strconv.ParseFloat(s, 64)
		return n, err == nil && !math.IsNaN(n) && !math.IsInf(n, 0)
	}
	return number(v)
}
func ToMillis(v any) *float64 {
	n, ok := finite(v)
	if !ok || n <= 0 {
		return nil
	}
	if n < 1e11 {
		n *= 1000
	}
	n = math.Floor(n + 0.5)
	return &n
}
func isoMillis(v string) float64 {
	t, err := time.Parse(time.RFC3339Nano, v)
	if err != nil {
		return 0
	}
	return float64(t.UnixMilli())
}
func valueMillis(v any) any {
	n := ToMillis(v)
	if n == nil {
		return nil
	}
	return *n
}
func put(f Fields, key string, v any, version float64) { f[key] = FieldWrite{v, version} }
func putIf(f Fields, key string, v any, version float64) {
	if v != nil {
		put(f, key, v, version)
	}
}
func from(f Fields, p map[string]any, target, source string, version float64) {
	if v, ok := p[source]; ok {
		put(f, target, v, version)
	}
}
func stringsFrom(f Fields, p map[string]any, names []string, version float64) {
	for _, name := range names {
		putIf(f, name, nonempty(p[name]), version)
	}
}
func rowOperation(entity, session string, key map[string]any, fields Fields, guard *Watermark) Operation {
	k := map[string]any{"sessionId": session}
	for f, v := range key {
		k[f] = v
	}
	return Operation{Kind: "upsert", Entity: entity, Key: k, Fields: fields, Guard: guard}
}
func cleared(names []string) Fields {
	f := Fields{}
	for _, n := range names {
		put(f, n, nil, FinalVersion)
	}
	return f
}
func statusFields(fields Fields, status string, at *float64) {
	rank, ok := statusRank[status]
	if !ok {
		return
	}
	put(fields, "status", status, rank)
	if at != nil {
		put(fields, "statusAt", *at, rank)
	}
}
func AckStatus(kind string) string {
	switch strings.ToLower(kind) {
	case "pending":
		return "pending"
	case "error", "failed":
		return "failed"
	case "sent", "server", "server_ack":
		return "sent"
	case "delivered", "delivery", "delivery_ack":
		return "delivered"
	case "read", "read-self", "read_self":
		return "read"
	case "played", "played-self":
		return "played"
	}
	return ""
}
func chatKind(jid string, group *bool) string {
	if group != nil && *group {
		return "group"
	}
	switch {
	case strings.HasSuffix(jid, "@g.us"):
		return "group"
	case strings.HasSuffix(jid, "@newsletter"):
		return "channel"
	case strings.HasSuffix(jid, "@broadcast"):
		return "broadcast"
	case strings.HasSuffix(jid, "@s.whatsapp.net"), strings.HasSuffix(jid, "@lid"), strings.HasSuffix(jid, "@c.us"):
		return "direct"
	}
	if group != nil && !*group {
		return "direct"
	}
	return ""
}
func jsonValue(v any) any {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var out any
	if json.Unmarshal(raw, &out) != nil {
		return nil
	}
	return out
}
func cloneFields(fields Fields) Fields {
	copy := Fields{}
	for k, v := range fields {
		copy[k] = FieldWrite{jsonValue(v.Value), v.Version}
	}
	return copy
}
