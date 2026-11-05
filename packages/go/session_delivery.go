package polymorfa

import (
	"bytes"
	"encoding/json"
)

type HistorySyncDelivery string

const (
	HistoryDeliveryArchive    HistorySyncDelivery = "archive"
	HistoryDeliveryDescriptor HistorySyncDelivery = "descriptor"
)

// HistorySyncDeliveryPatch permits descriptor writes; archive is read-only.
type HistorySyncDeliveryPatch string

const HistoryDeliverySetDescriptor HistorySyncDeliveryPatch = "descriptor"

type HistorySyncPolicyPatch struct {
	Mode        string                    `json:"mode,omitempty"`
	RequestFull *bool                     `json:"requestFull,omitempty"`
	Delivery    *HistorySyncDeliveryPatch `json:"delivery,omitempty"`
}
type EffectiveSessionConfiguration struct {
	Observation *ObservationConfiguration `json:"observation,omitempty"`
	HistorySync *HistorySyncPolicy        `json:"historySync,omitempty"`
	HMS         *HMSConfiguration         `json:"hms,omitempty"`
}
type ConfigurationSource string
type ConfigurationValueSource string

const (
	ConfigurationPlatform ConfigurationSource      = "platform"
	ConfigurationTeam     ConfigurationSource      = "team"
	ConfigurationProject  ConfigurationSource      = "project"
	ConfigurationSession  ConfigurationSource      = "session"
	ConfigurationConsent  ConfigurationValueSource = "consent"
)

type SessionConfigurationSources struct {
	HistorySyncMode        ConfigurationValueSource `json:"historySync.mode"`
	HistorySyncRequestFull ConfigurationValueSource `json:"historySync.requestFull"`
	HistorySyncDelivery    *ConfigurationSource     `json:"historySync.delivery,omitempty"`
	HMS                    ConfigurationSource      `json:"hms"`
	PresenceMode           ConfigurationSource      `json:"observation.presenceMode"`
	TypingMode             ConfigurationSource      `json:"observation.typingMode"`
	LabelMode              ConfigurationSource      `json:"observation.labelMode"`
	QuickReplyMode         ConfigurationSource      `json:"observation.quickReplyMode"`
}

// These reset paths keep existing []string callers source-compatible.
const (
	SessionResetHistorySync        = "historySync"
	SessionResetHistoryMode        = "historySync.mode"
	SessionResetHistoryRequestFull = "historySync.requestFull"
	SessionResetHistoryDelivery    = "historySync.delivery"
	SessionResetHMS                = "hms"
	SessionResetObservation        = "observation"
	SessionResetPresence           = "observation.presenceMode"
	SessionResetTyping             = "observation.typingMode"
	SessionResetLabel              = "observation.labelMode"
	SessionResetQuickReply         = "observation.quickReplyMode"
)

func deliveryOptions(o RequestOptions, intent bool) RequestOptions {
	if intent && o.APIVersion == "" {
		o.APIVersion = CustomerOwnedAPIVersion
	}
	return o
}
func historyIntent(x any, quick bool) (bool, error) {
	fields := []string{"mode", "requestFull", "delivery"}
	if quick {
		fields = append(fields, "consent")
	}
	m, e := existingFields(x, fields, nil)
	if e != nil {
		return false, e
	}
	if v, ok := m["mode"]; ok && v != "metadata_only" && v != "deliver" {
		return false, configuration("historySync.mode", "Unsupported history mode.")
	}
	if v, ok := m["requestFull"]; ok {
		if _, ok = v.(bool); !ok {
			return false, configuration("historySync.requestFull", "A boolean is required.")
		}
	}
	if v, ok := m["consent"]; ok && v != "ask" && v != "force_on" && v != "force_off" {
		return false, configuration("historySync.consent", "Unsupported history consent.")
	}
	v, ok := m["delivery"]
	if ok && v != "descriptor" {
		return false, configuration("historySync.delivery", "Only descriptor delivery can be set.")
	}
	return ok, nil
}
func configurationIntent(v UpdateSessionRequest) (bool, error) {
	m, e := campaignObject(v)
	if e != nil {
		return false, e
	}
	return configurationMapIntent(m)
}
func configurationMapIntent(m map[string]any) (bool, error) {
	if !existingInt(m["revision"], 0, float64(campaignSafeInteger)) {
		return false, configuration("revision", "A nonnegative safe revision is required.")
	}
	patch, e := existingFields(m["configuration"], []string{"set", "reset"}, nil)
	if e != nil {
		return false, e
	}
	intent := false
	if x, ok := patch["set"]; ok {
		set, e := existingFields(x, []string{"observation", "historySync", "hms"}, nil)
		if e != nil {
			return false, e
		}
		if x, ok := set["historySync"]; ok {
			intent, e = historyIntent(x, false)
			if e != nil {
				return false, e
			}
		}
	}
	if x, ok := patch["reset"]; ok {
		a, ok := x.([]any)
		if !ok {
			return false, configuration("reset", "Reset must be an array.")
		}
		for _, v := range a {
			s, ok := v.(string)
			if !ok {
				return false, configuration("reset", "Invalid reset path.")
			}
			switch s {
			case SessionResetHistorySync, SessionResetHistoryMode, SessionResetHistoryRequestFull, SessionResetHistoryDelivery, SessionResetHMS, SessionResetObservation, SessionResetPresence, SessionResetTyping, SessionResetLabel, SessionResetQuickReply:
			default:
				return false, configuration("reset", "Invalid reset path.")
			}
			intent = intent || s == SessionResetHistoryDelivery
		}
	}
	return intent, nil
}
func quickLinkIntent(v CreateQuickLinkRequest) (bool, error) {
	if v.Configuration != nil && v.Configuration.SessionConfigurationOverrides.HistorySync != nil {
		return false, configuration("historySync", "Use the invitation historySync field.")
	}
	m, e := campaignObject(v)
	if e != nil {
		return false, e
	}
	return quickLinkMapIntent(m)
}
func quickLinkMapIntent(m map[string]any) (bool, error) {
	if _, e := existingFields(m, []string{"purpose", "signalMode", "session", "addConnection", "connectionGoal", "projectId", "customerId", "externalId", "billingControls", "configuration"}, nil); e != nil {
		return false, e
	}
	mode, hasMode := m["signalMode"]
	if hasMode && mode != "standard" && mode != "zero_knowledge" {
		return false, configuration("signalMode", "Unsupported Signal custody mode.")
	}
	if m["purpose"] == "add_connection" {
		s, ok := m["session"].(string)
		if !ok || s == "" || (m["addConnection"] != "linked_devices" && m["addConnection"] != "official_api") || m["connectionGoal"] == "single" {
			return false, configuration("purpose", "A supplementary invitation requires a session and connection.")
		}
		for _, k := range []string{"signalMode", "customerId", "externalId", "billingControls"} {
			if _, ok := m[k]; ok {
				return false, configuration(k, "Unavailable on supplementary invitations.")
			}
		}
	} else {
		if p, ok := m["purpose"]; ok && p != "initial" {
			return false, configuration("purpose", "Unsupported invitation purpose.")
		}
		for _, k := range []string{"session", "addConnection"} {
			if _, ok := m[k]; ok {
				return false, configuration(k, "Unavailable on initial invitations.")
			}
		}
	}
	intent := hasMode
	if c, ok := m["configuration"]; ok {
		config, e := existingFields(c, []string{"observation", "hms", "testing", "connectionPreference", "connectionEnforcement", "methods", "defaultMethod", "prefillPhone", "allowPhoneChange", "historySync"}, nil)
		if e != nil {
			return false, e
		}
		if x, ok := config["historySync"]; ok {
			i, e := historyIntent(x, true)
			if e != nil {
				return false, e
			}
			intent = intent || i
		}
	}
	return intent, nil
}

// Reject unknown aliases and null named fields before decoding can discard them.
func (v *CreateQuickLinkRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return validation("An invitation object is required.")
	}
	if _, e := quickLinkMapIntent(m); e != nil {
		return e
	}
	type plain CreateQuickLinkRequest
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	*v = CreateQuickLinkRequest(x)
	return nil
}
func (v *UpdateSessionRequest) UnmarshalJSON(b []byte) error {
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m == nil {
		return validation("A configuration object is required.")
	}
	if _, e := existingFields(m, []string{"configuration", "revision"}, []string{"configuration", "revision"}); e != nil {
		return e
	}
	if _, e := configurationMapIntent(m); e != nil {
		return e
	}
	type plain UpdateSessionRequest
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	*v = UpdateSessionRequest(x)
	return nil
}
func (v *HistorySyncPolicy) UnmarshalJSON(b []byte) error {
	type plain HistorySyncPolicy
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	var m map[string]json.RawMessage
	json.Unmarshal(b, &m)
	if raw, ok := m["delivery"]; ok && (bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || x.Delivery == nil || (*x.Delivery != HistoryDeliveryArchive && *x.Delivery != HistoryDeliveryDescriptor)) {
		return validation("Invalid history delivery response.")
	}
	*v = HistorySyncPolicy(x)
	return nil
}
func (v *Session) UnmarshalJSON(b []byte) error {
	type plain Session
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	var m map[string]json.RawMessage
	json.Unmarshal(b, &m)
	if raw, ok := m["signalMode"]; ok && (bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || x.SignalMode == nil || (*x.SignalMode != SignalCustodyStandard && *x.SignalMode != SignalCustodyZeroKnowledge)) {
		return validation("Invalid immutable Signal custody mode.")
	}
	*v = Session(x)
	return nil
}
func (v *SessionConfigurationSources) UnmarshalJSON(b []byte) error {
	type plain SessionConfigurationSources
	var x plain
	if e := json.Unmarshal(b, &x); e != nil {
		return e
	}
	var m map[string]json.RawMessage
	json.Unmarshal(b, &m)
	if raw, ok := m["historySync.delivery"]; ok && (bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || x.HistorySyncDelivery == nil || contractOne(string(*x.HistorySyncDelivery), "historySync.delivery", "platform", "team", "project", "session") != nil) {
		return validation("Invalid history delivery source.")
	}
	*v = SessionConfigurationSources(x)
	return nil
}
