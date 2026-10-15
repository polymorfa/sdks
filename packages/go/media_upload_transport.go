package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"regexp"
	"sync"
)

// WhatsAppMediaUploadTransport moves encrypted bytes. Implementations receive
// no plaintext, media key, API credential or signed grant from this interface.
type WhatsAppMediaUploadTransport interface {
	Name() string
	Upload(context.Context, string, *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error)
}

// WhatsAppEncryptedUploadBody opens repeatable ciphertext||MAC streams. The
// underlying repeat pass checks EOF/hash before the final bytes are released.
type WhatsAppEncryptedUploadBody struct {
	info                      EncryptedMediaInfo
	source                    WhatsAppMediaSource
	max                       int64
	ctx                       context.Context
	cancel                    context.CancelFunc
	mu                        sync.Mutex
	readers                   []*customEncryptedReader
	closed, completed, failed bool
}

func (b *WhatsAppEncryptedUploadBody) MediaType() UploadMediaType { return b.info.MediaType }
func (b *WhatsAppEncryptedUploadBody) FileEncSHA256() []byte {
	return bytes.Clone(b.info.FileEncSHA256)
}
func (b *WhatsAppEncryptedUploadBody) EncryptedLength() int64 { return b.info.EncryptedLength }
func (*WhatsAppEncryptedUploadBody) String() string           { return "WhatsAppEncryptedUploadBody[redacted]" }
func (b *WhatsAppEncryptedUploadBody) GoString() string       { return b.String() }
func (b *WhatsAppEncryptedUploadBody) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{"mediaType": b.MediaType(), "fileEncSha256": b.FileEncSHA256(), "encryptedLength": b.EncryptedLength()})
}
func (b *WhatsAppEncryptedUploadBody) Open(ctx context.Context, offset int64) (io.ReadCloser, error) {
	if b == nil || b.source == nil || ctx == nil || offset < 0 || offset > b.info.EncryptedLength {
		return nil, configuration("offset", "The encrypted offset is outside the upload body.")
	}
	if ctx.Err() != nil {
		return nil, contextError(ctx, nil)
	}
	b.mu.Lock()
	closed := b.closed
	b.mu.Unlock()
	if closed {
		return nil, mediaError("media_upload_closed", "The encrypted upload body is closed.")
	}
	child, cancel := context.WithCancel(b.ctx)
	stop := context.AfterFunc(ctx, cancel)
	stream, err := openEncryptedUpload(child, b.source, b.info, b.max)
	if err != nil {
		b.mu.Lock()
		b.failed = true
		b.mu.Unlock()
		stop()
		cancel()
		return nil, err
	}
	reader := &customEncryptedReader{stream: stream, remaining: b.info.EncryptedLength - offset, body: b, cancel: cancel, stop: stop}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		reader.Close()
		return nil, mediaError("media_upload_closed", "The encrypted upload body is closed.")
	}
	b.readers = append(b.readers, reader)
	b.mu.Unlock()
	if offset > 0 {
		if _, err = io.CopyN(io.Discard, stream, offset); err != nil {
			b.mu.Lock()
			b.failed = true
			b.mu.Unlock()
			reader.Close()
			return nil, sourceReadError(child, err)
		}
	}
	if reader.remaining == 0 {
		if err = reader.complete(); err != nil {
			reader.Close()
			return nil, err
		}
	}
	return reader, nil
}

type customEncryptedReader struct {
	stream    *encryptedUploadReader
	remaining int64
	body      *WhatsAppEncryptedUploadBody
	cancel    context.CancelFunc
	stop      func() bool
	closeOnce sync.Once
}

func (r *customEncryptedReader) complete() error {
	if err := r.stream.complete(); err != nil {
		r.body.mu.Lock()
		r.body.failed = true
		r.body.mu.Unlock()
		return err
	}
	r.body.mu.Lock()
	r.body.completed = true
	r.body.mu.Unlock()
	return nil
}
func (r *customEncryptedReader) Read(p []byte) (int, error) {
	n, err := r.stream.Read(p)
	r.remaining -= int64(n)
	if r.remaining < 0 {
		r.body.mu.Lock()
		r.body.failed = true
		r.body.mu.Unlock()
		return n, mediaError("media_source_changed", "The encrypted upload length changed.")
	}
	if r.remaining == 0 && err == nil {
		err = r.complete()
	}
	if err == io.EOF && r.remaining != 0 {
		err = mediaError("media_source_changed", "The encrypted upload ended early.")
	}
	if err != nil && err != io.EOF {
		r.body.mu.Lock()
		r.body.failed = true
		r.body.mu.Unlock()
	}
	return n, err
}
func (r *customEncryptedReader) Close() error {
	var err error
	r.closeOnce.Do(func() { r.stop(); r.cancel(); err = r.stream.Close() })
	return err
}
func (b *WhatsAppEncryptedUploadBody) finish() bool {
	b.mu.Lock()
	b.closed = true
	complete := b.completed && !b.failed
	readers := append([]*customEncryptedReader{}, b.readers...)
	b.mu.Unlock()
	b.cancel()
	for _, r := range readers {
		r.Close()
	}
	return complete
}

var uploadTransportName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)

func (r *WhatsAppMediaResource) customUpload(ctx context.Context, session string, source WhatsAppMediaSource, info EncryptedMediaInfo, max int64, extension WhatsAppMediaUploadTransport) (WhatsAppUploadLocation, error) {
	child, cancel := context.WithCancel(ctx)
	body := &WhatsAppEncryptedUploadBody{info: info, source: source, max: max, ctx: child, cancel: cancel}
	defer body.finish()
	location, err := extension.Upload(child, session, body)
	complete := body.finish()
	if ctx.Err() != nil {
		return WhatsAppUploadLocation{}, contextError(ctx, nil)
	}
	if err != nil {
		return WhatsAppUploadLocation{}, mediaError("media_upload_transport_failed", "The custom encrypted upload transport failed.")
	}
	if !complete {
		return WhatsAppUploadLocation{}, mediaError("media_upload_incomplete", "The transport did not consume a complete verified encrypted body.")
	}
	if location.DirectPath == "" || location.URL == "" {
		return WhatsAppUploadLocation{}, uploadResponseError("The transport returned an invalid upload location.")
	}
	return location, nil
}

type builtinMediaUploadTransport struct {
	resource *WhatsAppMediaResource
	mode     string
	options  UploadWhatsAppMediaOptions
}

func (t builtinMediaUploadTransport) Name() string     { return t.mode }
func (t builtinMediaUploadTransport) String() string   { return "WhatsAppMediaUploadTransport[redacted]" }
func (t builtinMediaUploadTransport) GoString() string { return t.String() }
func (t builtinMediaUploadTransport) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{"name": t.mode})
}

func (t builtinMediaUploadTransport) Upload(ctx context.Context, session string, body *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
	if body == nil || body.source == nil {
		return WhatsAppUploadLocation{}, configuration("body", "A prepared encrypted upload body is required.")
	}
	body.mu.Lock()
	closed := body.closed
	body.mu.Unlock()
	if closed {
		return WhatsAppUploadLocation{}, mediaError("media_upload_closed", "The encrypted upload body is closed.")
	}
	var result WhatsAppUploadLocation
	var err error
	if t.mode == "direct" {
		result, err = t.resource.directUpload(ctx, session, body.source, body.info, body.max, t.options)
	} else {
		var reader *encryptedUploadReader
		result, err = t.resource.RelayUpload(ctx, session, body.info, func(child context.Context) (io.ReadCloser, error) {
			reader, err = openEncryptedUpload(child, body.source, body.info, body.max)
			return reader, err
		}, t.options.RequestOptions)
		if err == nil && reader != nil {
			err = reader.complete()
		}
	}
	body.mu.Lock()
	if err == nil {
		body.completed = true
	} else {
		body.failed = true
	}
	body.mu.Unlock()
	return result, err
}

// UploadTransport returns a reusable built-in transport that customer code can
// wrap. Only its encrypted-body upload boundary is exposed to the wrapper.
func (r *WhatsAppMediaResource) UploadTransport(mode string, options UploadWhatsAppMediaOptions) (WhatsAppMediaUploadTransport, error) {
	if mode != "relay" && mode != "direct" {
		return nil, configuration("egress", "Media egress must be relay or direct.")
	}
	if options.UploadTransport != nil || options.MaxAttempts < 0 || options.MaxAttempts > 100 || options.DocumentPartSize < 0 || options.DocumentPartSize > 64*1024*1024 {
		return nil, configuration("upload", "Invalid built-in transport options.")
	}
	return builtinMediaUploadTransport{r, mode, options}, nil
}
