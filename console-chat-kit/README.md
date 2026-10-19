# Chat kit evidence for polymorfa/sdks#357

Every person, phone number, message, team and identifier here is synthetic test data.

## Live regional chat (`live-*`)

A local development stack with two simulated test numbers. The Polymorfa Console
Chats page renders the conversation with `@polymorfa/react`, `@polymorfa/browser`
and `@polymorfa/ui`, installed from packed tarballs built from this branch. The
other test number was paired in a desktop WhatsApp client.

- Customer messages reached the Console. A Console reply was decrypted as an
  incoming message on the paired client, and that client's reply was delivered
  back and shown in the Console.
- The video opens on a reloaded page, so the thread starts by showing messages
  the Console sent before the reload as "Message content was not retained". The
  stored history keeps no text for the number's own sends. The reply sent in the
  video keeps its text through the later list refreshes.
- Cropped to the chat area. Six seconds of waiting (18s to 24s) were cut because
  a sign-in notice from the test script covered the thread.
- "Developer details" is a Console-only extension passed as `ChatDetails` children.
  The SDK's own details panel shows customer fields only.
- These recordings show the desktop client side as test assertions, not video;
  that client's window could not be captured.

Revisions: SDK `a3b94ef` (packed as 0.1.0-dev.0; the later `38b7cde` changes only
the missing-content label color), Console consumer `173b2e3`.

## Synthetic fixture (`fixture-*`)

Static synthetic data with mocked transport, rendered by the same components at
SDK `f792943`. They show the order cart, filters, keyboard focus, phone width,
dark theme and Portuguese strings. They are not a message flow.
