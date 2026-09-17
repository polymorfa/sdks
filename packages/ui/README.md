# `@polymorfa/ui`

Shared appearance, localization, and safe diagnostic contracts for Polymorfa browser components.

```ts
import { createLocale, defineAppearance } from "@polymorfa/ui";

const appearance = defineAppearance({
  variables: { colorPrimary: "#7c3aed" },
  layout: { density: "compact" },
});

const locale = createLocale("ar-LB", { "common.cancel": "إلغاء" });
```

The appearance object is immutable and shared by the Web Component, React, and development-tool packages. CSS variable names use the stable `--pmfa-*` prefix. Partial locale dictionaries fall back to the bundled English messages.

`redactDiagnostic()` recursively removes credentials, authorization values, secrets, and message bodies before diagnostic data is displayed or copied.

## Styling

The chat and template components in `@polymorfa/react` and
`@polymorfa/elements` share one stylesheet, `COMPONENT_STYLES`. You can
restyle them at five levels, from lightest to fullest control.

### Variables

`appearance.variables` become CSS custom properties on each component root:

| Variable                                        | CSS property                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `colorPrimary`                                  | `--pmfa-color-primary`                                                  |
| `colorBackground`                               | `--pmfa-color-background`                                               |
| `colorForeground`                               | `--pmfa-color-foreground`                                               |
| `colorMuted`                                    | `--pmfa-color-muted`                                                    |
| `colorBorder`                                   | `--pmfa-color-border`                                                   |
| `colorDanger`                                   | `--pmfa-color-danger`                                                   |
| `colorSuccess`                                  | `--pmfa-color-success`                                                  |
| `fontFamily`                                    | `--pmfa-font-family`                                                    |
| `fontSizeBase`                                  | `--pmfa-font-size-base`                                                 |
| `spacingSmall`, `spacingMedium`, `spacingLarge` | `--pmfa-spacing-small`, `--pmfa-spacing-medium`, `--pmfa-spacing-large` |
| `radiusSmall`, `radiusMedium`, `radiusLarge`    | `--pmfa-radius-small`, `--pmfa-radius-medium`, `--pmfa-radius-large`    |
| `shadowPanel`                                   | `--pmfa-shadow-panel`                                                   |
| `motion`                                        | `--pmfa-motion`                                                         |

`layout.drawerWidth` sets `--pmfa-drawer-width`.

### Dark colors

`theme: "dark"` uses the dark palette; `theme: "system"` uses it when the
system prefers dark. `darkVariables` overrides its colors one by one and is
emitted as `--pmfa-dark-color-*` (for example `--pmfa-dark-color-primary`).
Only color keys apply. Unset dark colors use the built-in dark palette, except
`colorPrimary`, which falls back to your light primary.

```ts
defineAppearance({
  theme: "system",
  variables: { colorPrimary: "#0f766e" },
  darkVariables: { colorPrimary: "#14b8a6", colorBackground: "#0b1716" },
});
```

### Cascade layer

Every bundled rule sits in `@layer polymorfa`. Any unlayered CSS in your app
overrides it, whatever its specificity:

```css
.pmfa-bubble {
  border-radius: 6px;
}
```

### Unstyled mode

`unstyled: true` skips the bundled stylesheet: React does not add it to the
document, and Web Components do not adopt it. Components still render their
`pmfa-*` classes, `data-slot` attributes (React), and `part` names (Web
Components), so you can style them from scratch.

React adds the bundled stylesheet to the document once, the first time a
styled component mounts, and it stays there. Its `pmfa-*` rules then also
match unstyled React components on the same page. Keep `unstyled: true` for
every React component on a page (or style the unstyled ones with unlayered
CSS, which overrides the bundled `@layer polymorfa` rules). Web Components
keep styles inside each shadow root, so they are not affected.

### Slots

Every structural node has a slot name. `appearance.elements[slot]` accepts a
`className` and inline `styles` (camelCase, kebab-case, or `--custom`
properties) for that node. React components also take a `classNames` prop
keyed by slot and set `data-slot` on each node. Web Components add the
kebab-case slot name to the node's `part` attribute.

| Slot              | `part`             | Node                                 |
| ----------------- | ------------------ | ------------------------------------ |
| `messageList`     | `message-list`     | Scrolling message log (`role="log"`) |
| `message`         | `message`          | One message row                      |
| `bubble`          | `bubble`           | Message bubble                       |
| `messageMeta`     | `message-meta`     | Time and delivery status             |
| `messageActions`  | `message-actions`  | Reply and Retry group                |
| `replyButton`     | `reply-button`     | Reply action                         |
| `retryButton`     | `retry-button`     | Retry action on a failed message     |
| `attachment`      | `attachment`       | Image thumbnail or file card         |
| `replyQuote`      | `reply-quote`      | Quoted message above a reply         |
| `dateSeparator`   | `date-separator`   | "Today", "Yesterday", or a date      |
| `loadMore`        | `load-more`        | Load earlier messages button         |
| `empty`           | `empty`            | Empty-conversation text              |
| `composer`        | `composer`         | Composer form                        |
| `composerInput`   | `composer-input`   | Message textarea                     |
| `composerSend`    | `composer-send`    | Send button                          |
| `composerAttach`  | `composer-attach`  | Attach button                        |
| `composerToolbar` | `composer-toolbar` | Composer button and field row        |
| `emojiButton`     | `emoji-button`     | Emoji picker button                  |
| `emojiPicker`     | `emoji-picker`     | Emoji picker popover                 |
| `voiceButton`     | `voice-button`     | Record voice note button             |
| `recordingBar`    | `recording-bar`    | Voice note recording bar             |
| `quickReplyMenu`  | `quick-reply-menu` | "/" quick reply list                 |
| `attachmentChip`  | `attachment-chip`  | Pending attachment                   |
| `replyBanner`     | `reply-banner`     | "Replying to …" banner               |
| `drawer`          | `drawer`           | Drawer panel                         |
| `drawerHeader`    | `drawer-header`    | Drawer header                        |
| `drawerTitle`     | `drawer-title`     | Drawer title                         |
| `drawerClose`     | `drawer-close`     | Drawer close button                  |
| `templateBuilder` | `template-builder` | Template builder panel               |
| `field`           | `field`            | Labelled field or field group        |
| `label`           | `label`            | Field label                          |
| `input`           | `input`            | Template input or textarea           |
| `actions`         | `actions`          | Template action row                  |
| `primaryButton`   | `primary-button`   | Save draft                           |
| `button`          | `button`           | Preview and Submit to Meta           |
| `preview`         | `preview-panel`    | Template preview area                |
| `error`           | `error`            | Error message                        |

`COMPONENT_SLOTS` lists them, and `slotPartName()` converts a slot to its
part name (`preview` maps to `preview-panel`, because the
Preview button already uses `preview`). Web Components keep their earlier part names as well, such as
`meta`, `input`, `send`, `header`, `title`, and `close`.

### Composer helpers

The React and Web Component composers share these exports, which you can
use in a custom composer:

- `QuickReplyOption`, `findQuickReplyQuery()`, `filterQuickReplies()`, and
  `applyQuickReply()` for "/" quick replies.
- `insertText()` inserts at a caret or over a selection.
- `emojiList()`, `emojiInCategory()`, `searchEmoji()`, `readRecentEmoji()`,
  and `recordRecentEmoji()` expose the built-in set of about 430 emoji with
  English names and keywords. It lives in its own module, so bundlers drop
  it when nothing imports it.
- `placePopover()` positions a fixed popover beside an anchor inside the
  viewport, and `formatElapsed()` formats a recording time as `mm:ss`.

### Web Component stylesheets

Style Web Components from the page with `::part()`:

```css
pmfa-message-list::part(bubble) {
  border-radius: 6px;
}
pmfa-chat-drawer::part(drawer-header) {
  background: #0f766e;
  color: white;
}
```

For rules that `::part()` cannot express, such as descendants or states,
pass `configuration.stylesheet`. It takes CSS text, a `CSSStyleSheet`, or an
array of either, and is adopted inside the shadow root after the default
stylesheet:

```ts
element.configuration = {
  appearance: { theme: "dark" },
  stylesheet: `.pmfa-msg-out .pmfa-bubble { border-end-end-radius: 18px; }`,
};
```
