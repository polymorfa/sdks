# Independent public history fixtures

The corpus and generator bytes come from TypeScript strict commit
`8fcddb30aed420b9f88a3fa0cfe3579ca315323b`. The optional-header corpus and Node
server originate from Rust strict `bbf9bccadb3c0a7d559fac017a5a48fdca5d054b`; the
stored-block/flags supplement comes from C# strict
`759bbaf0f2eff8de5a8b62f8569f2959b1237442`. The small-header/padding fixture comes
from Go strict `b713448f89ef95a528fcb98c172edd2eec381a72`. Generator files retain
exact bytes with `.py.txt` names so package linters do not rewrite their
independent source. Copy them to a scratch directory with `.py` names to rerun.

PHP requires HistorySync.syncType. Across direct and inline paths, the main
38-stream/2,992-recipe corpus records 64 complete checks, 5,728 compressed refusals
and 268 protobuf-policy-only observations. Already-invalid protobuf and empty
output cannot prove compression refusal. The supplement adds 166 complete
checks, 332 compressed refusals and six protobuf-only observations. Representative
small prefixes are exhaustive; long prefixes are sampled.

All 15 complete optional-header streams are supported by the tested PHP/zlib
runtimes, including the exact legacy 1 MiB filename plus 1 MiB comment. Their
`supported` fields describe Rust, not PHP. The other header is incomplete.
Only huge-name-comment and unterminated-name from the older 1,334-vector diagnostic
corpus are exercised here. The older C# 152-vector prototype is not exercised.
The 40 small-header/padding checks ignore the fixture's Go-specific support field.

The Node peer independently encrypts provider bytes using Node crypto, then serves
synthetic HTTPS. PHP uses its public Guzzle seam and cURL CONNECT_TO, preserving
certificate validation and the original synthetic CDN host/SNI.
No WhatsApp/customer account is used. Set POLYMORFA_TEST_WORK_DIR to task-owned
storage outside system temp. Storage tests verify a signed archive and use an
application decoder projection. They do not add descriptor storage dispatch.

The copied server adds CA signing key usage and leaf subject/authority key identifiers
for strict certificate validation. Encryption and corpus bytes are unchanged.
