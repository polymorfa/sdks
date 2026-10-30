package polymorfa

import (
	"context"
	"encoding/json"
	"strings"
)

// Passkeys relays supplied assertions. It never runs a browser ceremony.
type Passkeys struct{ t *transport }

func (c *MessagingClient) Passkeys() *Passkeys { return &Passkeys{c.t} }

type IssuePasskeyChallengeRequest struct {
	ChallengeB64URL *string `json:"challengeB64Url,omitempty"`
	TTLSeconds      *int64  `json:"ttlSeconds,omitempty"`
	// Deprecated: ignored by the server; runner authority determines this value.
	UserVerification *string `json:"userVerification,omitempty"`
	// Deprecated: ignored by the server; runner authority determines this value.
	TimeoutMS *int64 `json:"timeoutMs,omitempty"`
}
type PasskeyTicket struct {
	Version          int    `json:"version"`
	Ticket           string `json:"ticket"`
	Session          string `json:"session"`
	RPID             string `json:"rpId"`
	ChallengeB64URL  string `json:"challengeB64Url"`
	UserVerification string `json:"userVerification"`
	ExpiresAt        string `json:"expiresAt"`
	TimeoutMS        *int64 `json:"timeoutMs,omitempty"`
}
type PasskeyAssertionResponse struct {
	AuthenticatorDataB64 string  `json:"authenticatorDataB64"`
	ClientDataJSONB64    string  `json:"clientDataJSONB64"`
	SignatureB64         string  `json:"signatureB64"`
	UserHandleB64        *string `json:"userHandleB64,omitempty"`
}
type PasskeyAssertion struct {
	ID          string                   `json:"id"`
	RawIDB64URL string                   `json:"rawIdB64Url"`
	Response    PasskeyAssertionResponse `json:"response"`
}
type SubmitPasskeyAssertionRequest struct {
	TicketID  string           `json:"ticketId"`
	Assertion PasskeyAssertion `json:"assertion"`
}
type PasskeyAssertionResult struct {
	OK      bool   `json:"ok"`
	Ticket  string `json:"ticket"`
	Session string `json:"session"`
}
type ConfirmPasskeyRequest struct {
	TicketID string  `json:"ticketId"`
	Code     *string `json:"code,omitempty"`
}
type PasskeyConfirmation struct {
	Status        string  `json:"status"`
	TicketID      *string `json:"ticketId,omitempty"`
	Code          *string `json:"code,omitempty"`
	SkipHandoffUX *bool   `json:"skipHandoffUX,omitempty"`
	Error         *string `json:"error,omitempty"`
}

var PasskeyConfirmationStatuses = []string{"none", "challenge_pending", "assertion_sending", "assertion_submitted", "code_available", "confirmation_sending", "waiting_for_pairing", "completed", "failed"}

func passkeyPath(s string) (string, error) {
	if s == "" {
		return "", validation("Provide a session.")
	}
	return messagingPath(s) + "/passkey", nil
}
func passkeyChars(s string) int {
	n := 0
	for _, r := range s {
		n++
		if r > 0xffff {
			n++
		}
	}
	return n
}
func passkeyBudget(body any) error {
	data, err := json.Marshal(body)
	if err != nil || len(data) > 1048576 {
		return validation("Passkey request exceeds the 1 MiB JSON body budget.")
	}
	return nil
}
func (r *Passkeys) IssueChallenge(ctx context.Context, s string, body IssuePasskeyChallengeRequest, o ...RequestOptions) (Response[Envelope[PasskeyTicket]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[PasskeyTicket]]{}, err
	}
	p, err := passkeyPath(s)
	if err != nil {
		return Response[Envelope[PasskeyTicket]]{}, err
	}
	if body.ChallengeB64URL != nil && *body.ChallengeB64URL == "" || body.TimeoutMS != nil && *body.TimeoutMS <= 0 || body.UserVerification != nil && *body.UserVerification != "required" && *body.UserVerification != "preferred" && *body.UserVerification != "discouraged" {
		return Response[Envelope[PasskeyTicket]]{}, validation("Invalid passkey challenge options.")
	}
	if err = passkeyBudget(body); err != nil {
		return Response[Envelope[PasskeyTicket]]{}, err
	}
	return request[Envelope[PasskeyTicket]](ctx, r.t, "POST", p+"/challenge", nil, singleSubmission{body}, noRetry(options(o)))
}
func (r *Passkeys) GetChallenge(ctx context.Context, s, ticket string, o ...RequestOptions) (Response[Envelope[PasskeyTicket]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[PasskeyTicket]]{}, err
	}
	p, err := passkeyPath(s)
	if err != nil {
		return Response[Envelope[PasskeyTicket]]{}, err
	}
	if ticket == "" {
		return Response[Envelope[PasskeyTicket]]{}, validation("Provide a ticket ID.")
	}
	return request[Envelope[PasskeyTicket]](ctx, r.t, "GET", p+"/challenge/"+escaped(ticket), nil, nil, options(o))
}
func (r *Passkeys) SubmitAssertion(ctx context.Context, s string, body SubmitPasskeyAssertionRequest, o ...RequestOptions) (Response[Envelope[PasskeyAssertionResult]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[PasskeyAssertionResult]]{}, err
	}
	p, err := passkeyPath(s)
	if err != nil {
		return Response[Envelope[PasskeyAssertionResult]]{}, err
	}
	a := body.Assertion
	v := a.Response
	if body.TicketID == "" || a.ID == "" || passkeyChars(a.ID) > 1364 || a.RawIDB64URL == "" || passkeyChars(a.RawIDB64URL) > 1364 || v.AuthenticatorDataB64 == "" || v.ClientDataJSONB64 == "" || v.SignatureB64 == "" || v.UserHandleB64 != nil && passkeyChars(*v.UserHandleB64) > 86 {
		return Response[Envelope[PasskeyAssertionResult]]{}, validation("Invalid passkey assertion shape.")
	}
	if err = passkeyBudget(body); err != nil {
		return Response[Envelope[PasskeyAssertionResult]]{}, err
	}
	return request[Envelope[PasskeyAssertionResult]](ctx, r.t, "POST", p+"/assertion", nil, singleSubmission{body}, noRetry(options(o)))
}
func (r *Passkeys) GetConfirmation(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[PasskeyConfirmation]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[PasskeyConfirmation]]{}, err
	}
	p, err := passkeyPath(s)
	if err != nil {
		return Response[Envelope[PasskeyConfirmation]]{}, err
	}
	return request[Envelope[PasskeyConfirmation]](ctx, r.t, "GET", p+"/confirmation", nil, nil, options(o))
}
func (r *Passkeys) Confirm(ctx context.Context, s string, body ConfirmPasskeyRequest, o ...RequestOptions) (Response[Envelope[PasskeyConfirmation]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[PasskeyConfirmation]]{}, err
	}
	p, err := passkeyPath(s)
	if err != nil {
		return Response[Envelope[PasskeyConfirmation]]{}, err
	}
	if body.TicketID == "" {
		return Response[Envelope[PasskeyConfirmation]]{}, validation("Provide a ticket ID.")
	}
	if body.Code != nil {
		v := *body.Code
		if len(v) != 9 || v[4] != '-' || strings.Trim(v[:4]+v[5:], "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") != "" {
			return Response[Envelope[PasskeyConfirmation]]{}, validation("Invalid passkey confirmation code.")
		}
	}
	if err = passkeyBudget(body); err != nil {
		return Response[Envelope[PasskeyConfirmation]]{}, err
	}
	return request[Envelope[PasskeyConfirmation]](ctx, r.t, "POST", p+"/confirmation", nil, singleSubmission{body}, noRetry(options(o)))
}
