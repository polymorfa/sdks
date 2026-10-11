package polymorfa

import (
	"context"
	"strconv"
)

type TestingConfiguration struct {
	Profile *struct {
		Name   string `json:"name,omitempty"`
		Status string `json:"status,omitempty"`
	} `json:"profile,omitempty"`
	AccountType      string `json:"accountType,omitempty"`
	ReplyBehavior    string `json:"replyBehavior,omitempty"`
	FailureScenario  string `json:"failureScenario,omitempty"`
	HistoryFixtureID string `json:"historyFixtureId,omitempty"`
}
type TestingHistoryMessage struct {
	ID          string `json:"id"`
	SenderPhone string `json:"senderPhone"`
	Text        string `json:"text"`
	Timestamp   int64  `json:"timestamp"`
	FromMe      bool   `json:"fromMe"`
}
type TestEventOverrides struct {
	Text              string `json:"text,omitempty"`
	From              string `json:"from,omitempty"`
	PushName          string `json:"pushName,omitempty"`
	MediaType         string `json:"mediaType,omitempty"`
	Caption           string `json:"caption,omitempty"`
	AckStatus         string `json:"ackStatus,omitempty"`
	MessageID         string `json:"messageId,omitempty"`
	FailureReason     string `json:"failureReason,omitempty"`
	Video             *bool  `json:"video,omitempty"`
	DurationSeconds   *int   `json:"durationSeconds,omitempty"`
	CallEndReason     string `json:"callEndReason,omitempty"`
	RestrictionActive *bool  `json:"restrictionActive,omitempty"`
	Status            string `json:"status,omitempty"`
	StatusReason      string `json:"statusReason,omitempty"`
	TemplateName      string `json:"templateName,omitempty"`
	TemplateStatus    string `json:"templateStatus,omitempty"`
	Reason            string `json:"reason,omitempty"`
}
type TriggerTestEventRequest struct {
	Session     string              `json:"session"`
	Event       string              `json:"event"`
	Overrides   *TestEventOverrides `json:"overrides,omitempty"`
	FromSession string              `json:"fromSession,omitempty"`
}
type TriggerTestEventResult struct {
	Event    string  `json:"event"`
	Session  string  `json:"session"`
	Delivery string  `json:"delivery"`
	EventID  *string `json:"eventId"`
	Source   string  `json:"source"`
}
type TestEventFixtureInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Overrides   []string `json:"overrides"`
}
type TestingPhone struct {
	Session string `json:"session"`
	Phone   string `json:"phone"`
	Online  bool   `json:"online"`
	Devices []struct {
		DeviceID int `json:"deviceId"`
	} `json:"devices"`
}
type SendTestingPhoneMessageRequest struct {
	To   string `json:"to"`
	Text string `json:"text"`
}
type SendTestingPhoneMessageResult struct {
	Session   string  `json:"session"`
	To        string  `json:"to"`
	MessageID *string `json:"messageId"`
}
type UnlinkTestingPhoneDeviceResult struct {
	Session  string `json:"session"`
	DeviceID int    `json:"deviceId"`
	Unlinked bool   `json:"unlinked"`
}
type Testing struct{ t *transport }

func (c *MessagingClient) Testing() *Testing { return &Testing{c.t} }
func (r *Testing) CreateHistoryFixture(ctx context.Context, project string, messages []TestingHistoryMessage, o ...RequestOptions) (Response[struct {
	FixtureID string `json:"fixtureId"`
}], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[struct {
			FixtureID string `json:"fixtureId"`
		}]{}, err
	}
	return request[struct {
		FixtureID string `json:"fixtureId"`
	}](ctx, r.t, "POST", "/messaging/testing/"+escaped(project)+"/history-fixtures", nil, struct {
		Messages []TestingHistoryMessage `json:"messages"`
	}{messages}, options(o))
}
func (r *Testing) TriggerEvent(ctx context.Context, project string, b TriggerTestEventRequest, o ...RequestOptions) (Response[TriggerTestEventResult], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[TriggerTestEventResult]{}, err
	}
	return request[TriggerTestEventResult](ctx, r.t, "POST", "/messaging/testing/"+escaped(project)+"/events", nil, b, options(o))
}
func (r *Testing) ListEventFixtures(ctx context.Context, project string, o ...RequestOptions) (Response[struct {
	Fixtures []TestEventFixtureInfo `json:"fixtures"`
}], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[struct {
			Fixtures []TestEventFixtureInfo `json:"fixtures"`
		}]{}, err
	}
	return request[struct {
		Fixtures []TestEventFixtureInfo `json:"fixtures"`
	}](ctx, r.t, "GET", "/messaging/testing/"+escaped(project)+"/events/fixtures", nil, nil, options(o))
}
func phonePath(project, session string) string {
	return "/messaging/testing/" + escaped(project) + "/numbers/" + escaped(session) + "/phone"
}
func (r *Testing) GetPhone(ctx context.Context, project, session string, o ...RequestOptions) (Response[TestingPhone], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[TestingPhone]{}, err
	}
	return request[TestingPhone](ctx, r.t, "GET", phonePath(project, session), nil, nil, options(o))
}
func (r *Testing) SendPhoneMessage(ctx context.Context, project, session string, b SendTestingPhoneMessageRequest, o ...RequestOptions) (Response[SendTestingPhoneMessageResult], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[SendTestingPhoneMessageResult]{}, err
	}
	return request[SendTestingPhoneMessageResult](ctx, r.t, "POST", phonePath(project, session)+"/messages", nil, b, options(o))
}
func (r *Testing) UnlinkPhoneDevice(ctx context.Context, project, session string, id int, o ...RequestOptions) (Response[UnlinkTestingPhoneDeviceResult], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[UnlinkTestingPhoneDeviceResult]{}, err
	}
	if id < 1 || id > 99 {
		return Response[UnlinkTestingPhoneDeviceResult]{}, validation("deviceId must be between 1 and 99.")
	}
	return request[UnlinkTestingPhoneDeviceResult](ctx, r.t, "POST", phonePath(project, session)+"/devices/"+strconv.Itoa(id)+"/unlink", nil, nil, options(o))
}

type EmbeddedSignupResult struct {
	Code          string `json:"code"`
	WABAID        string `json:"wabaId"`
	PhoneNumberID string `json:"phoneNumberId"`
	Coexistence   *bool  `json:"coexistence,omitempty"`
	HistorySync   *bool  `json:"historySync,omitempty"`
}
type EmbeddedSignupRequest struct {
	QuickLinkID string                `json:"quicklinkId"`
	ProjectID   string                `json:"projectId,omitempty"`
	Result      *EmbeddedSignupResult `json:"result,omitempty"`
}
type CloudOnboarding struct{ t *transport }

func (c *MessagingClient) CloudOnboarding() *CloudOnboarding { return &CloudOnboarding{c.t} }
func (r *CloudOnboarding) Advance(ctx context.Context, b EmbeddedSignupRequest, o ...RequestOptions) (Response[Envelope[struct {
	Stage string `json:"stage"`
}]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[struct {
			Stage string `json:"stage"`
		}]]{}, err
	}
	return request[Envelope[struct {
		Stage string `json:"stage"`
	}]](ctx, r.t, "POST", "/messaging/cloud-api/embedded-signup", nil, b, options(o))
}
