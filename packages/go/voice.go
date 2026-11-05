package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type OrganizationVoice struct{ t *transport }
type ProjectVoice struct {
	t         *transport
	projectID string
}
type VoiceAudio struct {
	t         *transport
	projectID string
	confine   bool
}
type VoiceProviderCredentials struct {
	t         *transport
	projectID string
	bound     bool
	confine   bool
}

func (c *OrganizationClient) Voice() *OrganizationVoice { return &OrganizationVoice{c.t} }
func (c *ProjectClient) Voice() *ProjectVoice           { return &ProjectVoice{c.t, c.projectID} }

// Audio creates a project-specific audio view from an organization client.
func (v *OrganizationVoice) Audio(projectID string) *VoiceAudio {
	return &VoiceAudio{v.t, projectID, false}
}
func (v *ProjectVoice) Audio() *VoiceAudio {
	return &VoiceAudio{v.t, v.projectID, v.t.config.Credential.Kind == OrganizationAPIKey}
}
func (v *OrganizationVoice) ProviderCredentials(projectID ...string) *VoiceProviderCredentials {
	p := ""
	if len(projectID) > 0 {
		p = projectID[0]
	}
	return &VoiceProviderCredentials{t: v.t, projectID: p}
}
func (v *ProjectVoice) ProviderCredentials() *VoiceProviderCredentials {
	return &VoiceProviderCredentials{v.t, v.projectID, true, v.t.config.Credential.Kind == OrganizationAPIKey}
}
func voiceAssetPath(id string) string { return "/platform/voice/audio/" + escaped(id) }
func voiceCredentialPath(id string) string {
	return "/platform/voice/provider-credentials/" + escaped(id)
}
func (r *VoiceAudio) List(ctx context.Context, p ListVoiceAudioParams, o ...RequestOptions) (*CursorPage[VoiceAudioAsset], error) {
	if strings.TrimSpace(r.projectID) == "" {
		return nil, configuration("projectId", "A project ID is required.")
	}
	q := p.ListParams.query()
	q.Set("projectId", r.projectID)
	setString(q, "status", p.Status)
	return page[VoiceAudioAsset](ctx, r.t, "/platform/voice/audio", q, options(o))
}
func (r *VoiceAudio) CreateUpload(ctx context.Context, b CreateVoiceAudioUploadRequest, o ...RequestOptions) (Response[VoiceAudioUploadCreated], error) {
	if strings.TrimSpace(r.projectID) == "" {
		return Response[VoiceAudioUploadCreated]{}, configuration("projectId", "A project ID is required.")
	}
	return unwrapped[VoiceAudioUploadCreated](ctx, r.t, "POST", "/platform/voice/audio", nil, struct {
		CreateVoiceAudioUploadRequest
		ProjectID string `json:"projectId"`
	}{b, r.projectID}, options(o))
}
func (r *VoiceAudio) Synthesize(ctx context.Context, b SynthesizeVoiceAudioRequest, o ...RequestOptions) (Response[VoiceAudioAsset], error) {
	valid := false
	switch b.Provider {
	case "elevenlabs":
		valid = regexp.MustCompile(`^[A-Za-z0-9]{1,64}$`).MatchString(b.VoiceID) && (b.Model == "" || b.Model == "eleven_multilingual_v2" || b.Model == "eleven_flash_v2_5" || b.Model == "eleven_turbo_v2_5")
	case "openai":
		voices := map[string]bool{"alloy": true, "ash": true, "ballad": true, "coral": true, "echo": true, "fable": true, "nova": true, "onyx": true, "sage": true, "shimmer": true, "verse": true}
		valid = voices[b.VoiceID] && (b.Model == "" || b.Model == "gpt-4o-mini-tts" || b.Model == "tts-1" || b.Model == "tts-1-hd")
	}
	if !valid {
		return Response[VoiceAudioAsset]{}, validation("Invalid synthesis provider, voice or model.")
	}

	if strings.TrimSpace(r.projectID) == "" {
		return Response[VoiceAudioAsset]{}, configuration("projectId", "A project ID is required.")
	}
	return unwrapped[VoiceAudioAsset](ctx, r.t, "POST", "/platform/voice/audio/tts", nil, struct {
		SynthesizeVoiceAudioRequest
		ProjectID string `json:"projectId"`
	}{b, r.projectID}, options(o))
}
func (r *VoiceAudio) assertProject(asset VoiceAudioAsset) error {
	if r.projectID != "" && !strings.EqualFold(asset.ProjectID, r.projectID) {
		return &Error{Kind: NotFoundError, Code: "resource_not_found", Status: 404, Message: "Audio asset not found."}
	}
	return nil
}
func (r *VoiceAudio) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceAudioAsset], error) {
	v, err := unwrapped[VoiceAudioAsset](ctx, r.t, "GET", voiceAssetPath(id), nil, nil, options(o))
	if err == nil {
		err = r.assertProject(v.Data)
	}
	return v, err
}
func (r *VoiceAudio) confineAsset(ctx context.Context, id string, o RequestOptions) error {
	if !r.confine {
		return nil
	}
	o.IdempotencyKey = ""
	_, err := r.Retrieve(ctx, id, o)
	return err
}
func (r *VoiceAudio) Complete(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceAudioAsset], error) {
	opts := options(o)
	if err := r.confineAsset(ctx, id, opts); err != nil {
		return Response[VoiceAudioAsset]{}, err
	}
	return unwrapped[VoiceAudioAsset](ctx, r.t, "POST", voiceAssetPath(id)+"/complete", nil, nil, opts)
}
func (r *VoiceAudio) Update(ctx context.Context, id string, b UpdateVoiceAudioRequest, o ...RequestOptions) (Response[VoiceAudioAsset], error) {
	opts := options(o)
	if err := r.confineAsset(ctx, id, opts); err != nil {
		return Response[VoiceAudioAsset]{}, err
	}
	return unwrapped[VoiceAudioAsset](ctx, r.t, "PATCH", voiceAssetPath(id), nil, b, opts)
}
func (r *VoiceAudio) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceResourceDeleted], error) {
	opts := options(o)
	if err := r.confineAsset(ctx, id, opts); err != nil {
		return Response[VoiceResourceDeleted]{}, err
	}
	return unwrapped[VoiceResourceDeleted](ctx, r.t, "DELETE", voiceAssetPath(id), nil, nil, opts)
}
func (r *VoiceAudio) PreviewURL(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceAudioPreview], error) {
	opts := options(o)
	if err := r.confineAsset(ctx, id, opts); err != nil {
		return Response[VoiceAudioPreview]{}, err
	}
	return unwrapped[VoiceAudioPreview](ctx, r.t, "GET", voiceAssetPath(id)+"/preview", nil, nil, opts)
}
func (r *VoiceAudio) WaitUntilReady(ctx context.Context, id string, p WaitForVoiceAudioOptions, o ...RequestOptions) (Response[VoiceAudioAsset], error) {
	if p.Timeout == 0 {
		p.Timeout = 120 * time.Second
	}
	if p.Interval == 0 {
		p.Interval = 2 * time.Second
	}
	if p.Timeout < 0 || p.Interval < 0 {
		return Response[VoiceAudioAsset]{}, configuration("wait", "Timeout and interval must be positive.")
	}
	wait, cancel := context.WithTimeout(ctx, p.Timeout)
	defer cancel()
	for {
		v, err := r.Retrieve(wait, id, o...)
		if err != nil {
			return v, err
		}
		if err = wait.Err(); err != nil {
			return v, contextError(wait, err)
		}
		if v.Data.Status == "ready" || v.Data.Status == "failed" {
			return v, nil
		}
		if err = sleep(wait, p.Interval); err != nil {
			return v, contextError(wait, err)
		}
	}
}
func (r *VoiceProviderCredentials) List(ctx context.Context, o ...RequestOptions) (Response[[]VoiceProviderCredential], error) {
	q := url.Values{}
	setString(q, "projectId", r.projectID)
	return unwrapped[[]VoiceProviderCredential](ctx, r.t, "GET", "/platform/voice/provider-credentials", q, nil, options(o))
}
func (r *VoiceProviderCredentials) Create(ctx context.Context, b CreateVoiceProviderCredentialRequest, o ...RequestOptions) (Response[VoiceProviderCredential], error) {
	if b.APIKey == "" {
		return Response[VoiceProviderCredential]{}, configuration("apiKey", "An apiKey is required.")
	}
	if r.bound {
		b.ProjectID = &Nullable[string]{Value: &r.projectID}
	}
	return unwrapped[VoiceProviderCredential](ctx, r.t, "POST", "/platform/voice/provider-credentials", nil, b, options(o))
}
func (r *VoiceProviderCredentials) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceProviderCredential], error) {
	v, err := unwrapped[VoiceProviderCredential](ctx, r.t, "GET", voiceCredentialPath(id), nil, nil, options(o))
	if err == nil && r.bound && v.Data.ProjectID != nil && !strings.EqualFold(*v.Data.ProjectID, r.projectID) {
		err = &Error{Kind: NotFoundError, Code: "resource_not_found", Status: 404, Message: "Provider credential not found."}
	}
	return v, err
}
func (r *VoiceProviderCredentials) confineCredential(ctx context.Context, id string, o RequestOptions) error {
	if !r.confine {
		return nil
	}
	o.IdempotencyKey = ""
	v, err := r.Retrieve(ctx, id, o)
	if err != nil {
		return err
	}
	if v.Data.ProjectID == nil {
		return &Error{Kind: AuthorizationError, Code: "permission_denied", Status: 403, Message: "Manage team-wide provider credentials from the organization client."}
	}
	return nil
}
func (r *VoiceProviderCredentials) Verify(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceProviderCredential], error) {
	opts := options(o)
	if err := r.confineCredential(ctx, id, opts); err != nil {
		return Response[VoiceProviderCredential]{}, err
	}
	return unwrapped[VoiceProviderCredential](ctx, r.t, "POST", voiceCredentialPath(id)+"/verify", nil, nil, opts)
}
func (r *VoiceProviderCredentials) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[VoiceResourceDeleted], error) {
	opts := options(o)
	if err := r.confineCredential(ctx, id, opts); err != nil {
		return Response[VoiceResourceDeleted]{}, err
	}
	return unwrapped[VoiceResourceDeleted](ctx, r.t, "DELETE", voiceCredentialPath(id), nil, nil, opts)
}

// Upload uses only the issued upload headers and then completes the asset.
func (r *VoiceAudio) Upload(ctx context.Context, b UploadVoiceAudioRequest, opts ...RequestOptions) (Response[VoiceAudioAsset], error) {
	if b.Body == nil || b.SizeBytes < 1 || b.SizeBytes > VoiceAudioMaxUploadBytes {
		return Response[VoiceAudioAsset]{}, validation("Upload requires a body and sizeBytes from 1 to 16777216.")
	}
	allowed := map[string]bool{"audio/mpeg": true, "audio/wav": true, "audio/x-wav": true, "audio/ogg": true, "audio/mp4": true, "audio/x-m4a": true}
	if !allowed[b.ContentType] {
		return Response[VoiceAudioAsset]{}, validation("Upload content type must be MP3, WAV, OGG or M4A audio.")
	}
	if sized, ok := b.Body.(interface{ Len() int }); ok && int64(sized.Len()) != b.SizeBytes {
		return Response[VoiceAudioAsset]{}, validation("Upload sizeBytes must match the body length.")
	}
	created, err := r.CreateUpload(ctx, CreateVoiceAudioUploadRequest{Name: b.Name, ContentType: b.ContentType, SizeBytes: b.SizeBytes, RetentionDays: b.RetentionDays}, opts...)
	if err != nil {
		return Response[VoiceAudioAsset]{}, err
	}
	upload := created.Data.Upload
	u, err := url.Parse(upload.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" || upload.Method != "POST" || b.SizeBytes > upload.MaxBytes {
		return Response[VoiceAudioAsset]{}, &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned an invalid audio upload target.", Metadata: created.Metadata}
	}
	o := options(opts)
	timeout := o.Timeout
	if timeout == 0 {
		timeout = r.t.timeout
	}
	uploadCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(uploadCtx, "POST", u.String(), io.LimitReader(b.Body, b.SizeBytes+1))
	if err != nil {
		return Response[VoiceAudioAsset]{}, err
	}
	req.ContentLength = b.SizeBytes
	for k, v := range upload.Headers {
		if strings.EqualFold(k, "authorization") || strings.EqualFold(k, "cookie") {
			return Response[VoiceAudioAsset]{}, &Error{Kind: ServerError, Code: "invalid_response", Message: "Upload target contained credential headers.", Metadata: created.Metadata}
		}
		req.Header.Set(k, v)
	}
	client := *r.t.client
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(req)
	if err != nil {
		return Response[VoiceAudioAsset]{}, contextError(uploadCtx, err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Response[VoiceAudioAsset]{}, &Error{Kind: ConnectionError, Code: "upload_failed", Status: response.StatusCode, Message: "Audio upload failed; the asset remains pending_upload."}
	}
	o.IdempotencyKey = ""
	return unwrapped[VoiceAudioAsset](ctx, r.t, "POST", voiceAssetPath(created.Data.Asset.ID)+"/complete", nil, nil, o)
}
