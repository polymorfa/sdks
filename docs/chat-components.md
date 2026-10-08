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
otherwise use **Latest messages**. The inline composer places the writing area
above emoji, attachment and send controls. Quoted replies
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

Image attachments display a preview. Audio and video use native browser controls,
with `preload="none"`; they do not autoplay. Other files show their name and size.
Without a safe URL, attachments remain metadata. Only absolute HTTP, HTTPS and
blob URLs reach links or players; unsafe schemes are rejected. Your host controls
media authorization, expiry, content security policy and retention.

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

Use appearance variables, `classNames`, or Web Component `::part()` overrides.
The new inline slots are `chatWindow`, `chatHeader`, `chatFooter`; `latestButton`
styles the return-to-bottom control. Receipt labels and all controls use the
host's locale dictionary. Read and played states use a semantic receipt color.
Reduced-motion preferences govern quote navigation and animation.
