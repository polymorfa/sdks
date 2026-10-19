# Console and native client, one live exchange

Every person, phone number, message, team and identifier here is synthetic test data.

`console-inspector-exchange.mp4` shows one message exchange on a local development
stack, recorded from both ends at the same time:

- Left: the Polymorfa Console Chats page for the support test number. It renders the
  conversation with `@polymorfa/react`, `@polymorfa/browser` and `@polymorfa/ui`,
  installed from packed tarballs built from SDK `38b7cde` (packed as `0.1.0-dev.0`,
  not a registry release).
- Right: a desktop WhatsApp client paired to the customer test number, against
  simulated WhatsApp servers. Its frames are real window captures taken every 500 ms.

The two recordings are placed side by side by wall-clock time. The bottom bar shows
that time. Alignment is within about one second; `timeline.json` lists the capture
windows and each step's time. Nothing was cut from either recording.

## What the video shows

1. The customer's message is already in the Console. The name "Inspector customer"
   comes from the stored chat summary.
2. A message is typed in the Console and sent. The paired client receives it as an
   incoming message.
3. The Console page is hard-reloaded while that sent message is the latest one. The
   thread still shows the sent text, and the chat keeps the customer's name and phone.
4. The client replies. The reply is delivered (two ticks) and appears in the Console.
5. A second hard reload keeps all three messages and the name. The last seconds show
   the same thread at phone width (390 px), letterboxed in the recording.

The stills (`live-native-*`) are single frames from the same run.

## Limits

- The Console ran as a development server, so the Next.js dev indicator (the round
  "N" button) overlaps the send button. A production build of the same source was
  built separately; it was not used for this recording.
- The Console was in Portuguese because the browser prefers Portuguese.
- Before the first Console send, the thread header showed the customer's WhatsApp ID
  instead of the phone. The phone appeared once the stored chat recorded it. This is
  how the stored chat reports phones today; it is not a rendering change.
- Messages stored before this server version may still show "Message content was not
  retained". This run used fresh messages only.
- This is a local stack with simulated WhatsApp. It is not a hosted deployment, a
  published package or delivery over the real WhatsApp network.

Revisions: SDK `38b7cdef8795644e03eb864efe95875807bf45f5`; Console consumer
`355d7990416b74cc28342627c9ab8e19c66f17e1`; server change
`5f289706e2822de392b196969c58952271f44958`, combined in an unpublished local merge
`531144679fd1edc8f8db4e8b1246e86239b3f314` for this run.

The earlier `console-chat-kit/` folder is unchanged. Its video predates the server
change and did not capture the native client.
