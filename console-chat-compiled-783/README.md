# Compiled Console chat acceptance with SDK 783bbe7 packs

On 2026-10-19 a compiled local Console (`next build --webpack`, then `next start`) sent a message through the SDK chat kit to a simulated WhatsApp client. Inspector decrypted it and replied, and two hard reloads kept every message and the counterpart's name. The run used synthetic test Numbers on a local isolated stack, so it is not evidence of a hosted deployment, registry publication or delivery over the real WhatsApp network.

## Exact revisions

| Input | Revision or hash |
| --- | --- |
| Console PR 774 | `0fbfc764a70b1d7d83588241443e5a1d67212894` |
| Backend PR 776 | `5f289706e2822de392b196969c58952271f44958` |
| Local verification merge (not pushed) | `db9b2bfdda5bd7b2e3348948cec30b9c2744ec5f` |
| SDK PR 357 source of the packs | `783bbe7f72a4de2fa9eee4d17338ac5af3a3b16f` |
| `@polymorfa/sdk` pack | `e79cbca32099a0b2abbfa774cf55188fd1c8c4f9f0fd98590bcec4382cb6b40e` |
| `@polymorfa/browser` pack | `c84b32b7d8fbd71aadb6ebcdbd34770ee67378bfb7fdd6b3cfb8a90cce1727d5` |
| `@polymorfa/ui` pack | `934baff2b17fa3f555a757e8c3f08a949514179b8f2e009ef0f7f1ccac7cad0a` |
| `@polymorfa/react` pack | `0fa8b6c0a73fe3711c403e0396e611cfb7fce0bfa015e1e1c7e939ee18902f76` |
| `@polymorfa/elements` pack (installed independently only; the Console does not import it) | `ba577089ce8d7a02b4a7aba2649cd790a4a3e8ba95f2eeac532f166a51cceb50` |

The packs are version `0.1.0-dev.0` and were installed through temporary root overrides. Afterwards the committed registry pin `0.1.0-dev.20261010020302` and the original lockfile were restored. The merge tree differs from the earlier integration `531144679fd1edc8f8db4e8b1246e86239b3f314` only in the generated i18n review report.

A temporary patch to the slot recipe (patch SHA-256 `97fa89ca3c2c1c00387e251e41bd717a7a102789bae881d725dac437a5b38c07`) replaced the Console's `next dev` with an awaited `next build --webpack` and a managed `next start` on the same assigned origin. `NODE_ENV=production` applied to the Console only, and `POLYMORFA_ENV=development` was kept. Authentication, origins and grants were unchanged. The recipe was restored to its original hash after teardown.

## Production server evidence

- The build log reports Next.js 16.3.8 (webpack) "Creating an optimized production build" and lists the routes.
- The process on the Console port was `next start --hostname 127.0.0.1 --port 20001`, and its listener was `next-server (v16.3.8)`. The environment held `NODE_ENV=production` and `POLYMORFA_ENV=development`.
- `/_next/webpack-hmr` returned 404, pages sent `X-Powered-By: Next.js`, and the browser loaded content-hashed `/_next/static/chunks/*` files. The DOM had no Next dev overlay (`nextjs-portal`).

## What passed

1. Real local OTP sign-in, Inspector device approval through the authenticated API, enrollment, regional settings, purpose acceptance, and capture grants on two synthetic test Numbers. Authentication screens and codes are excluded from all files.
2. The Console sent `Compiled console reply 783bbe7 (k7q2)` from the support Number. Inspector decrypted it as an incoming message.
3. Direct regional reads confirmed that the support Number's own copy kept the exact text. The chat summary kept `observedName` "Inspector customer" while the outbound message was latest, and it now included a phone.
4. Hard reload 1 showed the sent body (marked Sent), the name, and the phone the region reports (`+1 458 723 8412`) (`01`).
5. Inspector replied. The reply was delivered with ack 2 (`03`), captured by the region, and shown live in the Console.
6. Hard reload 2 kept all three messages, the name and the phone, with no unavailable labels (`04`). At 390 px there was no horizontal overflow (`05`).
7. The regional chat offered no reply or upload controls and no file input.
8. The run unlinked only its own Inspector companion. Teardown released the slot normally.

The native recorder captured 444 of 444 frames through `capturePage`, with none skipped and none pending. The video shows both ends of the same exchange, aligned by wall clock (`timeline.json`), without cuts. It is H.264, 1920x718, 91.5 s.

## Limits and observations

- Before the first send, the chat header showed the LID and no phone. This is the intended suppression of ordinary inbound LID phones, not a regression. The phone appeared only after the outbound observation, and no phone was invented.
- The first slot attempt failed before any Console step. The runner logged "session disconnected, reconnecting" and then `get qr channel: GetQRChannel must be called before connecting`, which left the first test Number's primary in `starting`. A second identical run passed. This intermittent runner pairing race is unrelated to the Console and is not fixed here.
- Right after sign-in, the browser console logged nine resource 404s during the redirect. Their URLs were not captured, and they did not recur on Chats, on either reload, or on a direct visit to the team page. On every Console page the support widget logged a framing CSP error, because the local origin is not one of its allowed frame ancestors. No React hydration error was logged.
- After each reload the number picker returned to its default Number and had to be reselected.
- The Console UI is in Portuguese because of the browser's saved locale.
- Reduced motion and dark theme were not exercised in this run.
