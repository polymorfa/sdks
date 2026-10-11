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
	ExperimentOutcome *CampaignExperimentOutcome `json:"experimentOutcome,omitempty"`
	MessageVariations []CampaignMessageVariation `json:"messageVariations,omitempty"`
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
	for _, k := range []string{"id", "name", "status", "templateId", "recipientListId", "recipientCount", "sentCount", "deliveredCount", "readCount", "failedCount", "skippedCount", "scheduledAt", "launchedAt", "completedAt", "createdAt", "updatedAt", "sendWindow", "composerBlueprint", "messages", "audienceRef", "senderConfig", "complianceConfig", "variants", "variantStrategy", "experimentOutcome", "messageVariations"} {
		delete(all, k)
	}
	v.Extra = all
	return nil
}

type CampaignAnalytics struct {
	CampaignID     string                     `json:"campaignId"`
	RecipientCount int                        `json:"recipientCount"`
	SentCount      int                        `json:"sentCount"`
	DeliveredCount int                        `json:"deliveredCount"`
	ReadCount      int                        `json:"readCount"`
	FailedCount    int                        `json:"failedCount"`
	SkippedCount   int                        `json:"skippedCount"`
	RespondedCount int                        `json:"respondedCount"`
	ResponseRate   float64                    `json:"responseRate"`
	Experiment     *CampaignExperimentResults `json:"experiment,omitempty"`
}
type PlatformCampaignAnalytics struct {
	CampaignAnalytics
	AverageResponseTimeMS *float64 `json:"averageResponseTimeMs"`
	MinResponseTimeMS     *float64 `json:"minResponseTimeMs"`
	MaxResponseTimeMS     *float64 `json:"maxResponseTimeMs"`
}
type CreateCampaignRequest struct {
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
}
type CreatePlatformCampaignRequest struct {
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
	MessagesArray     json.RawMessage                      `json:"messagesArray,omitempty"`
	AudienceRef       json.RawMessage                      `json:"audienceRef,omitempty"`
	ComplianceConfig  json.RawMessage                      `json:"complianceConfig,omitempty"`
	Variants          []CampaignVariant                    `json:"variants,omitempty"`
	VariantStrategy   *CampaignVariantStrategy             `json:"variantStrategy,omitempty"`
	MessageVariations []CampaignMessageVariation           `json:"messageVariations,omitempty"`
}
type UpdateCampaignRequest struct {
	Name              *string                               `json:"name,omitempty"`
	RecipientListID   *Nullable[string]                     `json:"recipientListId,omitempty"`
	SenderConfig      PlatformPayload                       `json:"senderConfig,omitempty"`
	ScheduledAt       *Nullable[int64]                      `json:"scheduledAt,omitempty"`
	SendWindow        *Nullable[CampaignSendWindowRequest]  `json:"sendWindow,omitempty"`
	MessageVariations *Nullable[[]CampaignMessageVariation] `json:"messageVariations,omitempty"`
	Variants          *Nullable[[]CampaignVariant]          `json:"variants,omitempty"`
	VariantStrategy   *Nullable[CampaignVariantStrategy]    `json:"variantStrategy,omitempty"`
}
type UpdatePlatformCampaignRequest struct {
	UpdateCampaignRequest
	Extra PlatformPayload `json:"-"`
}

func (v UpdatePlatformCampaignRequest) MarshalJSON() ([]byte, error) {
	m := clonePayload(v.Extra)
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
	ID                string          `json:"id"`
	Phone             string          `json:"phone"`
	Variables         PlatformPayload `json:"variables"`
	VariantKey        *string         `json:"variantKey"`
	Status            string          `json:"status"`
	Attempts          int             `json:"attempts"`
	LastError         *string         `json:"lastError"`
	ExternalMessageID *string         `json:"externalMessageId"`
	QueuedAt          int64           `json:"queuedAt"`
	SentAt            *int64          `json:"sentAt"`
	DeliveredAt       *int64          `json:"deliveredAt"`
	ReadAt            *int64          `json:"readAt"`
	FailedAt          *int64          `json:"failedAt"`
	RespondedAt       *int64          `json:"respondedAt"`
}
type ListCampaignRecipientsParams struct {
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
	ScheduledAt *int64 `json:"scheduledAt,omitempty"`
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
