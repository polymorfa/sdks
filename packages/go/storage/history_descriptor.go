package storage

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"unicode/utf8"
)

func descriptorText(v any, min, max int) bool {
	s, ok := v.(string)
	return ok && utf8.RuneCountInString(s) >= min && utf8.RuneCountInString(s) <= max
}
func descriptorIDs(v any) bool {
	m, ok := v.(map[string]any)
	if !ok || len(m) == 0 {
		return false
	}
	for k, v := range m {
		if (k != "linked_devices" && k != "official_api") || !descriptorText(v, 1, 512) {
			return false
		}
	}
	return true
}
func descriptorNumber(v any) bool {
	n, ok := v.(float64)
	return ok && !math.IsNaN(n) && !math.IsInf(n, 0) && n >= 0 && math.Trunc(n) == n
}

var descriptorDate = regexp.MustCompile(`^([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?Z$`)

func validDescriptorDate(v any) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	m := descriptorDate.FindStringSubmatch(s)
	if m == nil {
		return false
	}
	y, _ := strconv.Atoi(m[1])
	month, _ := strconv.Atoi(m[2])
	d, _ := strconv.Atoi(m[3])
	days := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if y%4 == 0 && (y%100 != 0 || y%400 == 0) {
		days[1] = 29
	}
	return d >= 1 && d <= days[month-1]
}

// The raw stream seam must validate too; typed webhook parsing is optional.
func validateHistoryDescriptor(p map[string]any) error {
	bad := func() error { return storageError("storage_invalid_history_descriptor") }
	if p["delivery"] != "descriptor" || !descriptorIDs(p["whatsapp_ids"]) || !descriptorText(p["syncType"], 1, math.MaxInt) || !descriptorNumber(p["fileLength"]) {
		return bad()
	}
	for _, k := range []string{"whatsapp_id", "original_whatsapp_id"} {
		if v, ok := p[k]; ok && !descriptorText(v, 1, 512) {
			return bad()
		}
	}
	if v, ok := p["original_whatsapp_ids"]; ok && !descriptorIDs(v) {
		return bad()
	}
	for _, k := range []string{"chunkOrder", "progress"} {
		if v, ok := p[k]; ok && (!descriptorNumber(v) || (k == "progress" && v.(float64) > 100)) {
			return bad()
		}
	}
	if v, ok := p["oldestMessageAt"]; ok && !validDescriptorDate(v) {
		return bad()
	}
	if v, ok := p["peerDataRequestSessionId"]; ok && !descriptorText(v, 0, math.MaxInt) {
		return bad()
	}
	m, media := p["media"]
	i, inline := p["inline"]
	if media == inline {
		return bad()
	}
	if media {
		d, ok := m.(map[string]any)
		if !ok || d["type"] != "md-msg-hist" {
			return bad()
		}
		for _, k := range []string{"directPath", "mediaKey", "fileSha256", "fileEncSha256"} {
			if !descriptorText(d[k], 1, math.MaxInt) {
				return bad()
			}
		}
		if v, ok := d["encHandle"]; ok && !descriptorText(v, 0, math.MaxInt) {
			return bad()
		}
	} else {
		d, ok := i.(map[string]any)
		if !ok || d["encoding"] != "zlib-base64-protobuf" || !descriptorText(d["data"], 1, math.MaxInt) {
			return bad()
		}
	}
	return nil
}
func validDescriptorChunk(chunk map[string]any) bool {
	if chunk == nil {
		return false
	}
	b, e := json.Marshal(chunk)
	if e != nil {
		return false
	}
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return false
	}
	for _, k := range []string{"conversations", "statusV3Messages", "pushnames", "pastParticipants", "phoneNumberToLidMappings"} {
		if v, ok := m[k]; ok && v != nil {
			a, ok := v.([]any)
			if !ok {
				return false
			}
			for _, entry := range a {
				if _, ok := entry.(map[string]any); !ok {
					return false
				}
			}
		}
	}
	if v, ok := m["syncType"]; ok && v != nil {
		switch v.(type) {
		case string, float64:
		default:
			return false
		}
	}
	return true
}
