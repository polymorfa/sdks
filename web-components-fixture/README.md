# Web Components chat smoke (fixture transport)

Every message here is synthetic. The page uses an in-memory data source, not the
Polymorfa API. It is the SDK's `examples/vanilla-elements` sample extended with more
fixture messages; `index.html` and `main.ts` are the exact page. The bar above the
chat (search, type, direction, reply, language, theme) belongs to the host page and
drives public element properties. It is not SDK UI.

Packages: `@polymorfa/elements`, `@polymorfa/browser`, `@polymorfa/ui` and
`@polymorfa/sdk`, packed as `0.1.0-dev.0` from SDK
`38b7cdef8795644e03eb864efe95875807bf45f5` and installed as tarballs. Not a registry
release. Rendered in a real Chromium tab.

Checked:

- Order carts: item fields, missing unit price shown as "Not provided", 23-item cart
  collapsed to 20 with Show all, unreadable order label.
- Unavailable bodies: not retained, deleted and unavailable each have their own label.
- `replies="false"`: no Reply buttons. Removing it shows 9 Reply buttons.
- `messageFilter` with `MessageFilterController`: type, direction and loaded-message
  search, including order product IDs and order text. The unavailable labels are not
  searchable. No match shows "No loaded messages match".
- Keyboard: Enter on Show all expands the cart and keeps focus on the toggle (2 px
  focus ring). Typing and Enter in the composer sends through the fixture source and
  clears the field, keeping focus.
- 390 px wide, dark theme and pt-BR: no horizontal overflow; Portuguese labels.

Found, not fixed here:

- An available message with empty text renders as a tiny bubble whose time spills
  outside it (12:07 in `wc-03`, clipped at the left edge on a phone).
- After expanding the 23-item cart by keyboard, the focused Show fewer toggle sits
  just below the visible message area until scrolled.
