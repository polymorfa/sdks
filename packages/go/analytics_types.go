package polymorfa

type CallOutcomeMetrics struct {
	Total              int64    `json:"total"`
	Answered           int64    `json:"answered"`
	Missed             int64    `json:"missed"`
	Declined           int64    `json:"declined"`
	Failed             int64    `json:"failed"`
	Ringing            int64    `json:"ringing"`
	AnswerRate         *float64 `json:"answerRate"`
	TalkSeconds        float64  `json:"talkSeconds"`
	TimedAnswered      int64    `json:"timedAnswered"`
	TimedPickup        int64    `json:"timedPickup"`
	AverageTalkSeconds *float64 `json:"averageTalkSeconds"`
	MedianTalkSeconds  *float64 `json:"medianTalkSeconds"`
	P95TalkSeconds     *float64 `json:"p95TalkSeconds"`
	AveragePickupMS    *float64 `json:"averagePickupMs"`
	P95PickupMS        *float64 `json:"p95PickupMs"`
	ShortAnswered      int64    `json:"shortAnswered"`
	Video              int64    `json:"video"`
}
type CallBusinessDirections struct {
	Inbound  CallOutcomeMetrics `json:"inbound"`
	Outbound CallOutcomeMetrics `json:"outbound"`
}
type CallBusinessMediaQuality struct {
	MeasuredCalls   int64    `json:"measuredCalls"`
	AverageJitterMS *float64 `json:"averageJitterMs"`
	AverageRTTMS    *float64 `json:"averageRttMs"`
	PacketsLost     *float64 `json:"packetsLost"`
}
type CallBusinessAppQuality struct {
	MeasuredCalls   int64    `json:"measuredCalls"`
	AverageJitterMS *float64 `json:"averageJitterMs"`
	AverageRTTMS    *float64 `json:"averageRttMs"`
	PacketLossRate  *float64 `json:"packetLossRate"`
	Reconnects      *int64   `json:"reconnects"`
}
type CallBusinessCodeCount struct {
	Code  string `json:"code"`
	Count int64  `json:"count"`
}
type CallBusinessFollowUp struct {
	EligibleMissed    int64    `json:"eligibleMissed"`
	ReturnedWithin24H int64    `json:"returnedWithin24h"`
	Rate              *float64 `json:"rate"`
	AverageDelayMS    *float64 `json:"averageDelayMs"`
	PendingWindow     int64    `json:"pendingWindow"`
	UnknownContact    int64    `json:"unknownContact"`
}
type CallBusinessMetrics struct {
	CallOutcomeMetrics
	Directions            CallBusinessDirections   `json:"directions"`
	MediaQuality          CallBusinessMediaQuality `json:"mediaQuality"`
	AppQuality            CallBusinessAppQuality   `json:"appQuality"`
	EndReasons            []CallBusinessCodeCount  `json:"endReasons"`
	AppErrors             []CallBusinessCodeCount  `json:"appErrors"`
	Transports            []CallBusinessCodeCount  `json:"transports"`
	MultiParticipantCalls int64                    `json:"multiParticipantCalls"`
	FollowUp              CallBusinessFollowUp     `json:"followUp"`
}
type WhatsAppBusinessSegment struct {
	Dimension              string      `json:"dimension"`
	Key                    string      `json:"key"`
	SendAttempts           int64       `json:"sendAttempts"`
	Sent                   int64       `json:"sent"`
	SendFailures           int64       `json:"sendFailures"`
	SendFailureRate        *float64    `json:"sendFailureRate"`
	CompletedConversations int64       `json:"completedConversations"`
	DeliveredConversations int64       `json:"deliveredConversations"`
	ReadConversations      int64       `json:"readConversations"`
	RepliedConversations   int64       `json:"repliedConversations"`
	DeliveryRate           *float64    `json:"deliveryRate"`
	ReadRate               *float64    `json:"readRate"`
	ReplyRate              *float64    `json:"replyRate"`
	AverageCustomerReplyMS *float64    `json:"averageCustomerReplyMs"`
	ReadRateInterval95     *[2]float64 `json:"readRateInterval95"`
	ReplyRateInterval95    *[2]float64 `json:"replyRateInterval95"`
	ReadRateDifference     *float64    `json:"readRateDifference"`
	ReplyRateDifference    *float64    `json:"replyRateDifference"`
	ShareOfConversations   *float64    `json:"shareOfConversations"`
	ShareOfSends           *float64    `json:"shareOfSends"`
}
type WhatsAppEngagement struct {
	WindowHours            int      `json:"windowHours"`
	CompletedConversations int64    `json:"completedConversations"`
	DeliveredConversations int64    `json:"deliveredConversations"`
	ReadConversations      int64    `json:"readConversations"`
	RepliedConversations   int64    `json:"repliedConversations"`
	DeliveryRate           *float64 `json:"deliveryRate"`
	ReadRate               *float64 `json:"readRate"`
	ReplyRate              *float64 `json:"replyRate"`
	AverageCustomerReplyMS *float64 `json:"averageCustomerReplyMs"`
	Complete               bool     `json:"complete"`
	DroppedConversations   int64    `json:"droppedConversations"`
	DroppedRecords         int64    `json:"droppedRecords"`
	DroppedReceiptJoins    int64    `json:"droppedReceiptJoins"`
}
type WhatsAppDevicePlatform struct {
	Platform string   `json:"platform"`
	Messages int64    `json:"messages"`
	Share    *float64 `json:"share"`
}
type WhatsAppDevice struct {
	DeviceIndex       int    `json:"deviceIndex"`
	EstimatedPlatform string `json:"estimatedPlatform"`
	ReportedClass     string `json:"reportedClass"`
	LastActiveAt      *int64 `json:"lastActiveAt"`
	Listed            *bool  `json:"listed"`
}
type WhatsAppDeviceInventory struct {
	ListObserved bool             `json:"listObserved"`
	ListCurrent  bool             `json:"listCurrent"`
	ObservedAt   *int64           `json:"observedAt"`
	DeviceCount  *int             `json:"deviceCount"`
	Truncated    bool             `json:"truncated"`
	Devices      []WhatsAppDevice `json:"devices"`
}
type WhatsAppDeviceAnalytics struct {
	Detector          string                   `json:"detector"`
	Measured          bool                     `json:"measured"`
	Complete          bool                     `json:"complete"`
	ObservedBuckets   int                      `json:"observedBuckets"`
	CustomerMessages  *int64                   `json:"customerMessages"`
	AccountMessages   *int64                   `json:"accountMessages"`
	CustomerPlatforms []WhatsAppDevicePlatform `json:"customerPlatforms"`
	AccountPlatforms  []WhatsAppDevicePlatform `json:"accountPlatforms"`
	Inventory         *WhatsAppDeviceInventory `json:"inventory"`
}
type WhatsAppRecipientActivityRow struct {
	TS                   int64    `json:"ts"`
	RecipientCountry     string   `json:"recipientCountry"`
	RecipientDeviceCount string   `json:"recipientDeviceCount"`
	DeviceSource         string   `json:"deviceSource"`
	IncomingMessages     int64    `json:"incomingMessages"`
	DeliveryReceipts     int64    `json:"deliveryReceipts"`
	ReadReceipts         int64    `json:"readReceipts"`
	OnlineSignals        int64    `json:"onlineSignals"`
	OfflineSignals       int64    `json:"offlineSignals"`
	TypingSignals        int64    `json:"typingSignals"`
	LastSignalAt         int64    `json:"lastSignalAt"`
	QuietGaps            int64    `json:"quietGaps"`
	QuietGapMS           float64  `json:"quietGapMs"`
	AverageQuietGapMS    *float64 `json:"averageQuietGapMs"`
}
type WhatsAppRecipientActivity struct {
	Measured        bool                           `json:"measured"`
	Complete        bool                           `json:"complete"`
	ObservedBuckets int                            `json:"observedBuckets"`
	DroppedSignals  int64                          `json:"droppedSignals"`
	Truncated       bool                           `json:"truncated"`
	Rows            []WhatsAppRecipientActivityRow `json:"rows"`
}
type WhatsAppConversationGroup struct {
	RecipientCountry       string   `json:"recipientCountry,omitempty"`
	RecipientDeviceCount   string   `json:"recipientDeviceCount,omitempty"`
	TS                     int64    `json:"ts"`
	MessageType            string   `json:"messageType"`
	TextBand               string   `json:"textBand"`
	Origin                 string   `json:"origin"`
	CallingCode            string   `json:"callingCode"`
	CustomerDevices        string   `json:"customerDevices"`
	CompletedConversations int64    `json:"completedConversations"`
	DeliveredConversations int64    `json:"deliveredConversations"`
	ReadConversations      int64    `json:"readConversations"`
	RepliedConversations   int64    `json:"repliedConversations"`
	ReplyLatencySumMS      float64  `json:"replyLatencySumMs"`
	ReadRate               *float64 `json:"readRate"`
	ReplyRate              *float64 `json:"replyRate"`
	AverageCustomerReplyMS *float64 `json:"averageCustomerReplyMs"`
}
type WhatsAppConversationBucket struct {
	TS       int64 `json:"ts"`
	Complete bool  `json:"complete"`
}
type WhatsAppConversationBreakdown struct {
	Measured             bool                         `json:"measured"`
	Complete             bool                         `json:"complete"`
	ObservedBuckets      int                          `json:"observedBuckets"`
	DroppedConversations int64                        `json:"droppedConversations"`
	Truncated            bool                         `json:"truncated"`
	Buckets              []WhatsAppConversationBucket `json:"buckets"`
	Rows                 []WhatsAppConversationGroup  `json:"rows"`
}
type WhatsAppMessageAnalysis struct {
	Complete bool                      `json:"complete"`
	Segments []WhatsAppBusinessSegment `json:"segments"`
}
type WhatsAppCustomerActivity struct {
	Observed       bool  `json:"observed"`
	OnlineSignals  int64 `json:"onlineSignals"`
	OfflineSignals int64 `json:"offlineSignals"`
	TypingSignals  int64 `json:"typingSignals"`
}
type WhatsAppAccountActivity struct {
	Observed                      bool     `json:"observed"`
	PrimaryPhoneActivitySignals   int64    `json:"primaryPhoneActivitySignals"`
	PrimaryPhoneActivePeriods     int64    `json:"primaryPhoneActivePeriods"`
	CompletedPhoneActivityPeriods int64    `json:"completedPhoneActivityPeriods"`
	PhoneActivityMS               float64  `json:"phoneActivityMs"`
	AveragePhoneActivityMS        *float64 `json:"averagePhoneActivityMs"`
	PhoneQuietGaps                int64    `json:"phoneQuietGaps"`
	PhoneQuietMS                  float64  `json:"phoneQuietMs"`
	AveragePhoneQuietMS           *float64 `json:"averagePhoneQuietMs"`
	PrimaryPhoneMessages          int64    `json:"primaryPhoneMessages"`
	OtherDeviceMessages           int64    `json:"otherDeviceMessages"`
	PrimaryPhoneReplies           int64    `json:"primaryPhoneReplies"`
	OtherDeviceReplies            int64    `json:"otherDeviceReplies"`
	AveragePrimaryPhoneResponseMS *float64 `json:"averagePrimaryPhoneResponseMs"`
	AverageOtherDeviceResponseMS  *float64 `json:"averageOtherDeviceResponseMs"`
	LastPrimaryPhoneAt            *int64   `json:"lastPrimaryPhoneAt"`
}
type WhatsAppResponseQueue struct {
	AwaitingReply   int64   `json:"awaitingReply"`
	OldestWaitingMS float64 `json:"oldestWaitingMs"`
	ObservedAt      int64   `json:"observedAt"`
	Complete        bool    `json:"complete"`
}
type WhatsAppMetrics struct {
	RecipientActivity         *WhatsAppRecipientActivity    `json:"recipientActivity,omitempty"`
	DeviceAnalytics           WhatsAppDeviceAnalytics       `json:"deviceAnalytics"`
	ConversationBreakdown     WhatsAppConversationBreakdown `json:"conversationBreakdown"`
	Calls                     CallBusinessMetrics           `json:"calls"`
	Measured                  bool                          `json:"measured"`
	ObservedHours             int                           `json:"observedHours"`
	LastObservedAt            *int64                        `json:"lastObservedAt"`
	OutgoingMessages          int64                         `json:"outgoingMessages"`
	IncomingMessages          int64                         `json:"incomingMessages"`
	SendAttempts              int64                         `json:"sendAttempts"`
	SendFailures              int64                         `json:"sendFailures"`
	SendFailureRate           *float64                      `json:"sendFailureRate"`
	BusinessReplies           int64                         `json:"businessReplies"`
	AverageBusinessResponseMS *float64                      `json:"averageBusinessResponseMs"`
	OnlineMS                  float64                       `json:"onlineMs"`
	Disconnects               int64                         `json:"disconnects"`
	ConnectFailures           int64                         `json:"connectFailures"`
	StreamErrors              int64                         `json:"streamErrors"`
	KeepaliveTimeouts         int64                         `json:"keepaliveTimeouts"`
	Engagement                WhatsAppEngagement            `json:"engagement"`
	MessageAnalysis           WhatsAppMessageAnalysis       `json:"messageAnalysis"`
	CustomerActivity          WhatsAppCustomerActivity      `json:"customerActivity"`
	AccountActivity           WhatsAppAccountActivity       `json:"accountActivity"`
	ResponseQueue             *WhatsAppResponseQueue        `json:"responseQueue"`
}
type WhatsAppAnalyticsSummary struct {
	WhatsAppMetrics
	TotalNumbers     int `json:"totalNumbers"`
	MeasuredNumbers  int `json:"measuredNumbers"`
	ConnectedNumbers int `json:"connectedNumbers"`
}
type WhatsAppAnalyticsNumber struct {
	WhatsAppMetrics
	SessionID   string `json:"sessionId"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	Name        string `json:"name"`
	Backend     string `json:"backend"`
	Status      string `json:"status"`
}
type WhatsAppCallSeriesPoint struct {
	CallOutcomeMetrics
	SessionID string `json:"sessionId"`
	TS        int64  `json:"ts"`
}
type WhatsAppSeriesPoint struct {
	CustomerOnlineSignals         int64    `json:"customerOnlineSignals"`
	CustomerTypingSignals         int64    `json:"customerTypingSignals"`
	PrimaryPhoneMessages          int64    `json:"primaryPhoneMessages"`
	OtherDeviceMessages           int64    `json:"otherDeviceMessages"`
	PrimaryPhoneReplies           int64    `json:"primaryPhoneReplies"`
	PhoneActivePeriods            int64    `json:"phoneActivePeriods"`
	CompletedPhoneActivityPeriods int64    `json:"completedPhoneActivityPeriods"`
	PhoneActivityMS               float64  `json:"phoneActivityMs"`
	PhoneQuietGaps                int64    `json:"phoneQuietGaps"`
	PhoneQuietMS                  float64  `json:"phoneQuietMs"`
	SessionID                     string   `json:"sessionId"`
	TS                            int64    `json:"ts"`
	OutgoingMessages              int64    `json:"outgoingMessages"`
	IncomingMessages              int64    `json:"incomingMessages"`
	SendFailures                  int64    `json:"sendFailures"`
	BusinessReplies               int64    `json:"businessReplies"`
	AverageBusinessResponseMS     *float64 `json:"averageBusinessResponseMs"`
	OnlineMS                      float64  `json:"onlineMs"`
	Disconnects                   int64    `json:"disconnects"`
}
type AnalyticsPeriod struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}
type AnalyticsRequestVitals struct {
	Requests  int64    `json:"requests"`
	Failures  int64    `json:"failures"`
	ErrorRate *float64 `json:"errorRate"`
}
type WhatsAppAnalytics struct {
	CallSeries    []WhatsAppCallSeriesPoint `json:"callSeries"`
	Enabled       bool                      `json:"enabled"`
	Period        AnalyticsPeriod           `json:"period"`
	RequestVitals AnalyticsRequestVitals    `json:"requestVitals"`
	Summary       *WhatsAppAnalyticsSummary `json:"summary"`
	Numbers       []WhatsAppAnalyticsNumber `json:"numbers"`
	Series        []WhatsAppSeriesPoint     `json:"series"`
}
type AnalyticsSettings struct {
	Enabled bool `json:"enabled"`
}
