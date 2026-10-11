package polymorfa

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"io"
	"os"
	"path/filepath"
)

type WhatsAppMediaVerifyMode string

const VerifyBeforeRelease WhatsAppMediaVerifyMode = "before-release"
const VerifyStreaming WhatsAppMediaVerifyMode = "streaming"

type WhatsAppMediaStream struct {
	Body                          io.ReadCloser
	MediaKind, MimeType, Filename string
	FileLength                    *int64
}
type mediaPipeReader struct {
	*io.PipeReader
	cancel context.CancelFunc
	source io.Reader
}

func (p *mediaPipeReader) Close() error {
	p.cancel()
	if closer, ok := p.source.(io.Closer); ok {
		closer.Close()
	}
	return p.PipeReader.Close()
}

// DecryptWhatsAppMediaStream consumes and closes source. Before-release buffers
// verified plaintext; streaming releases plaintext before final integrity
// checks and reports any failure on the reader. Always check the final read.
func DecryptWhatsAppMediaStream(ctx context.Context, source io.Reader, keys WhatsAppMediaKeys, d WhatsAppMediaDescriptor, maxBytes int64, mode WhatsAppMediaVerifyMode) (io.ReadCloser, error) {
	if maxBytes == 0 {
		maxBytes = DefaultWhatsAppMediaMaxBytes
	}
	if maxBytes < 1 || maxBytes > 9007199254740991 {
		return nil, configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if len(keys.IV) != 16 || len(keys.CipherKey) != 32 || len(keys.MACKey) != 32 || source == nil {
		return nil, mediaError("media_invalid_descriptor", "A source and valid media keys are required.")
	}
	if mode == "" {
		mode = VerifyBeforeRelease
	}
	if mode != VerifyBeforeRelease && mode != VerifyStreaming {
		return nil, configuration("verify", "verify must be before-release or streaming.")
	}
	plainBound := maxBytes
	if d.FileLength != nil {
		if *d.FileLength < 0 || *d.FileLength > maxBytes {
			return nil, mediaError("media_too_large", "Media exceeds the configured limit.")
		}
		plainBound = *d.FileLength
	}
	encryptedBound := (plainBound/16+1)*16 + 10
	owned, cancel := context.WithCancel(ctx)
	reader, writer := io.Pipe()
	result := &mediaPipeReader{reader, cancel, source}
	go func() {
		<-owned.Done()
		writer.CloseWithError(contextError(owned, owned.Err()))
		if closer, ok := source.(io.Closer); ok {
			closer.Close()
		}
	}()
	go func() {
		defer cancel()
		if closer, ok := source.(io.Closer); ok {
			defer closer.Close()
		}
		err := decryptMediaInto(owned, writer, source, keys, d, maxBytes, encryptedBound, mode)
		writer.CloseWithError(err)
	}()
	return result, nil
}
func decryptMediaInto(ctx context.Context, out io.Writer, in io.Reader, keys WhatsAppMediaKeys, d WhatsAppMediaDescriptor, maxBytes, encryptedBound int64, mode WhatsAppMediaVerifyMode) error {
	block, _ := aes.NewCipher(keys.CipherKey)
	decrypt := cipher.NewCBCDecrypter(block, keys.IV)
	mac := hmac.New(sha256.New, keys.MACKey)
	mac.Write(keys.IV)
	encHash, plainHash := sha256.New(), sha256.New()
	var verified bytes.Buffer
	target := out
	if mode == VerifyBeforeRelease {
		target = &verified
	}
	buf := []byte{}
	chunk := make([]byte, 32768)
	var held []byte
	var total, plainBytes int64
	emit := func(p []byte) error {
		plainBytes += int64(len(p))
		if plainBytes > maxBytes {
			return mediaError("media_too_large", "Media exceeds the configured plaintext limit.")
		}
		plainHash.Write(p)
		if ctx.Err() != nil {
			return contextError(ctx, ctx.Err())
		}
		_, err := target.Write(p)
		return err
	}
	for {
		if ctx.Err() != nil {
			return contextError(ctx, ctx.Err())
		}
		n, err := in.Read(chunk)
		if n > 0 {
			total += int64(n)
			if total > encryptedBound {
				return mediaError("media_too_large", "Encrypted media exceeds the configured limit.")
			}
			encHash.Write(chunk[:n])
			buf = append(buf, chunk[:n]...)
			blocks := (len(buf) - 10) / 16
			if blocks > 0 {
				ciphertext := buf[:blocks*16]
				mac.Write(ciphertext)
				plain := make([]byte, len(ciphertext))
				decrypt.CryptBlocks(plain, ciphertext)
				if held != nil {
					if e := emit(held); e != nil {
						return e
					}
				}
				if len(plain) > 16 {
					if e := emit(plain[:len(plain)-16]); e != nil {
						return e
					}
				}
				held = append(held[:0], plain[len(plain)-16:]...)
				buf = append(buf[:0], buf[blocks*16:]...)
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return &Error{Kind: ConnectionError, Code: "connection_error", Message: "Encrypted media could not be read.", Cause: err}
		}
	}
	if held == nil || len(buf) != 10 {
		return mediaError("media_invalid_ciphertext", "Encrypted media has incomplete blocks or MAC.")
	}
	if d.FileEncSHA256 != nil && !hmac.Equal(encHash.Sum(nil), d.FileEncSHA256) {
		return mediaError("media_enc_hash_mismatch", "Encrypted media hash does not match.")
	}
	if !hmac.Equal(mac.Sum(nil)[:10], buf) {
		return mediaError("media_mac_mismatch", "Media MAC does not match.")
	}
	padding := int(held[15])
	if padding < 1 || padding > 16 {
		return mediaError("media_invalid_padding", "Media padding is invalid.")
	}
	for _, v := range held[16-padding:] {
		if int(v) != padding {
			return mediaError("media_invalid_padding", "Media padding is invalid.")
		}
	}
	if err := emit(held[:16-padding]); err != nil {
		return err
	}
	if d.FileSHA256 != nil && !hmac.Equal(plainHash.Sum(nil), d.FileSHA256) {
		return mediaError("media_hash_mismatch", "Plaintext media hash does not match.")
	}
	if mode == VerifyBeforeRelease {
		if ctx.Err() != nil {
			return contextError(ctx, ctx.Err())
		}
		_, err := io.Copy(out, &verified)
		return err
	}
	return nil
}
func DownloadWhatsAppMediaStream(ctx context.Context, d WhatsAppMediaDescriptor, o WhatsAppMediaDownloadOptions, mode WhatsAppMediaVerifyMode) (WhatsAppMediaStream, error) {
	if o.MaxBytes < 0 || o.MaxBytes > 9007199254740991 {
		return WhatsAppMediaStream{}, configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if mode != "" && mode != VerifyBeforeRelease && mode != VerifyStreaming {
		return WhatsAppMediaStream{}, configuration("verify", "verify must be before-release or streaming.")
	}
	if len(d.FileSHA256) != 32 {
		return WhatsAppMediaStream{}, mediaError("media_invalid_descriptor", "The media descriptor needs fileSha256.")
	}
	keys, err := DeriveWhatsAppMediaKeys(d.MediaKey, d.MediaKind)
	if err != nil {
		return WhatsAppMediaStream{}, err
	}
	body, err := openWhatsAppMedia(ctx, d, o)
	if err != nil {
		return WhatsAppMediaStream{}, err
	}
	plain, err := DecryptWhatsAppMediaStream(ctx, body, keys, d, o.MaxBytes, mode)
	if err != nil {
		body.Close()
		return WhatsAppMediaStream{}, err
	}
	mime := d.MimeType
	if mime == "" {
		mime = mediaMIME[d.MediaKind]
	}
	return WhatsAppMediaStream{Body: plain, MediaKind: d.MediaKind, MimeType: mime, Filename: d.Filename, FileLength: d.FileLength}, nil
}

type MediaFileResult struct {
	Path                          string
	Bytes                         int64
	MediaKind, MimeType, Filename string
	FileLength                    *int64
}

// WriteMediaToFile writes a private sibling file and installs it only after the
// source completes without error. The default refuses an existing destination.
func WriteMediaToFile(ctx context.Context, source io.ReadCloser, path string, overwrite bool) (int64, error) {
	if source == nil {
		return 0, configuration("source", "A readable media source is required.")
	}
	defer source.Close()
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			source.Close()
		case <-done:
		}
	}()
	f, err := os.CreateTemp(filepath.Dir(path), ".polymorfa-media-*")
	if err != nil {
		return 0, err
	}
	staging := f.Name()
	defer os.Remove(staging)
	n, err := io.Copy(f, source)
	closeErr := f.Close()
	if err != nil {
		return n, err
	}
	if closeErr != nil {
		return n, closeErr
	}
	if ctx.Err() != nil {
		return n, contextError(ctx, ctx.Err())
	}
	if overwrite {
		err = os.Rename(staging, path)
	} else {
		err = os.Link(staging, path)
	}
	return n, err
}
func DownloadWhatsAppMediaToFile(ctx context.Context, d WhatsAppMediaDescriptor, path string, o WhatsAppMediaDownloadOptions, overwrite bool) (MediaFileResult, error) {
	stream, err := DownloadWhatsAppMediaStream(ctx, d, o, VerifyStreaming)
	if err != nil {
		return MediaFileResult{}, err
	}
	n, err := WriteMediaToFile(ctx, stream.Body, path, overwrite)
	return MediaFileResult{Path: path, Bytes: n, MediaKind: stream.MediaKind, MimeType: stream.MimeType, Filename: stream.Filename, FileLength: stream.FileLength}, err
}
