package polymorfa

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"testing"
)

func TestNativeMediaEncryptGoldenVectorsAndBoundaries(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	plain := []byte("Polymorfa golden vector: whatsmeow cbcutil + hkdfutil, 2026.")
	vectors := map[UploadMediaType]string{UploadImage: "474233e574aba8c2e6f5c68cd3ea5b7e4cad764538e8593340c36d30d4067b87783033c9ef4b31ce661e6bd986f4a2c01c454eabdf2c3653726639cc1bc8eeb58ddb7d86c09618d427a0", UploadDocument: "a152af0afcc1abc69708d42cd69405d5f54acb48a16964f8e61ebe26b53d1f07e8eeb87617194a5bcc9781404d5ab4b14ac1e3f51052d7ffbdb4102e3f1996744ea9bd705fff983e5d7c"}
	for kind, want := range vectors {
		got, err := EncryptWhatsAppMedia(context.Background(), plain, EncryptMediaOptions{MediaType: kind, MediaKey: key})
		if err != nil || hex.EncodeToString(got.Ciphertext) != want {
			t.Fatalf("golden vector %s: %v", kind, err)
		}
		encoded, _ := json.Marshal(got)
		if bytes.Contains(encoded, []byte("mediaKey")) || bytes.Contains(encoded, []byte("ciphertext")) {
			t.Fatal("secret serialized")
		}
	}
	for _, kind := range []UploadMediaType{UploadImage, UploadVideo, UploadAudio, UploadVoiceNote, UploadDocument, UploadSticker} {
		for _, size := range []int{0, 1, 15, 16, 17, 65535, 65536, 65537} {
			source := bytes.Repeat([]byte{31}, size)
			encrypted, err := EncryptWhatsAppMedia(context.Background(), source, EncryptMediaOptions{MediaType: kind, MediaKey: key})
			if err != nil {
				t.Fatal(kind, size, err)
			}
			length := int64(size)
			keys, _ := DeriveWhatsAppMediaKeys(key, string(kind))
			decoded, err := DecryptWhatsAppMedia(encrypted.Ciphertext, keys, WhatsAppMediaDescriptor{MediaKind: string(kind), MediaKey: key, FileSHA256: encrypted.FileSHA256, FileEncSHA256: encrypted.FileEncSHA256, FileLength: &length}, DefaultWhatsAppMediaMaxBytes)
			if err != nil || !bytes.Equal(decoded, source) || encrypted.EncryptedLength != int64((size/16+1)*16+10) {
				t.Fatal("boundary", kind, size, err)
			}
			sum := sha256.Sum256(source)
			if !bytes.Equal(encrypted.FileSHA256, sum[:]) {
				t.Fatal("plaintext hash")
			}
		}
	}
}
func TestEncryptionRepeatPassNeverReleasesFinalBytesForChangedSource(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	options := EncryptMediaOptions{MediaType: UploadDocument, MediaKey: key}
	original := bytes.Repeat([]byte{1}, 65537)
	first, err := EncryptWhatsAppMedia(context.Background(), original, options)
	if err != nil {
		t.Fatal(err)
	}
	changed := bytes.Clone(original)
	changed[len(changed)-1] = 2
	var destination bytes.Buffer
	_, err = EncryptWhatsAppMediaTo(context.Background(), bytes.NewReader(changed), &destination, options, &first.EncryptedMediaInfo)
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "media_source_changed" || int64(destination.Len()) >= first.EncryptedLength {
		t.Fatal("changed source finalized", err, destination.Len())
	}
}
func TestEncryptionRejectsBoundsCancellationAndShortWrites(t *testing.T) {
	if _, err := EncryptWhatsAppMedia(context.Background(), []byte("too big"), EncryptMediaOptions{MediaType: UploadImage, MaxBytes: 2}); err == nil {
		t.Fatal("size limit")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := EncryptWhatsAppMedia(ctx, nil, EncryptMediaOptions{MediaType: UploadImage}); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation", err)
	}
	if _, err := EncryptWhatsAppMediaTo(context.Background(), bytes.NewReader([]byte("fixture")), shortCipherWriter{}, EncryptMediaOptions{MediaType: UploadImage}, nil); !errors.Is(err, io.ErrShortWrite) {
		t.Fatal("short write", err)
	}
}

type shortCipherWriter struct{}

func (shortCipherWriter) Write(value []byte) (int, error) { return len(value) - 1, nil }
