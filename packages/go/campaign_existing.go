package polymorfa

import (
	"bytes"
	"encoding/json"
	"fmt"
	"golang.org/x/net/idna"
	"math"
	"net/url"
	"reflect"
	"regexp"
	"strings"
)

// CampaignVariableBinding selects a customer field and/or fallback text.
type CampaignVariableBinding struct {
	Extra    PlatformPayload `json:"-"`
	Source   *string         `json:"source,omitempty"`
	Fallback *string         `json:"fallback,omitempty"`
}
type CampaignVariableMapping map[string]CampaignVariableBinding

func (v CampaignVariableMapping) MarshalJSON() ([]byte, error) {
	if v == nil {
		return []byte(`{}`), nil
	}
	type plain CampaignVariableMapping
	return json.Marshal(plain(v))
}
func (v CampaignVariableBinding) MarshalJSON() ([]byte, error) {
	type plain CampaignVariableBinding
	return openCampaignJSON(plain(v), v.Extra, "source", "fallback")
}
func (v *CampaignVariableBinding) UnmarshalJSON(b []byte) error {
	var raw map[string]json.RawMessage
	json.Unmarshal(b, &raw)
	for _, key := range []string{"source", "fallback"} {
		if v, ok := raw[key]; ok && bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			return existingInvalid(key)
		}
	}
	type plain CampaignVariableBinding
	var x plain
	m, e := decodeOpenCampaign(b, &x, "source", "fallback")
	*v = CampaignVariableBinding(x)
	v.Extra = m
	return e
}

type CampaignTrackedLink struct {
	Key string `json:"key"`
	URL string `json:"url"`
}
type CampaignTrackedLinks []CampaignTrackedLink

func (v CampaignTrackedLinks) MarshalJSON() ([]byte, error) {
	if v == nil {
		return []byte(`[]`), nil
	}
	type plain CampaignTrackedLinks
	return json.Marshal(plain(v))
}

// Composed messages and their nested media/buttons preserve declared extensions.
type CampaignComposedMessage struct {
	Version       *int                      `json:"version,omitempty"`
	Source        *string                   `json:"source,omitempty"`
	Media         *CampaignComposedMedia    `json:"media,omitempty"`
	Buttons       *[]CampaignComposedButton `json:"buttons,omitempty"`
	Footer        *string                   `json:"footer,omitempty"`
	DelayAfterSec *int                      `json:"delayAfterSec,omitempty"`
	Extra         PlatformPayload           `json:"-"`
}
type CampaignComposedMedia struct {
	Kind     string          `json:"kind"`
	URL      string          `json:"url"`
	Filename *string         `json:"filename,omitempty"`
	Caption  *string         `json:"caption,omitempty"`
	Extra    PlatformPayload `json:"-"`
}
type CampaignComposedButton struct {
	Kind  string          `json:"kind"`
	Label string          `json:"label"`
	URL   *string         `json:"url,omitempty"`
	Phone *string         `json:"phone,omitempty"`
	Extra PlatformPayload `json:"-"`
}

func openCampaignJSON(v any, extra PlatformPayload, owned ...string) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	m := clonePayload(extra)
	for _, key := range owned {
		delete(m, key)
	}
	var typed PlatformPayload
	if err = json.Unmarshal(b, &typed); err != nil {
		return nil, err
	}
	for k, v := range typed {
		m[k] = v
	}
	return json.Marshal(m)
}
func (v CampaignComposedMessage) MarshalJSON() ([]byte, error) {
	type plain CampaignComposedMessage
	return openCampaignJSON(plain(v), v.Extra, "version", "source", "media", "buttons", "footer", "delayAfterSec")
}
func (v CampaignComposedMedia) MarshalJSON() ([]byte, error) {
	type plain CampaignComposedMedia
	return openCampaignJSON(plain(v), v.Extra, "kind", "url", "filename", "caption")
}
func (v CampaignComposedButton) MarshalJSON() ([]byte, error) {
	type plain CampaignComposedButton
	return openCampaignJSON(plain(v), v.Extra, "kind", "label", "url", "phone")
}
func decodeOpenCampaign(b []byte, out any, owned ...string) (PlatformPayload, error) {
	var m PlatformPayload
	if err := json.Unmarshal(b, &m); err != nil || m == nil {
		return nil, validation("An object is required.")
	}
	if err := json.Unmarshal(b, out); err != nil {
		return nil, err
	}
	for _, k := range owned {
		delete(m, k)
	}
	return m, nil
}
func (v *CampaignComposedMessage) UnmarshalJSON(b []byte) error {
	var raw map[string]any
	if json.Unmarshal(b, &raw) != nil {
		return existingInvalid("messagesArray")
	}
	if e := validateComposed([]any{raw}); e != nil {
		return e
	}
	type plain CampaignComposedMessage
	var x plain
	m, e := decodeOpenCampaign(b, &x, "version", "source", "media", "buttons", "footer", "delayAfterSec")
	*v = CampaignComposedMessage(x)
	v.Extra = m
	return e
}
func (v *CampaignComposedMedia) UnmarshalJSON(b []byte) error {
	type plain CampaignComposedMedia
	var x plain
	m, e := decodeOpenCampaign(b, &x, "kind", "url", "filename", "caption")
	*v = CampaignComposedMedia(x)
	v.Extra = m
	return e
}
func (v *CampaignComposedButton) UnmarshalJSON(b []byte) error {
	type plain CampaignComposedButton
	var x plain
	m, e := decodeOpenCampaign(b, &x, "kind", "label", "url", "phone")
	*v = CampaignComposedButton(x)
	v.Extra = m
	return e
}

type CampaignRecipientFailureReason string

const (
	CampaignFailureOptedOut            CampaignRecipientFailureReason = "opted_out"
	CampaignFailureColdHeld            CampaignRecipientFailureReason = "cold_held"
	CampaignFailureCancelled           CampaignRecipientFailureReason = "campaign_cancelled"
	CampaignFailureInvalidRecipient    CampaignRecipientFailureReason = "invalid_recipient"
	CampaignFailureSessionNotConnected CampaignRecipientFailureReason = "session_not_connected"
	CampaignFailureAckTimeout          CampaignRecipientFailureReason = "ack_timeout"
	CampaignFailureBlockedBySafety     CampaignRecipientFailureReason = "blocked_by_safety"
	CampaignFailureSendFailed          CampaignRecipientFailureReason = "send_failed"
	CampaignFailureMissingVariable     CampaignRecipientFailureReason = "missing_variable"
	CampaignFailureOther               CampaignRecipientFailureReason = "other"
)

func validCampaignFailure(v string) bool {
	switch CampaignRecipientFailureReason(v) {
	case CampaignFailureOptedOut, CampaignFailureColdHeld, CampaignFailureCancelled, CampaignFailureInvalidRecipient, CampaignFailureSessionNotConnected, CampaignFailureAckTimeout, CampaignFailureBlockedBySafety, CampaignFailureSendFailed, CampaignFailureMissingVariable, CampaignFailureOther:
		return true
	}
	return false
}
func closedJSON(b []byte, out any, allowed ...string) error {
	var m map[string]json.RawMessage
	if json.Unmarshal(b, &m) != nil || m == nil {
		return validation("An object is required.")
	}
	for k, v := range m {
		found := false
		for _, a := range allowed {
			if a == k {
				found = true
			}
		}
		if !found || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			return configuration(k, "Unsupported or null field.")
		}
	}
	return json.Unmarshal(b, out)
}
func campaignObject(v any) (map[string]any, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	var m map[string]any
	e = json.Unmarshal(b, &m)
	if e != nil || m == nil {
		return nil, validation("An object is required.")
	}
	return m, nil
}
func existingInvalid(field string) error {
	return configuration(field, "Invalid campaign request field.")
}
func existingText(v any, min, max int) bool {
	s, ok := v.(string)
	return ok && contractText(s, "text", min, max) == nil
}
func existingFields(v any, allowed, required []string) (map[string]any, error) {
	m, ok := v.(map[string]any)
	if !ok || m == nil {
		return nil, existingInvalid("object")
	}
	for k := range m {
		ok := false
		for _, a := range allowed {
			if k == a {
				ok = true
			}
		}
		if !ok {
			return nil, existingInvalid(k)
		}
	}
	for _, k := range required {
		if _, ok := m[k]; !ok {
			return nil, existingInvalid(k)
		}
	}
	return m, nil
}
func existingInt(v any, min, max float64) bool {
	n, ok := v.(float64)
	return ok && n >= min && n <= max && math.Trunc(n) == n
}

var trackedURLDomain = idna.New(idna.MapForLookup(), idna.Transitional(false), idna.StrictDomainName(false), idna.ValidateLabels(false), idna.VerifyDNSLength(false))
var trackedLinkKey = regexp.MustCompile(`^[a-z0-9_]{1,32}$`)
var alternativeKey = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,15}$`)
var followLink = regexp.MustCompile(`(?i)\{\{[\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]*link:`)

func validateExistingCampaign(v any, platform, patch bool) error {
	m, e := campaignObject(v)
	if e != nil {
		return e
	}
	return validateExistingCampaignMap(m, platform, patch)
}
func validateExistingCampaignMap(m map[string]any, platform, patch bool) error {
	if x, ok := m["variableMapping"]; ok && !(patch && x == nil) {
		bindings, ok := x.(map[string]any)
		if !ok || len(bindings) > 50 {
			return existingInvalid("variableMapping")
		}
		for k, b := range bindings {
			if !campaignVariableID.MatchString(k) {
				return existingInvalid("variableMapping")
			}
			entry, e := existingFields(b, []string{"source", "fallback"}, nil)
			if e != nil {
				return e
			}
			if s, ok := entry["source"]; ok {
				v, ok := s.(string)
				if !ok || !campaignVariableID.MatchString(v) {
					return existingInvalid("source")
				}
			}
			if f, ok := entry["fallback"]; ok {
				if !existingText(f, 1, 1024) || campaignTrimSpace(f.(string)) == "" {
					return existingInvalid("fallback")
				}
			}
		}
	}
	if x, ok := m["trackedLinks"]; ok && x != nil {
		a, ok := x.([]any)
		if !ok || len(a) > 5 {
			return existingInvalid("trackedLinks")
		}
		seen := map[string]bool{}
		for _, item := range a {
			entry, e := existingFields(item, []string{"key", "url"}, []string{"key", "url"})
			if e != nil {
				return e
			}
			key, ok := entry["key"].(string)
			if !ok || !trackedLinkKey.MatchString(key) || seen[key] {
				return existingInvalid("trackedLinks.key")
			}
			seen[key] = true
			if !existingText(entry["url"], 1, 2048) || !validTrackedURL(entry["url"].(string)) {
				return existingInvalid("trackedLinks.url")
			}
		}
	}
	if x, ok := m["templateId"]; ok && patch && x != nil {
		v, ok := x.(string)
		if !ok || contractUUID(v, "templateId") != nil {
			return existingInvalid("templateId")
		}
	}
	if x, ok := m["followUp"]; ok && x != nil {
		if e := validateExistingFollowUp(x); e != nil {
			return e
		}
	}
	if x, ok := m["messagesArray"]; ok {
		if e := validateComposed(x); e != nil {
			return e
		}
	}
	for _, key := range []string{"variants", "messageVariations"} {
		if x, ok := m[key]; ok && !(x == nil && (!platform || patch)) {
			if e := validateAlternatives(x, key == "variants", platform); e != nil {
				return e
			}
		}
	}
	if x, ok := m["variantStrategy"]; ok && !(x == nil && (!platform || patch)) {
		v, e := existingFields(x, []string{"winnerCriterion", "holdoutPercent", "testSlicePercent", "autoPromote", "testWindowMinutes"}, []string{"winnerCriterion", "holdoutPercent", "autoPromote", "testWindowMinutes"})
		if e != nil {
			return e
		}
		if contractOne(fmt.Sprint(v["winnerCriterion"]), "winnerCriterion", "delivery", "read", "reply") != nil || !existingInt(v["holdoutPercent"], 0, 30) || v["autoPromote"] != true || !existingInt(v["testWindowMinutes"], 15, 1440) {
			return existingInvalid("variantStrategy")
		}
		if n, ok := v["testSlicePercent"]; ok && !existingInt(n, 5, 50) {
			return existingInvalid("testSlicePercent")
		}
	}
	return nil
}
func validTrackedURL(raw string) bool {
	for _, r := range raw {
		if r < 32 || r == 127 || campaignTrimSpace(string(r)) == "" {
			return false
		}
	}
	// WHATWG special URLs treat backslashes as path separators.
	normalized := strings.ReplaceAll(raw, `\`, "/")
	u, e := url.Parse(normalized)
	if e != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
		return false
	}
	if u.User != nil {
		p, _ := u.User.Password()
		if u.User.Username() != "" || p != "" {
			return false
		}
	}
	asciiHost, e := trackedURLDomain.ToASCII(strings.ToLower(u.Hostname()))
	host := strings.TrimSuffix(asciiHost, ".")
	if e != nil {
		return false
	}
	if !strings.Contains(host, ".") || strings.HasPrefix(host, "[") || strings.Contains(host, ":") {
		return false
	}
	for _, suffix := range []string{".local", ".internal", ".localhost"} {
		if strings.HasSuffix(host, suffix) {
			return false
		}
	}
	tail := host[strings.LastIndex(host, ".")+1:]
	if regexp.MustCompile(`^[0-9]+$`).MatchString(tail) {
		return false
	}
	// URL normalization percent-encodes non-ASCII path/query/fragment data.
	port := u.Port()
	u.Scheme = "https"
	u.Host = asciiHost
	if port := port; port != "" && port != "443" {
		u.Host += ":" + port
	}
	if u.Path == "" {
		u.Path = "/"
	}
	normalized = u.String()
	n := utf16Length(normalized)
	for _, r := range normalized {
		if r > 127 {
			n += len(string(r))*3 - 1
		}
	}
	return n <= 2048
}
func validateExistingFollowUp(x any) error {
	v, e := existingFields(x, []string{"delaySeconds", "expirySeconds", "message"}, []string{"message"})
	if e != nil {
		return e
	}
	delay, expiry := float64(86400), float64(604800)
	if n, ok := v["delaySeconds"]; ok {
		if !existingInt(n, 60, 604800) {
			return existingInvalid("delaySeconds")
		}
		delay = n.(float64)
	}
	if n, ok := v["expirySeconds"]; ok {
		if !existingInt(n, 86400, 2592000) {
			return existingInvalid("expirySeconds")
		}
		expiry = n.(float64)
	}
	if expiry <= delay {
		return existingInvalid("expirySeconds")
	}
	msg, ok := v["message"].(map[string]any)
	if !ok {
		return existingInvalid("message")
	}
	if msg["type"] == "text" {
		_, e = existingFields(msg, []string{"type", "text"}, []string{"type", "text"})
		if e != nil {
			return e
		}
		if !existingText(msg["text"], 1, 16384) || followLink.MatchString(msg["text"].(string)) {
			return existingInvalid("message.text")
		}
	} else {
		_, e = existingFields(msg, []string{"type", "templateId"}, []string{"type", "templateId"})
		id, ok := msg["templateId"].(string)
		if e != nil || msg["type"] != "template" || !ok || contractUUID(id, "templateId") != nil {
			return existingInvalid("message.templateId")
		}
	}
	return nil
}
func validateAlternatives(x any, variants, platform bool) error {
	a, ok := x.([]any)
	max := 5
	if variants {
		max = 4
	}
	if !ok || len(a) < 2 || len(a) > max {
		return existingInvalid("variants")
	}
	sum := 0.
	seen := map[string]bool{}
	for _, x := range a {
		fields := []string{"key", "weight", "blueprint"}
		if variants {
			fields = append(fields, "label")
		}
		v, e := existingFields(x, fields, fields)
		if e != nil {
			return e
		}
		key, ok := v["key"].(string)
		if !ok || !alternativeKey.MatchString(key) || seen[key] {
			return existingInvalid("key")
		}
		seen[key] = true
		if variants {
			label, ok := v["label"].(string)
			if !ok {
				return existingInvalid("label")
			}
			if !platform {
				label = campaignTrimSpace(label)
			}
			if !existingText(label, 1, 100) {
				return existingInvalid("label")
			}
		}
		if !existingInt(v["weight"], 1, 99) {
			return existingInvalid("weight")
		}
		sum += v["weight"].(float64)
		b, ok := v["blueprint"].(map[string]any)
		if !ok || b["version"] != float64(2) || !existingText(b["source"], 1, 4096) || campaignTrimSpace(b["source"].(string)) == "" {
			return existingInvalid("blueprint")
		}
	}
	if sum != 100 {
		return existingInvalid("weight")
	}
	return nil
}
func validateComposed(x any) error {
	a, ok := x.([]any)
	if !ok || len(a) > 10 {
		return existingInvalid("messagesArray")
	}
	for _, x := range a {
		m, ok := x.(map[string]any)
		if !ok {
			return existingInvalid("messagesArray")
		}
		if v, ok := m["version"]; ok && v != float64(2) {
			return existingInvalid("version")
		}
		for _, k := range []string{"source", "footer"} {
			if v, ok := m[k]; ok && !existingText(v, 0, int(^uint(0)>>1)) {
				return existingInvalid(k)
			}
		}
		if v, ok := m["delayAfterSec"]; ok && !existingInt(v, 0, 86400) {
			return existingInvalid("delayAfterSec")
		}
		if x, ok := m["media"]; ok {
			v, ok := x.(map[string]any)
			if !ok || contractOne(fmt.Sprint(v["kind"]), "kind", "image", "video", "audio", "document") != nil || !existingText(v["url"], 0, int(^uint(0)>>1)) {
				return existingInvalid("media")
			}
			for _, k := range []string{"filename", "caption"} {
				if s, ok := v[k]; ok && !existingText(s, 0, int(^uint(0)>>1)) {
					return existingInvalid(k)
				}
			}
		}
		if x, ok := m["buttons"]; ok {
			a, ok := x.([]any)
			if !ok {
				return existingInvalid("buttons")
			}
			for _, x := range a {
				v, ok := x.(map[string]any)
				if !ok || contractOne(fmt.Sprint(v["kind"]), "kind", "reply", "link", "call") != nil || !existingText(v["label"], 0, int(^uint(0)>>1)) {
					return existingInvalid("button")
				}
				for _, k := range []string{"url", "phone"} {
					if s, ok := v[k]; ok && !existingText(s, 0, int(^uint(0)>>1)) {
						return existingInvalid(k)
					}
				}
			}
		}
	}
	return nil
}
func validateRecipientList(v ListCampaignRecipientsParams) error {
	if v.Reason != "" && !validCampaignFailure(string(v.Reason)) {
		return existingInvalid("reason")
	}
	if v.Status != "" {
		if e := contractOne(v.Status, "status", "queued", "sending", "sent", "delivered", "read", "failed", "skipped"); e != nil {
			return e
		}
	}
	if v.Cursor != "" {
		if e := contractText(v.Cursor, "cursor", 1, 256); e != nil {
			return e
		}
	}
	if v.Limit != 0 {
		if e := contractInt(int64(v.Limit), 1, 100, "limit"); e != nil {
			return e
		}
	}
	return nil
}
func validateCampaignLaunch(v any, platform bool) error {
	m, e := campaignObject(v)
	if e != nil {
		return e
	}
	if platform {
		id, _ := m["projectId"].(string)
		if e = contractUUID(id, "projectId"); e != nil {
			return e
		}
	}
	if n, ok := m["scheduledAt"]; ok {
		v, ok := n.(float64)
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			return existingInvalid("scheduledAt")
		}
	}
	return nil
}

func (v *CreateCampaignRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return existingInvalid("body")
	}
	if e := validateExistingCampaignMap(m, false, false); e != nil {
		return e
	}
	type plain CreateCampaignRequest
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	restoreCampaignNulls(m, &x)
	*v = CreateCampaignRequest(x)
	return nil
}
func (v *CreatePlatformCampaignRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return existingInvalid("body")
	}
	if e := validateExistingCampaignMap(m, true, false); e != nil {
		return e
	}
	type plain CreatePlatformCampaignRequest
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	restoreCampaignNulls(m, &x)
	*v = CreatePlatformCampaignRequest(x)
	return nil
}
func (v *LaunchCampaignRequest) UnmarshalJSON(b []byte) error {
	type plain LaunchCampaignRequest
	var x plain
	if e := closedJSON(b, &x, "scheduledAt", "skipMissingVariables"); e != nil {
		return e
	}
	*v = LaunchCampaignRequest(x)
	return nil
}
func (v *LaunchPlatformCampaignRequest) UnmarshalJSON(b []byte) error {
	type launch LaunchCampaignRequest
	var x struct {
		ProjectID string `json:"projectId"`
		launch
	}
	if e := closedJSON(b, &x, "projectId", "scheduledAt", "skipMissingVariables"); e != nil {
		return e
	}
	*v = LaunchPlatformCampaignRequest{ProjectID: x.ProjectID, LaunchCampaignRequest: LaunchCampaignRequest(x.launch)}
	return validateCampaignLaunch(*v, true)
}

func (v *UpdateCampaignRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return existingInvalid("body")
	}
	if e := validateExistingCampaignMap(m, false, true); e != nil {
		return e
	}
	type plain UpdateCampaignRequest
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	restoreCampaignNulls(m, &x)
	*v = UpdateCampaignRequest(x)
	return nil
}
func (v *UpdatePlatformCampaignRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return existingInvalid("body")
	}
	if e := validateExistingCampaignMap(m, true, true); e != nil {
		return e
	}
	type update UpdateCampaignRequest
	var x struct {
		update
		MessagesArray *[]CampaignComposedMessage `json:"messagesArray,omitempty"`
	}
	extra, e := decodeOpenCampaign(b, &x, "name", "templateId", "variableMapping", "trackedLinks", "recipientListId", "senderConfig", "scheduledAt", "sendWindow", "messageVariations", "variants", "variantStrategy", "followUp", "messagesArray")
	if e != nil {
		return e
	}
	restoreCampaignNulls(m, &x)
	*v = UpdatePlatformCampaignRequest{UpdateCampaignRequest: UpdateCampaignRequest(x.update), MessagesArray: x.MessagesArray, Extra: extra}
	return nil
}

// encoding/json clears *Nullable on null without invoking its decoder. Restore
// the explicit null marker on request models so PATCH resets survive decoding.
func restoreCampaignNulls(raw map[string]any, out any) {
	restoreCampaignNullFields(raw, reflect.ValueOf(out).Elem())
}
func restoreCampaignNullFields(raw map[string]any, v reflect.Value) {
	for i := 0; i < v.NumField(); i++ {
		f := v.Type().Field(i)
		field := v.Field(i)
		if f.Anonymous && field.Kind() == reflect.Struct {
			restoreCampaignNullFields(raw, field)
			continue
		}
		name := strings.Split(f.Tag.Get("json"), ",")[0]
		value, present := raw[name]
		if present && value == nil && field.CanSet() && field.Kind() == reflect.Ptr && strings.HasPrefix(field.Type().Elem().Name(), "Nullable[") {
			field.Set(reflect.New(field.Type().Elem()))
		}
	}
}
