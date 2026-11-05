# Independent public history fixtures

The 38-stream, 2,992-recipe corpus and its generator are exact copies from
`packages/typescript/test/fixtures` at SDK `8fcddb30aed420b9f88a3fa0cfe3579ca315323b`.
Python standard zlib/gzip/binascii and manually encoded provider protobuf produce
expected bytes. No SDK decoder is the oracle. The optional-header fixtures and
server are copied from Rust strict commit `bbf9bccadb3c0a7d559fac017a5a48fdca5d054b`;
the supplemental stored-block/flags fixture and generator are copied from C#
strict commit `759bbaf0f2eff8de5a8b62f8569f2959b1237442`.

Go requires syncType, so complete compressed empty output and recipes whose base
already fails Go protobuf policy cannot prove compressed-input refusal. The two
public paths record 64 complete controls, 5,728 compressed refusals and 268
protobuf-policy-only observations for the main corpus. The supplemental corpus
adds 166 complete checks, 332 compressed refusals and six protobuf-only checks.
Small representative prefixes are exhaustive; long prefixes are sampled.

All 15 complete streams in the retained header fixture exceed Go's existing
511-byte filename/comment limit. They are valid but unsupported, not malformed.
The incomplete header remains separate. Its `supported` field describes Rust's
policy, not Go's. The two legacy huge-name-comment/unterminated-name vectors are
exact retained bytes from the older 1,334-vector diagnostic corpus; this package
exercises only those two, not that whole older corpus. The C# prototype's older
152-vector corpus is not exercised here. `go-header-boundaries.json` independently
adds accepted 511 and refused 512-byte controls, both fields and FHCRC.

The Node server independently encrypts corpus bytes with HKDF-SHA256,
AES-256-CBC and HMAC-SHA256/MAC10. It is a synthetic HTTPS peer, not WhatsApp.
Set POLYMORFA_TEST_WORK_DIR to a task-owned directory outside system temp.
The storage test verifies a signed archive, then uses an application projection
of common decoded fields. It does not add descriptor dispatch or claim generic
full-schema storage support.
