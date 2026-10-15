package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type MediaInfo struct {
	ID         string  `json:"id"`
	Session    string  `json:"session"`
	MessageID  string  `json:"messageId"`
	MimeType   string  `json:"mimeType"`
	FileLength int64   `json:"fileLength"`
	Persisted  bool    `json:"persisted"`
	S3URL      *string `json:"s3Url,omitempty"`
}
type MediaDownload struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	Filename      string
	Redirected    bool
	Metadata      Metadata
}
type MediaDownloadURL struct {
	Streamed  bool
	URL       string
	ExpiresAt *time.Time
	RequestID string
}
type MessagingMedia struct{ t *transport }

func mediaPath(id string) string            { return "/messaging/media/" + escaped(id) }
func (d MediaDownloadURL) String() string   { return "MediaDownloadURL[redacted]" }
func (d MediaDownloadURL) GoString() string { return d.String() }

func (r *MessagingMedia) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[MediaInfo]], error) {
	return request[Envelope[MediaInfo]](ctx, r.t, "GET", mediaPath(id)+"/info", nil, nil, options(o))
}
func (r *MessagingMedia) Persist(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", mediaPath(id)+"/download-and-save", nil, nil, options(o))
}
func (r *MessagingMedia) DownloadStream(ctx context.Context, id string, o ...RequestOptions) (*MediaDownload, error) {
	return downloadStream(ctx, r.t, mediaPath(id), options(o))
}
func (r *MessagingMedia) Download(ctx context.Context, id string, o ...RequestOptions) (Response[[]byte], error) {
	return downloadBytes(ctx, r.t, mediaPath(id), options(o))
}
func (r *MessagingMedia) DownloadURL(ctx context.Context, id string, opts ...RequestOptions) (MediaDownloadURL, error) {
	o := options(opts)
	o.Headers = o.Headers.Clone()
	if o.Headers == nil {
		o.Headers = http.Header{}
	}
	o.Headers.Set("Accept", "application/octet-stream, */*")
	resp, md, err := r.t.open(ctx, "GET", mediaPath(id), nil, nil, o, true)
	if err != nil {
		return MediaDownloadURL{}, err
	}
	defer resp.Body.Close()
	result := MediaDownloadURL{Streamed: true, RequestID: md.RequestID}
	if resp.StatusCode >= 300 {
		location, err := safeRedirect(resp)
		if err != nil {
			return result, err
		}
		result.Streamed = false
		result.URL = location.String()
		result.ExpiresAt = SignedURLExpiry(result.URL)
	}
	return result, nil
}
func safeRedirect(resp *http.Response) (*url.URL, error) {
	location, err := url.Parse(resp.Header.Get("Location"))
	if err != nil || location.Host == "" || location.Scheme != "https" || location.User != nil {
		return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "Media redirect must target an HTTPS URL without credentials."}
	}
	return location, nil
}

type mediaDeadlineBody struct {
	io.ReadCloser
	caller, deadline context.Context
	cancel           context.CancelFunc
	metadata         Metadata
	eof              bool
}

func (body *mediaDeadlineBody) Read(buffer []byte) (int, error) {
	if body.eof {
		return 0, io.EOF
	}
	n, err := body.ReadCloser.Read(buffer)
	if body.caller.Err() != nil || body.deadline.Err() != nil || (err != nil && err != io.EOF) {
		body.cancel()
		kind, message := ConnectionError, "Media body could not be read."
		var cause error
		if body.caller.Err() != nil {
			kind, message, cause = CancelledError, "Media download was cancelled.", body.caller.Err()
			if cause == context.DeadlineExceeded {
				kind, message = TimeoutError, "Media download deadline exceeded."
			}
		} else if body.deadline.Err() == context.DeadlineExceeded {
			kind, message, cause = TimeoutError, "Media download timed out.", context.DeadlineExceeded
		}
		return n, &Error{Kind: kind, Message: message, Metadata: body.metadata, Cause: cause}
	}
	if err == io.EOF {
		body.eof = true
		body.cancel()
	}
	return n, err
}
func (body *mediaDeadlineBody) Close() error { defer body.cancel(); return body.ReadCloser.Close() }
func downloadStream(ctx context.Context, t *transport, path string, o RequestOptions) (_ *MediaDownload, failure error) {
	timeout := t.timeout
	if o.Timeout != 0 {
		timeout = o.Timeout
	}
	if timeout <= 0 {
		return nil, configuration("timeout", "timeout must be positive.")
	}
	downloadCtx, cancel := context.WithTimeout(ctx, timeout)
	defer func() {
		if failure != nil {
			cancel()
		}
	}()

	o.Headers = o.Headers.Clone()
	if o.Headers == nil {
		o.Headers = http.Header{}
	}
	o.Headers.Set("Accept", "application/octet-stream, */*")
	resp, md, err := t.open(downloadCtx, "GET", path, nil, nil, o, true)
	if err != nil {
		return nil, err
	}
	redirected := false
	if resp.StatusCode >= 300 {
		location, e := safeRedirect(resp)
		resp.Body.Close()
		if e != nil {
			return nil, e
		}
		req, e := http.NewRequestWithContext(downloadCtx, "GET", location.String(), nil)
		if e != nil {
			return nil, &Error{Kind: ConnectionError, Message: "Invalid media redirect request."}
		}
		storageClient := *t.client
		storageClient.Jar = nil
		resp, e = storageClient.Do(req)
		if e != nil {
			if downloadCtx.Err() != nil {
				return nil, contextError(downloadCtx, downloadCtx.Err())
			}
			return nil, &Error{Kind: ConnectionError, Message: "The storage download could not be reached."}
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			resp.Body.Close()
			return nil, &Error{Kind: ServerError, Status: resp.StatusCode, Message: "Storage refused the media download."}
		}
		redirected = true
	}
	return &MediaDownload{Body: &mediaDeadlineBody{ReadCloser: resp.Body, caller: ctx, deadline: downloadCtx, cancel: cancel, metadata: md}, ContentType: resp.Header.Get("Content-Type"), ContentLength: resp.ContentLength, Filename: ParseContentDispositionFilename(resp.Header.Get("Content-Disposition")), Redirected: redirected, Metadata: md}, nil
}
func downloadBytes(ctx context.Context, t *transport, path string, o RequestOptions) (Response[[]byte], error) {
	d, err := downloadStream(ctx, t, path, o)
	if err != nil {
		return Response[[]byte]{}, err
	}
	defer d.Body.Close()
	b, err := io.ReadAll(d.Body)
	if err != nil {
		return Response[[]byte]{Metadata: d.Metadata}, err
	}
	return Response[[]byte]{Data: b, Metadata: d.Metadata}, nil
}
func SignedURLExpiry(value string) *time.Time {
	u, err := url.Parse(value)
	if err != nil {
		return nil
	}
	q := u.Query()
	if start, err := time.Parse("20060102T150405Z", q.Get("X-Amz-Date")); err == nil {
		if seconds, err := strconv.ParseUint(q.Get("X-Amz-Expires"), 10, 32); err == nil {
			expiry := start.Add(time.Duration(seconds) * time.Second)
			return &expiry
		}
	}
	if s := q.Get("Expires"); len(s) >= 9 && len(s) <= 11 {
		if unix, err := strconv.ParseInt(s, 10, 64); err == nil {
			expiry := time.Unix(unix, 0)
			return &expiry
		}
	}
	return nil
}
