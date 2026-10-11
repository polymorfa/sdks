package polymorfa

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestWhatsAppMediaIntegrity(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	keys, err := DeriveWhatsAppMediaKeys(key, "image")
	if err != nil {
		t.Fatal(err)
	}
	actual := append(append(append([]byte{}, keys.IV...), keys.CipherKey...), keys.MACKey...)
	const expected = "aa6a127218397cbd2383e4ccf7176a79008c9aea9b7c5d81eb56b3f530f87d42dcc92d27b11ad6b5bd66f0560d0d8c4691d09ffec108833c1699574c52657923fb6e3e161d9698bc6b3a05fbc508a5154d4981725e9eb39838fcff2130508f1360cbb319f99cef163d57ab7c050a667e"
	if hex.EncodeToString(actual) != expected[:160] {
		t.Fatal("HKDF fixture mismatch")
	}
	sticker, err := DeriveWhatsAppMediaKeys(key, "sticker")
	if err != nil || !bytes.Equal(sticker.CipherKey, keys.CipherKey) {
		t.Fatal("sticker must use image keys", err)
	}
	plaintext := []byte("Hello verified media")
	padding := 16 - len(plaintext)%16
	padded := append(append([]byte{}, plaintext...), bytes.Repeat([]byte{byte(padding)}, padding)...)
	block, _ := aes.NewCipher(keys.CipherKey)
	encrypted := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, keys.IV).CryptBlocks(encrypted, padded)
	mac := hmac.New(sha256.New, keys.MACKey)
	mac.Write(keys.IV)
	mac.Write(encrypted)
	encrypted = append(encrypted, mac.Sum(nil)[:10]...)
	plainHash := sha256.Sum256(plaintext)
	encryptedHash := sha256.Sum256(encrypted)
	length := int64(len(plaintext))
	d := WhatsAppMediaDescriptor{MediaKind: "image", MediaKey: key, FileLength: &length, FileSHA256: plainHash[:], FileEncSHA256: encryptedHash[:]}
	result, err := DecryptWhatsAppMedia(encrypted, keys, d, 1024)
	if err != nil || !bytes.Equal(result, plaintext) {
		t.Fatal("verified decryption", err)
	}
	for _, test := range []struct {
		name       string
		data       []byte
		descriptor WhatsAppMediaDescriptor
		max        int64
		code       string
	}{
		{"encrypted hash", append([]byte{encrypted[0] ^ 1}, encrypted[1:]...), d, 1024, "media_enc_hash_mismatch"},
		{"MAC", append([]byte{encrypted[0] ^ 1}, encrypted[1:]...), WhatsAppMediaDescriptor{}, 1024, "media_mac_mismatch"},
		{"plaintext hash", encrypted, WhatsAppMediaDescriptor{FileSHA256: make([]byte, 32)}, 1024, "media_hash_mismatch"},
		{"bounded", encrypted, d, 1, "media_too_large"},
		{"truncated", encrypted[:9], WhatsAppMediaDescriptor{}, 1024, "media_too_short"},
	} {
		t.Run(test.name, func(t *testing.T) {
			data, err := DecryptWhatsAppMedia(test.data, keys, test.descriptor, test.max)
			e, ok := err.(*Error)
			if !ok || e.Code != test.code || data != nil {
				t.Fatal(data, err)
			}
		})
	}
	if strings.Contains(keys.String(), hex.EncodeToString(key)) || strings.Contains(d.String(), hex.EncodeToString(key)) {
		t.Fatal("secret formatting")
	}
	for _, url := range []string{"http://mmg.whatsapp.net/a", "https://mmg.whatsapp.net.evil/a", "https://user:pass@mmg.whatsapp.net/a", "https://mmg.whatsapp.net:443/a"} {
		if IsWhatsAppMediaURL(url) {
			t.Fatal("unsafe URL allowed", url)
		}
	}
	if !IsWhatsAppMediaURL("https://mmg.whatsapp.net/a") {
		t.Fatal("allowlisted HTTPS URL")
	}
}
