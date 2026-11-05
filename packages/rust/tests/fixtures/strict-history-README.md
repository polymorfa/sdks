# Independent Rust history fixtures

`strict-history.json` and `generate-strict-history.py` are exact copies of the
TypeScript strict-history fixtures at SDK commit
`8fcddb30aed420b9f88a3fa0cfe3579ca315323b`. The generator uses Python standard
`zlib`, `gzip` and `binascii`, with manually encoded provider protobuf fields.
No flate2 or SDK encoder produces the expected compressed streams or plaintext.
Rust tests load their own shipped files. They do not read TypeScript source.

The corpus has 38 complete streams and 2,992 malformed recipes. Three complete
streams contain deliberately invalid protobuf. Their 48 derived recipes are
checked for safe errors but counted as protobuf-only observations, since that
error alone cannot prove compression refusal. The other 35 complete streams
have valid protobuf, including compressed empty output, unknown fields and a
full-width uint64. Across direct decode and inline download, the suite records
70 complete-stream checks, 5,888 compressed refusals and 102 protobuf-only
checks. Small prefixes are exhaustive; long compressed prefixes are sampled.

`strict-history-headers.json` has 16 compact recipes produced independently by
`generate-strict-history-headers.py`. Each expands to bytes with a SHA256 check.
There are six supported complete streams, nine RFC-valid but unsupported
headers and one incomplete header. Filename and comment boundaries cover
65,535 and 65,536 non-NUL bytes, separately and together, with and without FHCRC.
Python's decoder independently accepts all 15 complete streams.

The exact `huge-name-comment` and `unterminated-name` bytes are retained from
`portable-history-decoder-investigation/independent-vectors.json`, part of the
original 1,334-vector diagnostic corpus. The complete original corpus remains
in the task evidence packet; this Rust crate exercises these two exact vectors
through its public methods. The valid 2 MiB filename/comment vector is
unsupported by pinned flate2 1.1.10 because each field exceeds 65,535 bytes.
It is counted as a valid-but-unsupported safe refusal, never malformed data.
The unterminated filename is incomplete compression. Repeated segments avoid
storing a second multi-megabyte base64 copy; their expanded hashes match the
original vectors.

`strict-history-server.mjs` encrypts independent corpus streams with Node crypto
HKDF-SHA256, AES-256-CBC and HMAC-SHA256/MAC10. It serves an isolated synthetic
HTTPS peer, using a task-owned temporary directory outside system temp. Tests
exercise actual public authenticated downloads, compressed suffix/member and
checksum refusal, tampered ciphertext, limits and cancellation before EOF.
They verify that bearer credentials, cookies and API-version headers are absent;
the existing WhatsApp Origin and Referer remain present.

The storage regression verifies a signed archive event and invokes the real
public inline decoder inside an application-supplied archive projection. A
trailing compressed byte must prevent all storage rows, event markers,
checkpoints and ACKs. Its valid control persists and ACKs. This does not add
production descriptor dispatch or a complete provider-schema storage mapping.
