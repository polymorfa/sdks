package polymorfa

import (
	"io"
	"time"
)

const VoiceAudioMaxUploadBytes int64 = 16777216

type VoiceAudioTTS struct {
	Provider     string  `json:"provider"`
	VoiceID      string  `json:"voiceId"`
	Model        string  `json:"model"`
	Text         string  `json:"text"`
	Characters   int     `json:"characters"`
	KeySource    string  `json:"keySource"`
	CredentialID *string `json:"credentialId"`
}
type VoiceAudioAsset struct {
	ID                  string         `json:"id"`
	ProjectID           string         `json:"projectId"`
	Name                string         `json:"name"`
	Source              string         `json:"source"`
	Status              string         `json:"status"`
	FailureReason       *string        `json:"failureReason"`
	OriginalFormat      *string        `json:"originalFormat"`
	OriginalContentType *string        `json:"originalContentType"`
	SizeBytes           *int64         `json:"sizeBytes"`
	DurationMS          *int64         `json:"durationMs"`
	ContentSHA256       *string        `json:"contentSha256"`
	TTS                 *VoiceAudioTTS `json:"tts"`
	RetentionDays       *int           `json:"retentionDays"`
	ExpiresAt           *string        `json:"expiresAt"`
	InUseCount          int            `json:"inUseCount"`
	Revision            int64          `json:"revision"`
	CreatedAt           string         `json:"createdAt"`
	UpdatedAt           string         `json:"updatedAt"`
	ReadyAt             *string        `json:"readyAt"`
}
type VoiceAudioUpload struct {
	URL       string            `json:"url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	MaxBytes  int64             `json:"maxBytes"`
	ExpiresAt string            `json:"expiresAt"`
}

func (VoiceAudioUpload) String() string     { return "VoiceAudioUpload{[redacted]}" }
func (v VoiceAudioUpload) GoString() string { return v.String() }

type VoiceAudioUploadCreated struct {
	Asset  VoiceAudioAsset  `json:"asset"`
	Upload VoiceAudioUpload `json:"upload"`
}
type VoiceAudioPreview struct {
	URL         string `json:"url"`
	ContentType string `json:"contentType"`
	ExpiresAt   string `json:"expiresAt"`
}

func (VoiceAudioPreview) String() string     { return "VoiceAudioPreview{[redacted]}" }
func (v VoiceAudioPreview) GoString() string { return v.String() }

type VoiceProviderCredential struct {
	ID             string  `json:"id"`
	ProjectID      *string `json:"projectId"`
	Provider       string  `json:"provider"`
	Label          string  `json:"label"`
	KeyFingerprint string  `json:"keyFingerprint"`
	Status         string  `json:"status"`
	VerifiedAt     *string `json:"verifiedAt"`
	LastError      *string `json:"lastError"`
	Revision       int64   `json:"revision"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}
type VoiceResourceDeleted struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}
type ListVoiceAudioParams struct {
	ListParams
	Status string
}
type CreateVoiceAudioUploadRequest struct {
	Name          string `json:"name"`
	ContentType   string `json:"contentType"`
	SizeBytes     int64  `json:"sizeBytes"`
	RetentionDays *int   `json:"retentionDays,omitempty"`
}
type UploadVoiceAudioRequest struct {
	Name          string
	ContentType   string
	Body          io.Reader
	SizeBytes     int64
	RetentionDays *int
}
type SynthesizeVoiceAudioRequest struct {
	Name          string `json:"name"`
	Text          string `json:"text"`
	CredentialID  string `json:"credentialId,omitempty"`
	RetentionDays *int   `json:"retentionDays,omitempty"`
	Provider      string `json:"provider"`
	VoiceID       string `json:"voiceId"`
	Model         string `json:"model,omitempty"`
}

func (SynthesizeVoiceAudioRequest) String() string     { return "SynthesizeVoiceAudioRequest{[redacted]}" }
func (v SynthesizeVoiceAudioRequest) GoString() string { return v.String() }

type UpdateVoiceAudioRequest struct {
	ExpectedRevision *int64         `json:"expectedRevision,omitempty"`
	Name             *string        `json:"name,omitempty"`
	RetentionDays    *Nullable[int] `json:"retentionDays,omitempty"`
}
type WaitForVoiceAudioOptions struct{ Timeout, Interval time.Duration }
type CreateVoiceProviderCredentialRequest struct {
	Provider  string            `json:"provider"`
	Label     string            `json:"label"`
	APIKey    string            `json:"apiKey"`
	ProjectID *Nullable[string] `json:"projectId,omitempty"`
}

func (CreateVoiceProviderCredentialRequest) String() string {
	return "CreateVoiceProviderCredentialRequest{[redacted]}"
}
func (v CreateVoiceProviderCredentialRequest) GoString() string { return v.String() }
