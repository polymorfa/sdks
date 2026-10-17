package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync"
)

// WhatsAppMediaSource opens a fresh immutable plaintext stream on each pass.
// The SDK closes each returned stream; implementations must honor ctx.
type WhatsAppMediaSource func(context.Context) (io.ReadCloser, error)
type UploadWhatsAppMediaOptions struct {
	EncryptMediaOptions
	Egress           string                       // relay (default) or direct
	UploadTransport  WhatsAppMediaUploadTransport // optional customer encrypted-byte transport
	MaxAttempts      int                          // direct attempts per request; default 3
	DocumentPartSize int64                        // bounded document part; default 50 MiB
	RequestOptions   RequestOptions
}
type WhatsAppMediaUploadResult struct {
	EncryptedMediaInfo
	WhatsAppUploadLocation
	Egress string `json:"egress"`
}

func (result WhatsAppMediaUploadResult) String() string   { return "WhatsAppMediaUploadResult[redacted]" }
func (result WhatsAppMediaUploadResult) GoString() string { return result.String() }

type encryptedUploadReader struct {
	*io.PipeReader
	cancel   context.CancelFunc
	result   chan error
	once     sync.Once
	finished chan struct{}
	err      error
}

func (reader *encryptedUploadReader) Close() error {
	reader.cancel()
	return reader.PipeReader.Close()
}
func (reader *encryptedUploadReader) complete() error {
	reader.once.Do(func() { reader.err = <-reader.result; close(reader.finished) })
	<-reader.finished
	return reader.err
}
func openEncryptedUpload(ctx context.Context, source WhatsAppMediaSource, info EncryptedMediaInfo, max int64) (*encryptedUploadReader, error) {
	owned, cancel := context.WithCancel(ctx)
	plain, err := source(owned)
	if err != nil || plain == nil {
		if owned.Err() != nil {
			cancel()
			return nil, contextError(owned, nil)
		}
		cancel()
		return nil, mediaError("media_source_failed", "The media source could not be opened.")
	}
	read, write := io.Pipe()
	output := &encryptedUploadReader{PipeReader: read, cancel: cancel, result: make(chan error, 1), finished: make(chan struct{})}
	done := make(chan struct{})
	var closeOnce sync.Once
	closePlain := func() { closeOnce.Do(func() { plain.Close() }) }
	go func() {
		select {
		case <-owned.Done():
			closePlain()
		case <-done:
		}
	}()
	go func() {
		defer close(done)
		defer closePlain()
		_, failure := EncryptWhatsAppMediaTo(owned, plain, write, EncryptMediaOptions{MediaType: info.MediaType, MimeType: info.MimeType, MediaKey: info.MediaKey, MaxBytes: max}, &info)
		if failure != nil && owned.Err() != nil {
			failure = contextError(owned, nil)
		}
		write.CloseWithError(failure)
		output.result <- failure
	}()
	return output, nil
}
func sourceInfo(ctx context.Context, source WhatsAppMediaSource, options EncryptMediaOptions) (EncryptedMediaInfo, error) {
	plain, err := source(ctx)
	if err != nil || plain == nil {
		if ctx.Err() != nil {
			return EncryptedMediaInfo{}, contextError(ctx, nil)
		}
		return EncryptedMediaInfo{}, mediaError("media_source_failed", "The media source could not be opened.")
	}
	var closeOnce sync.Once
	closePlain := func() { closeOnce.Do(func() { plain.Close() }) }
	defer closePlain()
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			closePlain()
		case <-done:
		}
	}()
	info, err := EncryptWhatsAppMediaTo(ctx, plain, io.Discard, options, nil)
	if err != nil && ctx.Err() != nil {
		return EncryptedMediaInfo{}, contextError(ctx, nil)
	}
	return info, err
}
func (r *WhatsAppMediaResource) UploadBytes(ctx context.Context, session string, plaintext []byte, options UploadWhatsAppMediaOptions) (WhatsAppMediaUploadResult, error) {
	owned := bytes.Clone(plaintext)
	return r.Upload(ctx, session, func(context.Context) (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(owned)), nil }, options)
}
func (r *WhatsAppMediaResource) Upload(ctx context.Context, session string, source WhatsAppMediaSource, options UploadWhatsAppMediaOptions) (WhatsAppMediaUploadResult, error) {
	if source == nil || session == "" {
		return WhatsAppMediaUploadResult{}, configuration("source", "An immutable media source and session are required.")
	}
	mode := options.Egress
	if options.UploadTransport != nil {
		name := options.UploadTransport.Name()
		if mode != "" || !uploadTransportName.MatchString(name) {
			return WhatsAppMediaUploadResult{}, configuration("egress", "Select one valid named encrypted upload transport.")
		}
		mode = name
	}
	if mode == "" {
		mode = "relay"
	}
	if options.UploadTransport == nil && mode != "relay" && mode != "direct" {
		return WhatsAppMediaUploadResult{}, configuration("egress", "Media egress must be relay or direct.")
	}
	if options.UploadTransport == nil && mode == "direct" && (options.MaxAttempts < 0 || options.MaxAttempts > 100 || options.DocumentPartSize < 0 || options.DocumentPartSize > 64*1024*1024) {
		return WhatsAppMediaUploadResult{}, configuration("upload", "Direct attempts must be 1–100 and document part size 1–67108864 bytes.")
	}
	if mode == "direct" && options.UploadTransport == nil {
		if err := serverOnly(r.t); err != nil {
			return WhatsAppMediaUploadResult{}, err
		}
	}
	if builtin, ok := options.UploadTransport.(builtinMediaUploadTransport); ok && builtin.mode == "direct" {
		if err := serverOnly(builtin.resource.t); err != nil {
			return WhatsAppMediaUploadResult{}, err
		}
	}
	settings, err := encryptionOptions(options.EncryptMediaOptions)
	if err != nil {
		return WhatsAppMediaUploadResult{}, err
	}
	info, err := sourceInfo(ctx, source, settings)
	if err != nil {
		return WhatsAppMediaUploadResult{}, err
	}
	var location WhatsAppUploadLocation
	if options.UploadTransport != nil {
		location, err = r.customUpload(ctx, session, source, info, settings.MaxBytes, options.UploadTransport)
	} else if mode == "relay" {
		var opened *encryptedUploadReader
		location, err = r.RelayUpload(ctx, session, info, func(child context.Context) (io.ReadCloser, error) {
			opened, err = openEncryptedUpload(child, source, info, settings.MaxBytes)
			return opened, err
		}, options.RequestOptions)
		if err == nil && opened != nil {
			err = opened.complete()
		}
	} else {
		location, err = r.directUpload(ctx, session, source, info, settings.MaxBytes, options)
	}
	if err != nil {
		return WhatsAppMediaUploadResult{}, err
	}
	return WhatsAppMediaUploadResult{info, location, mode}, nil
}

type directUploadFailure struct {
	status int
	retry  bool
	final  error
}

func (failure *directUploadFailure) Error() string { return failure.final.Error() }
func uploadStatus(status int) error {
	code := "media_upload_failed"
	switch status {
	case 401:
		code = "media_upload_unauthorized"
	case 413:
		code = "media_too_large"
	case 415:
		code = "media_upload_hash_mismatch"
	case 507:
		code = "media_upload_throttled"
	}
	return &directUploadFailure{status: status, retry: status == 401 || status == 408 || (status >= 500 && status != 507), final: &Error{Kind: ServerError, Status: status, Code: code, Message: "The WhatsApp media host rejected the upload."}}
}
func (r *WhatsAppMediaResource) directPost(ctx context.Context, target string, body io.Reader, length int64) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, "POST", target, body)
	if err != nil {
		return nil, mediaError("media_invalid_descriptor", "The upload URL is invalid.")
	}
	request.ContentLength = length
	request.Header.Set("Origin", "https://web.whatsapp.com")
	request.Header.Set("Referer", "https://web.whatsapp.com/")
	client := *r.t.client
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, contextError(ctx, nil)
		}
		var typed *Error
		if errors.As(err, &typed) {
			return nil, typed
		}
		// Network errors can contain the signed URL; never retain their cause.
		return nil, &directUploadFailure{retry: true, final: &Error{Kind: ConnectionError, Code: "connection_error", Message: "The WhatsApp media host could not be reached."}}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, uploadStatus(response.StatusCode)
	}
	value, err := io.ReadAll(io.LimitReader(response.Body, 65537))
	if err != nil {
		if ctx.Err() != nil {
			return nil, contextError(ctx, nil)
		}
		return nil, &directUploadFailure{retry: true, final: &Error{Kind: ConnectionError, Message: "The upload response could not be read."}}
	}
	if len(value) > 65536 || (len(value) > 0 && !json.Valid(value)) {
		return nil, mediaError("invalid_response", "The media host returned an invalid upload response.")
	}
	return value, nil
}
func (r *WhatsAppMediaResource) directUpload(ctx context.Context, session string, source WhatsAppMediaSource, info EncryptedMediaInfo, max int64, options UploadWhatsAppMediaOptions) (WhatsAppUploadLocation, error) {
	if err := serverOnly(r.t); err != nil {
		return WhatsAppUploadLocation{}, err
	}
	attempts := options.MaxAttempts
	if attempts == 0 {
		attempts = 3
	}
	size := options.DocumentPartSize
	if size == 0 {
		size = 50 * 1024 * 1024
	}
	if attempts < 1 || attempts > 100 || size < 1 || size > 64*1024*1024 {
		return WhatsAppUploadLocation{}, configuration("upload", "Direct attempts must be 1–100 and document part size 1–67108864 bytes.")
	}
	timeout := r.t.timeout
	if options.RequestOptions.Timeout > 0 {
		timeout = options.RequestOptions.Timeout
	}
	active, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	grant, err := r.CreateUploadGrant(active, session, info.MediaType, info.FileEncSHA256, options.RequestOptions)
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	retry := func(operation func(int) ([]byte, error)) ([]byte, error) {
		var failure *directUploadFailure
		for attempt := 0; attempt < attempts; attempt++ {
			if active.Err() != nil {
				return nil, contextError(active, nil)
			}
			if attempt > 0 && failure.status == 401 {
				grant, err = r.CreateUploadGrant(active, session, info.MediaType, info.FileEncSHA256, options.RequestOptions)
				if err != nil {
					return nil, err
				}
			}
			result, err := operation(attempt)
			if err == nil {
				return result, nil
			}
			if !errors.As(err, &failure) {
				return nil, err
			}
			if !failure.retry {
				return nil, failure.final
			}
		}
		return nil, failure.final
	}
	post := func(query url.Values, body io.Reader, length int64) ([]byte, error) {
		target, err := directUploadURL(grant, info, query)
		if err != nil {
			return nil, err
		}
		return r.directPost(active, target, body, length)
	}
	if info.MediaType == UploadDocument && info.EncryptedLength > size {
		stream, err := openEncryptedUpload(active, source, info, max)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		defer stream.Close()
		for start := int64(0); start < info.EncryptedLength; start += size {
			end := min(start+size, info.EncryptedLength)
			part := make([]byte, int(end-start))
			if _, err = io.ReadFull(stream, part); err != nil {
				return WhatsAppUploadLocation{}, sourceReadError(active, err)
			}
			if end == info.EncryptedLength {
				if err = stream.complete(); err != nil {
					return WhatsAppUploadLocation{}, err
				}
			}
			_, err = retry(func(int) ([]byte, error) {
				return post(url.Values{"stream": {"1"}, "bytestart": {strconv.FormatInt(start, 10)}, "byteend": {strconv.FormatInt(end, 10)}}, bytes.NewReader(part), end-start)
			})
			if err != nil {
				return WhatsAppUploadLocation{}, err
			}
		}
		hash, _ := uploadHash(info.FileEncSHA256)
		value, err := retry(func(int) ([]byte, error) { return post(url.Values{"stream": {"1"}, "final_hash": {hash}}, nil, 0) })
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		return directLocation(value)
	}
	value, err := retry(func(attempt int) ([]byte, error) {
		offset := int64(0)
		if attempt > 0 {
			progress, failure := post(url.Values{"resume": {"1"}}, nil, 0)
			var status *directUploadFailure
			if failure != nil && !(errors.As(failure, &status) && status.status == 404) {
				return nil, failure
			}
			if failure == nil && len(progress) > 0 {
				var state struct {
					Resume json.RawMessage `json:"resume"`
				}
				if json.Unmarshal(progress, &state) != nil {
					return nil, mediaError("invalid_response", "The media host returned invalid upload progress.")
				}
				var finished string
				if json.Unmarshal(state.Resume, &finished) == nil && finished == "complete" {
					return progress, nil
				}
				var count json.Number
				if json.Unmarshal(state.Resume, &count) == nil {
					offset, _ = strconv.ParseInt(string(count), 10, 64)
				} else if finished != "" {
					offset, _ = strconv.ParseInt(finished, 10, 64)
				}
				if offset <= 0 || offset >= info.EncryptedLength {
					offset = 0
				}
			}
		}
		stream, failure := openEncryptedUpload(active, source, info, max)
		if failure != nil {
			return nil, failure
		}
		defer stream.Close()
		if offset > 0 {
			if _, failure = io.CopyN(io.Discard, stream, offset); failure != nil {
				return nil, sourceReadError(active, failure)
			}
		}
		query := url.Values{}
		if offset > 0 {
			query.Set("bytestart", strconv.FormatInt(offset, 10))
			query.Set("byteend", strconv.FormatInt(info.EncryptedLength, 10))
		}
		result, failure := post(query, stream, info.EncryptedLength-offset)
		if failure != nil {
			return nil, failure
		}
		if failure = stream.complete(); failure != nil {
			return nil, failure
		}
		return result, nil
	})
	if err != nil {
		return WhatsAppUploadLocation{}, err
	}
	return directLocation(value)
}
func sourceReadError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return contextError(ctx, nil)
	}
	var typed *Error
	if errors.As(err, &typed) {
		return typed
	}
	return mediaError("media_source_failed", "The encrypted source could not be read completely.")
}
