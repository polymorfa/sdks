package polymorfa

import "encoding/json"

// CampaignReplyFlowSend is a closed set of supported public message variants.
type CampaignReplyFlowSend interface{ campaignReplyFlowSend() }
type CampaignReplyText struct {
	Text string `json:"text"`
}
type CampaignReplyButton struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}
type CampaignReplyButtons struct {
	Body    string                `json:"body"`
	Footer  *string               `json:"footer,omitempty"`
	Buttons []CampaignReplyButton `json:"buttons"`
}
type CampaignReplyRow struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
}
type CampaignReplyList struct {
	Body       string             `json:"body"`
	ButtonText string             `json:"buttonText"`
	Footer     *string            `json:"footer,omitempty"`
	Rows       []CampaignReplyRow `json:"rows"`
}
type CampaignReplyFlowForm struct {
	FlowID     string  `json:"flowId"`
	Body       string  `json:"body"`
	ButtonText string  `json:"buttonText"`
	Footer     *string `json:"footer,omitempty"`
	Screen     string  `json:"screen"`
}

func (CampaignReplyText) campaignReplyFlowSend()     {}
func (CampaignReplyButtons) campaignReplyFlowSend()  {}
func (CampaignReplyList) campaignReplyFlowSend()     {}
func (CampaignReplyFlowForm) campaignReplyFlowSend() {}
func (v CampaignReplyText) MarshalJSON() ([]byte, error) {
	type value CampaignReplyText
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"text", value(v)})
}
func (v CampaignReplyButtons) MarshalJSON() ([]byte, error) {
	type value CampaignReplyButtons
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"buttons", value(v)})
}
func (v CampaignReplyList) MarshalJSON() ([]byte, error) {
	type value CampaignReplyList
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"list", value(v)})
}
func (v CampaignReplyFlowForm) MarshalJSON() ([]byte, error) {
	type value CampaignReplyFlowForm
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"flow_form", value(v)})
}

type CampaignReplyFlowMatch interface{ campaignReplyFlowMatch() }
type CampaignReplyChoice struct {
	ReplyKind string `json:"replyKind"`
	ID        string `json:"id"`
}
type CampaignReplyKeyword struct {
	Value string `json:"value"`
}
type CampaignReplySubmission struct{}

func (CampaignReplyChoice) campaignReplyFlowMatch()     {}
func (CampaignReplyKeyword) campaignReplyFlowMatch()    {}
func (CampaignReplySubmission) campaignReplyFlowMatch() {}
func (v CampaignReplyChoice) MarshalJSON() ([]byte, error) {
	type value CampaignReplyChoice
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"choice", value(v)})
}
func (v CampaignReplyKeyword) MarshalJSON() ([]byte, error) {
	type value CampaignReplyKeyword
	return json.Marshal(struct {
		Kind string `json:"kind"`
		value
	}{"keyword", value(v)})
}
func (CampaignReplySubmission) MarshalJSON() ([]byte, error) {
	return []byte(`{"kind":"flow_submission"}`), nil
}

type CampaignReplyFlowEdge struct {
	Match CampaignReplyFlowMatch `json:"match"`
	To    string                 `json:"to"`
}
type CampaignReplyFlowNode struct {
	ID    string                  `json:"id"`
	Send  CampaignReplyFlowSend   `json:"send,omitempty"`
	Edges []CampaignReplyFlowEdge `json:"edges"`
}
type CampaignReplyFlowDefinition struct {
	EntryNodeID string                  `json:"entryNodeId"`
	Nodes       []CampaignReplyFlowNode `json:"nodes"`
}
type CreateCampaignReplyFlowRequest struct {
	Name       string                      `json:"name"`
	Definition CampaignReplyFlowDefinition `json:"definition"`
	FlowKey    *string                     `json:"flowKey,omitempty"`
	Revision   *int64                      `json:"revision,omitempty"`
}
type CreatePlatformCampaignReplyFlowRequest struct {
	CreateCampaignReplyFlowRequest
	ProjectID string `json:"projectId"`
}
type CampaignReplyFlow struct {
	ID         string                      `json:"id"`
	FlowKey    string                      `json:"flowKey"`
	Revision   int64                       `json:"revision"`
	Name       string                      `json:"name"`
	Definition CampaignReplyFlowDefinition `json:"definition"`
	CreatedAt  int64                       `json:"createdAt"`
}
type CampaignProjectParams struct{ ProjectID string }
type CampaignTestSendRequest struct {
	SessionID         string                       `json:"sessionId"`
	To                string                       `json:"to"`
	SampleRecipientID *string                      `json:"sampleRecipientId,omitempty"`
	Variables         *map[string]CampaignVariable `json:"variables,omitempty"`
}
type PlatformCampaignTestSendRequest struct {
	CampaignTestSendRequest
	ProjectID string `json:"projectId"`
}
type CampaignTestSender struct {
	SessionID string `json:"sessionId"`
	Phone     string `json:"phone"`
}
type CampaignTestSend struct {
	ID         string             `json:"id"`
	CampaignID string             `json:"campaignId"`
	Status     string             `json:"status"`
	From       CampaignTestSender `json:"from"`
	To         string             `json:"to"`
	MessageID  *string            `json:"messageId"`
	Variables  map[string]string  `json:"variables"`
	CreatedAt  int64              `json:"createdAt"`
}

// ReplyFlowID is required. Its zero Nullable value explicitly detaches a flow.
type SetCampaignReplyFlowRequest struct {
	ReplyFlowID Nullable[string] `json:"replyFlowId"`
}
type SetPlatformCampaignReplyFlowRequest struct {
	SetCampaignReplyFlowRequest
	ProjectID string `json:"projectId"`
}
type CampaignReplyFlowAssignment struct {
	CampaignID  string  `json:"campaignId"`
	ReplyFlowID *string `json:"replyFlowId"`
}
type CampaignTrackedLinkReport struct {
	Key         string `json:"key"`
	URL         string `json:"url"`
	UniqueOpens int64  `json:"uniqueOpens"`
	TotalOpens  int64  `json:"totalOpens"`
}
type CampaignRecipientExportParams struct {
	Status *string
	Reason *string
	Cursor *string
	Limit  *int
}
type PlatformCampaignRecipientExportParams struct {
	CampaignRecipientExportParams
	ProjectID string
}
type CampaignRecipientExportPage struct {
	CSV        string
	NextCursor *string
	Filename   *string
}
type CampaignApprovalRequester struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}
type CampaignLaunchApproval struct {
	ID             string                    `json:"id"`
	CampaignID     string                    `json:"campaignId"`
	Action         string                    `json:"action"`
	Status         string                    `json:"status"`
	Reasons        []string                  `json:"reasons"`
	RecipientCount int64                     `json:"recipientCount"`
	ScheduledAt    *int64                    `json:"scheduledAt"`
	RequestedBy    CampaignApprovalRequester `json:"requestedBy"`
	RequestedAt    int64                     `json:"requestedAt"`
	ExpiresAt      int64                     `json:"expiresAt"`
	DecidedBy      *string                   `json:"decidedBy"`
	DecidedAt      *int64                    `json:"decidedAt"`
	OperationID    *string                   `json:"operationId"`
}
type CampaignLaunchApprovalSettings struct {
	RecipientThreshold *int64 `json:"recipientThreshold"`
}
type CampaignSettings struct {
	LaunchApproval CampaignLaunchApprovalSettings `json:"launchApproval"`
}
type CampaignRetargetOutcome string

const (
	CampaignOutcomeDelivered    CampaignRetargetOutcome = "delivered"
	CampaignOutcomeNotDelivered CampaignRetargetOutcome = "not_delivered"
	CampaignOutcomeRead         CampaignRetargetOutcome = "read"
	CampaignOutcomeNotRead      CampaignRetargetOutcome = "not_read"
	CampaignOutcomeReplied      CampaignRetargetOutcome = "replied"
	CampaignOutcomeNotReplied   CampaignRetargetOutcome = "not_replied"
	CampaignOutcomeFailed       CampaignRetargetOutcome = "failed"
)

type CreateAudienceFromCampaignRequest struct {
	Name       string                  `json:"name"`
	CampaignID string                  `json:"campaignId"`
	Outcome    CampaignRetargetOutcome `json:"outcome"`
	ProjectID  *string                 `json:"projectId,omitempty"`
}
type AudienceFromCampaignResult struct {
	ID               string                      `json:"id"`
	Name             string                      `json:"name"`
	Source           string                      `json:"source"`
	RecipientCount   int64                       `json:"recipientCount"`
	FileID           *string                     `json:"fileId"`
	Columns          *[]string                   `json:"columns"`
	SampleRow        *map[string]string          `json:"sampleRow"`
	Mapping          *map[string]json.RawMessage `json:"mapping"`
	CreatedAt        int64                       `json:"createdAt"`
	UpdatedAt        int64                       `json:"updatedAt"`
	SourceCampaignID string                      `json:"sourceCampaignId"`
	Outcome          CampaignRetargetOutcome     `json:"outcome"`
	MatchedCount     int64                       `json:"matchedCount"`
	OptedOutCount    int64                       `json:"optedOutCount"`
}

type StopConfirmationLocale string

const (
	StopConfirmationEnglish    StopConfirmationLocale = "en"
	StopConfirmationPortuguese StopConfirmationLocale = "pt-BR"
	StopConfirmationSpanish    StopConfirmationLocale = "es"
)

type StopConfirmationSettings struct {
	TeamID          string                  `json:"teamId"`
	Enabled         bool                    `json:"enabled"`
	Locale          *StopConfirmationLocale `json:"locale"`
	Revision        int64                   `json:"revision"`
	TextRevision    int                     `json:"textRevision"`
	Acknowledgement *string                 `json:"acknowledgement"`
	UpdatedAt       *int64                  `json:"updatedAt"`
}
type UpdateStopConfirmationSettingsRequest struct {
	TeamID   string                           `json:"teamId"`
	Enabled  bool                             `json:"enabled"`
	Locale   Nullable[StopConfirmationLocale] `json:"locale"`
	Revision int64                            `json:"revision"`
}
type StopConfirmationCounts struct {
	Queued    int64 `json:"queued"`
	Admitted  int64 `json:"admitted"`
	Completed int64 `json:"completed"`
	Failed    int64 `json:"failed"`
	Unknown   int64 `json:"unknown"`
}
type StopConfirmationSummary struct {
	Enabled bool                   `json:"enabled"`
	Counts  StopConfirmationCounts `json:"counts"`
}
type SignalCustodyMode string

const (
	SignalCustodyStandard      SignalCustodyMode = "standard"
	SignalCustodyZeroKnowledge SignalCustodyMode = "zero_knowledge"
)

type SignalCustodyDefault struct {
	SignalModeDefault   *SignalCustodyMode `json:"signalModeDefault"`
	EffectiveSignalMode SignalCustodyMode  `json:"effectiveSignalMode"`
	Revision            int64              `json:"revision"`
}
type ProjectSignalCustodyUpdate struct {
	ExpectedRevision  int64             `json:"expectedRevision"`
	SignalModeDefault SignalCustodyMode `json:"signalModeDefault"`
}

// A zero Nullable SignalModeDefault restores Customer inheritance.
type CustomerSignalCustodyUpdate struct {
	ExpectedRevision  int64                       `json:"expectedRevision"`
	SignalModeDefault Nullable[SignalCustodyMode] `json:"signalModeDefault"`
}
