# Chat components

Use `@polymorfa/browser` for conversation state, `@polymorfa/react` or
`@polymorfa/elements` for rendering, and `@polymorfa/ui` for appearance and
localization. These components do not grant access to WhatsApp or retained history.
Your data source supplies authorized history, events, media URLs and sending.

## Inline React window

```tsx
import {
  ConversationController,
  MessageComposerController,
  createConversationComposerActions,
} from "@polymorfa/browser";
import { ChatWindow, PolymorfaProvider } from "@polymorfa/react";

// source implements ConversationDataSource; upload implements ComposerActions.upload.
const conversation = new ConversationController(source);
const composer = new MessageComposerController(
  createConversationComposerActions(conversation, upload),
);
await conversation.load();

<PolymorfaProvider
  appearance={{
    variables: {
      colorPrimary: "#171717",
      fontFamily: "Geist, ui-sans-serif, sans-serif",
    },
  }}
>
  <div style={{ height: "min(720px, 80dvh)" }}>
    <ChatWindow
      controller={conversation}
      composerController={composer}
      header={<h2>Customer support</h2>}
      disabled={!canSend}
      composerProps={{ attachments: canUpload, voiceNotes: canUpload }}
    />
  </div>
</PolymorfaProvider>;
```

Create controllers once per conversation, outside render or through the existing
controller factory props. Dispose them when the owning conversation is removed.
`disabled` prevents built-in composer and Reply actions; the backend still
checks authorization on every request. Omit `composerController` for history only.

The header and composer stay visible while history scrolls. Loading earlier
messages preserves the visible message position. New messages stay in view when
you are already at the bottom, including when the viewport or composer resizes;
otherwise use **Latest messages**. The inline composer keeps emoji, attachments, the growing message field and
mic/send controls in one row. Timestamps and observed receipt ticks sit inside
message bubbles. Quoted replies
navigate to a loaded original. Missing history is not fetched implicitly by a quote.

`messageFilter` affects presentation only. It never reloads the conversation,
removes messages from state, changes subscriptions, or cancels an in-flight send:

```tsx
<ChatWindow
  controller={conversation}
  messageFilter={(message) =>
    message.direction === "inbound" &&
    message.text.toLowerCase().includes(query.toLowerCase())
  }
/>
```

`MessageList`, `ComposeBox`, and `ChatDrawer` remain available independently.
`messageFilter` also applies to `MessageList` and `ChatDrawer`.

## Controlled conversation list

Use `ConversationListView` when your application owns the list's authorized
regional source. `ConversationList` remains the `InboxController` wrapper.

```tsx
import { ConversationListView, PolymorfaProvider } from "@polymorfa/react";

<PolymorfaProvider>
  <ConversationListView
    conversations={observedRows}
    selectedId={selectedId}
    onSelect={(row) => setSelectedId(row.id)}
    drafts={draftPreviews}
    actions={(row) => [row.archived ? "unarchive" : "archive"]}
    onAction={applyWhatsAppAction}
  />
</PolymorfaProvider>;
```

The host supplies `observedRows`, draft text, selection and `applyWhatsAppAction`.
Subscribe to your composer controllers for draft previews. **All**, **Unread**,
**Drafts** and **Archived** filter the supplied rows. Search matches names,
identifiers, scope labels, previews and drafts. Pinned rows sort first. Arrow
keys, Home and End move row focus; Enter or Space opens a row.

Supply observed `pinned`, `archived`, `markedUnread` and `unreadCount` values.
They are never inferred from message delivery or read receipts. Optional
`lastMessage.status` and `lastMessage.receipt` display outgoing acknowledgement
ticks; unknown state displays no tick. `subtitle` identifies the owning Number
or another short scope. These fields do not change the server wire contract.

Both `actions` and `onAction` are required to show mutation controls. `actions`
returns only the transitions your source supports and authorizes. Available UI
values are `pin`, `unpin`, `archive`, `unarchive`, `mark-read` and `mark-unread`;
these names do not imply a default API endpoint or grant. The callback awaits the
Number's mutation and refreshes observed rows. The component does not update
state optimistically or equate opening a row with a WhatsApp read. Rejected
callbacks display an error and keep the supplied row state. The host enforces
membership, Number/destination scope, transport capability and concurrent writes.

Pass `onNewConversation` to offer **New chat**. Supply controlled `query` and
`onQueryChange` to integrate application search. Pagination, retry and loading
props remain available without introducing a second data source.

`pmfa-inbox` has source-driven search, unread/archive filters, keyboard navigation
and receipt-aware compact rows. The controlled list, draft previews and action
callbacks described above are React APIs; Web Components do not expose those
controlled-list adapters.

## Web Components

```ts
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "@polymorfa/elements";

defineChatElements();
const chatWindow = document.createElement(
  "pmfa-chat-window",
) as PolymorfaChatWindowElement;
chatWindow.setAttribute("heading", "Customer support");
chatWindow.style.height = "min(720px, 80dvh)";
chatWindow.controller = conversation;
// Assign only after the host has confirmed sending is available.
chatWindow.composerController = composer;
chatWindow.messageFilter = (message) => message.direction === "inbound";
container.append(chatWindow);
```

`pmfa-chat-window` uses the existing drawer's composer, reply events, configuration
and quick-reply properties in an inline region. It has no close action and does
not capture Escape. Omit its composer for read-only history. It shares receipt,
media, grouping and scroll behavior with `pmfa-message-list` and `pmfa-chat-drawer`.

## Receipts and media

Transport state (`pending`, `sent`, `failed`) is separate from observed receipts.
A successful send means an acknowledged send, not recipient delivery or reading.
Supply `receipt.state` (`delivered`, `read`, `played`) or observed epoch-millisecond
receipt timestamps. Missing receipts remain **Sent**. Failures and pending sends
take precedence. Incoming messages do not show an outgoing acknowledgement.

```ts
const observed = {
  id: "message-1",
  text: "Your order is ready",
  createdAt: Date.now(),
  direction: "outbound",
  status: "sent",
  receipt: { state: "read", readAt: observedReadTime },
};
```

Image attachments display a preview. Audio uses the built-in player: a play
button, a seekable track, elapsed and total time, and a speed control for voice
notes. Video uses native browser controls. Players use `preload="none"` and never
autoplay, so nothing downloads until someone presses play. Documents show a
type badge, the file name and their details, such as `PDF · 12 pages · 2.4 MB`.

Without a safe URL, an attachment remains metadata: audio shows a disabled
player, and images and video show a placeholder with the file name. Only
absolute HTTP, HTTPS and blob URLs reach links or players; unsafe schemes are
rejected. Your host controls media authorization, expiry, content security
policy and retention.

Attachments accept optional presentation hints. The components never infer
them: without `durationSeconds` no length is shown, and without `waveform` the
player draws a plain track.

| Field             | Effect                                                           |
| ----------------- | ---------------------------------------------------------------- |
| `voice`           | Draws an audio attachment as a voice note, with a speed control. |
| `durationSeconds` | Shows the length before playback and on video placeholders.      |
| `waveform`        | Observed levels from 0 to 1, resampled to the player's bars.     |
| `pageCount`       | Adds the page count to a document's details.                     |

`@polymorfa/store` sets `voice` from the `ptt` flag on message events.

### Thumbnails, HD and link previews

| Field                      | Effect                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `width`, `height`          | Keeps a picture or video's proportions, between 0.71:1 and 4:1, before it loads.                                                                             |
| `thumbnail`                | An embedded JPEG (`contentType: "image/jpeg"`, base64 `data`), shown blurred until the file loads and used as a video poster or document first-page preview. |
| `hd`                       | The HD upload of the same picture or video (`url`, `size`, `width`, `height`).                                                                               |
| `quality`                  | `hd` when the attachment itself is the HD upload; it then shows an HD badge.                                                                                 |
| `linkPreview` (on message) | `url`, `title`, `description` and `thumbnail`; renders a card above the text.                                                                                |

An `hd` variant never loads on its own. The **HD** control loads it, then
replaces the standard picture in place; pressing it again switches back to
standard without reloading. Videos switch source when pressed. Only base64
JPEG data within 32 KiB becomes a thumbnail, and only HTTP and HTTPS links
become preview cards. Allow `img-src data:` in your content security policy to
show thumbnails.

`@polymorfa/store` reads `width`, `height`, `seconds`, `waveform`, `pageCount`,
`thumbnail`, `quality` and `linkPreview` from message events. It creates media
attachments before a download URL exists, so thumbnails show immediately. An
event with `association: { type: "hd_image" | "hd_video", parentMessageId }` is
the HD upload of another message: the store hides it and shows it as that
message's `hd` variant, whichever arrives first. An HD upload whose standard
message has not arrived stays hidden until it does. HD uploads do not add to
the unread count or replace the conversation preview.

## Compose media

`ComposeBox` and the composer inside `ChatWindow` accept images, video, audio
and documents through your `ComposerActions.upload` adapter. The adapter receives
the picked bytes, upload progress callback and abort signal. Return an authorized
`MessageAttachment`; your send adapter receives its metadata alongside text and
reply context. The components never upload to a default service.

```tsx
<ChatWindow
  controller={conversation}
  composerController={composer}
  composerProps={{
    attachments: true,
    attachmentKinds: ["image", "video", "audio", "document"],
    voiceNotes: true,
    voiceNoteAutoSend: false,
  }}
/>
```

The named picker offers Photos, Videos, Audio and Documents. Omit
`attachmentKinds` to retain the single file picker controlled by `accept`.
These choices are file-picker hints, not upload validation or permissions.
Your upload and send adapters enforce formats, sizes, authorization and transport
capabilities. Disable `attachments` and `voiceNotes` when uploading is unavailable.

Web Components use the same picker:

```ts
chatWindow.setAttribute("attachment-kinds", "image video audio document");
chatWindow.setAttribute("voice-note-auto-send", "false");
```

Picked images show a thumbnail. Ready audio and video have playback controls;
voice notes with auto-send disabled remain in the draft for review. Files can
also be dropped or pasted. Remove an attachment to cancel its upload. Upload
failure prevents sending; send failure preserves the ready files, caption and
reply for retry. Only safe attachment URLs reach previews and players.

Keep each conversation's composer controller while switching views if you want
to preserve its media draft and retry identity. Dispose it when the owning inbox
closes or authorization changes. Your host owns uploaded-object cleanup, URL
expiry and regional storage; components do not infer a storage policy.

### Drag and drop and send quality

Files dropped anywhere on `ChatWindow`, `<pmfa-chat-window>` or
`<pmfa-chat-drawer>` attach through the composer, with the same upload adapter,
accepted types and rejection messages as the attach button. A disabled window
or a composer without attachments ignores drops.

Each attached picture has an **HD** toggle. Pictures start in standard quality;
set `defaultMediaQuality: "hd"` on `MessageComposerController` to start in HD,
or call `setAttachmentQuality(id, quality)`. A draft attachment carries
`quality: "hd"` only when HD is chosen. Your send adapter decides how to deliver
it; the Polymorfa Messaging API sends a standard picture first, then the HD
upload.

## Failed sends

`ConversationController.send()` and `retry()` resolve to the resulting message,
including `status: "failed"` on transport failure. They continue recording the
failure in conversation state. `createConversationComposerActions()` turns a
failed result into a composer error, preserving text, attachments and reply
context. Resubmitting an unchanged draft retries the same client operation ID;
edited content creates a new operation. Your backend must use that ID for
idempotency and reconcile uncertain outcomes before accepting another effect.
The built-in handler inbox source sends that client operation ID as the
messaging idempotency key on every attempt, including token-refresh retries.

Retry accepts an optional abort signal. Disposal cancels owned requests; stale
history completions cannot overwrite newer history. Controllers never supply
server credentials or add a global content proxy.

## Styling and localization

The default theme follows familiar messaging ergonomics: a tail on the first
bubble of each run, 2px between messages from the same side and 12px when the
side changes, and the time and receipt sharing the last line of text. Hover
actions float beside the bubble, so showing them never reflows the thread.
Touch screens always show them, and row menus in the conversation list.

Use appearance variables, the chat variables listed in the `@polymorfa/ui`
README, `classNames`, or Web Component `::part()` overrides.
The new inline slots are `chatWindow`, `chatHeader`, `chatFooter`; `latestButton`
styles the return-to-bottom control. Receipt labels and all controls use the
host's locale dictionary. Read and played states use a semantic receipt color.
Reduced-motion preferences govern quote navigation and animation.
