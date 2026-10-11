package polymorfa

import (
	"context"
	"net/url"
	"strings"
)

type Contact struct {
	ConversationReference
	Name         string `json:"name"`
	PushName     string `json:"pushName"`
	BusinessName string `json:"businessName,omitempty"`
	ProfileURL   string `json:"profileUrl,omitempty"`
}
type CheckContactResult struct {
	ConversationReference
	Exists bool `json:"exists"`
}
type ContactBlocklist struct {
	Hash     string                  `json:"hash"`
	Contacts []ConversationReference `json:"contacts"`
}
type ContactPicture struct {
	URL string `json:"url"`
}
type ContactUserInfo struct {
	ConversationReference
	Status       string `json:"status"`
	PictureID    string `json:"pictureId"`
	VerifiedName string `json:"verifiedName"`
	Devices      []struct {
		ConversationReference
		Device int `json:"device"`
	} `json:"devices"`
}
type BusinessProfileCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type BusinessProfileHours struct {
	DayOfWeek string `json:"dayOfWeek"`
	Mode      string `json:"mode"`
	OpenTime  string `json:"openTime"`
	CloseTime string `json:"closeTime"`
}
type BusinessProfile struct {
	ConversationReference
	Address       string                    `json:"address"`
	Email         string                    `json:"email"`
	Description   string                    `json:"description"`
	Websites      []string                  `json:"websites"`
	CoverPhotoID  string                    `json:"coverPhotoId"`
	Categories    []BusinessProfileCategory `json:"categories"`
	Options       map[string]string         `json:"options"`
	HoursTimeZone string                    `json:"hoursTimeZone"`
	Hours         []BusinessProfileHours    `json:"hours"`
}
type Contacts struct{ t *transport }

func (c *MessagingClient) Contacts() *Contacts { return &Contacts{c.t} }
func contactsPath(s string) string             { return "/messaging/" + escaped(s) + "/contacts" }
func contactPath(s, id string) string          { return contactsPath(s) + "/" + escaped(id) }
func (r *Contacts) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[[]Contact]], error) {
	return request[Envelope[[]Contact]](ctx, r.t, "GET", contactsPath(s), nil, nil, options(o))
}
func (r *Contacts) Check(ctx context.Context, s string, phones []string, o ...RequestOptions) (Response[Envelope[[]CheckContactResult]], error) {
	return request[Envelope[[]CheckContactResult]](ctx, r.t, "GET", contactsPath(s)+"/check", url.Values{"phone": {strings.Join(phones, ",")}}, nil, options(o))
}
func (r *Contacts) Blocklist(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ContactBlocklist]], error) {
	return request[Envelope[ContactBlocklist]](ctx, r.t, "GET", contactsPath(s)+"/blocked", nil, nil, options(o))
}
func (r *Contacts) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[Contact]], error) {
	return request[Envelope[Contact]](ctx, r.t, "GET", contactPath(s, id), nil, nil, options(o))
}
func (r *Contacts) Picture(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[ContactPicture]], error) {
	return request[Envelope[ContactPicture]](ctx, r.t, "GET", contactPath(s, id)+"/picture", nil, nil, options(o))
}
func (r *Contacts) Info(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[ContactUserInfo]], error) {
	return request[Envelope[ContactUserInfo]](ctx, r.t, "GET", contactPath(s, id)+"/info", nil, nil, options(o))
}
func (r *Contacts) Devices(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[[]string]], error) {
	return request[Envelope[[]string]](ctx, r.t, "GET", contactPath(s, id)+"/devices", nil, nil, options(o))
}
func (r *Contacts) BusinessProfile(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[BusinessProfile]], error) {
	return request[Envelope[BusinessProfile]](ctx, r.t, "GET", contactPath(s, id)+"/business-profile", nil, nil, options(o))
}
func (r *Contacts) Block(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", contactPath(s, id)+"/block", nil, nil, options(o))
}
func (r *Contacts) Unblock(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", contactPath(s, id)+"/unblock", nil, nil, options(o))
}

type IdentityParams struct {
	PhoneNumber string
	ID          string
	Username    string
	UsernameKey string
}
type ResolvedIdentity struct {
	ConversationReference
	KeyRequired *bool `json:"keyRequired,omitempty"`
}
type Identities struct{ t *transport }

func (c *MessagingClient) Identities() *Identities { return &Identities{c.t} }
func (r *Identities) Resolve(ctx context.Context, s string, p IdentityParams, o ...RequestOptions) (Response[Envelope[ResolvedIdentity]], error) {
	q := url.Values{}
	setString(q, "phoneNumber", p.PhoneNumber)
	setString(q, "id", p.ID)
	setString(q, "username", p.Username)
	setString(q, "usernameKey", p.UsernameKey)
	return request[Envelope[ResolvedIdentity]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/identities/resolve", q, nil, options(o))
}

type UserSecurityCode struct {
	ConversationReference
	NumericCode string `json:"numericCode"`
	QRCode      string `json:"qrCode"`
}
type Users struct{ t *transport }

func (c *MessagingClient) Users() *Users { return &Users{c.t} }
func (r *Users) GetSecurityCode(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[UserSecurityCode]], error) {
	return request[Envelope[UserSecurityCode]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/users/"+escaped(id)+"/security-code", nil, nil, options(o))
}

type ProfileData struct {
	Name              string `json:"name"`
	Status            string `json:"status"`
	ProfilePictureURL string `json:"profilePicUrl,omitempty"`
	PhonePlatform     string `json:"phonePlatform,omitempty"`
	AccountType       string `json:"accountType,omitempty"`
}
type Profile struct{ t *transport }

func (c *MessagingClient) Profile() *Profile { return &Profile{c.t} }
func profilePath(s string) string            { return "/messaging/" + escaped(s) + "/profile" }
func (r *Profile) Get(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[ProfileData]], error) {
	return request[Envelope[ProfileData]](ctx, r.t, "GET", profilePath(s), nil, nil, options(o))
}
func (r *Profile) SetName(ctx context.Context, s, name string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", profilePath(s)+"/name", nil, struct {
		Name string `json:"name"`
	}{name}, options(o))
}
func (r *Profile) SetStatus(ctx context.Context, s, status string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", profilePath(s)+"/status", nil, struct {
		Status string `json:"status"`
	}{status}, options(o))
}
func (r *Profile) SetPicture(ctx context.Context, s string, b PictureRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", profilePath(s)+"/picture", nil, b, options(o))
}
func (r *Profile) DeletePicture(ctx context.Context, s string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", profilePath(s)+"/picture", nil, nil, options(o))
}

type PrivacySettings struct {
	GroupAdd     string `json:"groupAdd"`
	LastSeen     string `json:"lastSeen"`
	Status       string `json:"status"`
	Profile      string `json:"profile"`
	ReadReceipts string `json:"readReceipts"`
	Online       string `json:"online"`
	CallAdd      string `json:"callAdd"`
	Messages     string `json:"messages"`
	Defense      string `json:"defense"`
	Stickers     string `json:"stickers"`
}
type Privacy struct{ t *transport }

func (c *MessagingClient) Privacy() *Privacy { return &Privacy{c.t} }
func (r *Privacy) Get(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[PrivacySettings]], error) {
	return request[Envelope[PrivacySettings]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/privacy", nil, nil, options(o))
}
func (r *Privacy) Set(ctx context.Context, s, setting, value string, o ...RequestOptions) (Response[Envelope[PrivacySettings]], error) {
	return request[Envelope[PrivacySettings]](ctx, r.t, "PUT", "/messaging/"+escaped(s)+"/privacy/"+escaped(setting), nil, struct {
		Value string `json:"value"`
	}{value}, options(o))
}
func (r *Privacy) SetDefaultDisappearingTimer(ctx context.Context, s string, b DisappearingTimerRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", "/messaging/"+escaped(s)+"/privacy/disappearing/default", nil, b, options(o))
}
