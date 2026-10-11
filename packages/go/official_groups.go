package polymorfa

import (
	"context"
	"net/url"
)

type OfficialGroupCursors struct {
	Before string `json:"before,omitempty"`
	After  string `json:"after,omitempty"`
}
type OfficialGroupSummary struct {
	ID        string `json:"id"`
	Subject   string `json:"subject,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
}
type OfficialGroupList struct {
	Groups  []OfficialGroupSummary `json:"groups"`
	Cursors OfficialGroupCursors   `json:"cursors"`
	HasMore bool                   `json:"hasMore"`
}
type OfficialGroup struct {
	ID                   string                  `json:"id"`
	Subject              string                  `json:"subject,omitempty"`
	Description          string                  `json:"description,omitempty"`
	Suspended            *bool                   `json:"suspended,omitempty"`
	CreatedAt            string                  `json:"createdAt,omitempty"`
	ParticipantCount     *int                    `json:"participantCount,omitempty"`
	JoinApprovalRequired *bool                   `json:"joinApprovalRequired,omitempty"`
	Participants         []ConversationReference `json:"participants"`
}
type ListOfficialGroupsParams struct {
	Limit  int
	Before string
	After  string
}
type OfficialGroupCursorParams struct {
	Before string
	After  string
}
type CreateOfficialGroupRequest struct {
	Subject              string `json:"subject"`
	Description          string `json:"description,omitempty"`
	JoinApprovalRequired *bool  `json:"joinApprovalRequired,omitempty"`
}
type UpdateOfficialGroupRequest struct {
	Subject     *string `json:"subject,omitempty"`
	Description *string `json:"description,omitempty"`
}
type OfficialGroupAccepted struct {
	Accepted bool `json:"accepted"`
}
type OfficialGroupInviteLink struct {
	InviteLink string `json:"inviteLink"`
}
type OfficialGroupJoinRequest struct {
	JoinRequestID string                `json:"joinRequestId"`
	User          ConversationReference `json:"user"`
	CreatedAt     string                `json:"createdAt,omitempty"`
}
type OfficialGroupJoinRequestList struct {
	Items   []OfficialGroupJoinRequest `json:"items"`
	Cursors OfficialGroupCursors       `json:"cursors"`
	HasMore bool                       `json:"hasMore"`
}
type OfficialGroupJoinError struct {
	Code  int    `json:"code"`
	Title string `json:"title,omitempty"`
}
type OfficialGroupJoinFailure struct {
	JoinRequestID string                   `json:"joinRequestId"`
	Errors        []OfficialGroupJoinError `json:"errors"`
}
type OfficialGroupJoinDecision struct {
	Succeeded []string                   `json:"succeeded"`
	Failed    []OfficialGroupJoinFailure `json:"failed"`
}
type PinOfficialGroupMessageRequest struct {
	Operation      string `json:"operation"`
	MessageID      string `json:"messageId"`
	ExpirationDays *int   `json:"expirationDays,omitempty"`
}
type OfficialGroups struct{ t *transport }

func (c *MessagingClient) OfficialGroups() *OfficialGroups { return &OfficialGroups{c.t} }
func officialGroupsPath(s string) string                   { return messagingPath(s) + "/official-groups" }
func officialGroupPath(s, id string) string                { return officialGroupsPath(s) + "/" + escaped(id) }
func serverRead[T any](ctx context.Context, t *transport, path string, q url.Values, o RequestOptions) (Response[Envelope[T]], error) {
	if err := serverOnly(t); err != nil {
		return Response[Envelope[T]]{}, err
	}
	return request[Envelope[T]](ctx, t, "GET", path, q, nil, o)
}
func serverWriteOnce[T any](ctx context.Context, t *transport, method, path string, body any, o RequestOptions) (Response[Envelope[T]], error) {
	if err := serverOnly(t); err != nil {
		return Response[Envelope[T]]{}, err
	}
	return request[Envelope[T]](ctx, t, method, path, nil, body, noRetry(o))
}
func (r *OfficialGroups) List(ctx context.Context, s string, p ListOfficialGroupsParams, o ...RequestOptions) (Response[Envelope[OfficialGroupList]], error) {
	q := url.Values{}
	setInt(q, "limit", p.Limit)
	setString(q, "before", p.Before)
	setString(q, "after", p.After)
	return serverRead[OfficialGroupList](ctx, r.t, officialGroupsPath(s), q, options(o))
}
func (r *OfficialGroups) Create(ctx context.Context, s string, b CreateOfficialGroupRequest, o ...RequestOptions) (Response[Envelope[AsyncAccepted]], error) {
	return serverWriteOnce[AsyncAccepted](ctx, r.t, "POST", officialGroupsPath(s), b, options(o))
}
func (r *OfficialGroups) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[OfficialGroup]], error) {
	return serverRead[OfficialGroup](ctx, r.t, officialGroupPath(s, id), nil, options(o))
}
func (r *OfficialGroups) Update(ctx context.Context, s, id string, b UpdateOfficialGroupRequest, o ...RequestOptions) (Response[Envelope[OfficialGroupAccepted]], error) {
	return serverWriteOnce[OfficialGroupAccepted](ctx, r.t, "PATCH", officialGroupPath(s, id), b, options(o))
}
func (r *OfficialGroups) Delete(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[OfficialGroupAccepted]], error) {
	return serverWriteOnce[OfficialGroupAccepted](ctx, r.t, "DELETE", officialGroupPath(s, id), nil, options(o))
}
func (r *OfficialGroups) GetInviteLink(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[OfficialGroupInviteLink]], error) {
	return serverRead[OfficialGroupInviteLink](ctx, r.t, officialGroupPath(s, id)+"/invite-link", nil, options(o))
}
func (r *OfficialGroups) ResetInviteLink(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[OfficialGroupInviteLink]], error) {
	return serverWriteOnce[OfficialGroupInviteLink](ctx, r.t, "POST", officialGroupPath(s, id)+"/invite-link/reset", nil, options(o))
}
func (r *OfficialGroups) RemoveParticipants(ctx context.Context, s, id string, participants []string, o ...RequestOptions) (Response[Envelope[OfficialGroupAccepted]], error) {
	return serverWriteOnce[OfficialGroupAccepted](ctx, r.t, "POST", officialGroupPath(s, id)+"/participants/remove", GroupParticipantsRequest{participants}, options(o))
}
func (r *OfficialGroups) ListJoinRequests(ctx context.Context, s, id string, p OfficialGroupCursorParams, o ...RequestOptions) (Response[Envelope[OfficialGroupJoinRequestList]], error) {
	q := url.Values{}
	setString(q, "before", p.Before)
	setString(q, "after", p.After)
	return serverRead[OfficialGroupJoinRequestList](ctx, r.t, officialGroupPath(s, id)+"/join-requests", q, options(o))
}
func (r *OfficialGroups) ApproveJoinRequests(ctx context.Context, s, id string, ids []string, o ...RequestOptions) (Response[Envelope[OfficialGroupJoinDecision]], error) {
	return serverWriteOnce[OfficialGroupJoinDecision](ctx, r.t, "POST", officialGroupPath(s, id)+"/join-requests/approve", struct {
		IDs []string `json:"joinRequestIds"`
	}{ids}, options(o))
}
func (r *OfficialGroups) RejectJoinRequests(ctx context.Context, s, id string, ids []string, o ...RequestOptions) (Response[Envelope[OfficialGroupJoinDecision]], error) {
	return serverWriteOnce[OfficialGroupJoinDecision](ctx, r.t, "POST", officialGroupPath(s, id)+"/join-requests/reject", struct {
		IDs []string `json:"joinRequestIds"`
	}{ids}, options(o))
}
func (r *OfficialGroups) Pin(ctx context.Context, s, id string, b PinOfficialGroupMessageRequest, o ...RequestOptions) (Response[Envelope[OfficialGroupAccepted]], error) {
	switch b.Operation {
	case "pin":
		if b.ExpirationDays == nil || *b.ExpirationDays < 1 || *b.ExpirationDays > 30 {
			return Response[Envelope[OfficialGroupAccepted]]{}, validation("Pin expirationDays must be between 1 and 30.")
		}
	case "unpin":
		if b.ExpirationDays != nil {
			return Response[Envelope[OfficialGroupAccepted]]{}, validation("Unpin does not take expirationDays.")
		}
	default:
		return Response[Envelope[OfficialGroupAccepted]]{}, validation("operation must be pin or unpin.")
	}
	return serverWriteOnce[OfficialGroupAccepted](ctx, r.t, "POST", officialGroupPath(s, id)+"/pins", b, options(o))
}
