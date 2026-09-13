# QuickLink launch contract checkpoint

Source: polymorfa/polymorfa commit 85f2955c95cf183fa284ee28a618466972f2ff6a,
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

Customer profiles no longer expose phone/phoneMasked or accept phone on create
or update. Pairing invitations retain their own expectedPhone and connected
Numbers retain phone information. CLI must adopt this SDK commit together with
its removed profile phone flags.

Invitation policy enforcement: creation now omits branding, theme, history and
connection overrides. Customer pairing requests omit locale/theme. These values
belong to saved settings; only pairing methods remain configurable per invitation.
Typecheck and all407tests pass after this contract delta. Exact final API source
will be recorded after the companion checkpoint is pushed.
