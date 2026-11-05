package polymorfa

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"io"
)

// UploadMediaType uses WhatsApp's transport name. Voice notes use ptt with audio keys.
type UploadMediaType string

const (
	UploadImage     UploadMediaType = "image"
	UploadVideo     UploadMediaType = "video"
	UploadAudio     UploadMediaType = "audio"
	UploadVoiceNote UploadMediaType = "ptt"
	UploadDocument  UploadMediaType = "document"
	UploadSticker   UploadMediaType = "sticker"
)

func validUploadType(kind UploadMediaType) bool {
	switch kind {
	case UploadImage, UploadVideo, UploadAudio, UploadVoiceNote, UploadDocument, UploadSticker:
		return true
	}
	return false
}

type EncryptMediaOptions struct {
	MediaType UploadMediaType
	MimeType  string
	// MediaKey is optional. Supply a fixed key only for a repeat pass of the same immutable source or a test vector.
	MediaKey []byte
	MaxBytes int64
}
type EncryptedMediaInfo struct {
	MediaType       UploadMediaType `json:"mediaType"`
	MediaKey        []byte          `json:"-"`
	FileSHA256      []byte          `json:"fileSha256"`
	FileEncSHA256   []byte          `json:"fileEncSha256"`
	FileLength      int64           `json:"fileLength"`
	EncryptedLength int64           `json:"encryptedLength"`
	MimeType        string          `json:"mimeType,omitempty"`
}

func (info EncryptedMediaInfo) String() string   { return "EncryptedMediaInfo[redacted]" }
func (info EncryptedMediaInfo) GoString() string { return info.String() }

type EncryptedMedia struct {
	EncryptedMediaInfo
	Ciphertext []byte `json:"-"`
}

func (media EncryptedMedia) String() string   { return "EncryptedMedia[redacted]" }
func (media EncryptedMedia) GoString() string { return media.String() }

func encryptionOptions(options EncryptMediaOptions) (EncryptMediaOptions, error) {
	if !validUploadType(options.MediaType) {
		return options, configuration("mediaType", "Unsupported upload media type.")
	}
	if options.MaxBytes == 0 {
		options.MaxBytes = DefaultWhatsAppMediaMaxBytes
	}
	if options.MaxBytes < 1 || options.MaxBytes > 9007199254740991 {
		return options, configuration("maxBytes", "maxBytes must be a positive safe integer.")
	}
	if options.MediaKey == nil {
		options.MediaKey = make([]byte, 32)
		if _, err := rand.Read(options.MediaKey); err != nil {
			return options, mediaError("media_key_failed", "Could not generate a media key.")
		}
	} else {
		if len(options.MediaKey) != 32 {
			return options, mediaError("media_invalid_descriptor", "The media key must be 32 bytes.")
		}
		options.MediaKey = bytes.Clone(options.MediaKey)
	}
	return options, nil
}

// EncryptWhatsAppMediaTo encrypts incrementally with bounded working memory.
// expected is used for a repeat pass. The source must reach EOF and match its
// hashes and length before the final ciphertext block and MAC are released.
// Cellar whatsapp-1049950004 WAMediaCrypto.js:75-101 defines ciphertext || mac10.
func EncryptWhatsAppMediaTo(ctx context.Context, source io.Reader, destination io.Writer, options EncryptMediaOptions, expected *EncryptedMediaInfo) (EncryptedMediaInfo, error) {
	options, err := encryptionOptions(options)
	if err != nil {
		return EncryptedMediaInfo{}, err
	}
	if source == nil || destination == nil {
		return EncryptedMediaInfo{}, configuration("source", "An input and destination are required.")
	}
	keys, err := DeriveWhatsAppMediaKeys(options.MediaKey, string(options.MediaType))
	if err != nil {
		return EncryptedMediaInfo{}, err
	}
	block, err := aes.NewCipher(keys.CipherKey)
	if err != nil {
		return EncryptedMediaInfo{}, mediaError("media_invalid_descriptor", "Could not initialize media encryption.")
	}
	cbc := cipher.NewCBCEncrypter(block, keys.IV)
	plainHash, encryptedHash := sha256.New(), sha256.New()
	mac := hmac.New(sha256.New, keys.MACKey)
	mac.Write(keys.IV)
	info := EncryptedMediaInfo{MediaType: options.MediaType, MediaKey: bytes.Clone(options.MediaKey), MimeType: options.MimeType}
	buffer := make([]byte, 64*1024+aes.BlockSize)
	pending := 0
	writeCipher := func(value []byte) error {
		cbc.CryptBlocks(value, value)
		mac.Write(value)
		encryptedHash.Write(value)
		info.EncryptedLength += int64(len(value))
		written, err := destination.Write(value)
		if err == nil && written != len(value) {
			err = io.ErrShortWrite
		}
		return err
	}
	for {
		if err := ctx.Err(); err != nil {
			return EncryptedMediaInfo{}, contextError(ctx, err)
		}
		n, readErr := source.Read(buffer[pending : 64*1024])
		if n < 0 || n > 64*1024-pending {
			return EncryptedMediaInfo{}, mediaError("media_source_failed", "The media source returned an invalid read.")
		}
		if n > 0 {
			info.FileLength += int64(n)
			if info.FileLength > options.MaxBytes {
				return EncryptedMediaInfo{}, mediaError("media_too_large", "Media exceeds the configured limit.")
			}
			plainHash.Write(buffer[pending : pending+n])
			pending += n
		}
		if readErr != nil && readErr != io.EOF {
			return EncryptedMediaInfo{}, mediaError("media_source_failed", "The media source could not be read.")
		}
		if readErr == io.EOF {
			break
		}
		if n == 0 {
			return EncryptedMediaInfo{}, mediaError("media_source_failed", "The media source stopped without EOF.")
		}
		complete := pending / aes.BlockSize * aes.BlockSize
		if complete > 0 {
			if err := writeCipher(buffer[:complete]); err != nil {
				return EncryptedMediaInfo{}, err
			}
			copy(buffer, buffer[complete:pending])
			pending -= complete
		}
	}
	// Hold the last block and MAC until EOF, digest and caller cancellation checks pass.
	padded := make([]byte, (pending/aes.BlockSize+1)*aes.BlockSize)
	copy(padded, buffer[:pending])
	padding := byte(len(padded) - pending)
	for i := pending; i < len(padded); i++ {
		padded[i] = padding
	}
	cbc.CryptBlocks(padded, padded)
	mac.Write(padded)
	tail := append(padded, mac.Sum(nil)[:10]...)
	encryptedHash.Write(tail)
	info.EncryptedLength += int64(len(tail))
	info.FileSHA256 = plainHash.Sum(nil)
	info.FileEncSHA256 = encryptedHash.Sum(nil)
	if expected != nil && (info.FileLength != expected.FileLength || info.EncryptedLength != expected.EncryptedLength || !hmac.Equal(info.FileSHA256, expected.FileSHA256) || !hmac.Equal(info.FileEncSHA256, expected.FileEncSHA256)) {
		return EncryptedMediaInfo{}, mediaError("media_source_changed", "The media source changed between encryption passes.")
	}
	if err := ctx.Err(); err != nil {
		return EncryptedMediaInfo{}, contextError(ctx, err)
	}
	if written, err := destination.Write(tail); err != nil {
		return EncryptedMediaInfo{}, err
	} else if written != len(tail) {
		return EncryptedMediaInfo{}, io.ErrShortWrite
	}
	return info, nil
}
func EncryptWhatsAppMedia(ctx context.Context, plaintext []byte, options EncryptMediaOptions) (EncryptedMedia, error) {
	var ciphertext bytes.Buffer
	info, err := EncryptWhatsAppMediaTo(ctx, bytes.NewReader(plaintext), &ciphertext, options, nil)
	if err != nil {
		return EncryptedMedia{}, err
	}
	return EncryptedMedia{info, ciphertext.Bytes()}, nil
}
