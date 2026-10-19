# Chat rendering repairs: before and after (fixture transport)

Every message here is synthetic. Both pages use an in-memory data source, not the
Polymorfa API: `index.html`/`main.ts` render `pmfa-chat-window` (Web Components),
`react.html`/`react-main.tsx` render `ChatWindow` (React). Both share `fixture.ts`.
The bar above the Web Components chat belongs to the host page. Rendered in a real
Chromium tab.

- `before-*`: packages packed from SDK `38b7cdef8795644e03eb864efe95875807bf45f5`.
- `after-*`: packages packed from SDK `783bbe7f72a4de2fa9eee4d17338ac5af3a3b16f`
  (two commits on 38b). Packed as `0.1.0-dev.0`; not a registry release.

## Empty message bubble

An available message with empty text (12:07) rendered a 17 px bubble with its time
spilling 42 px past the bubble's start edge. After the fix the bubble is 80 px wide
and the time sits inside it, with no label added. The not retained, deleted and
unavailable labels are unchanged.

## Cart toggle after Show all

Pressing Enter on "Show all 23 items" adds three items above the toggle. Before, the
message list kept its scroll position and the focused toggle moved 284 px down (Web
Components: from y=416 to y=700, below the list's visible end at 701). After, the
list scrolls by the same 284 px, so the toggle stays at y=416 (React: y=383). Focus
and its ring stay on the toggle, the page does not scroll, and collapsing restores
the previous position.

Phone stills are 390 px wide, dark theme, Portuguese. The earlier
`console-chat-kit-native/` video on branch `evidence/console-chat-sdk-counterparts`
was recorded at `38b7cde` and does not include these changes.
