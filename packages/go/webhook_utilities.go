package polymorfa

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const FlowForwardSignatureHeader = "X-Polymorfa-Flow-Signature"

type VerifyFlowForwardOptions struct {
	Tolerance *time.Duration
	Now       time.Time
}

var flowForwardSignaturePattern = regexp.MustCompile(`^t=([0-9]{1,12}),v1=([a-fA-F0-9]{64})$`)

func VerifyFlowForwardSignature(raw []byte, signature, secret string, o VerifyFlowForwardOptions) bool {
	if secret == "" {
		return false
	}
	match := flowForwardSignaturePattern.FindStringSubmatch(strings.TrimSpace(signature))
	if match == nil {
		return false
	}
	seconds, err := strconv.ParseInt(match[1], 10, 64)
	if err != nil {
		return false
	}
	now := o.Now
	if now.IsZero() {
		now = time.Now()
	}
	tolerance := 300 * time.Second
	if o.Tolerance != nil {
		tolerance = *o.Tolerance
	}
	delta := now.Sub(time.Unix(seconds, 0))
	if delta < 0 {
		delta = -delta
	}
	if tolerance < 0 || delta > tolerance {
		return false
	}
	sig, _ := hex.DecodeString(match[2])
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(match[1] + "."))
	m.Write(raw)
	return hmac.Equal(sig, m.Sum(nil))
}

type VerifyLocalWebhookOptions struct {
	ToleranceSeconds *int64
	NowUnixSeconds   *int64
}

var localWebhookSecretPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
var localWebhookSignaturePattern = regexp.MustCompile(`^t=([0-9]+),v1=([a-f0-9]{64})$`)

func ConstructLocalWebhookEvent(raw []byte, signature, secret string, o VerifyLocalWebhookOptions) (WebhookEvent, error) {
	fail := func() (WebhookEvent, error) {
		return WebhookEvent{}, &Error{Kind: AuthenticationError, Code: "invalid_webhook_signature", Message: "Local webhook signature verification failed."}
	}
	if !localWebhookSecretPattern.MatchString(secret) {
		return fail()
	}
	key, err := base64.RawURLEncoding.DecodeString(secret)
	if err != nil || len(key) != 32 {
		return fail()
	}
	match := localWebhookSignaturePattern.FindStringSubmatch(signature)
	if match == nil {
		return fail()
	}
	ts, err := strconv.ParseInt(match[1], 10, 64)
	if err != nil || ts > 9007199254740991 {
		return fail()
	}
	now := time.Now().Unix()
	if o.NowUnixSeconds != nil {
		now = *o.NowUnixSeconds
	}
	tolerance := int64(300)
	if o.ToleranceSeconds != nil {
		tolerance = *o.ToleranceSeconds
	}
	if tolerance < 0 || tolerance > 9007199254740991 {
		return fail()
	}
	delta := now - ts
	if delta < 0 {
		delta = -delta
	}
	if delta > tolerance {
		return fail()
	}
	sig, _ := hex.DecodeString(match[2])
	m := hmac.New(sha256.New, key)
	m.Write([]byte(strconv.FormatInt(ts, 10) + "."))
	m.Write(raw)
	if !hmac.Equal(sig, m.Sum(nil)) {
		return fail()
	}
	return ParseVerifiedWebhookEvent(raw)
}

type WebhookFixture struct {
	Body        []byte
	ContentType string
	Signature   string
	Headers     http.Header
}

func CreateWebhookFixture(event WebhookEvent, secret string) (WebhookFixture, error) {
	b, err := json.Marshal(event)
	if err != nil {
		return WebhookFixture{}, err
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(b)
	sig := hex.EncodeToString(m.Sum(nil))
	return WebhookFixture{b, "application/json", sig, http.Header{"Content-Type": []string{"application/json"}, "X-Webhook-Signature": []string{sig}}}, nil
}
