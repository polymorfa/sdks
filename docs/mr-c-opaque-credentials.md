# Opaque credentials and the coordinated API cutover

Source contract: polymorfa/polymorfa #647, checkpoint 2ec6d0f036f3ea80addf1813dfea74e82ca143fc.
This SDK PR updates all six languages to validate server credential prefixes,
canonical base64url and CRC-32/ISO-HDLC. It never authenticates a credential and
contains no signing key. Shape validation permits growth and asserts no exact
total length. The API validates its supported format and live issuance records.

Treat every credential as an opaque string. Never parse it or assume a fixed
length. Credential storage must support at least 512 characters, preferably
unrestricted text. Client-token lengths vary with their bindings, Customer block
and signing kid; pass them unchanged and keep browser tokens in memory.

Organization keys contain 20 CSPRNG bytes and a four-byte big-endian CRC32 after
`pmfa_`; project tokens use `pmfa_pt_`. The current totals are 37/40 characters,
provided as fixture evidence, not storage or client parsing limits. CRC is not
authentication. Test keys are ordinary project tokens restricted by live server
authority; clients do not infer the restriction from the string.

Publication and CLI dependency pinning must follow accepted API deployment and
source/package verification. Source merge alone does not establish availability.
The native SDK foundation #348 remains a stack dependency until merged to main.
