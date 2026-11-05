package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestS3NativeMinIOVerifiedArchiveAndETagUpload(t *testing.T) {
	path := os.Getenv("POLYMORFA_S3_FIXTURE_METADATA")
	if path == "" {
		t.Skip("Requires task-owned MinIO fixture metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var meta struct {
		SyntheticOnly bool   `json:"syntheticOnly"`
		Endpoint      string `json:"endpoint"`
		Region        string `json:"region"`
		AccessKeyID   string `json:"accessKeyId"`
		Secret        string `json:"secretAccessKey"`
	}
	if json.Unmarshal(raw, &meta) != nil || !meta.SyntheticOnly {
		t.Fatal("synthetic MinIO metadata required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	credentials := aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
		return aws.Credentials{AccessKeyID: meta.AccessKeyID, SecretAccessKey: meta.Secret}, nil
	})
	baseOptions := s3.Options{BaseEndpoint: aws.String(meta.Endpoint), Region: meta.Region, UsePathStyle: true, Credentials: credentials, HTTPClient: &http.Client{Timeout: 10 * time.Second}, RetryMaxAttempts: 1}
	owner := s3.New(baseOptions)
	bucket := fmt.Sprint("sdk-go-", time.Now().UnixNano())
	if _, err = owner.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Fatal("MinIO bucket creation failed")
	}
	plain := bytes.Repeat([]byte("customer-owned-media\x00"), 4000)
	put, err := owner.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String("media/source"), Body: bytes.NewReader(plain), ContentType: aws.String("fixture/binary")})
	if err != nil {
		t.Fatal("MinIO seed failed")
	}
	var gets, puts atomic.Int32
	var change atomic.Bool
	tracked := baseOptions
	tracked.HTTPClient = &http.Client{Timeout: 10 * time.Second, Transport: mediaRoundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Method == "PUT" && strings.HasSuffix(r.URL.Path, "/media/archive") {
			puts.Add(1)
		}
		if r.Method == "GET" && strings.HasSuffix(r.URL.Path, "/media/source") {
			count := gets.Add(1)
			if r.Header.Get("If-Match") != aws.ToString(put.ETag) {
				t.Error("S3 object read was not pinned to HEAD ETag")
			}
			if count == 2 && change.Load() {
				if _, e := owner.PutObject(r.Context(), &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String("media/source"), Body: strings.NewReader("concurrent replacement")}); e != nil {
					t.Error("MinIO concurrent replacement failed")
				}
			}
		}
		return http.DefaultTransport.RoundTrip(r)
	})}
	store, err := NewS3MediaStore(S3MediaStoreOptions{Client: s3.New(tracked), Bucket: bucket, Prefix: "media/"})
	if err != nil {
		t.Fatal(err)
	}
	var uploaded []byte
	var grants atomic.Int32
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/upload-grants"):
			grantFixture(t, w, r, UploadImage, &grants)
		case strings.HasSuffix(r.URL.Path, "/uploads"):
			uploaded, _ = io.ReadAll(r.Body)
			locationFixture(w, false)
		case strings.HasPrefix(r.URL.Path, "/mms/"):
			assertCDNHeaders(t, r)
			uploaded, _ = io.ReadAll(r.Body)
			locationFixture(w, true)
		default:
			t.Error("unexpected upload route")
			w.WriteHeader(404)
		}
	})
	for _, mode := range []string{"relay", "direct"} {
		gets.Store(0)
		uploaded = nil
		result, err := store.UploadToWhatsApp(ctx, S3UploadToWhatsAppOptions{Messaging: sdk.WhatsAppMedia(), Session: "session", Key: "source", UploadWhatsAppMediaOptions: UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, Egress: mode}})
		if err != nil || gets.Load() != 2 {
			t.Fatal("MinIO two-pass upload", mode, gets.Load(), err)
		}
		keys, _ := DeriveWhatsAppMediaKeys(result.MediaKey, "image")
		decoded, err := DecryptWhatsAppMedia(uploaded, keys, WhatsAppMediaDescriptor{MediaKind: "image", MediaKey: result.MediaKey, FileSHA256: result.FileSHA256, FileEncSHA256: result.FileEncSHA256}, DefaultWhatsAppMediaMaxBytes)
		if err != nil || !bytes.Equal(decoded, plain) || result.MimeType != "fixture/binary" {
			t.Fatal("MinIO upload ciphertext", err)
		}
	}
	gets.Store(0)
	change.Store(true)
	before := grants.Load()
	uploaded = nil
	if _, err = store.UploadToWhatsApp(ctx, S3UploadToWhatsAppOptions{Messaging: sdk.WhatsAppMedia(), Session: "session", Key: "source", UploadWhatsAppMediaOptions: UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, Egress: "direct"}}); err == nil || gets.Load() != 2 || len(uploaded) != 0 || grants.Load() != before+1 {
		t.Fatal("MinIO changed ETag finalized upload", err)
	}
	// Archive uses a private disk spool and snapshots caller-owned descriptor bytes
	// before its first CDN I/O, then performs exactly one verified object PUT.
	media, err := EncryptWhatsAppMedia(ctx, plain, EncryptMediaOptions{MediaType: UploadImage})
	if err != nil {
		t.Fatal(err)
	}
	length := int64(len(plain))
	descriptor := WhatsAppMediaDescriptor{MediaKind: "image", URL: "https://cdn.whatsapp.net/incoming", MediaKey: media.MediaKey, FileSHA256: media.FileSHA256, FileEncSHA256: media.FileEncSHA256, FileLength: &length, MimeType: "fixture/binary", Filename: "photo @ 1.jpg"}
	var corrupt atomic.Bool
	ready, release := make(chan struct{}), make(chan struct{})
	var once atomic.Bool
	cdn := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		assertCDNHeaders(t, r)
		if once.CompareAndSwap(false, true) {
			close(ready)
			<-release
		}
		data := bytes.Clone(media.Ciphertext)
		if corrupt.Load() {
			data[len(data)-1] ^= 1
		}
		w.Write(data)
	})
	scratch := filepath.Join(filepath.Dir(path), "scratch")
	if os.MkdirAll(scratch, 0700) != nil {
		t.Fatal("scratch setup")
	}
	archiveOptions := S3ArchiveOptions{Key: "archive", ScratchDirectory: scratch, Metadata: map[string]string{"customer-label": "fixture"}, WhatsAppMediaDownloadOptions: WhatsAppMediaDownloadOptions{HTTPClient: cdn.t.client}}
	type outcome struct {
		r S3ArchiveResult
		e error
	}
	done := make(chan outcome, 1)
	go func() { r, e := store.Archive(ctx, descriptor, archiveOptions); done <- outcome{r, e} }()
	select {
	case <-ready:
	case <-ctx.Done():
		t.Fatal("archive CDN request not received")
	}
	for _, secret := range [][]byte{descriptor.MediaKey, descriptor.FileSHA256, descriptor.FileEncSHA256} {
		for i := range secret {
			secret[i] ^= 1
		}
	}
	length++
	close(release)
	archived := <-done
	if archived.e != nil || archived.r.Bytes != int64(len(plain)) || puts.Load() != 1 {
		t.Fatal("verified MinIO archive or descriptor snapshot", archived.e)
	}
	object, err := owner.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String("media/archive")})
	if err != nil {
		t.Fatal("archived object read")
	}
	actual, readErr := io.ReadAll(object.Body)
	object.Body.Close()
	if readErr != nil || !bytes.Equal(actual, plain) || object.Metadata["wa-media-kind"] != "image" || object.Metadata["wa-file-name"] != "photo%20%40%201.jpg" {
		t.Fatal("archived plaintext/metadata mismatch")
	}
	for k := range object.Metadata {
		if strings.Contains(strings.ToLower(k), "key") {
			t.Fatal("media key persisted in metadata")
		}
	}
	// Restore a fresh descriptor from encryption output, whose shared slices above
	// were deliberately mutated after Archive had snapshotted them.
	fresh, err := EncryptWhatsAppMedia(ctx, plain, EncryptMediaOptions{MediaType: UploadImage})
	if err != nil {
		t.Fatal(err)
	}
	media = fresh
	length = int64(len(plain))
	descriptor.MediaKey = fresh.MediaKey
	descriptor.FileSHA256 = fresh.FileSHA256
	descriptor.FileEncSHA256 = fresh.FileEncSHA256
	descriptor.FileLength = &length
	corrupt.Store(true)
	if _, err = store.Archive(ctx, descriptor, archiveOptions); err == nil || puts.Load() != 1 {
		t.Fatal("corruption started MinIO overwrite", err)
	}
	corrupt.Store(false)
	length++
	if _, err = store.Archive(ctx, descriptor, archiveOptions); err == nil || puts.Load() != 1 {
		t.Fatal("wrong known length started MinIO overwrite", err)
	}
	length--
	cancelled, stop := context.WithCancel(ctx)
	stop()
	if _, err = store.Archive(cancelled, descriptor, archiveOptions); err == nil || puts.Load() != 1 {
		t.Fatal("cancelled archive started MinIO overwrite", err)
	}
	object, err = owner.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String("media/archive")})
	if err != nil {
		t.Fatal("preserved archive read")
	}
	actual, readErr = io.ReadAll(object.Body)
	object.Body.Close()
	if readErr != nil || !bytes.Equal(actual, plain) {
		t.Fatal("failed archive replaced valid existing object")
	}
	entries, err := os.ReadDir(scratch)
	if err != nil || len(entries) != 0 {
		t.Fatal("private archive spool was not removed")
	}
}
