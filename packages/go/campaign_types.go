package polymorfa

import "encoding/json"

type CampaignBlueprint struct {
	Version int             `json:"version"`
	Source  string          `json:"source"`
	Extra   PlatformPayload `json:"-"`
}

func (v CampaignBlueprint) MarshalJSON() ([]byte, error) {
	m := clonePayload(v.Extra)
	m["version"], _ = json.Marshal(v.Version)
	m["source"], _ = json.Marshal(v.Source)
	return json.Marshal(m)
}
func (v *CampaignBlueprint) UnmarshalJSON(b []byte) error {
	var m PlatformPayload
	if err := json.Unmarshal(b, &m); err != nil {
		return err
	}
	if err := json.Unmarshal(m["version"], &v.Version); err != nil {
		return err
	}
	if err := json.Unmarshal(m["source"], &v.Source); err != nil {
		return err
	}
	delete(m, "version")
	delete(m, "source")
	v.Extra = m
	return nil
}
func clonePayload(p PlatformPayload) PlatformPayload {
	m := PlatformPayload{}
	for k, v := range p {
		m[k] = append(json.RawMessage{}, v...)
	}
	return m
}

type CampaignVariant struct {
	Key       string            `json:"key"`
	Label     string            `json:"label"`
	Weight    int               `json:"weight"`
	Blueprint CampaignBlueprint `json:"blueprint"`
}
type CampaignVariantStrategy struct {
	WinnerCriterion   string `json:"winnerCriterion"`
	HoldoutPercent    int    `json:"holdoutPercent"`
	TestSlicePercent  *int   `json:"testSlicePercent,omitempty"`
	AutoPromote       bool   `json:"autoPromote"`
	TestWindowMinutes int    `json:"testWindowMinutes"`
}
type CampaignExperimentOutcome struct {
	State     string `json:"state"`
	WinnerKey string `json:"winnerKey,omitempty"`
	Reason    string `json:"reason,omitempty"`
}
type CampaignExperimentVariantResult struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Weight      int     `json:"weight"`
	Assigned    int     `json:"assigned"`
	Sent        int     `json:"sent"`
	Delivered   int     `json:"delivered"`
	Read        int     `json:"read"`
	Replied     int     `json:"replied"`
	OutcomeRate float64 `json:"outcomeRate"`
}
type CampaignExperimentResults struct {
	Criterion    string                            `json:"criterion"`
	Outcome      *CampaignExperimentOutcome        `json:"outcome"`
	HoldoutCount int                               `json:"holdoutCount"`
	ReserveCount int                               `json:"reserveCount"`
	Variants     []CampaignExperimentVariantResult `json:"variants"`
}
type CampaignMessageVariation struct {
	Key       string            `json:"key"`
	Weight    int               `json:"weight"`
	Blueprint CampaignBlueprint `json:"blueprint"`
}

// CampaignFollowUpMessage is a sealed text/template union. Each variant supplies
// its own fixed discriminator, so callers cannot mix text and template fields.
type CampaignFollowUpMessage interface{ campaignFollowUpMessage() }
type CampaignFollowUpTextMessage struct {
	Text string `json:"text"`
}
type CampaignFollowUpTemplateMessage struct {
	TemplateID string `json:"templateId"`
}

func (CampaignFollowUpTextMessage) campaignFollowUpMessage()     {}
func (CampaignFollowUpTemplateMessage) campaignFollowUpMessage() {}
func (v CampaignFollowUpTextMessage) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}{"text", v.Text})
}
func (v CampaignFollowUpTemplateMessage) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type       string `json:"type"`
		TemplateID string `json:"templateId"`
	}{"template", v.TemplateID})
}

// CampaignFollowUp configures one receipt-timed follow-up (beta). The first
// delivery starts the wait; the first read restarts it before sending starts.
// Replies and opt-outs cancel it. The API enforces enrollment and bounds.
type CampaignFollowUp struct {
	// DelaySeconds is optional, 60 through 604800; the API defaults to 86400.
	DelaySeconds *int `json:"delaySeconds,omitempty"`
	// ExpirySeconds is optional, 86400 through 2592000 and longer than the delay;
	// the API defaults to 604800. Expiry starts at the first message's send.
	ExpirySeconds *int                    `json:"expirySeconds,omitempty"`
	Message       CampaignFollowUpMessage `json:"message"`
}

func (v CampaignFollowUp) MarshalJSON() ([]byte, error) {
	switch message := v.Message.(type) {
	case CampaignFollowUpTextMessage, CampaignFollowUpTemplateMessage:
	case *CampaignFollowUpTextMessage:
		if message == nil {
			return nil, validation("A follow-up message is required.")
		}
	case *CampaignFollowUpTemplateMessage:
		if message == nil {
			return nil, validation("A follow-up message is required.")
		}
	default:
		return nil, validation("A text or template follow-up message is required.")
	}
	type config CampaignFollowUp
	return json.Marshal(config(v))
}
func (v *CampaignFollowUp) UnmarshalJSON(data []byte) error {
	var wire struct {
		DelaySeconds  *int                       `json:"delaySeconds"`
		ExpirySeconds *int                       `json:"expirySeconds"`
		Message       map[string]json.RawMessage `json:"message"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	var kind string
	if err := json.Unmarshal(wire.Message["type"], &kind); err != nil {
		return validation("A follow-up message discriminator is required.")
	}
	if kind == "text" {
		if _, ok := wire.Message["templateId"]; ok {
			return validation("A text follow-up cannot contain templateId.")
		}
	}
	if kind == "template" {
		if _, ok := wire.Message["text"]; ok {
			return validation("A template follow-up cannot contain text.")
		}
	}
	var message CampaignFollowUpMessage
	switch kind {
	case "text":
		var text *string
		if err := json.Unmarshal(wire.Message["text"], &text); err != nil || text == nil {
			return validation("A text follow-up requires text.")
		}
		message = CampaignFollowUpTextMessage{Text: *text}
	case "template":
		var id *string
		if err := json.Unmarshal(wire.Message["templateId"], &id); err != nil || id == nil {
			return validation("A template follow-up requires templateId.")
		}
		message = CampaignFollowUpTemplateMessage{TemplateID: *id}
	default:
		return validation("A follow-up must use text or template.")
	}
	*v = CampaignFollowUp{DelaySeconds: wire.DelaySeconds, ExpirySeconds: wire.ExpirySeconds, Message: message}
	return nil
}

type CampaignFollowUpStatus string

const (
	CampaignFollowUpWaitingReceipt CampaignFollowUpStatus = "waiting_receipt"
	CampaignFollowUpScheduled      CampaignFollowUpStatus = "scheduled"
	CampaignFollowUpSending        CampaignFollowUpStatus = "sending"
	CampaignFollowUpSent           CampaignFollowUpStatus = "sent"
	CampaignFollowUpCancelled      CampaignFollowUpStatus = "cancelled"
	CampaignFollowUpExpired        CampaignFollowUpStatus = "expired"
	CampaignFollowUpFailed         CampaignFollowUpStatus = "failed"
	CampaignFollowUpOutcomeUnknown CampaignFollowUpStatus = "outcome_unknown"
)

// CampaignFollowUpSummary describes one recipient's follow-up. Times are Unix
// milliseconds; a nil anchor means that no delivery or read receipt timed it.
type CampaignFollowUpSummary struct {
	ID               string                 `json:"id"`
	NumberID         string                 `json:"numberId"`
	Status           CampaignFollowUpStatus `json:"status"`
	AnchorKind       *string                `json:"anchorKind"`
	FirstDeliveredAt *int64                 `json:"firstDeliveredAt"`
	FirstReadAt      *int64                 `json:"firstReadAt"`
	DueAt            *int64                 `json:"dueAt"`
	ExpiresAt        int64                  `json:"expiresAt"`
	SentAt           *int64                 `json:"sentAt"`
	DeliveredAt      *int64                 `json:"deliveredAt"`
	ReadAt           *int64                 `json:"readAt"`
	RepliedAt        *int64                 `json:"repliedAt"`
	Reason           *string                `json:"reason"`
	CommandID        *string                `json:"commandId"`
}

// CampaignFollowUpReport counts follow-up outcomes separately from first messages.
type CampaignFollowUpReport struct {
	Total     int    `json:"total"`
	Waiting   int    `json:"waiting"`
	Scheduled int    `json:"scheduled"`
	Sending   int    `json:"sending"`
	Sent      int    `json:"sent"`
	Delivered int    `json:"delivered"`
	Read      int    `json:"read"`
	Replied   int    `json:"replied"`
	Cancelled int    `json:"cancelled"`
	Expired   int    `json:"expired"`
	Failed    int    `json:"failed"`
	Unknown   int    `json:"unknown"`
	NextDueAt *int64 `json:"nextDueAt"`
}
type CampaignSendWindowRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}
type CampaignSendWindowRequest struct {
	TimeZone          string                    `json:"timeZone,omitempty"`
	Days              []string                  `json:"days"`
	Hours             []CampaignSendWindowRange `json:"hours"`
	RecipientTimeZone *bool                     `json:"recipientTimeZone,omitempty"`
	TimeZoneVariable  string                    `json:"timeZoneVariable,omitempty"`
}
type CampaignSendWindow struct {
	TimeZone          string                    `json:"timeZone"`
	Days              []string                  `json:"days"`
	Hours             []CampaignSendWindowRange `json:"hours"`
	RecipientTimeZone bool                      `json:"recipientTimeZone"`
	TimeZoneVariable  string                    `json:"timeZoneVariable"`
}
type Campaign struct {
	VariableMapping   *CampaignVariableMapping   `json:"variableMapping,omitempty"`
	TrackedLinks      CampaignTrackedLinks       `json:"trackedLinks"`
	ID                string                     `json:"id"`
	Name              string                     `json:"name"`
	Status            string                     `json:"status"`
	TemplateID        *string                    `json:"templateId"`
	RecipientListID   *string                    `json:"recipientListId"`
	RecipientCount    int                        `json:"recipientCount"`
	SentCount         int                        `json:"sentCount"`
	DeliveredCount    int                        `json:"deliveredCount"`
	ReadCount         int                        `json:"readCount"`
	FailedCount       int                        `json:"failedCount"`
	SkippedCount      int                        `json:"skippedCount"`
	ScheduledAt       *int64                     `json:"scheduledAt"`
	LaunchedAt        *int64                     `json:"launchedAt"`
	CompletedAt       *int64                     `json:"completedAt"`
	CreatedAt         int64                      `json:"createdAt"`
	UpdatedAt         int64                      `json:"updatedAt"`
	SendWindow        *CampaignSendWindow        `json:"sendWindow"`
	ComposerBlueprint json.RawMessage            `json:"composerBlueprint,omitempty"`
	Messages          json.RawMessage            `json:"messages,omitempty"`
	AudienceRef       json.RawMessage            `json:"audienceRef,omitempty"`
	SenderConfig      json.RawMessage            `json:"senderConfig,omitempty"`
	ComplianceConfig  json.RawMessage            `json:"complianceConfig,omitempty"`
	Variants          []CampaignVariant          `json:"variants,omitempty"`
	VariantStrategy   *CampaignVariantStrategy   `json:"variantStrategy,omitempty"`
	ExperimentOutcome *CampaignExperimentOutcome `json:"experimentOutcome"`
	MessageVariations []CampaignMessageVariation `json:"messageVariations,omitempty"`
	FollowUp          *CampaignFollowUp          `json:"followUp"`
	// FrequencyCap is this campaign's own cap; nil when only the team cap applies.
	FrequencyCap *CampaignFrequencyCap `json:"frequencyCap,omitempty"`
	// Drip is nil for a campaign that is not a drip.
	Drip *CampaignDrip `json:"drip,omitempty"`
	// EnrollmentOpen reports continuous enrollment; nil for a non-drip.
	EnrollmentOpen *bool `json:"enrollmentOpen,omitempty"`
	// PauseReason is the stored reason while paused, or nil.
	PauseReason *string `json:"pauseReason,omitempty"`
	// SegmentID is the saved segment evaluated at launch, or nil. Read-only on
	// the Messaging API; choose segments with an team key.
	SegmentID       *string                  `json:"segmentId,omitempty"`
	SegmentSnapshot *CampaignSegmentSnapshot `json:"segmentSnapshot,omitempty"`
}
type PlatformCampaign struct {
	Campaign
	Extra PlatformPayload `json:"-"`
}

func (v PlatformCampaign) MarshalJSON() ([]byte, error) {
	m := clonePayload(v.Extra)
	b, err := json.Marshal(v.Campaign)
	if err != nil {
		return nil, err
	}
	var fields PlatformPayload
	json.Unmarshal(b, &fields)
	for k, v := range fields {
		m[k] = v
	}
	return json.Marshal(m)
}
func (v *PlatformCampaign) UnmarshalJSON(b []byte) error {
	if err := json.Unmarshal(b, &v.Campaign); err != nil {
		return err
	}
	var all PlatformPayload
	if err := json.Unmarshal(b, &all); err != nil {
		return err
	}
	for _, k := range []string{"id", "name", "status", "templateId", "recipientListId", "recipientCount", "sentCount", "deliveredCount", "readCount", "failedCount", "skippedCount", "scheduledAt", "launchedAt", "completedAt", "createdAt", "updatedAt", "sendWindow", "composerBlueprint", "messages", "audienceRef", "senderConfig", "complianceConfig", "variants", "variantStrategy", "experimentOutcome", "messageVariations", "followUp", "variableMapping", "trackedLinks", "frequencyCap", "drip", "enrollmentOpen", "pauseReason", "segmentId", "segmentSnapshot"} {
		delete(all, k)
	}
	v.Extra = all
	return nil
}

type CampaignAnalytics struct {
	AverageResponseTimeMS *float64                   `json:"averageResponseTimeMs"`
	MinResponseTimeMS     *float64                   `json:"minResponseTimeMs"`
	MaxResponseTimeMS     *float64                   `json:"maxResponseTimeMs"`
	CampaignID            string                     `json:"campaignId"`
	RecipientCount        int                        `json:"recipientCount"`
	SentCount             int                        `json:"sentCount"`
	DeliveredCount        int                        `json:"deliveredCount"`
	ReadCount             int                        `json:"readCount"`
	FailedCount           int                        `json:"failedCount"`
	SkippedCount          int                        `json:"skippedCount"`
	RespondedCount        int                        `json:"respondedCount"`
	ResponseRate          float64                    `json:"responseRate"`
	Experiment            *CampaignExperimentResults `json:"experiment"`
	FollowUps             CampaignFollowUpReport     `json:"followUps"`
	// FrequencyCap counts recipients with a message skipped by the cap.
	FrequencyCap *CampaignFrequencyCapAnalytics `json:"frequencyCap,omitempty"`
	// Drip reports results by step; nil for a campaign that is not a drip.
	Drip *CampaignDripStats `json:"drip,omitempty"`
}
type PlatformCampaignAnalytics struct {
	CampaignAnalytics
}
type CreateCampaignRequest struct {
	VariableMapping   *CampaignVariableMapping              `json:"variableMapping,omitempty"`
	TrackedLinks      *Nullable[CampaignTrackedLinks]       `json:"trackedLinks,omitempty"`
	Name              string                                `json:"name"`
	TemplateID        string                                `json:"templateId,omitempty"`
	RecipientListID   string                                `json:"recipientListId,omitempty"`
	SenderConfig      PlatformPayload                       `json:"senderConfig,omitempty"`
	ScheduledAt       *int64                                `json:"scheduledAt,omitempty"`
	SendWindow        *Nullable[CampaignSendWindowRequest]  `json:"sendWindow,omitempty"`
	Recipients        []CampaignRecipientInput              `json:"recipients,omitempty"`
	MessageVariations *Nullable[[]CampaignMessageVariation] `json:"messageVariations,omitempty"`
	Variants          *Nullable[[]CampaignVariant]          `json:"variants,omitempty"`
	VariantStrategy   *Nullable[CampaignVariantStrategy]    `json:"variantStrategy,omitempty"`
	FollowUp          *Nullable[CampaignFollowUp]           `json:"followUp,omitempty"`
	// FrequencyCap is a beta campaign cap stricter than the team cap; null uses the team cap.
	FrequencyCap *Nullable[CampaignFrequencyCap] `json:"frequencyCap,omitempty"`
	// Drip is beta; null creates an ordinary campaign.
	Drip *Nullable[CampaignDripInput] `json:"drip,omitempty"`
}
type CreatePlatformCampaignRequest struct {
	VariableMapping   *CampaignVariableMapping             `json:"variableMapping,omitempty"`
	TrackedLinks      *Nullable[CampaignTrackedLinks]      `json:"trackedLinks,omitempty"`
	ProjectID         string                               `json:"projectId"`
	Name              string                               `json:"name"`
	TemplateID        string                               `json:"templateId,omitempty"`
	RecipientListID   string                               `json:"recipientListId,omitempty"`
	SenderConfig      PlatformPayload                      `json:"senderConfig,omitempty"`
	ScheduledAt       *int64                               `json:"scheduledAt,omitempty"`
	SendWindow        *Nullable[CampaignSendWindowRequest] `json:"sendWindow,omitempty"`
	Recipients        []CampaignRecipientInput             `json:"recipients,omitempty"`
	RecipientCount    *int                                 `json:"recipientCount,omitempty"`
	ComposerBlueprint json.RawMessage                      `json:"composerBlueprint,omitempty"`
	MessagesArray     *[]CampaignComposedMessage           `json:"messagesArray,omitempty"`
	AudienceRef       json.RawMessage                      `json:"audienceRef,omitempty"`
	ComplianceConfig  json.RawMessage                      `json:"complianceConfig,omitempty"`
	Variants          []CampaignVariant                    `json:"variants,omitempty"`
	VariantStrategy   *CampaignVariantStrategy             `json:"variantStrategy,omitempty"`
	MessageVariations []CampaignMessageVariation           `json:"messageVariations,omitempty"`
	FollowUp          *Nullable[CampaignFollowUp]          `json:"followUp,omitempty"`
	FrequencyCap      *Nullable[CampaignFrequencyCap]      `json:"frequencyCap,omitempty"`
	// SegmentID is a beta saved segment evaluated at launch. The create schema
	// permits omission, not null, and cannot combine it with RecipientListID.
	SegmentID string                       `json:"segmentId,omitempty"`
	Drip      *Nullable[CampaignDripInput] `json:"drip,omitempty"`
}
type UpdateCampaignRequest struct {
	TemplateID        *Nullable[string]                     `json:"templateId,omitempty"`
	VariableMapping   *Nullable[CampaignVariableMapping]    `json:"variableMapping,omitempty"`
	TrackedLinks      *Nullable[CampaignTrackedLinks]       `json:"trackedLinks,omitempty"`
	Name              *string                               `json:"name,omitempty"`
	RecipientListID   *Nullable[string]                     `json:"recipientListId,omitempty"`
	SenderConfig      PlatformPayload                       `json:"senderConfig,omitempty"`
	ScheduledAt       *Nullable[int64]                      `json:"scheduledAt,omitempty"`
	SendWindow        *Nullable[CampaignSendWindowRequest]  `json:"sendWindow,omitempty"`
	MessageVariations *Nullable[[]CampaignMessageVariation] `json:"messageVariations,omitempty"`
	Variants          *Nullable[[]CampaignVariant]          `json:"variants,omitempty"`
	VariantStrategy   *Nullable[CampaignVariantStrategy]    `json:"variantStrategy,omitempty"`
	FollowUp          *Nullable[CampaignFollowUp]           `json:"followUp,omitempty"`
	// FrequencyCap replaces the campaign cap; null removes it. Draft or paused only.
	FrequencyCap *Nullable[CampaignFrequencyCap] `json:"frequencyCap,omitempty"`
	// Drip changes only the fields set; null makes the draft an ordinary campaign.
	Drip *Nullable[CampaignDripPatch] `json:"drip,omitempty"`
}
type UpdatePlatformCampaignRequest struct {
	UpdateCampaignRequest
	MessagesArray *[]CampaignComposedMessage `json:"messagesArray,omitempty"`
	// SegmentID sets the saved segment, or null clears it. Unlaunched drafts only.
	SegmentID *Nullable[string] `json:"segmentId,omitempty"`
	Extra     PlatformPayload   `json:"-"`
}

func (v UpdatePlatformCampaignRequest) MarshalJSON() ([]byte, error) {
	m := clonePayload(v.Extra)
	if v.MessagesArray != nil {
		m["messagesArray"], _ = json.Marshal(v.MessagesArray)
	}
	if v.SegmentID != nil {
		m["segmentId"], _ = json.Marshal(v.SegmentID)
	}
	b, err := json.Marshal(v.UpdateCampaignRequest)
	if err != nil {
		return nil, err
	}
	var fields PlatformPayload
	json.Unmarshal(b, &fields)
	for k, v := range fields {
		m[k] = v
	}
	return json.Marshal(m)
}

type CampaignRecipient struct {
	FailureReason     *CampaignRecipientFailureReason `json:"failureReason"`
	MessagesSent      int                             `json:"messagesSent"`
	NextMessageAt     *float64                        `json:"nextMessageAt"`
	SequenceError     *string                         `json:"sequenceError"`
	ID                string                          `json:"id"`
	Phone             string                          `json:"phone"`
	Variables         PlatformPayload                 `json:"variables"`
	VariantKey        *string                         `json:"variantKey"`
	Status            string                          `json:"status"`
	Attempts          int                             `json:"attempts"`
	LastError         *string                         `json:"lastError"`
	ExternalMessageID *string                         `json:"externalMessageId"`
	QueuedAt          int64                           `json:"queuedAt"`
	SentAt            *int64                          `json:"sentAt"`
	DeliveredAt       *int64                          `json:"deliveredAt"`
	ReadAt            *int64                          `json:"readAt"`
	FailedAt          *int64                          `json:"failedAt"`
	RespondedAt       *int64                          `json:"respondedAt"`
	FollowUp          *CampaignFollowUpSummary        `json:"followUp"`
}
type ListCampaignRecipientsParams struct {
	Reason CampaignRecipientFailureReason
	ListParams
	Status string
}
type ListPlatformCampaignRecipientsParams struct {
	ListCampaignRecipientsParams
	ProjectID string
}
type AddCampaignRecipientsRequest struct {
	Recipients []CampaignRecipientInput `json:"recipients"`
}
type AddCampaignRecipientsResult struct {
	CampaignID     string                `json:"campaignId"`
	Added          int                   `json:"added"`
	RecipientCount int                   `json:"recipientCount"`
	DuplicateCount int                   `json:"duplicateCount"`
	InvalidCount   int                   `json:"invalidCount"`
	InvalidRows    []InvalidRecipientRow `json:"invalidRows"`
}
type AddPlatformCampaignRecipientsRequest struct {
	ProjectID  string                   `json:"projectId"`
	Recipients []CampaignRecipientInput `json:"recipients"`
}
type CampaignOperation struct {
	Campaign
	OperationID string `json:"operationId"`
}
type CampaignStopOperation struct {
	Campaign
	OperationID *string `json:"operationId"`
}
type LaunchCampaignRequest struct {
	SkipMissingVariables *bool    `json:"skipMissingVariables,omitempty"`
	ScheduledAt          *float64 `json:"scheduledAt,omitempty"`
}
type RescheduleCampaignRequest struct {
	ScheduledAt *int64 `json:"scheduledAt"`
}
type ReschedulePlatformCampaignRequest struct {
	ProjectID   string `json:"projectId"`
	ScheduledAt *int64 `json:"scheduledAt"`
}
type RequeueCampaignRequest struct {
	IncludeSkippedError *bool `json:"includeSkippedError,omitempty"`
}
type CampaignRequeueResult struct {
	Requeued int `json:"requeued"`
}
type ListCampaignsParams struct{ ProjectID, ProjectSlug string }
type PlatformCampaignParams struct{ ProjectID string }
type CampaignConversionValue struct {
	AmountMinor int64  `json:"amountMinor"`
	Currency    string `json:"currency"`
}
type RecordCampaignConversionRequest struct {
	ProjectID   string                             `json:"projectId"`
	RecipientID string                             `json:"recipientId"`
	EventID     string                             `json:"eventId"`
	EventType   string                             `json:"eventType"`
	OccurredAt  string                             `json:"occurredAt"`
	Value       *Nullable[CampaignConversionValue] `json:"value,omitempty"`
}
type CampaignConversionAttribution struct {
	Outcome    string  `json:"outcome"`
	TouchAt    *string `json:"touchAt"`
	WindowDays int     `json:"windowDays"`
}
type CampaignConversion struct {
	ID          string                        `json:"id"`
	CampaignID  string                        `json:"campaignId"`
	RecipientID *string                       `json:"recipientId"`
	EventType   string                        `json:"eventType"`
	OccurredAt  string                        `json:"occurredAt"`
	Value       *CampaignConversionValue      `json:"value"`
	Evidence    string                        `json:"evidence"`
	Attribution CampaignConversionAttribution `json:"attribution"`
	RecordedAt  string                        `json:"recordedAt"`
	Replayed    bool                          `json:"replayed"`
}
type CampaignConversionCurrencyTotal struct {
	Currency                string `json:"currency"`
	Evidence                string `json:"evidence"`
	AttributedConversions   int    `json:"attributedConversions"`
	AttributedAmountMinor   string `json:"attributedAmountMinor"`
	UnattributedConversions int    `json:"unattributedConversions"`
	UnattributedAmountMinor string `json:"unattributedAmountMinor"`
}
type CampaignConversionModel struct {
	Touch       string `json:"touch"`
	WindowDays  int    `json:"windowDays"`
	Correlation string `json:"correlation"`
}
type CampaignConversionCounts struct {
	Total         int `json:"total"`
	Attributed    int `json:"attributed"`
	OutsideWindow int `json:"outsideWindow"`
	NotSent       int `json:"notSent"`
	OptedOut      int `json:"optedOut"`
}
type CampaignConversionReport struct {
	CampaignID          string                            `json:"campaignId"`
	Model               CampaignConversionModel           `json:"model"`
	SentCount           int                               `json:"sentCount"`
	Conversions         CampaignConversionCounts          `json:"conversions"`
	ConvertedRecipients int                               `json:"convertedRecipients"`
	ConversionRate      float64                           `json:"conversionRate"`
	Values              []CampaignConversionCurrencyTotal `json:"values"`
}

// LaunchPlatformCampaignRequest selects an explicit project and retains false/zero.
type LaunchPlatformCampaignRequest struct {
	ProjectID string `json:"projectId"`
	LaunchCampaignRequest
}
type PlatformCampaignOperation struct {
	PlatformCampaign
	OperationID string `json:"operationId"`
}

func (v *PlatformCampaignOperation) UnmarshalJSON(b []byte) error {
	if err := json.Unmarshal(b, &v.PlatformCampaign); err != nil {
		return err
	}
	var w struct {
		OperationID string `json:"operationId"`
	}
	if err := json.Unmarshal(b, &w); err != nil {
		return err
	}
	v.OperationID = w.OperationID
	delete(v.Extra, "operationId")
	return nil
}
func (v PlatformCampaignOperation) MarshalJSON() ([]byte, error) {
	b, err := json.Marshal(v.PlatformCampaign)
	if err != nil {
		return nil, err
	}
	var m PlatformPayload
	json.Unmarshal(b, &m)
	m["operationId"], _ = json.Marshal(v.OperationID)
	return json.Marshal(m)
}
