package polymorfa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"net/url"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

const campaignContractVersion = "2026-10-14"
const campaignSafeInteger int64 = 9007199254740991

var campaignUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var campaignNodeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`)
var campaignVariableID = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$`)
var profileAttributeID = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,47}$`)
var profilePhone = regexp.MustCompile(`^\+[1-9][0-9]{6,14}$`)
var profileReplay = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)
var replyScreen = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)

func contractUUID(v, field string) error {
	if !campaignUUID.MatchString(v) {
		return configuration(field, "A canonical UUID is required.")
	}
	return nil
}
func contractInt(v, min, max int64, field string) error {
	if v < min || v > max {
		return configuration(field, "Integer is outside the supported range.")
	}
	return nil
}
func utf16Length(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}
func contractText(v, field string, min, max int) error {
	if !utf8.ValidString(v) || utf16Length(v) < min || utf16Length(v) > max {
		return configuration(field, "Text has an unsupported length or encoding.")
	}
	return nil
}
func contractBytes(v, field string, min, max int) error {
	if !utf8.ValidString(v) || len(v) < min || len(v) > max {
		return configuration(field, "Text exceeds the UTF-8 byte bounds.")
	}
	return nil
}
func campaignTrimSpace(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		return r >= 0x09 && r <= 0x0d || r == 0x20 || r == 0xa0 || r == 0x1680 || r >= 0x2000 && r <= 0x200a || r == 0x2028 || r == 0x2029 || r == 0x202f || r == 0x205f || r == 0x3000 || r == 0xfeff
	})
}

func hasASCIIControl(s string) bool {
	for _, r := range s {
		if r < 32 || r == 127 {
			return true
		}
	}
	return false
}
func hasControl(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}
func contractOne(v, field string, values ...string) error {
	for _, x := range values {
		if v == x {
			return nil
		}
	}
	return configuration(field, "Unsupported value.")
}
func campaignOptions(o RequestOptions, write, replay bool) (RequestOptions, error) {
	o.Headers = o.Headers.Clone()
	if o.MaxNetworkRetries != nil {
		n := *o.MaxNetworkRetries
		o.MaxNetworkRetries = &n
	}
	if o.APIVersion == "" {
		o.APIVersion = campaignContractVersion
	}
	if err := contractText(o.APIVersion, "apiVersion", 1, int(^uint(0)>>1)); err != nil {
		return o, err
	}
	key, err := requestIdempotencyKey(o)
	if err != nil {
		return o, err
	}
	o.IdempotencyKey = key
	if key != "" {
		if err := contractBytes(key, "idempotencyKey", 1, 255); err != nil {
			return o, err
		}
		if campaignTrimSpace(key) == "" {
			return o, configuration("idempotencyKey", "A caller idempotency key must not be blank.")
		}
		// HTTP field values permit horizontal tabs, but never other ASCII
		// controls. Refuse malformed headers before handing them to HTTP.
		for _, r := range key {
			if r < 32 && r != '\t' || r == 127 {
				return o, configuration("idempotencyKey", "The idempotency key contains invalid header characters.")
			}
		}
	}
	if write && !replay && o.MaxNetworkRetries == nil {
		o = noRetry(o)
	}
	if replay {
		return idempotent(o)
	}
	return o, nil
}
func validateCampaignScalar(v CampaignVariable) error {
	n := 0
	if v.String != nil {
		n++
		if !utf8.ValidString(*v.String) {
			return validation("Scalar text must be UTF-8.")
		}
	}
	if v.Number != nil {
		n++
		if math.IsNaN(*v.Number) || math.IsInf(*v.Number, 0) {
			return validation("Scalar number must be finite.")
		}
	}
	if v.Bool != nil {
		n++
	}
	if n != 1 {
		return validation("Exactly one scalar variant is required.")
	}
	return nil
}
func campaignScalarText(v CampaignVariable) string {
	if v.String != nil {
		return *v.String
	}
	if v.Bool != nil {
		return strconv.FormatBool(*v.Bool)
	}
	n := *v.Number
	if n == 0 {
		return "0"
	}
	a := math.Abs(n)
	if a >= 1e-6 && a < 1e21 {
		return strconv.FormatFloat(n, 'f', -1, 64)
	}
	s := strconv.FormatFloat(n, 'e', -1, 64)
	i := strings.IndexByte(s, 'e')
	exp, _ := strconv.Atoi(s[i+1:])
	sign := ""
	if exp >= 0 {
		sign = "+"
	}
	return s[:i] + "e" + sign + strconv.Itoa(exp)
}

// Semantic budgets follow JSON.stringify: HTML and Unicode separators stay literal.
func campaignJSONSize(v any) (int, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return 0, validation("Value must be JSON serializable.")
	}
	var plain any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&plain); err != nil {
		return 0, validation("Value must be JSON serializable.")
	}
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(campaignSemanticNumbers(plain)); err != nil {
		return 0, validation("Value must be JSON serializable.")
	}
	data := bytes.TrimSuffix(b.Bytes(), []byte("\n"))
	n := len(data)
	for i := 0; i+1 < len(data); i++ {
		if data[i] != '\\' {
			continue
		}
		if data[i+1] == '\\' {
			i++
			continue
		}
		if i+6 <= len(data) && (string(data[i:i+6]) == `\u2028` || string(data[i:i+6]) == `\u2029`) {
			n -= 3
			i += 5
		} else {
			i++
		}
	}
	return n, nil
}
func campaignSemanticNumbers(v any) any {
	switch x := v.(type) {
	case json.Number:
		n, _ := x.Float64()
		return json.Number(campaignScalarText(CampaignVariable{Number: &n}))
	case []any:
		for i := range x {
			x[i] = campaignSemanticNumbers(x[i])
		}
		return x
	case map[string]any:
		for k := range x {
			x[k] = campaignSemanticNumbers(x[k])
		}
		return x
	default:
		return v
	}
}

func validateReplyMessage(s, field string, max int, multiline bool) error {
	if err := contractBytes(s, field, 1, max); err != nil {
		return err
	}
	if multiline && campaignTrimSpace(s) == "" {
		return configuration(field, "Message text must not be blank.")
	}
	for _, r := range s {
		if unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\r' || r == '\t')) {
			return configuration(field, "Message text contains control characters.")
		}
	}
	return nil
}
func validateReplySend(v CampaignReplyFlowSend) error {
	if v == nil || reflect.ValueOf(v).Kind() == reflect.Ptr && reflect.ValueOf(v).IsNil() {
		return validation("A supported non-null reply message is required.")
	}
	switch x := v.(type) {
	case *CampaignReplyText:
		return validateReplySend(*x)
	case *CampaignReplyButtons:
		return validateReplySend(*x)
	case *CampaignReplyList:
		return validateReplySend(*x)
	case *CampaignReplyFlowForm:
		return validateReplySend(*x)
	case CampaignReplyText:
		return validateReplyMessage(x.Text, "send.text", 4096, true)
	case CampaignReplyButtons:
		if err := validateReplyMessage(x.Body, "send.body", 1024, true); err != nil {
			return err
		}
		if x.Footer != nil {
			if err := validateReplyMessage(*x.Footer, "send.footer", 60, false); err != nil {
				return err
			}
		}
		if len(x.Buttons) < 1 || len(x.Buttons) > 3 {
			return validation("Buttons require one through three choices.")
		}
		seen := map[string]bool{}
		for _, b := range x.Buttons {
			if !campaignNodeID.MatchString(b.ID) || seen[b.ID] {
				return validation("Button IDs must be supported and distinct.")
			}
			seen[b.ID] = true
			if err := validateReplyMessage(b.Text, "button.text", 20, false); err != nil {
				return err
			}
		}
	case CampaignReplyList:
		if err := validateReplyMessage(x.Body, "send.body", 1024, true); err != nil {
			return err
		}
		if err := validateReplyMessage(x.ButtonText, "send.buttonText", 20, false); err != nil {
			return err
		}
		if x.Footer != nil {
			if err := validateReplyMessage(*x.Footer, "send.footer", 60, false); err != nil {
				return err
			}
		}
		if len(x.Rows) < 1 || len(x.Rows) > 10 {
			return validation("Lists require one through ten rows.")
		}
		seen := map[string]bool{}
		for _, r := range x.Rows {
			if !campaignNodeID.MatchString(r.ID) || seen[r.ID] {
				return validation("Row IDs must be supported and distinct.")
			}
			seen[r.ID] = true
			if err := validateReplyMessage(r.Title, "row.title", 24, false); err != nil {
				return err
			}
			if r.Description != nil {
				if err := validateReplyMessage(*r.Description, "row.description", 72, false); err != nil {
					return err
				}
			}
		}
	case CampaignReplyFlowForm:
		if err := contractUUID(x.FlowID, "send.flowId"); err != nil {
			return err
		}
		if !replyScreen.MatchString(x.Screen) {
			return validation("Flow screen is invalid.")
		}
		if err := validateReplyMessage(x.Body, "send.body", 1024, true); err != nil {
			return err
		}
		if err := validateReplyMessage(x.ButtonText, "send.buttonText", 20, false); err != nil {
			return err
		}
		if x.Footer != nil {
			return validateReplyMessage(*x.Footer, "send.footer", 60, false)
		}
	default:
		return validation("Unsupported reply message variant.")
	}
	return nil
}
func validateReplyMatch(v CampaignReplyFlowMatch) error {
	if v == nil || reflect.ValueOf(v).Kind() == reflect.Ptr && reflect.ValueOf(v).IsNil() {
		return validation("A reply match is required.")
	}
	switch x := v.(type) {
	case *CampaignReplyChoice:
		return validateReplyMatch(*x)
	case *CampaignReplyKeyword:
		return validateReplyMatch(*x)
	case *CampaignReplySubmission:
		return nil
	case CampaignReplyChoice:
		if err := contractOne(x.ReplyKind, "match.replyKind", "button", "list"); err != nil {
			return err
		}
		if !campaignNodeID.MatchString(x.ID) {
			return validation("Invalid choice ID.")
		}
	case CampaignReplyKeyword:
		return validateReplyMessage(x.Value, "match.value", 64, false)
	case CampaignReplySubmission:
		return nil
	default:
		return validation("Unsupported reply match.")
	}
	return nil
}

// Stored keywords are normalized after the API validates the request byte bound.
// Unicode lowercasing can increase UTF-8 bytes while retaining the public
// response limit of 64 UTF-16 code units.
func validateReplyResponseMatch(v CampaignReplyFlowMatch) error {
	var keyword *CampaignReplyKeyword
	switch x := v.(type) {
	case CampaignReplyKeyword:
		keyword = &x
	case *CampaignReplyKeyword:
		keyword = x
	default:
		return validateReplyMatch(v)
	}
	if keyword == nil {
		return validation("A reply match is required.")
	}
	if err := contractText(keyword.Value, "match.value", 1, 64); err != nil {
		return err
	}
	if hasControl(keyword.Value) {
		return validation("Reply keyword contains control characters.")
	}
	return nil
}
func validateReplyCreate(v CreateCampaignReplyFlowRequest) error {
	return validateReplyGraph(v, validateReplyMatch)
}
func validateReplyGraph(v CreateCampaignReplyFlowRequest, checkMatch func(CampaignReplyFlowMatch) error) error {
	if err := contractBytes(v.Name, "name", 1, 128); err != nil {
		return err
	}
	if v.FlowKey != nil {
		if err := contractUUID(*v.FlowKey, "flowKey"); err != nil {
			return err
		}
	}
	if v.Revision != nil {
		if err := contractInt(*v.Revision, 1, 1000000, "revision"); err != nil {
			return err
		}
	}
	d := v.Definition
	if !campaignNodeID.MatchString(d.EntryNodeID) || len(d.Nodes) < 2 || len(d.Nodes) > 12 {
		return validation("A reply graph requires an entry and two through twelve nodes.")
	}
	seen := map[string]bool{}
	for _, n := range d.Nodes {
		if !campaignNodeID.MatchString(n.ID) || seen[n.ID] || n.Edges == nil || len(n.Edges) > 3 {
			return validation("Reply nodes need distinct IDs and at most three edges.")
		}
		seen[n.ID] = true
		if n.Send != nil {
			if err := validateReplySend(n.Send); err != nil {
				return err
			}
		}
		for _, e := range n.Edges {
			if !campaignNodeID.MatchString(e.To) {
				return validation("Invalid edge target.")
			}
			if err := checkMatch(e.Match); err != nil {
				return err
			}
		}
	}
	size, err := campaignJSONSize(d.Nodes)
	if err != nil {
		return err
	}
	if size > 24*1024 {
		return validation("Reply graph exceeds 24 KiB.")
	}
	return nil
}
func validateTestSend(v CampaignTestSendRequest) error {
	if err := contractUUID(v.SessionID, "sessionId"); err != nil {
		return err
	}
	if err := contractText(v.To, "to", 1, 32); err != nil {
		return err
	}
	if v.SampleRecipientID != nil {
		if err := contractUUID(*v.SampleRecipientID, "sampleRecipientId"); err != nil {
			return err
		}
	}
	if v.Variables != nil {
		if *v.Variables == nil || len(*v.Variables) > 50 {
			return validation("Variables must be an object with at most fifty values.")
		}
		for k, x := range *v.Variables {
			if !campaignVariableID.MatchString(k) {
				return validation("Invalid variable name.")
			}
			if err := validateCampaignScalar(x); err != nil {
				return err
			}
			if utf16Length(campaignScalarText(x)) > 1024 {
				return validation("Variable exceeds 1024 UTF-16 code units.")
			}
		}
	}
	return nil
}
func validateReplyAssignment(v SetCampaignReplyFlowRequest) error {
	if v.ReplyFlowID.Value != nil {
		return contractUUID(*v.ReplyFlowID.Value, "replyFlowId")
	}
	return nil
}
func campaignExportQuery(v CampaignRecipientExportParams) (url.Values, error) {
	q := url.Values{}
	if v.Status != nil {
		if err := contractOne(*v.Status, "status", "queued", "sending", "sent", "delivered", "read", "failed", "skipped"); err != nil {
			return nil, err
		}
		q.Set("status", *v.Status)
	}
	if v.Reason != nil {
		if err := contractOne(*v.Reason, "reason", "opted_out", "cold_held", "campaign_cancelled", "invalid_recipient", "session_not_connected", "ack_timeout", "blocked_by_safety", "send_failed", "missing_variable", "other"); err != nil {
			return nil, err
		}
		q.Set("reason", *v.Reason)
	}
	if v.Cursor != nil {
		if err := contractText(*v.Cursor, "cursor", 1, 256); err != nil {
			return nil, err
		}
		q.Set("cursor", *v.Cursor)
	}
	if v.Limit != nil {
		if err := contractInt(int64(*v.Limit), 1, 1000, "limit"); err != nil {
			return nil, err
		}
		q.Set("limit", strconv.Itoa(*v.Limit))
	}
	if (v.Status != nil || v.Reason != nil) && (v.Cursor != nil || v.Limit != nil && *v.Limit != 1000) {
		return nil, validation("Filtered exports cannot use a cursor or smaller page limit.")
	}
	return q, nil
}
func validateProfilePut(v PutAudienceProfileRequest) error {
	if v.ExpectedRevision != nil {
		if err := contractInt(*v.ExpectedRevision, 1, campaignSafeInteger, "expectedRevision"); err != nil {
			return err
		}
	}
	if v.Tags == nil || len(v.Tags) > 20 || v.Attributes == nil || len(v.Attributes) > 20 {
		return validation("Profiles require tags and attributes collections, at most twenty each.")
	}
	seen := map[string]bool{}
	for _, s := range v.Tags {
		if seen[s] || hasASCIIControl(s) {
			return validation("Tags must be distinct and have no ASCII controls.")
		}
		seen[s] = true
		if err := contractBytes(s, "tags", 1, 48); err != nil {
			return err
		}
	}
	for k, a := range v.Attributes {
		if !profileAttributeID.MatchString(k) {
			return validation("Invalid attribute name.")
		}
		if a.Value != nil {
			if err := validateCampaignScalar(*a.Value); err != nil {
				return err
			}
			if a.Value.String != nil {
				if err := contractBytes(*a.Value.String, "attributes", 0, 256); err != nil {
					return err
				}
				if strings.ContainsRune(*a.Value.String, 0) {
					return validation("Attribute text cannot contain NUL.")
				}
			}
		}
	}
	n, err := campaignJSONSize(v.Attributes)
	if err != nil {
		return err
	}
	if n > 8192 {
		return validation("Attributes exceed 8192 UTF-8 bytes.")
	}
	if v.Provenance != nil {
		if err := validateProvenance(*v.Provenance); err != nil {
			return err
		}
	}
	if v.Consent != nil {
		if err := validateProvenance(v.Consent.AudienceProfileProvenance); err != nil {
			return err
		}
		if v.Consent.Purpose != "campaigns" {
			return validation("Consent purpose must be campaigns.")
		}
		return contractInt(v.Consent.AssertedAt, 0, 8640000000000000, "assertedAt")
	}
	return nil
}
func validateProvenance(v AudienceProfileProvenance) error {
	if err := contractOne(string(v.Source), "source", "api", "csv", "form"); err != nil {
		return err
	}
	if err := contractBytes(v.Reference, "reference", 1, 128); err != nil {
		return err
	}
	if hasASCIIControl(v.Reference) {
		return validation("Provenance reference cannot contain controls.")
	}
	return nil
}
func validateProfileImport(v CreateAudienceProfileImportRequest) error {
	if !profileReplay.MatchString(v.ReplayKey) {
		return validation("Invalid import replay key.")
	}
	if len(v.CSVBase64) == 0 || len(v.CSVBase64) > 13981016 || strings.ContainsAny(v.CSVBase64, "\r\n") {
		return validation("CSV must be canonical standard base64 within 10 MiB.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(v.CSVBase64)
	if err != nil || len(data) > 10*1024*1024 || base64.StdEncoding.EncodeToString(data) != v.CSVBase64 || !utf8.Valid(data) || bytes.ContainsRune(data, 0) {
		return validation("CSV must be canonical standard base64 of UTF-8 without NUL.")
	}
	if m := v.Mapping; m != nil {
		headers := []string{m.Phone, m.Tags, m.Attributes}
		for _, x := range []*string{m.ExpectedRevision, m.ProvenanceReference, m.ConsentAllowed, m.ConsentAssertedAt, m.ConsentReference} {
			if x != nil {
				headers = append(headers, *x)
			}
		}
		seen := map[string]bool{}
		for _, s := range headers {
			if err := contractBytes(s, "mapping", 1, 64); err != nil {
				return err
			}
			if campaignTrimSpace(s) != s || hasControl(s) || seen[s] {
				return validation("Import headers must be distinct, trimmed and control-free.")
			}
			seen[s] = true
		}
	}
	data, err = json.Marshal(v)
	if err != nil {
		return validation("Import body must be JSON.")
	}
	if len(data) > 14*1024*1024 {
		return validation("Import body exceeds 14 MiB.")
	}
	return nil
}
func profilePageQuery(v ListAudienceProfilesParams) (url.Values, error) {
	q := url.Values{}
	if v.Cursor != nil {
		if err := contractUUID(*v.Cursor, "cursor"); err != nil {
			return nil, err
		}
		q.Set("cursor", *v.Cursor)
	}
	if v.Limit != nil {
		if err := contractInt(int64(*v.Limit), 1, 100, "limit"); err != nil {
			return nil, err
		}
		q.Set("limit", strconv.Itoa(*v.Limit))
	}
	return q, nil
}
func validateRetarget(v CreateAudienceFromCampaignRequest) error {
	if err := contractText(campaignTrimSpace(v.Name), "name", 1, 200); err != nil {
		return err
	}
	if err := contractUUID(v.CampaignID, "campaignId"); err != nil {
		return err
	}
	if v.ProjectID != nil {
		if err := contractUUID(*v.ProjectID, "projectId"); err != nil {
			return err
		}
	}
	return contractOne(string(v.Outcome), "outcome", "delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed")
}
func validateConfirmation(v UpdateStopConfirmationSettingsRequest) error {
	if err := contractUUID(v.TeamID, "teamId"); err != nil {
		return err
	}
	if err := contractInt(v.Revision, 0, 2147483646, "revision"); err != nil {
		return err
	}
	if v.Locale.Value == nil {
		if v.Enabled {
			return validation("Enabled confirmation requires a locale.")
		}
		return nil
	}
	return contractOne(string(*v.Locale.Value), "locale", "en", "pt-BR", "es")
}
func validateCustody(revision int64, mode *SignalCustodyMode, customer bool) error {
	if err := contractInt(revision, 0, campaignSafeInteger, "expectedRevision"); err != nil {
		return err
	}
	if mode == nil {
		if customer {
			return nil
		}
		return validation("Project custody requires a mode.")
	}
	return contractOne(string(*mode), "signalModeDefault", "standard", "zero_knowledge")
}

// These new models require their declared fields, but tolerate response extensions.
func campaignModelShape(data json.RawMessage, t reflect.Type) error {
	if t == reflect.TypeFor[json.RawMessage]() {
		if !json.Valid(data) {
			return validation("Invalid JSON model.")
		}
		return nil
	}
	if t.Kind() == reflect.Ptr {
		if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
			return nil
		}
		return campaignModelShape(data, t.Elem())
	}
	if strings.HasPrefix(t.Name(), "Nullable[") {
		if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
			return nil
		}
		return campaignModelShape(data, t.Field(0).Type.Elem())
	}
	if t == reflect.TypeFor[AudienceProfileAttribute]() {
		var a AudienceProfileAttribute
		return json.Unmarshal(data, &a)
	}
	switch t.Kind() {
	case reflect.Struct:
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(data, &obj); err != nil || obj == nil {
			return validation("Expected a model object.")
		}
		return campaignStructFields(obj, t)
	case reflect.Slice:
		var list []json.RawMessage
		if err := json.Unmarshal(data, &list); err != nil || list == nil {
			return validation("Expected a model array.")
		}
		for _, v := range list {
			if err := campaignModelShape(v, t.Elem()); err != nil {
				return err
			}
		}
	case reflect.Map:
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(data, &obj); err != nil || obj == nil {
			return validation("Expected a model object.")
		}
		for _, v := range obj {
			if err := campaignModelShape(v, t.Elem()); err != nil {
				return err
			}
		}
	default:
		if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
			return validation("A non-null model field is required.")
		}
	}
	return nil
}
func campaignNullableType(t reflect.Type) bool {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	return strings.HasPrefix(t.Name(), "Nullable[") || t == reflect.TypeFor[AudienceProfileAttribute]()
}
func campaignStructFields(obj map[string]json.RawMessage, t reflect.Type) error {
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.Anonymous {
			if err := campaignStructFields(obj, f.Type); err != nil {
				return err
			}
			continue
		}
		tag := f.Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		parts := strings.Split(tag, ",")
		raw, ok := obj[parts[0]]
		optional := len(parts) > 1 && parts[1] == "omitempty"
		if !ok {
			if optional {
				continue
			}
			return validation("A required model field is missing.")
		}
		// omitempty represents omission, not a nullable JSON field. Required
		// pointer fields model explicit null and are checked separately below.
		if optional && !campaignNullableType(f.Type) && bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return validation("An optional model field must be omitted or non-null.")
		}
		if err := campaignModelShape(raw, f.Type); err != nil {
			return err
		}
	}
	return nil
}
func campaignDecode(data json.RawMessage, out any) error {
	if !utf8.Valid(data) {
		return validation("Model JSON must be UTF-8.")
	}
	if err := campaignModelShape(data, reflect.TypeOf(out).Elem()); err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}
func campaignRequest[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, o RequestOptions) (Response[Envelope[T]], error) {
	raw, err := request[json.RawMessage](ctx, t, method, path, q, body, o)
	result := Response[Envelope[T]]{Metadata: raw.Metadata}
	if err != nil {
		return result, err
	}
	var env struct {
		Data    json.RawMessage `json:"data"`
		Success *bool           `json:"success"`
	}
	if raw.Metadata.Status != 200 || json.Unmarshal(raw.Data, &env) != nil || len(env.Data) == 0 || env.Success != nil && !*env.Success {
		return result, campaignResponseError(raw.Metadata)
	}
	if strings.HasPrefix(path, "/messaging/") && (env.Success == nil || !*env.Success) {
		return result, campaignResponseError(raw.Metadata)
	}
	if err := campaignDecode(env.Data, &result.Data.Data); err != nil {
		return result, campaignResponseError(raw.Metadata)
	}
	if err := validateCampaignResponse(result.Data.Data); err != nil {
		return result, campaignResponseError(raw.Metadata)
	}
	if env.Success != nil {
		result.Data.Success = *env.Success
	}
	return result, nil
}
func campaignResponseError(md Metadata) error {
	return &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned an invalid campaign contract response.", Metadata: md, Status: md.Status, RequestID: md.RequestID}
}
func (n *CampaignReplyFlowNode) UnmarshalJSON(data []byte) error {
	type node struct {
		ID    string                  `json:"id"`
		Send  json.RawMessage         `json:"send,omitempty"`
		Edges []CampaignReplyFlowEdge `json:"edges"`
	}
	var v node
	if err := campaignDecode(data, &v); err != nil {
		return err
	}
	n.ID = v.ID
	n.Edges = v.Edges
	n.Send = nil
	if len(v.Send) > 0 {
		var err error
		n.Send, err = decodeReplySend(v.Send)
		return err
	}
	return nil
}
func (e *CampaignReplyFlowEdge) UnmarshalJSON(data []byte) error {
	var v struct {
		Match json.RawMessage `json:"match"`
		To    string          `json:"to"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	if v.To == "" || len(v.Match) == 0 {
		return validation("Edge fields are required.")
	}
	m, err := decodeReplyMatch(v.Match)
	e.Match = m
	e.To = v.To
	return err
}
func decodeReplySend(data []byte) (CampaignReplyFlowSend, error) {
	var tag struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &tag); err != nil {
		return nil, err
	}
	var v CampaignReplyFlowSend
	switch tag.Kind {
	case "text":
		v = &CampaignReplyText{}
	case "buttons":
		v = &CampaignReplyButtons{}
	case "list":
		v = &CampaignReplyList{}
	case "flow_form":
		v = &CampaignReplyFlowForm{}
	default:
		return nil, validation("Unsupported reply message discriminator.")
	}
	if err := campaignDecode(data, v); err != nil {
		return nil, err
	}
	if err := validateReplySend(v); err != nil {
		return nil, err
	}
	return v, nil
}
func decodeReplyMatch(data []byte) (CampaignReplyFlowMatch, error) {
	var tag struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &tag); err != nil {
		return nil, err
	}
	var v CampaignReplyFlowMatch
	switch tag.Kind {
	case "choice":
		v = &CampaignReplyChoice{}
	case "keyword":
		v = &CampaignReplyKeyword{}
	case "flow_submission":
		v = &CampaignReplySubmission{}
	default:
		return nil, validation("Unsupported reply match discriminator.")
	}
	if err := campaignDecode(data, v); err != nil {
		return nil, err
	}
	if err := validateReplyResponseMatch(v); err != nil {
		return nil, err
	}
	return v, nil
}

func validateCampaignResponse(v any) error {
	switch x := v.(type) {
	case SignalCustodyDefault:
		if err := validateCustody(x.Revision, x.SignalModeDefault, true); err != nil {
			return err
		}
		return contractOne(string(x.EffectiveSignalMode), "effectiveSignalMode", "standard", "zero_knowledge")
	case CampaignReplyFlow:
		if err := contractUUID(x.ID, "id"); err != nil {
			return err
		}
		return validateReplyGraph(CreateCampaignReplyFlowRequest{Name: x.Name, Definition: x.Definition, FlowKey: &x.FlowKey, Revision: &x.Revision}, validateReplyResponseMatch)
	case CampaignReplyFlowAssignment:
		if err := contractUUID(x.CampaignID, "campaignId"); err != nil {
			return err
		}
		if x.ReplyFlowID != nil {
			return contractUUID(*x.ReplyFlowID, "replyFlowId")
		}
	case CampaignTestSend:
		return contractOne(x.Status, "status", "sent")
	case AudienceProfile:
		if err := contractInt(x.Revision, 1, campaignSafeInteger, "revision"); err != nil {
			return err
		}
		if err := validateProfilePhone(x.Phone); err != nil {
			return err
		}
		return validateProfilePut(PutAudienceProfileRequest{Tags: x.Tags, Attributes: x.Attributes, Provenance: x.Provenance})
	case AudienceConsentAssertion:
		if err := contractInt(x.ProfileRevision, 1, campaignSafeInteger, "profileRevision"); err != nil {
			return err
		}
		if err := validateProvenance(x.AudienceProfileProvenance); err != nil {
			return err
		}
		if x.Purpose != "campaigns" {
			return validation("Invalid consent purpose.")
		}
		return contractInt(x.AssertedAt, 0, 8640000000000000, "assertedAt")
	case AudienceProfileImportJob:
		if err := contractOne(x.State, "state", "queued", "completed", "cancelled"); err != nil {
			return err
		}
		if len(x.InvalidSamples) > 20 || len(x.ConflictSamples) > 20 {
			return validation("Import samples exceed twenty rows.")
		}
		for _, n := range []int64{x.TotalValid, x.InvalidCount, x.ProcessedValid, x.CreatedCount, x.UpdatedCount, x.ConflictCount} {
			if err := contractInt(n, 0, campaignSafeInteger, "count"); err != nil {
				return err
			}
		}
		for _, s := range x.InvalidSamples {
			if s.Row < 2 {
				return validation("Invalid import sample row.")
			}
		}
		for _, s := range x.ConflictSamples {
			if s.Row < 2 {
				return validation("Invalid import sample row.")
			}
			if err := contractOne(s.Reason, "reason", "quota", "revision_conflict"); err != nil {
				return err
			}
		}
	case DeleteAudienceProfileResult:
		if !x.Deleted {
			return validation("Deletion was not confirmed.")
		}
		return contractInt(x.Revision, 2, campaignSafeInteger, "revision")
	case StopConfirmationSettings:
		if x.TextRevision != 1 {
			return validation("Unknown confirmation text revision.")
		}
		if err := contractInt(x.Revision, 0, 2147483647, "revision"); err != nil {
			return err
		}
		return validateConfirmation(UpdateStopConfirmationSettingsRequest{TeamID: x.TeamID, Enabled: x.Enabled, Locale: Nullable[StopConfirmationLocale]{Value: x.Locale}})
	case AudienceFromCampaignResult:
		if x.Source != "campaign" {
			return validation("Invalid audience source.")
		}
		return contractOne(string(x.Outcome), "outcome", "delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed")
	}
	return nil
}
