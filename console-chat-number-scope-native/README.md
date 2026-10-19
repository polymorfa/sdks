# Chats Number scope: native Console and Inspector retest

On 2026-10-19 a compiled local Console used the new header Number picker for Chats, sent a message from one synthetic test Number, and received the native reply live. Inspector, running the real WhatsApp client against simulated WhatsApp, decrypted the Console message and replied. Two hard reloads kept the specific Number scope from the URL without reselection, and kept every message body and the counterpart's name. First-run native pairing succeeded on a fresh slot.

This is a local, isolated run with synthetic test Numbers. It does not show a hosted deployment, a published SDK release, or delivery over the real WhatsApp network.

## Exact revisions

| Input | Revision or hash |
| --- | --- |
| Backend PR 780 (session start health reconnect) head | `6d95fbf446353b22bf910c77fb09805e88b47e75` (Go source `f06e0a9e1ffcfcbadde136e6a959f4294bf2980a`, base dev `0e93ab8ff87349ee853289368fdab8d0cbec3ce9`) |
| Backend PR 776 (retained producers) head | `5f289706e2822de392b196969c58952271f44958` |
| Console PR 774 (Number header picker) head | `c98537873e03b7ba4764c3dd6d67935f1974fcee` |
| Local merge of 776 onto 780 (not pushed) | `e5ddc9474594c95c6c9dde047fe1325a2f50d7e3` |
| Local verification merge with 774 (not pushed) | `7735261f948ad7a13f61e3be2978154ef0df6ba2` |
| SDK PR 357 source of the packs | `783bbe7f72a4de2fa9eee4d17338ac5af3a3b16f` |
| `@polymorfa/sdk` pack | `e79cbca32099a0b2abbfa774cf55188fd1c8c4f9f0fd98590bcec4382cb6b40e` |
| `@polymorfa/browser` pack | `c84b32b7d8fbd71aadb6ebcdbd34770ee67378bfb7fdd6b3cfb8a90cce1727d5` |
| `@polymorfa/ui` pack | `934baff2b17fa3f555a757e8c3f08a949514179b8f2e009ef0f7f1ccac7cad0a` |
| `@polymorfa/react` pack | `0fa8b6c0a73fe3711c403e0396e611cfb7fce0bfa015e1e1c7e939ee18902f76` |

Both merges were clean. The packs are unpublished `0.1.0-dev.0` tarballs installed through temporary root overrides; installed files were byte-identical to the tarballs. Afterwards the committed registry pin `0.1.0-dev.20261010020302` and the original `package.json` and lockfile hashes were restored with a frozen install.

The Console ran as a production build: a temporary slot recipe patch (SHA-256 `97fa89ca3c2c1c00387e251e41bd717a7a102789bae881d725dac437a5b38c07`) awaited `next build --webpack` (206 pages) and then ran managed `next start` on the assigned origin. The listener was `next-server (v16.3.8)` under `pnpm exec next start --hostname 127.0.0.1 --port 20001`, with `NODE_ENV=production` and `POLYMORFA_ENV=development` for the Console only. `/_next/webpack-hmr` returned 404, chunks were content-hashed, and no dev overlay was present. The API stayed in local development mode with real authentication. The recipe was restored to its original SHA-256 `835b57ec4104252c48f8773c54197adc7728c56b126adb0ee2db482f930b3c07` after teardown.

## What passed

1. Fresh synthetic user, team and project; real local OTP sign-in; Inspector device approval through the authenticated API; enrollment, regional settings, purpose and capture grants on two synthetic test Numbers. Native pairing of the customer Number succeeded on the first run. Authentication screens and codes are excluded from every file.
2. Chats opened with no `number` parameter as All numbers. Both Numbers' own conversations appeared, each labelled with its owning Number (`01`).
3. The header picker showed All numbers, a separator, a brief loading state and both Numbers. Search filtered to one Number (`02`); an unmatched search showed the empty result while keeping All numbers available (`03`). Escape closed the picker and returned visible keyboard focus to the trigger.
4. In All numbers, the Support Number's conversation opened with "From" set to that Number (`04`). Before any outbound message, the header showed only the counterpart's LID. This is the intended suppression of ordinary inbound LID phones.
5. Choosing the Support Number set `?number=` to that Number's exact immutable ID, listed only its conversation and cleared the open thread (`05`).
6. The Console send (`06`) was decrypted as incoming by Inspector about 0.2 s later (`12`). Direct regional reads confirmed the Support Number's own copy kept the exact text, and the chat summary kept `observedName` "Inspector customer" while the outbound message was latest. The customer Number held the same text only as an incoming message.
7. Hard reload 1 restored the Support Number scope from the URL with no reselection. The thread showed the sent body, the name and the phone the region reports (`07`). The phone appeared only after the outbound observation.
8. Inspector replied; it was delivered with ack 2, captured regionally, and appeared live in the Console about 12 s later on the 15 s refresh (`08`, `13`).
9. Hard reload 2 again restored the scope and kept all three messages, the name and the phone, with no unavailable labels.
10. Back and Forward moved between the Support Number and All numbers. In All numbers, the Support thread still sent from the Support Number. The customer Number's conversation is its own mirror view: its greeting and reply outgoing, the Console message incoming, and "Support line" observed independently (`09`).
11. At 390 px in light (`10`) and dark (`11`) themes there was no horizontal overflow; timestamps and order were correct. The composer offered only Emoji and Send, with no reply, upload or file controls.
12. The run unlinked only its own Inspector companion. Normal teardown released the slot; both slots and all slot ports were free afterwards.

The native recorder captured 715 of 715 frames through `capturePage` at 2 fps, with none skipped and none pending. `console-inspector-number-scope-exchange.mp4` places the Console (left) and the native Inspector view (right) side by side, aligned by wall clock (`timeline.json`), without cuts: H.264, 2122x720, 304.0 s, 4,396,947 bytes, SHA-256 `826af49c8f6fe9befde66b307fc8967e9a8964fb69f8a2aaba114035d18ade68`.

## Limits and observations

- One native run passed. It shows first-run pairing with the PR 780 fix, not stress resistance or every QuickLink, tunnel or ZK custody mode.
- The 390 px segment is letterboxed inside the desktop-sized recording. Dark theme was checked at 390 px and desktop; Portuguese and reduced motion were not exercised in this run.
- Reopening the picker kept the previous search text, so it reopened directly into the no-match state until cleared.
- After Back/Forward and a viewport change, one tool snapshot lacked the Contacts, Chats and Storage sidebar items, while recorded frames from the same moment show them. Analytics also showed a hover-style highlight, probably from the automation pointer. This was not reproduced or diagnosed; the Number picker change does not touch the sidebar.
- During the sign-in redirect the browser logged nine resource 404s without captured URLs; they did not recur on Chats or after reloads. The support widget logged a framing CSP error on local Console pages. No hydration error was logged.
- Opening the Support conversation did not clear its unread badge; unread-on-open behavior is unchanged in this cycle.
- All phone numbers, LIDs, names, team and support code shown are synthetic values from a local stack that has been torn down.
