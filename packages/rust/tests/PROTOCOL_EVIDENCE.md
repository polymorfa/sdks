# Existing media protocol evidence

The Rust port follows the merged TypeScript SDK at
`ff51567105b64bf6997e7330ba8eb502d875e7b9`, specifically
`packages/typescript/src/media/whatsapp.ts` and its media tests.
The fixtures were calculated independently with Node's HKDF, AES-CBC and
HMAC implementations using the same construction as the TypeScript tests.

Cellar's newest stored bundle is `whatsapp-1049950004` (indexed 2026-10-10).
The inspected shipped-client modules are:

- `modules/WAWebCryptoCreateMediaKeys.js:23-29`: `extractAndExpand(i, a, 112)`;
  IV bytes 0-16, encryption key 16-48, MAC key 48-80, reference key 80-112.
- `modules/WAWebCryptoDecryptMedia.js:19`: `p = 10`.
- `modules/WAWebCryptoDecryptMedia.js:28-39`: HMAC-SHA256 over IV plus
  ciphertext, truncated to the trailing 10-byte MAC; compare before decrypt.
- `modules/WAWebCryptoDecryptMedia.js:41-50`: AES-CBC decryption.
- `modules/WAWebCryptoDecryptMedia.js:57-60`: plaintext SHA-256 comparison.
- `modules/WAWebCryptoMediaTypeInfo.js:4-12`: media type HKDF labels, including
  stickers using image keys.

These modules prove shipped client behavior. The deterministic vectors and
native transport tests prove this SDK's behavior; no live CDN acceptance is
claimed. This port does not implement the unmerged direct-media or history
encryption branches.
