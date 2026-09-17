# @polymorfa/react

React bindings for the framework-neutral controllers in `@polymorfa/browser`.

```tsx
import { MessageList, PolymorfaProvider } from "@polymorfa/react";

<PolymorfaProvider appearance={{ theme: "dark" }}>
  <MessageList controller={conversationController} />
</PolymorfaProvider>;
```

`MessageList`, `ComposeBox`, `ChatDrawer`, `TemplateBuilder`, and
`CallSurface` subscribe with `useSyncExternalStore`. Controllers may be passed
directly or created through a component factory; only factory-created
controllers are disposed by the binding. `useController` and
`useResolvedController` support custom rendering without forking state logic.

The chat and template components add the shared `@polymorfa/ui` stylesheet
to the document on mount and use `pmfa-*` class names, so a host stylesheet
can adjust them. Visible text comes from the provider's locale.

## Chat

`ChatDrawer` shows a conversation with its composer. Pass
`composerController` (or `createComposerController`) to render the built-in
`ComposeBox`; each message then offers Reply, which sets the composer's
reply target. Use `createConversationComposerActions()` from
`@polymorfa/browser` so the composer sends through the same conversation the
drawer shows.

```tsx
import {
  ConversationController,
  MessageComposerController,
  createConversationComposerActions,
} from "@polymorfa/browser";
import { ChatDrawer } from "@polymorfa/react";

const conversation = new ConversationController(source);
const composer = new MessageComposerController(
  createConversationComposerActions(conversation, uploadFile),
);

<ChatDrawer
  open={open}
  onClose={() => setOpen(false)}
  conversation={conversation}
  composerController={composer}
  title="Casey Rivera"
/>;
```

`uploadFile(attachment, onProgress, signal)` reads `attachment.file` and
resolves with a `MessageAttachment`; set its `url` (and `previewUrl` for
images) so the message list can show it.

- **Messages.** `MessageList` groups consecutive messages by side, adds
  "Today", "Yesterday", or a localized date between days, and shows a
  pending, sent, or failed icon on outbound messages. Images render as lazy
  thumbnails; other files render as a card with name, size, and a link when
  `url` is set. Only `https:`, `http:`, and `blob:` URLs become links or
  images; any other scheme renders the card without one. A reply shows the quoted message, and selecting the quote
  scrolls to and focuses it. Failed outbound messages offer Retry, which
  calls `controller.retry(clientId)`. Pass `onReply` to offer Reply on every
  message.
- **Composer.** `ComposeBox` attaches files from the paperclip button, a
  paste, or a drop onto the composer. Pending files show upload progress,
  a failed state, and a remove button. A rejected file, such as one over the
  size limit, shows as the composer error. When a reply target is set, a
  banner shows the quoted text (pass `conversation` or `messages` to resolve
  it) with a cancel button. `accept` and `multiple` (default `true`) apply to
  the file picker. Enter sends; Shift+Enter adds a line.
- **Drawer.** The drawer is a non-modal dialog labelled by its title. When
  `open` changes to `true`, it focuses the message field (or the close
  button); closing it returns focus to the element that had it. A drawer
  that mounts open leaves focus alone unless you pass `autoFocus`. Escape
  pressed inside the drawer calls `onClose`, except while an input method is
  composing text. A `composer`
  node replaces the built-in composer, and `conversation` is an alias of
  `controller`.
- **Custom rendering.** `renderMessage(message)` replaces a bubble's
  content, and `renderAttachment(attachment, message)` replaces one
  attachment.

## Styling

Every chat and template component takes `className` for its root and
`classNames` for its inner slots. Each slotted node also carries
`data-slot`, and `appearance.elements[slot]` applies a class and inline
styles from the provider:

```tsx
<PolymorfaProvider
  appearance={{
    theme: "system",
    variables: { colorPrimary: "#0f766e" },
    darkVariables: { colorPrimary: "#14b8a6" },
    elements: { bubble: { styles: { borderRadius: "6px" } } },
  }}
>
  <MessageList
    controller={conversation}
    classNames={{ messageList: "my-log", dateSeparator: "my-date" }}
  />
</PolymorfaProvider>
```

The bundled rules sit in `@layer polymorfa`, so unlayered app CSS overrides
them. `appearance.unstyled` stops the chat, template, and call components
from adding their stylesheets. See the
[`@polymorfa/ui` styling reference](../ui/README.md#styling) for the variable
list, dark colors, and every slot name.

`TemplateBuilder` edits canonical headers, bodies, footers, button labels,
carousel card bodies, and variable examples. It keeps “Save draft” and “Submit
to Meta” as separate actions and renders structured previews. Use
`renderPreview` to replace the preview region without replacing controller
state.

## Calls

`CallSurface` is the whole call experience: the incoming card while a call
rings, the stage and control dock during the call, and a ↗ button that pops
the call into its own resizable window. `IncomingCallCard`, `CallStage`,
`CallControls`, and `DialPad` compose individually. All of them render from a
`CallsController` and follow the provider's appearance and locale.

```tsx
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { CallSurface, DialPad, PolymorfaProvider } from "@polymorfa/react";

// Create once in the browser; call dispose() on application teardown.
const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
});
await calls.connect();

<PolymorfaProvider>
  <CallSurface controller={calls.controller} resolveName={lookupContactName} />
  <DialPad controller={calls.controller} />
</PolymorfaProvider>;
```

The client token needs `voip_place`, `voip_answer` and `voip_signal`. Browser
mode auto-answers remotely; Answer attaches local WebRTC media and Reject
ends the call. `calls.controller.call` is the shared `Call` model. See the
[browser package](../browser/README.md#calls) for lifecycle ownership and limits.

The incoming card mirrors the official desktop call window: name, "WhatsApp
audio/video call" subtitle, avatar or a mirrored self-preview with camera and
mute toggles and a ⋯ device menu, then Reject and Answer. Answering a video
offer with the camera off still acquires video muted, so the in-call camera
toggle can enable it. The dock carries split pills — `[camera|⌄]` and
`[mic|⌄]` whose dropdowns pick devices live — and a red hang-up pill. Video is
per direction; on an audio call the camera button upgrades to video
(`controller.enableVideo()`, a re-offer on the same connection) and
`disableVideo` hides it. A dropped connection shows "Reconnecting…" while the
controller restarts ICE, and gives up as `connection_failed` after the
resumption window. Avatars come from
`resolveAvatar` (a URL or a promise of one; `BrowserMessagingClient.contacts
.picture` works when the token carries `read_contact`); without one a stable
hash of the caller id picks one of eight palette tones.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds.
