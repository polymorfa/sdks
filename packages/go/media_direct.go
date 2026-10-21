package polymorfa

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/url"
	"strconv"
	"time"
)

const CustomerOwnedAPIVersion = "2026-10-14"

// These held routes have no replay ledger. Caller keys cannot authorize retries.
func customerOwnedOptions(options RequestOptions) RequestOptions {
	if options.APIVersion == "" {
		options.APIVersion = CustomerOwnedAPIVersion
	}
	return noRetry(options)
}

// singleSubmission also prevents net/http from replaying a keyed JSON body on
// a reused connection. Only the four unledgered API operations use this marker.
type singleSubmission struct{ body any }

// binaryRequest is internal: ordinary request bodies retain JSON serialization.
type binaryRequest struct {
	open   func(context.Context) (io.ReadCloser, error)
	length int64
}

type WhatsAppUploadGrant struct {
	Host      string
	UploadURL string `json:"-"`
	ExpiresAt time.Time
}

func (grant WhatsAppUploadGrant) String() string   { return "WhatsAppUploadGrant[redacted]" }
func (grant WhatsAppUploadGrant) GoString() string { return grant.String() }

type WhatsAppUploadLocation struct {
	DirectPath string `json:"-"`
	URL        string `json:"-"`
	Handle     string `json:"-"`
}

func (location WhatsAppUploadLocation) String() string   { return "WhatsAppUploadLocation[redacted]" }
func (location WhatsAppUploadLocation) GoString() string { return location.String() }

type WhatsAppMediaResource struct{ t *transport }

func (client *MessagingClient) WhatsAppMedia() *WhatsAppMediaResource {
	return &WhatsAppMediaResource{client.t}
}
func uploadKind(kind UploadMediaType) (string, *bool, error) {
	if !validUploadType(kind) {
		return "", nil, configuration("mediaType", "Unsupported upload media type.")
	}
	if kind == UploadDocument {
		return "file", nil, nil
	}
	if kind == UploadAudio || kind == UploadVoiceNote {
		voiceNote := kind == UploadVoiceNote
		return "voice", &voiceNote, nil
	}
	return string(kind), nil, nil
}
func uploadHash(hash []byte) (string, error) {
	if len(hash) != 32 {
		return "", mediaError("media_invalid_descriptor", "The encrypted media hash must be 32 bytes.")
	}
	return base64.RawURLEncoding.EncodeToString(hash), nil
}
func unwrapUpload(value json.RawMessage) (map[string]json.RawMessage, error) {
	var record map[string]json.RawMessage
	if json.Unmarshal(value, &record) != nil || record == nil {
		return nil, uploadResponseError("The API returned an invalid upload result.")
	}
	if inner, ok := record["data"]; ok {
		if json.Unmarshal(inner, &record) != nil || record == nil {
			return nil, uploadResponseError("The API returned an invalid upload result.")
		}
	}
	return record, nil
}
func (r *WhatsAppMediaResource) CreateUploadGrant(ctx context.Context, session string, kind UploadMediaType, encryptedHash []byte, options ...RequestOptions) (WhatsAppUploadGrant, error) {
	if err := serverOnly(r.t); err != nil {
		return WhatsAppUploadGrant{}, err
	}
	if session == "" {
		return WhatsAppUploadGrant{}, configuration("session", "A session is required.")
	}
	mediaType, ptt, err := uploadKind(kind)
	if err != nil {
		return WhatsAppUploadGrant{}, err
	}
	hash, err := uploadHash(encryptedHash)
	if err != nil {
		return WhatsAppUploadGrant{}, err
	}
	body := struct {
		Type          string `json:"type"`
		FileEncSHA256 string `json:"fileEncSha256"`
		PTT           *bool  `json:"ptt,omitempty"`
	}{mediaType, hash, ptt}
	result, err := request[json.RawMessage](ctx, r.t, "POST", "/messaging/"+escaped(session)+"/media/upload-grants", nil, singleSubmission{body}, noRetry(deliveryOptions(optionsOrDefault(options), true)))
	if err != nil {
		return WhatsAppUploadGrant{}, err
	}
	record, err := unwrapUpload(result.Data)
	if err != nil {
		return WhatsAppUploadGrant{}, err
	}
	var grant WhatsAppUploadGrant
	var expiry int64
	if json.Unmarshal(record["host"], &grant.Host) != nil || json.Unmarshal(record["uploadUrl"], &grant.UploadURL) != nil || json.Unmarshal(record["expiresAt"], &expiry) != nil {
		return grant, uploadResponseError("The API returned an invalid upload grant.")
	}
	approved, err := url.Parse(grant.UploadURL)
	if err != nil || !IsWhatsAppMediaURL(grant.UploadURL) || approved.Fragment != "" || approved.Hostname() != grant.Host || approved.Query().Get("auth") == "" || expiry < 1 || expiry > 8640000000000 {
		return WhatsAppUploadGrant{}, uploadResponseError("The API returned an invalid upload grant.")
	}
	grant.ExpiresAt = time.Unix(expiry, 0)
	return grant, nil
}
func optionsOrDefault(values []RequestOptions) RequestOptions { return options(values) }
func (r *WhatsAppMediaResource) RelayUpload(ctx context.Context, session string, info EncryptedMediaInfo, open func(context.Context) (io.ReadCloser, error), opts ...RequestOptions) (WhatsAppUploadLocation, error) {
	kind, ptt, err := uploadKind(info.MediaType)
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	hash, err := uploadHash(info.FileEncSHA256)
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	if session == "" || open == nil || info.EncryptedLength < 26 || info.EncryptedLength > 9007199254740991 {
		return WhatsAppUploadLocation{}, configuration("upload", "A session, encrypted body and valid length are required.")
	}
	query := url.Values{"type": {kind}, "fileEncSha256": {hash}}
	if ptt != nil {
		query.Set("ptt", strconv.FormatBool(*ptt))
	}
	resp, err := request[json.RawMessage](ctx, r.t, "POST", "/messaging/"+escaped(session)+"/media/uploads", query, singleSubmission{&binaryRequest{open, info.EncryptedLength}}, noRetry(deliveryOptions(optionsOrDefault(opts), true)))
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	record, err := unwrapUpload(resp.Data)
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	var location WhatsAppUploadLocation
	if json.Unmarshal(record["directPath"], &location.DirectPath) != nil || json.Unmarshal(record["url"], &location.URL) != nil || location.DirectPath == "" || location.URL == "" {
		return location, uploadResponseError("The API returned an invalid upload location.")
	}
	json.Unmarshal(record["handle"], &location.Handle)
	return location, nil
}
func directLocation(value []byte) (WhatsAppUploadLocation, error) {
	var body struct {
		DirectPath string `json:"direct_path"`
		URL        string `json:"url"`
		Handle     string `json:"handle"`
	}
	if json.Unmarshal(value, &body) != nil || body.DirectPath == "" || body.URL == "" {
		return WhatsAppUploadLocation{}, uploadResponseError("The media host returned an invalid upload location.")
	}
	return WhatsAppUploadLocation{body.DirectPath, body.URL, body.Handle}, nil
}
func directUploadURL(grant WhatsAppUploadGrant, info EncryptedMediaInfo, query url.Values) (string, error) {
	hash, err := uploadHash(info.FileEncSHA256)
	if err != nil {
		return "", err
	}
	path := "/mms/" + string(info.MediaType) + "/" + hash
	approved, err := url.Parse(grant.UploadURL)
	if err != nil || !IsWhatsAppMediaURL(grant.UploadURL) || approved.Fragment != "" || approved.Hostname() != grant.Host || approved.Path != path {
		return "", uploadResponseError("The upload grant does not match the encrypted media.")
	}
	values := approved.Query()
	for name, list := range query {
		values[name] = list
	}
	approved.RawQuery = values.Encode()
	return approved.String(), nil
}

func uploadResponseError(message string) error {
	return &Error{Kind: ServerError, Code: "invalid_response", Message: message}
}
