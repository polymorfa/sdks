package polymorfa

import (
	"bytes"
	"context"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3MediaClient is the official AWS SDK v2 boundary, also implemented by a
// caller-configured client for an S3-compatible customer bucket.
type S3MediaClient interface {
	HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}
type S3MediaStoreOptions struct {
	Client         S3MediaClient
	Bucket, Prefix string
}
type S3MediaStore struct {
	client         S3MediaClient
	bucket, prefix string
}
type S3UploadToWhatsAppOptions struct {
	Messaging    *WhatsAppMediaResource
	Session, Key string
	UploadWhatsAppMediaOptions
}
type S3ArchiveOptions struct {
	Key, ScratchDirectory string
	Metadata              map[string]string
	WhatsAppMediaDownloadOptions
}
type S3ArchiveResult struct {
	Bucket, Key    string
	Bytes          int64
	MimeType, ETag string
}

func (*S3MediaStore) String() string     { return "S3MediaStore[redacted]" }
func (s *S3MediaStore) GoString() string { return s.String() }
func NewS3MediaStore(options S3MediaStoreOptions) (*S3MediaStore, error) {
	if options.Client == nil || options.Bucket == "" || strings.ContainsAny(options.Bucket, "\r\n\x00") {
		return nil, configuration("bucket", "A configured S3 client and bucket are required.")
	}
	return &S3MediaStore{client: options.Client, bucket: options.Bucket, prefix: options.Prefix}, nil
}
func (s *S3MediaStore) key(key string) (string, error) {
	if key == "" || strings.ContainsRune(key, 0) || len(s.prefix)+len(key) > 1024 {
		return "", configuration("key", "A valid relative object key is required.")
	}
	return s.prefix + key, nil
}
func s3Failure(ctx context.Context) error {
	if ctx.Err() != nil {
		return contextError(ctx, nil)
	}
	return &Error{Kind: ConnectionError, Code: "media_store_failed", Message: "The customer media store operation failed."}
}

// UploadToWhatsApp performs two ETag-pinned object reads. The encryption repeat
// pass verifies EOF/hash before releasing its last bytes to the media provider.
func (s *S3MediaStore) UploadToWhatsApp(ctx context.Context, options S3UploadToWhatsAppOptions) (WhatsAppMediaUploadResult, error) {
	key, err := s.key(options.Key)
	if err != nil {
		return WhatsAppMediaUploadResult{}, err
	}
	if options.Messaging == nil {
		return WhatsAppMediaUploadResult{}, configuration("messaging", "A Messaging media resource is required.")
	}
	head, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil || head == nil {
		return WhatsAppMediaUploadResult{}, s3Failure(ctx)
	}
	etag := aws.ToString(head.ETag)
	if etag == "" {
		return WhatsAppMediaUploadResult{}, configuration("key", "The object must expose an ETag for stable reads.")
	}
	var size *int64
	if head.ContentLength != nil {
		if *head.ContentLength < 0 {
			return WhatsAppMediaUploadResult{}, mediaError("media_invalid_descriptor", "The object length is invalid.")
		}
		n := *head.ContentLength
		size = &n
	}
	source := func(child context.Context) (io.ReadCloser, error) {
		object, err := s.client.GetObject(child, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key), IfMatch: aws.String(etag)})
		if err != nil || object == nil || object.Body == nil {
			return nil, s3Failure(child)
		}
		if size != nil {
			if object.ContentLength != nil && *object.ContentLength != *size {
				object.Body.Close()
				return nil, mediaError("media_source_changed", "The object length changed.")
			}
			return &s3ExactBody{ReadCloser: object.Body, expected: *size}, nil
		}
		return object.Body, nil
	}
	upload := options.UploadWhatsAppMediaOptions
	if upload.MimeType == "" {
		upload.MimeType = aws.ToString(head.ContentType)
	}
	return options.Messaging.Upload(ctx, options.Session, source, upload)
}

type s3ExactBody struct {
	io.ReadCloser
	expected, read int64
}

func (b *s3ExactBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.read += int64(n)
	if b.read > b.expected || err == io.EOF && b.read != b.expected {
		return n, mediaError("media_source_changed", "The object length changed.")
	}
	return n, err
}
func metadataASCII(s string) bool {
	for _, b := range []byte(s) {
		if b < 32 || b > 126 {
			return false
		}
	}
	return true
}
func mediaFilenameMetadata(value string) string {
	const h = "0123456789ABCDEF"
	var out strings.Builder
	for _, b := range []byte(value) {
		if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || strings.ContainsRune("-_.!~*'()", rune(b)) {
			out.WriteByte(b)
		} else {
			out.WriteByte('%')
			out.WriteByte(h[b>>4])
			out.WriteByte(h[b&15])
		}
	}
	return out.String()
}

// Archive verifies into a private spool before issuing any object PUT, so
// corrupt incoming media cannot replace a previously valid object.
func (s *S3MediaStore) Archive(ctx context.Context, descriptor WhatsAppMediaDescriptor, options S3ArchiveOptions) (S3ArchiveResult, error) {
	key, err := s.key(options.Key)
	if err != nil {
		return S3ArchiveResult{}, err
	}
	// Snapshot caller-owned binary slices and length before the first I/O.
	descriptor.MediaKey = bytes.Clone(descriptor.MediaKey)
	descriptor.FileSHA256 = bytes.Clone(descriptor.FileSHA256)
	descriptor.FileEncSHA256 = bytes.Clone(descriptor.FileEncSHA256)
	if descriptor.FileLength != nil {
		n := *descriptor.FileLength
		descriptor.FileLength = &n
	}
	metadata := map[string]string{}
	for k, v := range options.Metadata {
		if k == "" || len(k) > 128 || len(v) > 1024 || !metadataASCII(k) || !metadataASCII(v) {
			return S3ArchiveResult{}, configuration("metadata", "Object metadata must contain bounded ASCII text.")
		}
		metadata[strings.ToLower(k)] = v
	}
	directory, err := os.MkdirTemp(options.ScratchDirectory, "polymorfa-media-")
	if err != nil {
		return S3ArchiveResult{}, s3Failure(ctx)
	}
	defer os.RemoveAll(directory)
	downloaded, err := DownloadWhatsAppMediaToFile(ctx, descriptor, filepath.Join(directory, "verified"), options.WhatsAppMediaDownloadOptions, false)
	if err != nil {
		return S3ArchiveResult{}, err
	}
	if descriptor.FileLength != nil && downloaded.Bytes != *descriptor.FileLength {
		return S3ArchiveResult{}, mediaError("media_invalid_descriptor", "The media length does not match the descriptor.")
	}
	metadata["wa-media-kind"] = downloaded.MediaKind
	if descriptor.FileSHA256 != nil {
		metadata["wa-file-sha256"] = hex.EncodeToString(descriptor.FileSHA256)
	}
	if downloaded.Filename != "" {
		metadata["wa-file-name"] = mediaFilenameMetadata(downloaded.Filename)
	}
	body, err := os.Open(downloaded.Path)
	if err != nil {
		return S3ArchiveResult{}, s3Failure(ctx)
	}
	defer body.Close()
	result, err := s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key), Body: body, ContentLength: aws.Int64(downloaded.Bytes), ContentType: aws.String(downloaded.MimeType), Metadata: metadata})
	if err != nil || result == nil {
		return S3ArchiveResult{}, s3Failure(ctx)
	}
	return S3ArchiveResult{Bucket: s.bucket, Key: key, Bytes: downloaded.Bytes, MimeType: downloaded.MimeType, ETag: aws.ToString(result.ETag)}, nil
}
