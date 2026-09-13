# QuickLink launch contract checkpoint

Source: polymorfa/polymorfa commit c012141e64049c64200dedb00892221c745bdc03,
draft PR https://github.com/polymorfa/polymorfa/pull/147. SDK base dev is
e15da860973ee9c81a8ffcccc95463ce3b22166f.

This patch covers optional QuickLink externalId, Session externalId, native
session lifecycle webhook correlation, project-owned callback settings, and typed Meta Cloud API history/contact/echo events.
It removes callbackUrl from invitation input and the obsolete settings redirect
allowlist. Request tests verify the external reference and callback serialization.

The repository-wide coverage ledger still pins 6918c561 and does not establish
coverage of the launch candidate. Comparing the candidate reports 451 operations,
344 absent ledger rows and six changed fingerprints. Many absent rows result from
the API prefix cutover; counts alone do not prove runtime omissions or parity.
Complete reconciliation against the final API commit is required before marking
this companion review-ready. Do not silently refresh fingerprints or claim all
languages are supported. The inspected repository contains TypeScript server and
browser/UI packages.

API implementation and public guides live in PR147. The CLI's customer pairing
flags still need alignment with the final project-owned policy. No package release,
feature rollout, registry publication or deployment is part of this checkpoint.
This is a contract correction to the existing QuickLink methods; the broader new
feature's narrated video belongs to PR147 and remains required there.
