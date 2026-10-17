# Independent strict history fixtures

`strict-history.json` and `generate-strict-history.py` are byte-for-byte copies
from the accepted TypeScript strict decoder at SDK 8fcddb30aed420b9f88a3fa0cfe3579ca315323b.
Python stdlib zlib independently validates all 38 complete streams. Its 2,992
recipes cover tails, concatenation, prefixes, wrapper/checksum and dictionary errors.
Three complete streams intentionally contain invalid protobuf. Recipes containing
those plaintexts are conservatively kept out of compressed-validation proof.
The C# suite reports their counts separately; it never credits a protobuf error
as a compressed-stream refusal.

`strict-history-headers.json`, its generator and `strict-history-server.mjs` are
copied unchanged from Rust strict SDK bbf9bccadb3c0a7d559fac017a5a48fdca5d054b.
The header file's `supported` field and generator summary describe Rust's existing
65,535-byte limit. C# ignores that classification and accepts all 15 complete
headers, including the exact retained 2 MiB optional-header vector. The remaining
record is incomplete. The two named legacy records retain their complete input
SHA256 hashes; this is not a run of the full older 1,334-vector corpus.
The server independently encrypts shared corpus bytes using Node crypto/HKDF/AES/
HMAC and serves a synthetic TLS CDN. No real account or customer data is used.
Generated short-lived TLS keys stay in the configured task work directory and
are deleted by the test; keys are never recorded in test output.

`generate-strict-history-dotnet.py` adds 84 independently verified complete
streams: all 32 gzip flag combinations, stored plaintext and exact raw-body
length boundaries, sync-flush multiblock streams and valid unused final bits.
Raw stored bodies have exact lengths 8191, 8192, 8193, 16384, 65535, 65536 and
65537 across gzip/zlib/raw wrappers. Their last-byte-shortened variants and
sampled prefixes must fail through public DecodeAsync. All complete plaintexts
are valid provider protobuf (including canonical empty output).

Run each generator with Python 3.11 or later beside these files. Tests use the
frozen JSON and do not require Python. Public decode, inline download, independently
authenticated download and signed archive/application projection are exercised.
No friend assembly, private decoder hook or fault injection is used by these tests.
Deterministic held caller contexts prove actual suspension before mutation and
cancellation during first-pass inflation and optional-header scans. Public tests
do not isolate cancellation within the shortened pass, checksum or joining phase,
or interruption inside synchronous native/protobuf calls. The separate accepted
BCL prototype owns source-failure/second-pass injection evidence.

Descriptor dispatch and full-schema projection are separate work. These fixtures
prove local supported runtime behavior, not live WhatsApp, browser/WASM/native
platform coverage, registry publication or production acceptance.

## Frozen hashes

- `strict-history.json`: `b8ae1ba0642a0cdf0c925eeeb5cc2d6c179c70cd6a6680463990e75d50b81439`
- `generate-strict-history.py`: `7ed41c8525c88f23bdac9a84287c7378a950550868136e8414f8558d896e0ca0`
- `strict-history-headers.json`: `4d02a1b0c8514f589fd7ceb25be90b8f45f22a97265eed6777de7525eb167219`
- `generate-strict-history-headers.py`: `d018c385b268ce70bfc368246a30636b079d228787a71b83ce5ce22c3da2466c`
- `strict-history-server.mjs`: `a6e8cb9d47e0019acf10b31ee30a5f07a889ae24166dad35a7dc6d30cf698372`
- `strict-history-dotnet.json`: `df0feb744e2a008bbc47e20973012f22c058a7bde9efb38e536db16c79d7ae0f`
- `generate-strict-history-dotnet.py`: `77149a06fb85d251e0a3485ad333186b34c6e7a942943e86e0ca5341d260fb89`
