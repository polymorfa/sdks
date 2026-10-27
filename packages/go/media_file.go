package polymorfa

import (
	"context"
	"io"
	"os"
)

// MediaFileOptions replaces a destination only after a complete successful download.
// Set Overwrite to false to protect an existing file; nil defaults to true.
type MediaFileOptions struct {
	Overwrite *bool
	MaxBytes  int64
}
type APIMediaFileResult struct {
	Path                  string
	Bytes                 int64
	ContentType, Filename string
	Metadata              Metadata
}
type limitedMediaReader struct {
	io.ReadCloser
	remaining int64
}

func (r *limitedMediaReader) Read(p []byte) (int, error) {
	if int64(len(p)) > r.remaining+1 {
		p = p[:r.remaining+1]
	}
	n, err := r.ReadCloser.Read(p)
	r.remaining -= int64(n)
	if r.remaining < 0 {
		return 0, mediaError("media_too_large", "Media exceeds the configured limit.")
	}
	return n, err
}
func checkMediaFile(path string, o MediaFileOptions) error {
	if o.MaxBytes < 0 || o.MaxBytes > 9007199254740991 {
		return configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if o.Overwrite != nil && !*o.Overwrite {
		_, err := os.Stat(path)
		if err == nil {
			return &Error{Kind: ConflictError, Code: "file_exists", Message: "The media destination already exists."}
		}
		if !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
func writeAPIMedia(ctx context.Context, d *MediaDownload, path string, o MediaFileOptions) (APIMediaFileResult, error) {
	r := APIMediaFileResult{Path: path, ContentType: d.ContentType, Filename: d.Filename, Metadata: d.Metadata}
	source := d.Body
	if o.MaxBytes > 0 {
		if d.ContentLength > o.MaxBytes {
			source.Close()
			return r, mediaError("media_too_large", "Media exceeds the configured limit.")
		}
		source = &limitedMediaReader{source, o.MaxBytes}
	}
	n, err := WriteMediaToFile(ctx, source, path, o.Overwrite == nil || *o.Overwrite)
	r.Bytes = n
	if os.IsExist(err) {
		err = &Error{Kind: ConflictError, Code: "file_exists", Message: "The media destination already exists."}
	}
	return r, err
}
func (r *MessagingMedia) DownloadToFile(ctx context.Context, id, path string, file MediaFileOptions, o ...RequestOptions) (APIMediaFileResult, error) {
	if err := checkMediaFile(path, file); err != nil {
		return APIMediaFileResult{}, err
	}
	d, err := r.DownloadStream(ctx, id, o...)
	if err != nil {
		return APIMediaFileResult{}, err
	}
	return writeAPIMedia(ctx, d, path, file)
}
func (r *Chats) DownloadMessageMediaToFile(ctx context.Context, session, chat, message, path string, file MediaFileOptions, o ...RequestOptions) (APIMediaFileResult, error) {
	if err := serverOnly(r.t); err != nil {
		return APIMediaFileResult{}, err
	}
	if err := checkMediaFile(path, file); err != nil {
		return APIMediaFileResult{}, err
	}
	d, err := r.DownloadMessageMediaStream(ctx, session, chat, message, o...)
	if err != nil {
		return APIMediaFileResult{}, err
	}
	return writeAPIMedia(ctx, d, path, file)
}
