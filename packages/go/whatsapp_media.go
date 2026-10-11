package polymorfa

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"io"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const DefaultWhatsAppMediaMaxBytes int64 = 256 * 1024 * 1024

type WhatsAppMediaDescriptor struct {
	MediaKind     string
	URL           string
	DirectPath    string
	MediaKey      []byte
	FileSHA256    []byte
	FileEncSHA256 []byte
	FileLength    *int64
	MimeType      string
	Filename      string
}

func (d WhatsAppMediaDescriptor) String() string   { return "WhatsAppMediaDescriptor[redacted]" }
func (d WhatsAppMediaDescriptor) GoString() string { return d.String() }

type WhatsAppMediaKeys struct {
	IV        []byte
	CipherKey []byte
	MACKey    []byte
}

func (k WhatsAppMediaKeys) String() string   { return "WhatsAppMediaKeys[redacted]" }
func (k WhatsAppMediaKeys) GoString() string { return k.String() }

type WhatsAppMediaDownloadOptions struct {
	MaxBytes   int64
	HTTPClient *http.Client
}
type WhatsAppMediaDownload struct {
	Bytes      []byte
	MediaKind  string
	MimeType   string
	Filename   string
	FileLength *int64
}

func (d WhatsAppMediaDownload) String() string   { return "WhatsAppMediaDownload[redacted]" }
func (d WhatsAppMediaDownload) GoString() string { return d.String() }
func mediaError(code, message string) error {
	return &Error{Kind: ValidationError, Code: code, Message: message}
}

var mediaInfo = map[string]string{"image": "WhatsApp Image Keys", "video": "WhatsApp Video Keys", "audio": "WhatsApp Audio Keys", "document": "WhatsApp Document Keys", "sticker": "WhatsApp Image Keys"}
var mediaMIME = map[string]string{"image": "image/jpeg", "video": "video/mp4", "audio": "audio/ogg", "document": "application/octet-stream", "sticker": "image/webp"}

func DeriveWhatsAppMediaKeys(key []byte, kind string) (WhatsAppMediaKeys, error) {
	info, ok := mediaInfo[kind]
	if len(key) != 32 || !ok {
		return WhatsAppMediaKeys{}, mediaError("media_invalid_descriptor", "Invalid media key or kind.")
	}
	expanded, err := hkdf.Key(sha256.New, key, nil, info, 112)
	if err != nil {
		return WhatsAppMediaKeys{}, mediaError("media_invalid_descriptor", "Could not derive media keys.")
	}
	return WhatsAppMediaKeys{expanded[:16], expanded[16:48], expanded[48:80]}, nil
}
func DecodeWhatsAppMedia(encoded, kind string) (WhatsAppMediaDescriptor, error) {
	d := WhatsAppMediaDescriptor{MediaKind: kind}
	fields, ok := map[string][8]int{"image": {1, 2, 4, 5, 8, 9, 11, 0}, "video": {1, 2, 3, 4, 6, 11, 13, 0}, "audio": {1, 2, 3, 4, 7, 8, 9, 0}, "document": {1, 2, 4, 5, 7, 9, 10, 8}, "sticker": {1, 5, 2, 9, 4, 3, 8, 0}}[kind]
	invalid := func() (WhatsAppMediaDescriptor, error) {
		return WhatsAppMediaDescriptor{}, mediaError("media_invalid_descriptor", "Invalid or truncated media descriptor.")
	}
	if !ok || len(encoded) == 0 || len(encoded) > 1<<20 {
		return invalid()
	}
	normalized := strings.ReplaceAll(strings.ReplaceAll(encoded, "-", "+"), "_", "/")
	bytes, err := base64.StdEncoding.DecodeString(normalized)
	if err != nil {
		bytes, err = base64.RawStdEncoding.DecodeString(normalized)
	}
	if err != nil {
		return invalid()
	}
	for len(bytes) > 0 {
		tag, n := binary.Uvarint(bytes)
		if n <= 0 || tag>>3 == 0 {
			return invalid()
		}
		bytes = bytes[n:]
		field := int(tag >> 3)
		wire := tag & 7
		if wire == 0 {
			value, n := binary.Uvarint(bytes)
			if n <= 0 {
				return invalid()
			}
			bytes = bytes[n:]
			if field == fields[3] {
				if value > 9007199254740991 {
					return invalid()
				}
				v := int64(value)
				d.FileLength = &v
			}
			continue
		}
		if wire == 1 {
			if len(bytes) < 8 {
				return invalid()
			}
			bytes = bytes[8:]
			continue
		}
		if wire == 5 {
			if len(bytes) < 4 {
				return invalid()
			}
			bytes = bytes[4:]
			continue
		}
		if wire != 2 {
			return invalid()
		}
		size, n := binary.Uvarint(bytes)
		if n <= 0 || size > uint64(len(bytes)-n) {
			return invalid()
		}
		value := bytes[n : n+int(size)]
		bytes = bytes[n+int(size):]
		switch field {
		case fields[0], fields[1], fields[6]:
			limit := 8192
			if field == fields[1] {
				limit = 255
			}
			if len(value) > limit || !utf8.Valid(value) {
				return invalid()
			}
			if field == fields[0] {
				d.URL = string(value)
			} else if field == fields[1] {
				d.MimeType = string(value)
			} else {
				d.DirectPath = string(value)
			}
		case fields[4], fields[2], fields[5]:
			if len(value) != 32 {
				return invalid()
			}
			copied := append([]byte(nil), value...)
			if field == fields[4] {
				d.MediaKey = copied
			} else if field == fields[2] {
				d.FileSHA256 = copied
			} else {
				d.FileEncSHA256 = copied
			}
		default:
			if fields[7] != 0 && field == fields[7] {
				if len(value) > 4096 || !utf8.Valid(value) {
					return invalid()
				}
				d.Filename = string(value)
			}
		}
	}
	if len(d.MediaKey) != 32 {
		return invalid()
	}
	return d, nil
}

// DecryptWhatsAppMedia verifies encrypted hash, MAC, CBC padding and plaintext
// hash before returning any bytes. Media keys and content never enter errors.
func DecryptWhatsAppMedia(data []byte, keys WhatsAppMediaKeys, d WhatsAppMediaDescriptor, maxBytes int64) ([]byte, error) {
	if maxBytes == 0 {
		maxBytes = DefaultWhatsAppMediaMaxBytes
	}
	if maxBytes < 1 || maxBytes > 9007199254740991 {
		return nil, configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if len(keys.IV) != 16 || len(keys.CipherKey) != 32 || len(keys.MACKey) != 32 {
		return nil, mediaError("media_invalid_descriptor", "Invalid media keys.")
	}
	if d.FileLength != nil && (*d.FileLength < 0 || *d.FileLength > maxBytes) || int64(len(data)) > maxBytes+26 {
		return nil, mediaError("media_too_large", "Media exceeds the configured limit.")
	}
	if len(data) <= 10 {
		return nil, mediaError("media_too_short", "Encrypted media is too short.")
	}
	if d.FileEncSHA256 != nil {
		hash := sha256.Sum256(data)
		if !hmac.Equal(hash[:], d.FileEncSHA256) {
			return nil, mediaError("media_enc_hash_mismatch", "Encrypted media hash does not match.")
		}
	}
	ciphertext := data[:len(data)-10]
	mac := hmac.New(sha256.New, keys.MACKey)
	mac.Write(keys.IV)
	mac.Write(ciphertext)
	if !hmac.Equal(mac.Sum(nil)[:10], data[len(data)-10:]) {
		return nil, mediaError("media_mac_mismatch", "Media MAC does not match.")
	}
	if len(ciphertext) == 0 || len(ciphertext)%16 != 0 {
		return nil, mediaError("media_invalid_ciphertext", "Ciphertext is not a whole number of blocks.")
	}
	block, _ := aes.NewCipher(keys.CipherKey)
	plaintext := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, keys.IV).CryptBlocks(plaintext, ciphertext)
	padding := int(plaintext[len(plaintext)-1])
	if padding < 1 || padding > 16 {
		return nil, mediaError("media_invalid_padding", "Media padding is invalid.")
	}
	for _, b := range plaintext[len(plaintext)-padding:] {
		if int(b) != padding {
			return nil, mediaError("media_invalid_padding", "Media padding is invalid.")
		}
	}
	plaintext = plaintext[:len(plaintext)-padding]
	if int64(len(plaintext)) > maxBytes {
		return nil, mediaError("media_too_large", "Media exceeds the configured plaintext limit.")
	}
	if d.FileSHA256 != nil {
		hash := sha256.Sum256(plaintext)
		if !hmac.Equal(hash[:], d.FileSHA256) {
			return nil, mediaError("media_hash_mismatch", "Plaintext media hash does not match.")
		}
	}
	return plaintext, nil
}
func IsWhatsAppMediaURL(value string) bool {
	u, err := url.Parse(value)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return u.Scheme == "https" && u.User == nil && u.Port() == "" && (host == "whatsapp.net" || strings.HasSuffix(host, ".whatsapp.net"))
}
func DownloadWhatsAppMedia(ctx context.Context, d WhatsAppMediaDescriptor, o WhatsAppMediaDownloadOptions) (WhatsAppMediaDownload, error) {
	if o.MaxBytes == 0 {
		o.MaxBytes = DefaultWhatsAppMediaMaxBytes
	}
	if o.MaxBytes < 1 || o.MaxBytes > 9007199254740991 {
		return WhatsAppMediaDownload{}, configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if len(d.FileSHA256) != 32 {
		return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "The media descriptor needs fileSha256.")
	}
	keys, err := DeriveWhatsAppMediaKeys(d.MediaKey, d.MediaKind)
	if err != nil {
		return WhatsAppMediaDownload{}, err
	}
	urls := []string{}
	if d.URL != "" {
		if !IsWhatsAppMediaURL(d.URL) {
			return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "Media URL must be an HTTPS WhatsApp media host.")
		}
		urls = append(urls, d.URL)
	}
	if d.DirectPath != "" {
		if !strings.HasPrefix(d.DirectPath, "/") || strings.HasPrefix(d.DirectPath, "//") {
			return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "directPath must start with a single slash.")
		}
		kind := d.MediaKind
		if kind == "sticker" {
			kind = "image"
		}
		fallback := "https://mmg.whatsapp.net" + d.DirectPath
		separator := "?"
		if strings.Contains(fallback, "?") {
			separator = "&"
		}
		fallback += separator + "hash=" + url.QueryEscape(base64.URLEncoding.EncodeToString(d.FileEncSHA256)) + "&mms-type=" + kind + "&__wa-mms="
		if !IsWhatsAppMediaURL(fallback) {
			return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "Invalid media fallback URL.")
		}
		if fallback != d.URL {
			urls = append(urls, fallback)
		}
	}
	if len(urls) == 0 {
		return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "Descriptor needs URL or directPath.")
	}
	hc := http.DefaultClient
	if o.HTTPClient != nil {
		hc = o.HTTPClient
	}
	client := *hc
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	for _, candidate := range urls {
		current := candidate
		for hop := 0; hop <= 3; hop++ {
			req, err := http.NewRequestWithContext(ctx, "GET", current, nil)
			if err != nil {
				break
			}
			req.Header.Set("Origin", "https://web.whatsapp.com")
			req.Header.Set("Referer", "https://web.whatsapp.com/")
			resp, err := client.Do(req)
			if err != nil {
				if ctx.Err() != nil {
					return WhatsAppMediaDownload{}, contextError(ctx, ctx.Err())
				}
				break
			}
			if resp.StatusCode == 301 || resp.StatusCode == 302 || resp.StatusCode == 303 || resp.StatusCode == 307 || resp.StatusCode == 308 {
				location, err := resp.Location()
				resp.Body.Close()
				if err != nil || !IsWhatsAppMediaURL(location.String()) {
					return WhatsAppMediaDownload{}, mediaError("media_invalid_descriptor", "Media redirected outside WhatsApp media hosts.")
				}
				current = location.String()
				continue
			}
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				resp.Body.Close()
				break
			}
			encrypted, err := io.ReadAll(io.LimitReader(resp.Body, o.MaxBytes+27))
			resp.Body.Close()
			if err != nil {
				return WhatsAppMediaDownload{}, &Error{Kind: ConnectionError, Message: "Media body could not be read."}
			}
			plaintext, err := DecryptWhatsAppMedia(encrypted, keys, d, o.MaxBytes)
			if err != nil {
				return WhatsAppMediaDownload{}, err
			}
			mime := d.MimeType
			if mime == "" {
				mime = mediaMIME[d.MediaKind]
			}
			return WhatsAppMediaDownload{plaintext, d.MediaKind, mime, d.Filename, d.FileLength}, nil
		}
	}
	return WhatsAppMediaDownload{}, &Error{Kind: ConnectionError, Code: "connection_error", Message: "WhatsApp media could not be downloaded."}
}
func (r *MessagingMedia) DownloadFromWhatsApp(ctx context.Context, d WhatsAppMediaDescriptor, o WhatsAppMediaDownloadOptions) (WhatsAppMediaDownload, error) {
	return DownloadWhatsAppMedia(ctx, d, o)
}
func MediaDescriptorFromEvent(e WebhookEvent) (WhatsAppMediaDescriptor, error) {
	p, err := DecodeWebhookPayload[struct {
		Type  string `json:"type"`
		Media string `json:"media"`
	}](e)
	if err != nil {
		return WhatsAppMediaDescriptor{}, mediaError("media_invalid_descriptor", "Invalid media webhook payload.")
	}
	return DecodeWhatsAppMedia(p.Media, p.Type)
}
