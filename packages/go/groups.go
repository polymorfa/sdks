package polymorfa

import (
	"context"
	"net/url"
)

type GroupParticipant struct {
	ConversationReference
	IsAdmin      bool `json:"isAdmin"`
	IsSuperAdmin bool `json:"isSuperAdmin"`
}
type Group struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	CreatedAt    int64              `json:"createdAt"`
	Participants []GroupParticipant `json:"participants"`
	OwnerID      string             `json:"ownerId"`
}
type GroupInviteInfo struct {
	ID           string             `json:"id"`
	Subject      string             `json:"subject"`
	CreatedAt    int64              `json:"createdAt"`
	Size         int                `json:"size"`
	Participants []GroupParticipant `json:"participants"`
	CreatorID    string             `json:"creatorId"`
}
type GroupInviteCode struct {
	Code string `json:"code"`
}
type CreateGroupRequest struct {
	Name         string   `json:"name"`
	Participants []string `json:"participants"`
}
type GroupParticipantsRequest struct {
	Participants []string `json:"participants"`
}
type PictureRequest struct {
	URL    string `json:"url,omitempty"`
	Base64 string `json:"base64,omitempty"`
}
type GroupCapabilities struct {
	Status       string  `json:"status"`
	SyncedAt     *string `json:"syncedAt"`
	CheckedAt    *string `json:"checkedAt"`
	Capabilities []struct {
		Key    string  `json:"key"`
		Kind   string  `json:"kind"`
		Unit   *string `json:"unit"`
		Value  *bool   `json:"value"`
		Source *string `json:"source"`
	} `json:"capabilities"`
}
type Groups struct{ t *transport }

func (c *MessagingClient) Groups() *Groups { return &Groups{c.t} }
func groupsPath(s string) string           { return "/messaging/" + escaped(s) + "/groups" }
func groupPath(s, id string) string        { return groupsPath(s) + "/" + escaped(id) }
func (r *Groups) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[[]Group]], error) {
	return request[Envelope[[]Group]](ctx, r.t, "GET", groupsPath(s), nil, nil, options(o))
}
func (r *Groups) Create(ctx context.Context, s string, b CreateGroupRequest, o ...RequestOptions) (Response[Envelope[Group]], error) {
	return request[Envelope[Group]](ctx, r.t, "POST", groupsPath(s), nil, b, options(o))
}
func (r *Groups) GetJoinInfo(ctx context.Context, s, code string, o ...RequestOptions) (Response[Envelope[GroupInviteInfo]], error) {
	return request[Envelope[GroupInviteInfo]](ctx, r.t, "GET", groupsPath(s)+"/join-info", url.Values{"code": {code}}, nil, options(o))
}
func (r *Groups) Join(ctx context.Context, s, code string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupsPath(s)+"/join", nil, GroupInviteCode{code}, options(o))
}
func (r *Groups) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[Group]], error) {
	return request[Envelope[Group]](ctx, r.t, "GET", groupPath(s, id), nil, nil, options(o))
}
func (r *Groups) GetCapabilities(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[GroupCapabilities]], error) {
	return request[Envelope[GroupCapabilities]](ctx, r.t, "GET", groupPath(s, id)+"/capabilities", nil, nil, options(o))
}
func (r *Groups) Delete(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", groupPath(s, id), nil, nil, options(o))
}
func (r *Groups) Leave(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupPath(s, id)+"/leave", nil, nil, options(o))
}
func (r *Groups) SetSubject(ctx context.Context, s, id, value string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/subject", nil, struct {
		Value string `json:"value"`
	}{value}, options(o))
}
func (r *Groups) SetDescription(ctx context.Context, s, id, value string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/description", nil, struct {
		Value string `json:"value"`
	}{value}, options(o))
}
func (r *Groups) GetInviteCode(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[GroupInviteCode]], error) {
	return request[Envelope[GroupInviteCode]](ctx, r.t, "GET", groupPath(s, id)+"/invite-code", nil, nil, options(o))
}
func (r *Groups) RevokeInviteCode(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[GroupInviteCode]], error) {
	return request[Envelope[GroupInviteCode]](ctx, r.t, "POST", groupPath(s, id)+"/invite-code/revoke", nil, nil, options(o))
}
func (r *Groups) ListParticipants(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[[]GroupParticipant]], error) {
	return request[Envelope[[]GroupParticipant]](ctx, r.t, "GET", groupPath(s, id)+"/participants", nil, nil, options(o))
}
func (r *Groups) AddParticipants(ctx context.Context, s, id string, b GroupParticipantsRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupPath(s, id)+"/participants/add", nil, b, options(o))
}
func (r *Groups) RemoveParticipants(ctx context.Context, s, id string, b GroupParticipantsRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupPath(s, id)+"/participants/remove", nil, b, options(o))
}
func (r *Groups) PromoteParticipants(ctx context.Context, s, id string, b GroupParticipantsRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupPath(s, id)+"/admin/promote", nil, b, options(o))
}
func (r *Groups) DemoteParticipants(ctx context.Context, s, id string, b GroupParticipantsRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", groupPath(s, id)+"/admin/demote", nil, b, options(o))
}
func (r *Groups) SetPicture(ctx context.Context, s, id string, b PictureRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/picture", nil, b, options(o))
}
func (r *Groups) SetInfoEditing(ctx context.Context, s, id string, adminsOnly bool, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/settings/info-edit", nil, struct {
		AdminsOnly bool `json:"adminsOnly"`
	}{adminsOnly}, options(o))
}
func (r *Groups) SetMessaging(ctx context.Context, s, id string, adminsOnly bool, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/settings/messages", nil, struct {
		AdminsOnly bool `json:"adminsOnly"`
	}{adminsOnly}, options(o))
}
func (r *Groups) SetMemberAddMode(ctx context.Context, s, id, mode string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/settings/member-add", nil, struct {
		Mode string `json:"mode"`
	}{mode}, options(o))
}
func (r *Groups) SetJoinApproval(ctx context.Context, s, id string, required bool, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", groupPath(s, id)+"/settings/join-approval", nil, struct {
		Required bool `json:"required"`
	}{required}, options(o))
}
