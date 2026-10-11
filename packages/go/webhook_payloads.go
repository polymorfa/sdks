package polymorfa

import (
	"encoding/json"
	"fmt"
)

// KnownWebhookPayload is a closed union of the payload families in the pinned
// TypeScript contract. Use a type switch after TypedPayload; raw bytes remain
// available on WebhookEvent.Payload for forward-compatible fields and events.
type KnownWebhookPayload interface{ knownWebhookPayload() }
type webhookPayloadBase struct{}

func (webhookPayloadBase) knownWebhookPayload() {}

type WebhookIdentity struct {
	ID          string `json:"id"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	BSUID       string `json:"bsuid,omitempty"`
	Username    string `json:"username,omitempty"`
}
type WebhookConversation struct {
	WebhookIdentity
	Sender *WebhookIdentity `json:"sender,omitempty"`
}
type NativeFlowResponse struct {
	Name       string `json:"name"`
	ParamsJSON string `json:"paramsJson"`
	Version    *int   `json:"version,omitempty"`
}
type ReplyChoice struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}
type WebhookPollOption struct {
	Name string `json:"name"`
	Hash string `json:"hash"`
}
type LinkedDeviceMessagePayload struct {
	webhookPayloadBase
	ID                 string              `json:"id"`
	WhatsAppIDs        WhatsAppMessageIDs  `json:"whatsapp_ids"`
	WhatsAppID         string              `json:"whatsapp_id,omitempty"`
	Conversation       WebhookConversation `json:"conversation"`
	FromMe             bool                `json:"fromMe"`
	Timestamp          int64               `json:"timestamp"`
	PushName           string              `json:"pushName"`
	IsGroup            bool                `json:"isGroup"`
	Type               string              `json:"type"`
	Text               string              `json:"text,omitempty"`
	Caption            string              `json:"caption,omitempty"`
	MimeType           string              `json:"mimeType,omitempty"`
	PTT                *bool               `json:"ptt,omitempty"`
	Filename           string              `json:"filename,omitempty"`
	Latitude           *float64            `json:"latitude,omitempty"`
	Longitude          *float64            `json:"longitude,omitempty"`
	DisplayName        string              `json:"displayName,omitempty"`
	Title              string              `json:"title,omitempty"`
	Reaction           string              `json:"reaction,omitempty"`
	ReactionTo         string              `json:"reactionTo,omitempty"`
	RevokedID          string              `json:"revokedId,omitempty"`
	Media              string              `json:"media,omitempty"`
	MediaURL           string              `json:"mediaUrl,omitempty"`
	Edited             *bool               `json:"edited,omitempty"`
	PollOptions        []WebhookPollOption `json:"pollOptions,omitempty"`
	Unavailable        *bool               `json:"unavailable,omitempty"`
	UnavailableReason  string              `json:"unavailableReason,omitempty"`
	NativeFlowResponse *NativeFlowResponse `json:"nativeFlowResponse,omitempty"`
	ReplyChoice        *ReplyChoice        `json:"replyChoice,omitempty"`
	ParentMessageID    string              `json:"parentMessageId,omitempty"`
	Extra              PlatformPayload     `json:"-"`
}
type CloudMessageReferral struct {
	SourceType string          `json:"source_type,omitempty"`
	SourceID   string          `json:"source_id,omitempty"`
	SourceURL  string          `json:"source_url,omitempty"`
	CTWAClid   string          `json:"ctwa_clid,omitempty"`
	Extra      PlatformPayload `json:"-"`
}
type CloudMessagePayload struct {
	webhookPayloadBase
	ID                 string                `json:"id"`
	WhatsAppIDs        WhatsAppMessageIDs    `json:"whatsapp_ids"`
	WhatsAppID         string                `json:"whatsapp_id,omitempty"`
	Conversation       WebhookConversation   `json:"conversation"`
	Timestamp          string                `json:"timestamp"`
	Type               string                `json:"type"`
	SenderName         string                `json:"senderName,omitempty"`
	NativeFlowResponse *NativeFlowResponse   `json:"nativeFlowResponse,omitempty"`
	ReplyChoice        *ReplyChoice          `json:"replyChoice,omitempty"`
	ParentMessageID    string                `json:"parentMessageId,omitempty"`
	Interactive        PlatformPayload       `json:"interactive,omitempty"`
	Referral           *CloudMessageReferral `json:"referral,omitempty"`
	Extra              PlatformPayload       `json:"-"`
}

func webhookOpenDecode(b []byte, v any, extra *PlatformPayload) error {
	if err := json.Unmarshal(b, v); err != nil {
		return err
	}
	var all, known PlatformPayload
	if err := json.Unmarshal(b, &all); err != nil {
		return err
	}
	encoded, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(encoded, &known); err != nil {
		return err
	}
	for key := range known {
		delete(all, key)
	}
	*extra = all
	return nil
}
func webhookOpenEncode(v any, extra PlatformPayload) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	m := clonePayload(extra)
	var known PlatformPayload
	if err = json.Unmarshal(b, &known); err != nil {
		return nil, err
	}
	for k, v := range known {
		m[k] = v
	}
	return json.Marshal(m)
}
func (v *LinkedDeviceMessagePayload) UnmarshalJSON(b []byte) error {
	type plain LinkedDeviceMessagePayload
	return webhookOpenDecode(b, (*plain)(v), &v.Extra)
}
func (v LinkedDeviceMessagePayload) MarshalJSON() ([]byte, error) {
	type plain LinkedDeviceMessagePayload
	return webhookOpenEncode(plain(v), v.Extra)
}
func (v *CloudMessagePayload) UnmarshalJSON(b []byte) error {
	type plain CloudMessagePayload
	return webhookOpenDecode(b, (*plain)(v), &v.Extra)
}
func (v CloudMessagePayload) MarshalJSON() ([]byte, error) {
	type plain CloudMessagePayload
	return webhookOpenEncode(plain(v), v.Extra)
}
func (v *CloudMessageReferral) UnmarshalJSON(b []byte) error {
	type plain CloudMessageReferral
	return webhookOpenDecode(b, (*plain)(v), &v.Extra)
}
func (v CloudMessageReferral) MarshalJSON() ([]byte, error) {
	type plain CloudMessageReferral
	return webhookOpenEncode(plain(v), v.Extra)
}

type MessageSentPayload struct {
	webhookPayloadBase
	ID           string              `json:"id"`
	WhatsAppIDs  WhatsAppMessageIDs  `json:"whatsapp_ids"`
	WhatsAppID   string              `json:"whatsapp_id,omitempty"`
	Conversation WebhookConversation `json:"conversation"`
	Type         string              `json:"type"`
	Timestamp    int64               `json:"timestamp"`
}
type WebhookMessageReference struct {
	ID          string             `json:"id"`
	WhatsAppIDs WhatsAppMessageIDs `json:"whatsapp_ids"`
	WhatsAppID  string             `json:"whatsapp_id,omitempty"`
}
type MetaPricingReport struct {
	Billable     *bool  `json:"billable,omitempty"`
	PricingModel string `json:"pricing_model,omitempty"`
	Category     string `json:"category,omitempty"`
	Type         string `json:"type,omitempty"`
}
type MessageAckPayload struct {
	webhookPayloadBase
	Messages     []WebhookMessageReference `json:"messages"`
	Conversation WebhookConversation       `json:"conversation"`
	From         *WebhookIdentity          `json:"from,omitempty"`
	Sender       *WebhookIdentity          `json:"sender,omitempty"`
	Type         string                    `json:"type"`
	Timestamp    int64                     `json:"timestamp"`
	Pricing      *MetaPricingReport        `json:"pricing,omitempty"`
}
type MessageDeletePayload struct {
	webhookPayloadBase
	From         WebhookIdentity     `json:"from"`
	Sender       WebhookIdentity     `json:"sender"`
	ID           string              `json:"id"`
	WhatsAppIDs  WhatsAppMessageIDs  `json:"whatsapp_ids"`
	WhatsAppID   string              `json:"whatsapp_id,omitempty"`
	Conversation WebhookConversation `json:"conversation"`
	FromMe       bool                `json:"fromMe"`
}
type PollVotePayload struct {
	webhookPayloadBase
	Conversation   WebhookConversation `json:"conversation"`
	PollMessageID  string              `json:"pollMessageId"`
	Voter          WebhookIdentity     `json:"voter"`
	SelectedHashes []string            `json:"selectedHashes"`
	Timestamp      int64               `json:"timestamp"`
}
type RuntimeSessionStatusPayload struct {
	webhookPayloadBase
	Status       string `json:"status"`
	StatusReason string `json:"statusReason,omitempty"`
	BanCode      *int   `json:"banCode,omitempty"`
	BanReason    string `json:"banReason,omitempty"`
	BanExpiresAt *int64 `json:"banExpiresAt,omitempty"`
	Detail       string `json:"detail,omitempty"`
}
type CloudAccountStatusPayload struct {
	webhookPayloadBase
	Source string          `json:"source"`
	Kind   string          `json:"kind"`
	WABAID string          `json:"wabaId,omitempty"`
	Value  PlatformPayload `json:"value"`
}
type SessionRestrictionUpdatedPayload struct {
	webhookPayloadBase
	Type            string  `json:"type"`
	Active          bool    `json:"active"`
	EnforcementType *string `json:"enforcementType"`
	ExpiresAt       *string `json:"expiresAt"`
	ObservedAt      string  `json:"observedAt"`
}
type SessionConnectedPayload struct {
	webhookPayloadBase
	PhoneNumber   string `json:"phoneNumber"`
	ID            string `json:"id,omitempty"`
	PushName      string `json:"pushName"`
	PhonePlatform string `json:"phonePlatform"`
	AccountType   string `json:"accountType"`
	BusinessName  string `json:"businessName,omitempty"`
}
type SessionLoggedOutPayload struct {
	webhookPayloadBase
	Reason string `json:"reason"`
	Code   int    `json:"code"`
}
type SessionPhoneOfflinePayload struct {
	webhookPayloadBase
	DaysSinceLastSeen int    `json:"daysSinceLastSeen"`
	DaysRemaining     int    `json:"daysRemaining"`
	LastSeen          string `json:"lastSeen"`
	Action            string `json:"action"`
}
type OfficialGroupWebhookError struct {
	Code  int    `json:"code"`
	Title string `json:"title,omitempty"`
}
type GroupUpdatePayload struct {
	webhookPayloadBase
	ID                   string                      `json:"id"`
	NewSubject           string                      `json:"newSubject,omitempty"`
	NewDescription       string                      `json:"newDescription,omitempty"`
	Action               string                      `json:"action,omitempty"`
	RequestID            string                      `json:"requestId,omitempty"`
	InviteLink           string                      `json:"inviteLink,omitempty"`
	JoinApprovalRequired *bool                       `json:"joinApprovalRequired,omitempty"`
	PictureChanged       *bool                       `json:"pictureChanged,omitempty"`
	FailedChanges        []string                    `json:"failedChanges,omitempty"`
	Errors               []OfficialGroupWebhookError `json:"errors,omitempty"`
}
type WebhookFailedGroupParticipant struct {
	Participant WebhookIdentity             `json:"participant"`
	Errors      []OfficialGroupWebhookError `json:"errors,omitempty"`
}
type WebhookGroupJoinRequest struct {
	JoinRequestID string          `json:"joinRequestId"`
	User          WebhookIdentity `json:"user"`
	State         string          `json:"state"`
}
type GroupParticipantPayload struct {
	webhookPayloadBase
	ID                 string                          `json:"id"`
	Joined             []WebhookIdentity               `json:"joined,omitempty"`
	Left               []WebhookIdentity               `json:"left,omitempty"`
	Promoted           []WebhookIdentity               `json:"promoted,omitempty"`
	Demoted            []WebhookIdentity               `json:"demoted,omitempty"`
	Reason             string                          `json:"reason,omitempty"`
	InitiatedBy        string                          `json:"initiatedBy,omitempty"`
	RequestID          string                          `json:"requestId,omitempty"`
	FailedParticipants []WebhookFailedGroupParticipant `json:"failedParticipants,omitempty"`
	Errors             []OfficialGroupWebhookError     `json:"errors,omitempty"`
	JoinRequest        *WebhookGroupJoinRequest        `json:"joinRequest,omitempty"`
}
type PresenceUpdatePayload struct {
	webhookPayloadBase
	ObservedAt  int64            `json:"observedAt"`
	From        *WebhookIdentity `json:"from,omitempty"`
	Sender      *WebhookIdentity `json:"sender,omitempty"`
	State       string           `json:"state,omitempty"`
	Media       string           `json:"media,omitempty"`
	Unavailable *bool            `json:"unavailable,omitempty"`
	LastSeen    *int64           `json:"lastSeen,omitempty"`
}
type ContactOptPayload struct {
	webhookPayloadBase
	Phone     string `json:"phone"`
	Source    string `json:"source"`
	Keyword   string `json:"keyword"`
	Session   string `json:"session"`
	ProjectID string `json:"projectId,omitempty"`
}
type ContactUpdatePayload struct {
	webhookPayloadBase
	ID              string `json:"id"`
	PhoneNumber     string `json:"phoneNumber,omitempty"`
	BSUID           string `json:"bsuid,omitempty"`
	FullName        string `json:"fullName,omitempty"`
	FirstName       string `json:"firstName,omitempty"`
	PushName        string `json:"pushName,omitempty"`
	OldPushName     string `json:"oldPushName,omitempty"`
	BusinessName    string `json:"businessName,omitempty"`
	OldBusinessName string `json:"oldBusinessName,omitempty"`
	PictureID       string `json:"pictureId,omitempty"`
	PictureRemoved  *bool  `json:"pictureRemoved,omitempty"`
	Username        string `json:"username,omitempty"`
}
type ChatArchivePayload struct {
	webhookPayloadBase
	From    WebhookIdentity `json:"from"`
	Archive *bool           `json:"archive,omitempty"`
	Pinned  *bool           `json:"pinned,omitempty"`
}
type ChatMutePayload struct {
	webhookPayloadBase
	From             WebhookIdentity `json:"from"`
	Muted            bool            `json:"muted"`
	MuteEndTimestamp *int64          `json:"muteEndTimestamp,omitempty"`
}
type ChatReadPayload struct {
	webhookPayloadBase
	From WebhookIdentity `json:"from"`
	Read bool            `json:"read"`
}
type ChatClearPayload struct {
	webhookPayloadBase
	From WebhookIdentity `json:"from"`
}
type ChatDeletePayload struct {
	webhookPayloadBase
	From WebhookIdentity `json:"from"`
}
type WebhookCallCapabilities struct {
	Video  bool `json:"video"`
	Invite bool `json:"invite"`
}
type CallReceivedPayload struct {
	webhookPayloadBase
	From              WebhookIdentity          `json:"from"`
	CallID            string                   `json:"callId"`
	HasVideo          bool                     `json:"hasVideo"`
	SessionConnection string                   `json:"sessionConnection,omitempty"`
	Capabilities      *WebhookCallCapabilities `json:"capabilities,omitempty"`
}
type CallMissedPayload struct {
	webhookPayloadBase
	From   WebhookIdentity `json:"from"`
	CallID string          `json:"callId"`
	Reason string          `json:"reason"`
}
type CallAcceptedPayload struct {
	webhookPayloadBase
	From              WebhookIdentity          `json:"from"`
	CallID            string                   `json:"callId"`
	AnsweredBy        string                   `json:"answeredBy,omitempty"`
	Exclusive         *bool                    `json:"exclusive,omitempty"`
	SessionConnection string                   `json:"sessionConnection,omitempty"`
	Capabilities      *WebhookCallCapabilities `json:"capabilities,omitempty"`
}
type CallRejectedPayload struct {
	webhookPayloadBase
	From   WebhookIdentity `json:"from"`
	CallID string          `json:"callId"`
}
type CallEndedPayload struct {
	webhookPayloadBase
	From              *WebhookIdentity `json:"from"`
	CallID            string           `json:"callId"`
	DurationSeconds   float64          `json:"durationSeconds"`
	Reason            string           `json:"reason"`
	Direction         string           `json:"direction"`
	HadVideo          bool             `json:"hadVideo"`
	SessionConnection string           `json:"sessionConnection,omitempty"`
}
type CallTelemetryPayload struct {
	webhookPayloadBase
	CallID          string  `json:"callId"`
	SetupMS         float64 `json:"setupMs"`
	RingMS          float64 `json:"ringMs"`
	DurationSeconds float64 `json:"durationSeconds"`
	TerminateReason string  `json:"terminateReason"`
	Codec           string  `json:"codec"`
	JitterMS        float64 `json:"jitterMs"`
	PacketsLost     float64 `json:"packetsLost"`
	RTTMS           float64 `json:"rttMs"`
	RecvKBPS        float64 `json:"recvKbps"`
	SendKBPS        float64 `json:"sendKbps"`
}
type WebhookCallParticipant struct {
	HandRaised *bool `json:"handRaised,omitempty"`
	WebhookIdentity
	AudioMuted bool   `json:"audioMuted"`
	Video      bool   `json:"video"`
	State      string `json:"state"`
}
type CallParticipantPayload struct {
	webhookPayloadBase
	CallID      string                 `json:"callId"`
	Participant WebhookCallParticipant `json:"participant"`
}
type CallParticipantLeftPayload struct {
	webhookPayloadBase
	CallID        string `json:"callId"`
	ParticipantID string `json:"participantId"`
	Reason        string `json:"reason,omitempty"`
}
type WebhookCallConnection struct {
	ID          string `json:"id"`
	Participant string `json:"participant"`
	Transport   string `json:"transport"`
}
type CallConnectionJoinedPayload struct {
	webhookPayloadBase
	CallID     string                `json:"callId"`
	Connection WebhookCallConnection `json:"connection"`
}
type CallConnectionLeftPayload struct {
	webhookPayloadBase
	CallID       string `json:"callId"`
	ConnectionID string `json:"connectionId"`
	Participant  string `json:"participant"`
	Reason       string `json:"reason"`
}
type NewsletterUpdatePayload struct {
	webhookPayloadBase
	ID     string `json:"id"`
	Action string `json:"action"`
	Muted  *bool  `json:"muted,omitempty"`
}
type WebhookBlocklistChange struct {
	Action      string `json:"action"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	BSUID       string `json:"bsuid,omitempty"`
	ID          string `json:"id"`
	Username    string `json:"username,omitempty"`
}
type BlocklistUpdatePayload struct {
	webhookPayloadBase
	Action  string                   `json:"action"`
	Changes []WebhookBlocklistChange `json:"changes"`
}
type LabelsUpdatePayload struct {
	webhookPayloadBase
	Action     string           `json:"action"`
	LabelID    string           `json:"labelId,omitempty"`
	From       *WebhookIdentity `json:"from,omitempty"`
	Label      string           `json:"label,omitempty"`
	Name       string           `json:"name,omitempty"`
	Color      *int             `json:"color,omitempty"`
	OrderIndex *int             `json:"orderIndex,omitempty"`
	Deleted    *bool            `json:"deleted,omitempty"`
	Labeled    *bool            `json:"labeled,omitempty"`
	ObservedAt *int64           `json:"observedAt,omitempty"`
	MessageID  string           `json:"messageId,omitempty"`
	Starred    *bool            `json:"starred,omitempty"`
}
type CloudHistorySyncPayload struct {
	webhookPayloadBase
	Kind  string          `json:"kind"`
	Value PlatformPayload `json:"value"`
}
type WebhookHistoryMessage struct {
	WebhookMessageReference
	Conversation WebhookIdentity `json:"conversation"`
	FromMe       *bool           `json:"fromMe,omitempty"`
}
type WebhookEncodedHistory struct {
	Encoding string `json:"encoding"`
	Data     string `json:"data"`
}
type LinkedHistorySyncPayload struct {
	webhookPayloadBase
	WhatsAppIDs         WhatsAppMessageIDs      `json:"whatsapp_ids"`
	WhatsAppID          string                  `json:"whatsapp_id,omitempty"`
	OriginalWhatsAppIDs *WhatsAppMessageIDs     `json:"original_whatsapp_ids,omitempty"`
	OriginalWhatsAppID  string                  `json:"original_whatsapp_id,omitempty"`
	Messages            []WebhookHistoryMessage `json:"messages"`
	Mode                string                  `json:"mode"`
	SyncType            string                  `json:"syncType"`
	ChunkOrder          *int                    `json:"chunkOrder,omitempty"`
	Progress            *float64                `json:"progress,omitempty"`
	FileLength          int64                   `json:"fileLength"`
	ConversationCount   int                     `json:"conversationCount"`
	MessageCount        int                     `json:"messageCount"`
	PushNameCount       int                     `json:"pushNameCount"`
	StatusMessageCount  int                     `json:"statusMessageCount"`
	WhatsApp            WebhookEncodedHistory   `json:"whatsapp"`
}
type ContactsSyncPayload struct {
	webhookPayloadBase
	Kind  string          `json:"kind"`
	Value PlatformPayload `json:"value"`
}
type MessageEchoPayload struct {
	webhookPayloadBase
	Source string          `json:"source"`
	Value  PlatformPayload `json:"value"`
}
type CommandResultPayload struct {
	webhookPayloadBase
	RequestID string          `json:"requestId"`
	Command   string          `json:"command"`
	Success   bool            `json:"success"`
	Data      PlatformPayload `json:"data,omitempty"`
	Error     string          `json:"error,omitempty"`
}
type BusinessQuickReplyUpdatePayload struct {
	webhookPayloadBase
	ID                 string   `json:"id"`
	Shortcut           string   `json:"shortcut"`
	Message            string   `json:"message"`
	Keywords           []string `json:"keywords"`
	Count              int      `json:"count"`
	Deleted            bool     `json:"deleted"`
	AssociatedLabelIDs []string `json:"associatedLabelIds"`
	ObservedAt         int64    `json:"observedAt"`
	FromFullSync       bool     `json:"fromFullSync"`
}

type CustomerEventPayload struct {
	webhookPayloadBase
	EventID        string `json:"eventId"`
	OccurredAt     string `json:"occurredAt"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	CustomerID     string `json:"customerId"`
	ActorKind      string `json:"actorKind"`
}
type CustomerCreatedPayload = CustomerEventPayload
type CustomerArchivedPayload = CustomerEventPayload
type CustomerRestoredPayload = CustomerEventPayload
type CustomerUpdatedPayload struct {
	CustomerEventPayload
	Fields []string `json:"fields"`
}
type CustomerEnabledPayload struct {
	CustomerEventPayload
	MigratedNumberCount int `json:"migratedNumberCount"`
}
type CustomerArchivingPayload struct {
	CustomerEventPayload
	BlockingNumberCount     int `json:"blockingNumberCount"`
	RevokedPairingLinkCount int `json:"revokedPairingLinkCount"`
}
type CustomerPairingLinkPayload struct {
	CustomerEventPayload
	PairingLinkID string `json:"pairingLinkId"`
}
type CustomerPairingLinkCreatedPayload = CustomerPairingLinkPayload
type CustomerPairingLinkOpenedPayload = CustomerPairingLinkPayload
type CustomerPairingLinkExpiredPayload = CustomerPairingLinkPayload
type CustomerPairingLinkConnectedPayload struct {
	CustomerPairingLinkPayload
	SessionID string `json:"sessionId"`
}
type CustomerPairingLinkFailedPayload struct {
	CustomerPairingLinkPayload
	ErrorCode string `json:"errorCode"`
}
type CustomerPairingLinkRevokedPayload struct {
	CustomerPairingLinkPayload
	Reason string `json:"reason,omitempty"`
}
type CustomerNumberAttachedPayload struct {
	CustomerEventPayload
	SessionID     string `json:"sessionId"`
	PairingLinkID string `json:"pairingLinkId,omitempty"`
}
type CustomerNumberTransferredPayload struct {
	CustomerEventPayload
	SessionID        string `json:"sessionId"`
	SourceCustomerID string `json:"sourceCustomerId"`
}
type CustomerNumberDisconnectedPayload struct {
	CustomerEventPayload
	SessionID string `json:"sessionId"`
	Reason    string `json:"reason"`
}
type BanSafeHealthThresholdPayload struct {
	webhookPayloadBase
	SessionID        string  `json:"sessionId"`
	ProjectID        string  `json:"projectId"`
	Health           float64 `json:"health"`
	Threshold        float64 `json:"threshold"`
	HealthSource     string  `json:"healthSource"`
	EstimatorVersion string  `json:"estimatorVersion"`
	ModelVersion     *string `json:"modelVersion"`
	EvaluatedAt      string  `json:"evaluatedAt"`
	PolicyVersion    int64   `json:"policyVersion"`
	EpisodeID        string  `json:"episodeId"`
	ActionID         string  `json:"actionId"`
}
type BanSafeRequiredFinding struct {
	FindingKey string `json:"findingKey"`
	Title      string `json:"title"`
	Severity   string `json:"severity"`
}
type BanSafeActionPayload struct {
	webhookPayloadBase
	PhoneNumber         string                   `json:"phoneNumber"`
	Action              string                   `json:"action"`
	Scope               string                   `json:"scope"`
	Rung                string                   `json:"rung"`
	PreviousRung        *string                  `json:"previousRung"`
	Reason              string                   `json:"reason"`
	Health              *float64                 `json:"health"`
	HealthBand          string                   `json:"healthBand"`
	Requires            []BanSafeRequiredFinding `json:"requires"`
	ThroughputPerMinute *float64                 `json:"throughputPerMinute"`
	EligibleLiftAt      *string                  `json:"eligibleLiftAt"`
	LiftRequires        string                   `json:"liftRequires"`
	AppealURL           string                   `json:"appealUrl"`
	StartedAt           string                   `json:"startedAt"`
	Docs                string                   `json:"docs"`
}
type BanSafeIncidentPayload struct {
	webhookPayloadBase
	ID          string  `json:"id"`
	PhoneNumber string  `json:"phoneNumber"`
	Kind        string  `json:"kind"`
	Source      string  `json:"source"`
	StartedAt   string  `json:"startedAt"`
	EndsAt      *string `json:"endsAt"`
	Belief      float64 `json:"belief"`
	Resolution  string  `json:"resolution"`
	ClaimID     *string `json:"claimId"`
	ClosedAt    *string `json:"closedAt"`
}
type BanSafeClaimPayload struct {
	webhookPayloadBase
	ID            string  `json:"id"`
	IncidentID    string  `json:"incidentId"`
	PhoneNumber   string  `json:"phoneNumber"`
	Status        string  `json:"status"`
	Verdict       string  `json:"verdict"`
	WindowStart   string  `json:"windowStart"`
	WindowEnd     string  `json:"windowEnd"`
	MeasuredCents float64 `json:"measuredCents"`
	CapCents      float64 `json:"capCents"`
	AmountCents   float64 `json:"amountCents"`
	Summary       string  `json:"summary"`
	Reason        string  `json:"reason"`
	DecidedAt     *string `json:"decidedAt"`
	PaidAt        *string `json:"paidAt"`
}
type CallPermissionChangedPayload struct {
	webhookPayloadBase
	Conversation   WebhookIdentity `json:"conversation"`
	Status         string          `json:"status"`
	PreviousStatus string          `json:"previousStatus"`
	ExpiresAt      *string         `json:"expiresAt"`
	Source         string          `json:"source"`
	ChangedAt      string          `json:"changedAt"`
}
type OrderPaymentConversation struct {
	ID          string `json:"id,omitempty"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
}
type OrderPaymentUpdateBase struct {
	webhookPayloadBase
	ReportedBy      string                   `json:"reportedBy"`
	ProviderEventID string                   `json:"providerEventId"`
	ReferenceID     string                   `json:"referenceId"`
	Conversation    OrderPaymentConversation `json:"conversation"`
	Kind            string                   `json:"kind"`
}
type WebhookPaymentAmount struct {
	Value  float64 `json:"value"`
	Offset float64 `json:"offset"`
}
type WebhookPaymentTransaction struct {
	ID                    string `json:"id,omitempty"`
	ProviderTransactionID string `json:"providerTransactionId,omitempty"`
	Provider              string `json:"provider,omitempty"`
	Status                string `json:"status,omitempty"`
	Method                string `json:"method,omitempty"`
	ErrorCode             string `json:"errorCode,omitempty"`
}
type OrderPaymentStatusPayload struct {
	OrderPaymentUpdateBase
	Status      string                     `json:"status"`
	Amount      *WebhookPaymentAmount      `json:"amount,omitempty"`
	Currency    string                     `json:"currency,omitempty"`
	Transaction *WebhookPaymentTransaction `json:"transaction,omitempty"`
}
type OrderPaymentMethodSelectedPayload struct {
	OrderPaymentUpdateBase
	MessageID        string `json:"messageId"`
	PaymentMethod    string `json:"paymentMethod"`
	LastFourDigits   string `json:"lastFourDigits,omitempty"`
	CredentialID     string `json:"credentialId,omitempty"`
	PaymentTimestamp *int64 `json:"paymentTimestamp,omitempty"`
}
type MessageFailedPayload struct {
	webhookPayloadBase
	To         WebhookIdentity `json:"to"`
	Type       string          `json:"type"`
	Error      string          `json:"error"`
	Code       string          `json:"code,omitempty"`
	RetryAfter *float64        `json:"retryAfter,omitempty"`
	Timestamp  int64           `json:"timestamp"`
}
type RuntimeTemplateStatusPayload struct {
	webhookPayloadBase
	TemplateName  string `json:"templateName"`
	TemplateID    string `json:"templateId"`
	Status        string `json:"status"`
	Category      string `json:"category"`
	Reason        string `json:"reason"`
	QualityRating string `json:"qualityRating"`
}
type CloudTemplateStatusPayload struct {
	webhookPayloadBase
	Kind                 string `json:"kind"`
	Event                string `json:"event,omitempty"`
	TemplateID           string `json:"templateId,omitempty"`
	TemplateName         string `json:"templateName,omitempty"`
	Language             string `json:"language,omitempty"`
	Reason               string `json:"reason,omitempty"`
	PreviousQualityScore string `json:"previousQualityScore,omitempty"`
	NewQualityScore      string `json:"newQualityScore,omitempty"`
	WABAID               string `json:"wabaId,omitempty"`
}
type CampaignLaunchedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	Name           string `json:"name"`
	RecipientCount int    `json:"recipientCount"`
	Scheduled      bool   `json:"scheduled"`
	LaunchedAt     int64  `json:"launchedAt"`
}
type CampaignPausedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	SentCount      int    `json:"sentCount"`
	RemainingCount int    `json:"remainingCount"`
	PausedAt       int64  `json:"pausedAt"`
}
type CampaignRescheduledPayload struct {
	webhookPayloadBase
	CampaignID          string `json:"campaignId"`
	PreviousScheduledAt *int64 `json:"previousScheduledAt"`
	ScheduledAt         int64  `json:"scheduledAt"`
	RescheduledAt       int64  `json:"rescheduledAt"`
}
type CampaignResumedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	SentCount      int    `json:"sentCount"`
	RemainingCount int    `json:"remainingCount"`
	ResumedAt      int64  `json:"resumedAt"`
}
type CampaignCompletedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	SentCount      int    `json:"sentCount"`
	DeliveredCount int    `json:"deliveredCount"`
	ReadCount      int    `json:"readCount"`
	FailedCount    int    `json:"failedCount"`
	SkippedCount   int    `json:"skippedCount"`
	ResponseCount  int    `json:"responseCount"`
	CompletedAt    int64  `json:"completedAt"`
	DurationMS     int64  `json:"durationMs"`
}
type CampaignFailedPayload struct {
	webhookPayloadBase
	CampaignID string `json:"campaignId"`
	Reason     string `json:"reason"`
	FailedAt   int64  `json:"failedAt"`
}
type CampaignStoppedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	SentCount      int    `json:"sentCount"`
	AbandonedCount int    `json:"abandonedCount"`
	StoppedAt      int64  `json:"stoppedAt"`
}
type CampaignRecipientSentPayload struct {
	webhookPayloadBase
	CampaignID        string `json:"campaignId"`
	RecipientID       string `json:"recipientId"`
	Phone             string `json:"phone"`
	SessionKey        string `json:"sessionKey"`
	ExternalMessageID string `json:"externalMessageId"`
	VariantKey        string `json:"variantKey"`
	Attempt           int    `json:"attempt"`
}
type CampaignRecipientFailedPayload struct {
	webhookPayloadBase
	CampaignID  string `json:"campaignId"`
	RecipientID string `json:"recipientId"`
	Phone       string `json:"phone"`
	Attempts    int    `json:"attempts"`
	Error       string `json:"error"`
	FailedAt    int64  `json:"failedAt"`
}
type CampaignRecipientSkippedPayload struct {
	webhookPayloadBase
	CampaignID  string `json:"campaignId"`
	RecipientID string `json:"recipientId"`
	Phone       string `json:"phone"`
	Reason      string `json:"reason"`
	SkippedAt   int64  `json:"skippedAt"`
}
type CampaignThrottledPayload struct {
	webhookPayloadBase
	CampaignID    string `json:"campaignId"`
	SessionKey    string `json:"sessionKey"`
	Reason        string `json:"reason"`
	DeferredCount int    `json:"deferredCount"`
	At            int64  `json:"at"`
}
type CampaignCapReachedPayload struct {
	webhookPayloadBase
	CampaignID     string `json:"campaignId"`
	SessionKey     string `json:"sessionKey"`
	Phone          string `json:"phone"`
	CapType        string `json:"capType"`
	CapLimit       int    `json:"capLimit"`
	WindowResetsAt int64  `json:"windowResetsAt"`
	At             int64  `json:"at"`
}
type CampaignColdBlockedPayload struct {
	webhookPayloadBase
	CampaignID  string `json:"campaignId"`
	RecipientID string `json:"recipientId"`
	Phone       string `json:"phone"`
	Surface     string `json:"surface"`
	Reason      string `json:"reason"`
	At          int64  `json:"at"`
}
type VoiceAssetEventPayload struct {
	webhookPayloadBase
	EventID        string `json:"eventId"`
	OccurredAt     string `json:"occurredAt"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	AssetID        string `json:"assetId"`
	Name           string `json:"name"`
	Source         string `json:"source"`
}
type VoiceAssetReadyPayload struct {
	VoiceAssetEventPayload
	DurationMS     int64  `json:"durationMs"`
	ContentSHA256  string `json:"contentSha256"`
	OriginalFormat string `json:"originalFormat"`
}
type VoiceAssetFailedPayload struct {
	VoiceAssetEventPayload
	FailureReason string `json:"failureReason"`
}
type UsageRecordedPayload struct {
	webhookPayloadBase
	ID            string                    `json:"id"`
	Meter         string                    `json:"meter"`
	Quantity      float64                   `json:"quantity"`
	Unit          string                    `json:"unit"`
	Dimensions    map[string]UsageDimension `json:"dimensions"`
	KeySource     string                    `json:"keySource"`
	SourceKind    string                    `json:"sourceKind"`
	SourceID      string                    `json:"sourceId"`
	ProjectID     *string                   `json:"projectId"`
	Session       *string                   `json:"session"`
	OccurredAt    string                    `json:"occurredAt"`
	RecordedAt    string                    `json:"recordedAt"`
	Revision      int                       `json:"revision"`
	PricingState  string                    `json:"pricingState"`
	RateCard      *UsageRateCard            `json:"rateCard"`
	PricedCredits *float64                  `json:"pricedCredits"`
}
type SessionCapabilitiesUpdatedPayload struct {
	webhookPayloadBase
	SessionCapabilities
	ChangedKeys []string `json:"changedKeys"`
}

// TypedPayload decodes a known payload into its public native type. The second
// result is false for unknown event names; unknown raw payloads are preserved.
func (e WebhookEvent) TypedPayload() (KnownWebhookPayload, bool, error) {
	var v KnownWebhookPayload
	switch e.Event {
	case "message.received", "message.reaction":
		var ts struct {
			Timestamp json.RawMessage `json:"timestamp"`
		}
		if err := json.Unmarshal(e.Payload, &ts); err != nil {
			return nil, true, err
		}
		if len(ts.Timestamp) > 0 && ts.Timestamp[0] == '"' {
			v = &CloudMessagePayload{}
		} else {
			v = &LinkedDeviceMessagePayload{}
		}
	case "message.edited", "message.revoked", "message.update":
		v = &LinkedDeviceMessagePayload{}
	case "message.sent":
		v = &MessageSentPayload{}
	case "message.ack":
		v = &MessageAckPayload{}
	case "message.delete":
		v = &MessageDeletePayload{}
	case "message.vote":
		v = &PollVotePayload{}
	case "message.failed":
		v = &MessageFailedPayload{}
	case "message.echo":
		v = &MessageEchoPayload{}
	case "session.status":
		var s struct {
			Source string `json:"source"`
		}
		if err := json.Unmarshal(e.Payload, &s); err != nil {
			return nil, true, err
		}
		if s.Source == "meta" {
			v = &CloudAccountStatusPayload{}
		} else {
			v = &RuntimeSessionStatusPayload{}
		}
	case "session.connected":
		v = &SessionConnectedPayload{}
	case "session.logged_out":
		v = &SessionLoggedOutPayload{}
	case "session.phone_offline":
		v = &SessionPhoneOfflinePayload{}
	case "session.restriction_updated":
		v = &SessionRestrictionUpdatedPayload{}
	case "session.capabilities_updated":
		v = &SessionCapabilitiesUpdatedPayload{}
	case "template.status":
		var s struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(e.Payload, &s); err != nil {
			return nil, true, err
		}
		if s.Kind != "" {
			v = &CloudTemplateStatusPayload{}
		} else {
			v = &RuntimeTemplateStatusPayload{}
		}
	case "history.sync":
		var s struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(e.Payload, &s); err != nil {
			return nil, true, err
		}
		if s.Kind == "history" {
			v = &CloudHistorySyncPayload{}
		} else {
			v = &LinkedHistorySyncPayload{}
		}
	case "group.update":
		v = &GroupUpdatePayload{}
	case "group.participant":
		v = &GroupParticipantPayload{}
	case "presence.update":
		v = &PresenceUpdatePayload{}
	case "contact.opted_in", "contact.opted_out":
		v = &ContactOptPayload{}
	case "contact.sync":
		v = &ContactsSyncPayload{}
	case "contact.update":
		v = &ContactUpdatePayload{}
	case "chat.archive":
		v = &ChatArchivePayload{}
	case "chat.clear":
		v = &ChatClearPayload{}
	case "chat.delete":
		v = &ChatDeletePayload{}
	case "chat.mute":
		v = &ChatMutePayload{}
	case "chat.read":
		v = &ChatReadPayload{}
	case "call.received":
		v = &CallReceivedPayload{}
	case "call.missed":
		v = &CallMissedPayload{}
	case "call.accepted":
		v = &CallAcceptedPayload{}
	case "call.rejected":
		v = &CallRejectedPayload{}
	case "call.ended":
		v = &CallEndedPayload{}
	case "call.telemetry":
		v = &CallTelemetryPayload{}
	case "call.participant_joined", "call.participant_state":
		v = &CallParticipantPayload{}
	case "call.participant_left":
		v = &CallParticipantLeftPayload{}
	case "call.connection_joined":
		v = &CallConnectionJoinedPayload{}
	case "call.connection_left":
		v = &CallConnectionLeftPayload{}
	case "call.permission_changed":
		v = &CallPermissionChangedPayload{}
	case "newsletter.update":
		v = &NewsletterUpdatePayload{}
	case "blocklist.update":
		v = &BlocklistUpdatePayload{}
	case "labels.update":
		v = &LabelsUpdatePayload{}
	case "command.result":
		v = &CommandResultPayload{}
	case "business.quick_reply.update":
		v = &BusinessQuickReplyUpdatePayload{}
	case "customer.created", "customer.archived", "customer.restored":
		v = &CustomerEventPayload{}
	case "customer.updated":
		v = &CustomerUpdatedPayload{}
	case "customer.enabled":
		v = &CustomerEnabledPayload{}
	case "customer.archiving":
		v = &CustomerArchivingPayload{}
	case "customer.pairing_link.created", "customer.pairing_link.opened", "customer.pairing_link.expired":
		v = &CustomerPairingLinkPayload{}
	case "customer.pairing_link.connected":
		v = &CustomerPairingLinkConnectedPayload{}
	case "customer.pairing_link.failed":
		v = &CustomerPairingLinkFailedPayload{}
	case "customer.pairing_link.revoked":
		v = &CustomerPairingLinkRevokedPayload{}
	case "customer.number.attached":
		v = &CustomerNumberAttachedPayload{}
	case "customer.number.transferred":
		v = &CustomerNumberTransferredPayload{}
	case "customer.number.disconnected":
		v = &CustomerNumberDisconnectedPayload{}
	case "bansafe.health_threshold":
		v = &BanSafeHealthThresholdPayload{}
	case "bansafe.action":
		v = &BanSafeActionPayload{}
	case "bansafe.incident":
		v = &BanSafeIncidentPayload{}
	case "bansafe.claim":
		v = &BanSafeClaimPayload{}
	case "order.payment_updated":
		var s struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(e.Payload, &s); err != nil {
			return nil, true, err
		}
		switch s.Kind {
		case "payment_status":
			v = &OrderPaymentStatusPayload{}
		case "payment_method_selected":
			v = &OrderPaymentMethodSelectedPayload{}
		default:
			return nil, true, fmt.Errorf("unknown payment update kind %q", s.Kind)
		}
	case "campaign.launched":
		v = &CampaignLaunchedPayload{}
	case "campaign.paused":
		v = &CampaignPausedPayload{}
	case "campaign.rescheduled":
		v = &CampaignRescheduledPayload{}
	case "campaign.resumed":
		v = &CampaignResumedPayload{}
	case "campaign.completed":
		v = &CampaignCompletedPayload{}
	case "campaign.failed":
		v = &CampaignFailedPayload{}
	case "campaign.stopped":
		v = &CampaignStoppedPayload{}
	case "campaign.recipient_sent":
		v = &CampaignRecipientSentPayload{}
	case "campaign.recipient_failed":
		v = &CampaignRecipientFailedPayload{}
	case "campaign.recipient_skipped":
		v = &CampaignRecipientSkippedPayload{}
	case "campaign.throttled":
		v = &CampaignThrottledPayload{}
	case "campaign.cap_reached":
		v = &CampaignCapReachedPayload{}
	case "campaign.cold_blocked":
		v = &CampaignColdBlockedPayload{}
	case "voice.asset_ready":
		v = &VoiceAssetReadyPayload{}
	case "voice.asset_failed":
		v = &VoiceAssetFailedPayload{}
	case "usage.recorded":
		v = &UsageRecordedPayload{}
	default:
		return nil, false, nil
	}
	if err := json.Unmarshal(e.Payload, v); err != nil {
		return nil, true, err
	}
	return v, true, nil
}
