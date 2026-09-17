# @polymorfa/elements

Framework-neutral Web Components for chat and composing, template
building, and calls. Applications own controllers and data transports; elements
render their immutable snapshots.

```ts
import { definePolymorfaElements } from "@polymorfa/elements";

definePolymorfaElements();
```

The registered elements are `pmfa-message-list`,
`pmfa-compose-box`, `pmfa-chat-drawer`, `pmfa-template-builder`, and
`pmfa-call`. Assign a matching `@polymorfa/browser` controller through the
element's `controller` property. Appearance and locale configuration uses the
`configuration` property.

Every element uses an open shadow root, stable CSS parts, keyboard-native
controls, live-region status, direction propagation, and controller unbinding
when disconnected. Vue, Svelte and other frameworks can use the elements
without a React runtime.

Chat and template elements render the same `pmfa-*` classes and stylesheet
as the React components, including the `light`, `dark`, and `system` themes.

## Chat

```ts
import {
  ConversationController,
  MessageComposerController,
  createConversationComposerActions,
} from "@polymorfa/browser";
import type { PolymorfaChatDrawerElement } from "@polymorfa/elements";

const conversation = new ConversationController(source);
const composer = new MessageComposerController(
  createConversationComposerActions(conversation, uploadFile),
);
const drawer =
  document.querySelector<PolymorfaChatDrawerElement>("pmfa-chat-drawer")!;
drawer.controller = conversation;
drawer.composerController = composer;
drawer.addEventListener("pmfa-close", () => drawer.remove());
```

- `pmfa-message-list` and `pmfa-chat-drawer` show attachments (lazy image
  thumbnails and file cards), reply quotes that scroll to the quoted
  message, date separators, grouped messages, and delivery status icons.
  Failed outbound messages offer Retry.
- Reply appears when the element has the `replyable` attribute, an `onReply`
  handler, or (for the drawer) a `composerController`. Each click dispatches
  a composed `pmfa-reply` event whose `detail` is the message.
- `pmfa-chat-drawer` renders a built-in composer when `composerController` is
  set, and Reply sets that composer's reply target. Slotted children still
  render in the footer, so a `pmfa-compose-box` placed inside works as
  before. Set the title with the `heading` attribute. The drawer is a
  non-modal dialog. When `open` changes to `true`, it focuses the message
  field (or its close button); when it closes, focus returns to `opener` or
  to the element that had it. A drawer that is already open when it connects
  leaves focus alone unless it has the `autofocus` attribute. Escape closes
  the drawer only when pressed inside it, and not while an input method is
  composing text.
- `pmfa-compose-box` attaches files from its paperclip button, a paste, or a
  drop, shows upload progress and failures with a remove button, and shows a
  reply banner. Set its `conversation` or `messages` property so the banner
  can quote the message. The `accept` and `multiple` attributes apply to the
  file picker (`multiple="false"` allows one file at a time).
- The composer toolbar matches the React `ComposeBox`: emoji picker,
  attach button, message field, and a microphone that turns into the send
  button once there is something to send. `emoji="false"` hides the emoji
  button, `voice-notes="false"` hides the microphone (it only shows where
  `MediaRecorder` and `getUserMedia` exist), `voice-note-auto-send="false"`
  keeps a finished recording in the composer, `placeholder` replaces the
  placeholder, and `max-rows` (default 8) limits how tall the field grows.
- Put your own buttons in the toolbar with `slot="start-actions"` and
  `slot="end-actions"`.
- Set the `quickReplies` property to offer `/` quick replies. Choosing one
  replaces the `/word` and dispatches a composed `pmfa-quick-reply` event
  whose `detail` is the option. `pmfa-chat-drawer` accepts the same
  attributes and `quickReplies` for its built-in composer.

```html
<pmfa-compose-box placeholder="Reply to Casey" voice-notes="false">
  <button slot="end-actions" type="button">Templates</button>
</pmfa-compose-box>
```

Messages whose object is unchanged keep their DOM nodes across updates, and
the composer keeps its textarea, so focus, scroll position, and the live
region stay put while the conversation changes.

## Styling

Every chat and template node carries a stable `part` name for `::part()`,
and `appearance.elements[slot]` applies a class and inline styles to it.
Existing part names still apply; the new names are added next to them.

```css
pmfa-message-list::part(bubble) {
  border-radius: 6px;
}
pmfa-chat-drawer::part(composer-send) {
  background: #0f766e;
}
```

The default stylesheet is one constructable `CSSStyleSheet` shared by every
element (a `<style>` element where `adoptedStyleSheets` is unavailable), and
its rules sit in `@layer polymorfa`. `configuration.stylesheet` adds your own
CSS text or `CSSStyleSheet` objects inside the shadow root after it.
`appearance.unstyled` drops the default stylesheet and keeps only yours:

```ts
element.configuration = {
  appearance: { unstyled: true },
  stylesheet: myChatSheet,
};
```

`darkVariables` sets dark-theme colors. See the
[`@polymorfa/ui` styling reference](../ui/README.md#styling) for the variable
list and every slot and part name.

`pmfa-template-builder` uses the same canonical template controller as the
React binding. Its open shadow root exposes stable parts for the editor,
validation messages, preview buttons/cards, save action, preview action, and
Meta submission action. The Preview button is `preview`, and the preview area
is `preview-panel`. Validation messages keep their nodes while they still
apply, so a screen reader announces each one once.

## Calls

Create a browser calls component and assign its existing controller to `pmfa-call`:

```ts
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { PolymorfaCallElement } from "@polymorfa/elements";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
});
await calls.connect();
const element = document.querySelector<PolymorfaCallElement>("pmfa-call");
if (element) element.controller = calls.controller;
// Call await calls.dispose() when the application releases this widget.
```

The token needs `voip_place`, `voip_answer` and `voip_signal`. See the
[browser package](../browser/README.md#calls) for answer-mode behavior,
media ownership and participant limits. The element keeps its existing layout,
controls, appearance and accessibility behavior.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds.
