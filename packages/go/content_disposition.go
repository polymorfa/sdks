package polymorfa

import (
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

// ParseContentDispositionFilename returns a sanitized display name, never a path.
// The first filename* parameter takes precedence when its encoding is valid.
func ParseContentDispositionFilename(header string) string {
	if len(header) > 8192 {
		return ""
	}
	params := map[string]string{}
	index := strings.IndexByte(header, ';')
	for index >= 0 && index < len(header) {
		index++
		for index < len(header) && (header[index] == ' ' || header[index] == '\t') {
			index++
		}
		eq := strings.IndexByte(header[index:], '=')
		if eq < 0 {
			break
		}
		eq += index
		name := strings.ToLower(strings.TrimSpace(header[index:eq]))
		index = eq + 1
		for index < len(header) && (header[index] == ' ' || header[index] == '\t') {
			index++
		}
		value := ""
		if index < len(header) && header[index] == '"' {
			index++
			var b strings.Builder
			for index < len(header) && header[index] != '"' {
				if header[index] == '\\' && index+1 < len(header) {
					index++
				}
				b.WriteByte(header[index])
				index++
			}
			value = b.String()
			next := strings.IndexByte(header[index:], ';')
			if next < 0 {
				index = -1
			} else {
				index += next
			}
		} else {
			end := strings.IndexByte(header[index:], ';')
			if end < 0 {
				value = strings.TrimSpace(header[index:])
				index = -1
			} else {
				value = strings.TrimSpace(header[index : index+end])
				index += end
			}
		}
		if name != "" {
			if _, exists := params[name]; !exists {
				params[name] = value
			}
		}
	}
	if extended, ok := params["filename*"]; ok {
		if decoded, valid := decodeExtendedFilename(extended); valid {
			return sanitizeFilename(decoded)
		}
	}
	return sanitizeFilename(params["filename"])
}
func decodeExtendedFilename(value string) (string, bool) {
	parts := strings.SplitN(value, "'", 3)
	if len(parts) != 3 {
		return "", false
	}
	charset := strings.ToLower(parts[0])
	if charset != "utf-8" && charset != "iso-8859-1" {
		return "", false
	}
	encoded := parts[2]
	for i := 0; i < len(encoded); i++ {
		b := encoded[i]
		if b == '%' {
			if i+2 >= len(encoded) {
				return "", false
			}
			i += 2
			continue
		}
		if !(b >= 'A' && b <= 'Z' || b >= 'a' && b <= 'z' || b >= '0' && b <= '9' || strings.ContainsRune("!#$&+.^_`|~-", rune(b))) {
			return "", false
		}
	}
	decoded, err := url.PathUnescape(encoded)
	if err != nil {
		return "", false
	}
	if charset == "utf-8" {
		return decoded, utf8.ValidString(decoded)
	}
	var b strings.Builder
	for _, c := range []byte(decoded) {
		b.WriteRune(rune(c))
	}
	return b.String(), true
}
func sanitizeFilename(value string) string {
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == '/' || r == '\\' }) // preserve an empty final path segment
	index := strings.LastIndexAny(value, "/\\")
	if index >= 0 {
		value = value[index+1:]
	} else if len(parts) == 0 {
		value = ""
	}
	value = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, value))
	if value == "." || value == ".." {
		return ""
	}
	return value
}
func GraphTransportHeaders(transport MessageTransport) http.Header {
	return http.Header{"X-Polymorfa-Transport": []string{string(transport)}}
}
