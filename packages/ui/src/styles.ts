/**
 * Stylesheet shared by the chat and template surfaces of `@polymorfa/react`
 * and `@polymorfa/elements`. Both render the same `pmfa-*` class names, so a
 * host restyling one package gets the same result in the other.
 *
 * Colors come from the appearance variables. The dark palette applies to
 * `.pmfa-dark` roots, and to `.pmfa-auto` roots when the system prefers dark;
 * it reads `--pmfa-dark-color-*` first. Every rule sits in the `polymorfa`
 * cascade layer, so unlayered host CSS wins without extra specificity.
 */
export const COMPONENT_STYLES = `
@layer polymorfa {
.pmfa {
  --pmfa-c-bg: var(--pmfa-color-background, #ffffff);
  --pmfa-c-fg: var(--pmfa-color-foreground, #17151f);
  --pmfa-c-muted: var(--pmfa-color-muted, #6d6878);
  --pmfa-c-border: var(--pmfa-color-border, #dedbe5);
  --pmfa-c-primary: var(--pmfa-color-primary, #5b4bf7);
  --pmfa-c-danger: var(--pmfa-color-danger, #c62828);
  --pmfa-c-success: var(--pmfa-color-success, #18794e);
  --pmfa-c-link: color-mix(in srgb, var(--pmfa-c-primary) 82%, var(--pmfa-c-fg));
  --pmfa-c-surface: color-mix(in srgb, var(--pmfa-c-fg) 5%, var(--pmfa-c-bg));
  --pmfa-c-in: var(--pmfa-c-bg);
  --pmfa-c-out: var(--pmfa-c-primary);
  --pmfa-c-on-out: #ffffff;
  --pmfa-c-on-danger: #ffffff;
  --pmfa-c-chat: color-mix(in srgb, var(--pmfa-c-fg) 4%, var(--pmfa-c-bg));
  --pmfa-c-bubble-shadow: 0 1px 1px rgb(0 0 0 / 0.07), 0 0 0 1px color-mix(in srgb, var(--pmfa-c-fg) 5%, transparent);
  --pmfa-r-s: var(--pmfa-radius-small, 6px);
  --pmfa-r-m: var(--pmfa-radius-medium, 10px);
  --pmfa-r-l: var(--pmfa-radius-large, 16px);
  --pmfa-r-bubble: 18px;
  --pmfa-s-s: var(--pmfa-spacing-small, 8px);
  --pmfa-s-m: var(--pmfa-spacing-medium, 12px);
  --pmfa-s-l: var(--pmfa-spacing-large, 20px);
  box-sizing: border-box;
  color: var(--pmfa-c-fg);
  font-family: var(--pmfa-font-family, system-ui, sans-serif);
  font-size: var(--pmfa-font-size-base, 16px);
  line-height: 1.45;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
.pmfa *, .pmfa *::before, .pmfa *::after { box-sizing: border-box; }
.pmfa-dark {
  --pmfa-c-bg: var(--pmfa-dark-color-background, #17161c);
  --pmfa-c-fg: var(--pmfa-dark-color-foreground, #f1eff6);
  --pmfa-c-muted: var(--pmfa-dark-color-muted, #aaa6b5);
  --pmfa-c-border: var(--pmfa-dark-color-border, #363340);
  --pmfa-c-primary: var(--pmfa-dark-color-primary, var(--pmfa-color-primary, #5b4bf7));
  --pmfa-c-danger: var(--pmfa-dark-color-danger, #ff8a80);
  --pmfa-c-success: var(--pmfa-dark-color-success, #4cc38a);
  --pmfa-c-link: color-mix(in srgb, var(--pmfa-c-primary) 45%, #ffffff);
  --pmfa-c-in: color-mix(in srgb, var(--pmfa-c-fg) 9%, var(--pmfa-c-bg));
  --pmfa-c-chat: color-mix(in srgb, #000000 28%, var(--pmfa-c-bg));
  --pmfa-c-bubble-shadow: none;
  --pmfa-c-on-danger: #1a0b0b;
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  .pmfa-auto {
    --pmfa-c-bg: var(--pmfa-dark-color-background, #17161c);
    --pmfa-c-fg: var(--pmfa-dark-color-foreground, #f1eff6);
    --pmfa-c-muted: var(--pmfa-dark-color-muted, #aaa6b5);
    --pmfa-c-border: var(--pmfa-dark-color-border, #363340);
    --pmfa-c-primary: var(--pmfa-dark-color-primary, var(--pmfa-color-primary, #5b4bf7));
    --pmfa-c-danger: var(--pmfa-dark-color-danger, #ff8a80);
    --pmfa-c-success: var(--pmfa-dark-color-success, #4cc38a);
    --pmfa-c-link: color-mix(in srgb, var(--pmfa-c-primary) 45%, #ffffff);
    --pmfa-c-in: color-mix(in srgb, var(--pmfa-c-fg) 9%, var(--pmfa-c-bg));
    --pmfa-c-chat: color-mix(in srgb, #000000 28%, var(--pmfa-c-bg));
    --pmfa-c-bubble-shadow: none;
    --pmfa-c-on-danger: #1a0b0b;
    color-scheme: dark;
  }
}
.pmfa-sr {
  position: absolute !important;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.pmfa-icon { flex: none; width: 20px; height: 20px; }

/* Controls */
.pmfa-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-m);
  background: var(--pmfa-c-bg);
  color: var(--pmfa-c-fg);
  font: inherit;
  font-size: 0.875em;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease, transform 120ms ease;
}
.pmfa-btn:hover:not(:disabled) { background: var(--pmfa-c-surface); }
.pmfa-btn:active:not(:disabled) { transform: scale(0.96); }
.pmfa-btn:focus-visible, .pmfa-input:focus-visible, .pmfa-quote:focus-visible,
.pmfa-att:focus-visible, .pmfa-msg:focus-visible {
  outline: 2px solid var(--pmfa-c-primary);
  outline-offset: 2px;
}
.pmfa-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pmfa-btn-primary {
  border-color: transparent;
  background: var(--pmfa-c-primary);
  color: #ffffff;
}
.pmfa-btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pmfa-c-primary) 86%, #000000);
}
.pmfa-btn-danger { border-color: transparent; background: var(--pmfa-c-danger); color: var(--pmfa-c-on-danger); }
.pmfa-btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pmfa-c-danger) 88%, #000000);
}
.pmfa-btn-ghost { border-color: transparent; background: transparent; color: var(--pmfa-c-muted); }
.pmfa-btn-ghost:hover:not(:disabled) { color: var(--pmfa-c-fg); }
.pmfa-btn-icon { width: 40px; padding: 0; border-radius: 999px; }
.pmfa-input {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-m);
  background: var(--pmfa-c-bg);
  color: var(--pmfa-c-fg);
  font: inherit;
  font-size: max(16px, 0.9375em);
}
textarea.pmfa-input { min-height: 72px; resize: vertical; }
.pmfa-input::placeholder { color: var(--pmfa-c-muted); opacity: 1; }
.pmfa-error { margin: 0; color: var(--pmfa-c-danger); font-size: 0.875em; }

/* Message list */
.pmfa-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--pmfa-s-m) var(--pmfa-s-m) var(--pmfa-s-l);
  background: var(--pmfa-c-chat);
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-block: var(--pmfa-s-l);
}
.pmfa-items {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pmfa-items > li { display: flex; flex-direction: column; min-width: 0; }
.pmfa-loadmore { align-self: center; margin-bottom: var(--pmfa-s-s); }
.pmfa-loadmore .pmfa-btn { border-radius: 999px; font-size: 0.8125em; }
.pmfa-empty {
  align-self: center;
  margin: auto;
  padding: var(--pmfa-s-l);
  color: var(--pmfa-c-muted);
  font-size: 0.875em;
}
.pmfa-items > .pmfa-date {
  position: sticky;
  top: 0;
  z-index: 1;
  align-self: center;
  margin: var(--pmfa-s-m) 0 var(--pmfa-s-s);
  padding: 3px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pmfa-c-bg) 92%, transparent);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-muted);
  font-size: 0.75em;
  font-weight: 600;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.pmfa-items > .pmfa-date:first-child { margin-top: 0; }
.pmfa-items > .pmfa-msg { max-width: min(82%, 36em); outline: none; border-radius: var(--pmfa-r-bubble); }
.pmfa-items > .pmfa-msg-in { align-self: flex-start; align-items: flex-start; }
.pmfa-items > .pmfa-msg-out { align-self: flex-end; align-items: flex-end; }
.pmfa-items > .pmfa-msg-start { margin-top: 10px; }
.pmfa-items > .pmfa-date + .pmfa-msg-start { margin-top: 0; }
.pmfa-row {
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  min-width: 0;
}
.pmfa-msg-out .pmfa-row { flex-direction: row-reverse; }
.pmfa-bubble {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 7px 12px 8px;
  border-radius: var(--pmfa-r-bubble);
  background: var(--pmfa-c-in);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-fg);
  overflow-wrap: anywhere;
}
.pmfa-bubble:has(> .pmfa-atts:first-child) { padding-top: 4px; }
.pmfa-bubble:has(.pmfa-att-media) { max-width: 268px; padding-inline: 4px; }
.pmfa-bubble:has(.pmfa-att-media) > .pmfa-text { padding-inline: 8px; }
.pmfa-bubble:has(> .pmfa-atts:only-child) { padding: 4px; }
.pmfa-text { white-space: pre-wrap; }
.pmfa-msg-in:not(.pmfa-msg-start) .pmfa-bubble { border-start-start-radius: 6px; }
.pmfa-msg-in:not(.pmfa-msg-end) .pmfa-bubble { border-end-start-radius: 6px; }
.pmfa-msg-in.pmfa-msg-end .pmfa-bubble { border-end-start-radius: 4px; }
.pmfa-msg-out:not(.pmfa-msg-start) .pmfa-bubble { border-start-end-radius: 6px; }
.pmfa-msg-out:not(.pmfa-msg-end) .pmfa-bubble { border-end-end-radius: 6px; }
.pmfa-msg-out.pmfa-msg-end .pmfa-bubble { border-end-end-radius: 4px; }
.pmfa-msg-out .pmfa-bubble {
  background: var(--pmfa-c-out);
  box-shadow: none;
  color: var(--pmfa-c-on-out);
}
.pmfa-msg-out .pmfa-bubble a { color: inherit; }
.pmfa-msg-failed .pmfa-bubble {
  background: color-mix(in srgb, var(--pmfa-c-danger) 12%, var(--pmfa-c-bg));
  color: var(--pmfa-c-fg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pmfa-c-danger) 50%, transparent);
}
.pmfa-msg-flash .pmfa-bubble { animation: pmfa-flash 1.2s ease-out; }
@keyframes pmfa-flash {
  0%, 30% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pmfa-c-primary) 55%, transparent); }
}
.pmfa-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 16px;
  margin: 3px 8px 0;
  color: var(--pmfa-c-muted);
  font-size: 0.6875em;
  font-variant-numeric: tabular-nums;
}
.pmfa-msg:not(.pmfa-msg-end):not(.pmfa-msg-failed):not(.pmfa-msg-pending) > .pmfa-meta {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.pmfa-meta .pmfa-status { width: 14px; height: 14px; }
.pmfa-msg-sent .pmfa-status { color: var(--pmfa-c-link); }
.pmfa-msg-failed .pmfa-meta { color: var(--pmfa-c-danger); font-weight: 600; }
.pmfa-msg-error { margin: 2px 8px 0; color: var(--pmfa-c-danger); font-size: 0.75em; }

/* Reply quote */
.pmfa-quote {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  max-width: 100%;
  min-width: 0;
  min-height: 40px;
  margin: 0 0 -10px;
  padding: 5px 12px 14px;
  border: 0;
  border-inline-start: 3px solid var(--pmfa-c-primary);
  border-radius: 12px 12px 0 0;
  background: color-mix(in srgb, var(--pmfa-c-fg) 7%, var(--pmfa-c-chat));
  color: var(--pmfa-c-fg);
  font: inherit;
  font-size: 0.8125em;
  text-align: start;
  cursor: pointer;
}
.pmfa-quote:hover { background: color-mix(in srgb, var(--pmfa-c-fg) 11%, var(--pmfa-c-chat)); }
.pmfa-quote-name { color: var(--pmfa-c-link); font-weight: 650; font-size: 0.9375em; }
.pmfa-quote-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  color: color-mix(in srgb, var(--pmfa-c-fg) 80%, var(--pmfa-c-bg));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pmfa-quote + .pmfa-row .pmfa-bubble { position: relative; }

/* Message actions */
.pmfa-actions-msg {
  display: flex;
  flex: none;
  opacity: 0;
  transition: opacity 120ms ease;
}
.pmfa-msg:hover .pmfa-actions-msg,
.pmfa-msg:focus-within .pmfa-actions-msg,
.pmfa-msg-failed .pmfa-actions-msg { opacity: 1; }
@media (hover: none), (pointer: coarse) {
  .pmfa-actions-msg { opacity: 1; }
}
.pmfa-actions-msg .pmfa-btn-icon .pmfa-icon { width: 18px; height: 18px; }
.pmfa-action-retry { color: var(--pmfa-c-danger); }

/* Attachments */
.pmfa-atts { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pmfa-att {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  color: inherit;
  text-decoration: none;
  border-radius: 12px;
}
.pmfa-att-media {
  display: block;
  overflow: hidden;
  background: color-mix(in srgb, var(--pmfa-c-fg) 8%, transparent);
}
.pmfa-att-media { border-radius: 14px; }
.pmfa-att-media img {
  display: block;
  width: 260px;
  max-width: 100%;
  height: auto;
  max-height: 320px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.pmfa-att-file {
  padding-block: 8px;
  padding-inline: 8px 12px;
  background: color-mix(in srgb, currentColor 9%, transparent);
}
a.pmfa-att-file:hover { background: color-mix(in srgb, currentColor 15%, transparent); }
.pmfa-att-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.pmfa-att-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.pmfa-att-name {
  overflow: hidden;
  font-size: 0.875em;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmfa-att-size { font-size: 0.75em; opacity: 0.85; font-variant-numeric: tabular-nums; }

/* Composer */
.pmfa-composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--pmfa-s-s);
  margin: 0;
  padding: var(--pmfa-s-s);
  border-top: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-bg);
}
.pmfa-composer-row { display: flex; align-items: flex-end; gap: 6px; }
.pmfa-composer .pmfa-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  max-height: 160px;
  border-radius: 20px;
  padding: 8px 16px;
  background: var(--pmfa-c-surface);
  border-color: transparent;
  line-height: 1.45;
  resize: none;
  field-sizing: content;
}
.pmfa-composer .pmfa-input:hover { border-color: var(--pmfa-c-border); }
.pmfa-composer .pmfa-input:focus-visible { outline-offset: 0; background: var(--pmfa-c-bg); border-color: var(--pmfa-c-border); }
.pmfa-composer .pmfa-btn { flex: none; }
.pmfa-send .pmfa-icon { width: 20px; height: 20px; stroke-width: 2.4; }
.pmfa-composer-standalone {
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-l);
}
.pmfa-composer[data-dragging] {
  outline: 2px dashed var(--pmfa-c-primary);
  outline-offset: -4px;
  background: color-mix(in srgb, var(--pmfa-c-primary) 8%, var(--pmfa-c-bg));
}
.pmfa-drop-hint {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: none;
  place-items: center;
  border-radius: inherit;
  background: color-mix(in srgb, var(--pmfa-c-bg) 80%, transparent);
  color: var(--pmfa-c-link);
  font-size: 0.875em;
  font-weight: 650;
  pointer-events: none;
}
.pmfa-composer[data-dragging] .pmfa-drop-hint { display: grid; }
.pmfa-reply-banner {
  display: flex;
  align-items: center;
  gap: var(--pmfa-s-s);
  min-width: 0;
  padding-block: 4px;
  padding-inline: 12px 4px;
  border-inline-start: 3px solid var(--pmfa-c-primary);
  border-radius: 10px;
  background: var(--pmfa-c-surface);
}
.pmfa-reply-body { display: flex; flex: 1; flex-direction: column; min-width: 0; font-size: 0.8125em; line-height: 1.3; }
.pmfa-reply-name { color: var(--pmfa-c-link); font-weight: 650; }
.pmfa-reply-text { overflow: hidden; color: var(--pmfa-c-muted); text-overflow: ellipsis; white-space: nowrap; }
.pmfa-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.pmfa-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
  padding-block: 4px;
  padding-inline: 10px 2px;
  border: 1px solid var(--pmfa-c-border);
  border-radius: 12px;
  background: var(--pmfa-c-bg);
  font-size: 0.8125em;
}
.pmfa-chip .pmfa-icon { width: 18px; height: 18px; color: var(--pmfa-c-muted); }
.pmfa-chip-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pmfa-chip-name { overflow: hidden; max-width: 18ch; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.pmfa-chip-status { color: var(--pmfa-c-muted); font-size: 0.875em; }
.pmfa-chip-failed { border-color: color-mix(in srgb, var(--pmfa-c-danger) 55%, transparent); }
.pmfa-chip-failed .pmfa-chip-status, .pmfa-chip-failed .pmfa-icon { color: var(--pmfa-c-danger); }
.pmfa-progress {
  position: relative;
  width: 100%;
  min-width: 72px;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pmfa-c-fg) 12%, transparent);
}
.pmfa-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--pmfa-c-primary);
  transition: width 160ms ease;
}
.pmfa-composer > .pmfa-error { padding-inline: 8px; }

/* Drawer */
.pmfa-drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  width: min(var(--pmfa-drawer-width, 400px), 100%);
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: var(--pmfa-c-bg);
  border-inline-start: 1px solid var(--pmfa-c-border);
  box-shadow: var(--pmfa-shadow-panel, 0 18px 50px rgb(23 21 31 / 0.16));
  animation: pmfa-slide 180ms ease-out;
}
.pmfa-drawer:focus { outline: none; }
.pmfa-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pmfa-s-s);
  min-height: 56px;
  padding-block: max(8px, env(safe-area-inset-top)) 8px;
  padding-inline: var(--pmfa-s-l) 8px;
  border-bottom: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-bg);
}
.pmfa-drawer-title { margin: 0; font-size: 1.0625em; font-weight: 650; }
.pmfa-drawer .pmfa-list { flex: 1; min-height: 0; }
.pmfa-drawer-footer { padding-bottom: env(safe-area-inset-bottom); background: var(--pmfa-c-bg); }
.pmfa-drawer-footer:empty { display: none; }
.pmfa-drawer-footer .pmfa-composer { border-top: 1px solid var(--pmfa-c-border); }
.pmfa-drawer > .pmfa-error { padding: var(--pmfa-s-s) var(--pmfa-s-l); }
@keyframes pmfa-slide { from { transform: translateX(24px); opacity: 0; } }
[dir="rtl"] .pmfa-drawer, .pmfa-drawer:dir(rtl) { animation-name: pmfa-slide-rtl; }
@keyframes pmfa-slide-rtl { from { transform: translateX(-24px); opacity: 0; } }
@media (max-width: 600px) {
  .pmfa-drawer { width: 100%; border-inline-start: 0; }
}

/* Template builder */
.pmfa-tb {
  container-type: inline-size;
  padding: var(--pmfa-s-l);
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-l);
  background: var(--pmfa-c-bg);
}
.pmfa-tb-title { margin: 0 0 var(--pmfa-s-m); font-size: 1.125em; font-weight: 650; }
.pmfa-tb-grid { display: grid; gap: var(--pmfa-s-l); grid-template-columns: minmax(0, 1fr); }
@container (min-width: 680px) {
  .pmfa-tb-grid { grid-template-columns: minmax(0, 1.25fr) minmax(260px, 1fr); }
  .pmfa-tb-aside { position: sticky; top: var(--pmfa-s-m); align-self: start; }
}
.pmfa-tb-form { display: flex; flex-direction: column; gap: var(--pmfa-s-m); min-width: 0; }
.pmfa-field { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; border: 0; min-width: 0; }
.pmfa-label, .pmfa-field > legend {
  padding: 0;
  color: var(--pmfa-c-muted);
  font-size: 0.8125em;
  font-weight: 600;
}
.pmfa-field > legend { margin-bottom: 4px; }
.pmfa-pairs { display: grid; gap: var(--pmfa-s-s); grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
.pmfa-pair { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pmfa-pair > span { font-size: 0.75em; color: var(--pmfa-c-muted); font-family: ui-monospace, monospace; }
.pmfa-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pmfa-s-s);
  padding-top: var(--pmfa-s-s);
}
.pmfa-actions .pmfa-btn-primary { margin-inline-end: auto; }
@container (max-width: 420px) {
  .pmfa-actions .pmfa-btn { flex: 1 1 100%; }
}
.pmfa-tb-aside {
  display: flex;
  flex-direction: column;
  gap: var(--pmfa-s-s);
  padding: var(--pmfa-s-m);
  border-radius: var(--pmfa-r-m);
  background: var(--pmfa-c-chat);
  min-width: 0;
}
.pmfa-hint { margin: auto 0; padding: var(--pmfa-s-l) var(--pmfa-s-s); color: var(--pmfa-c-muted); font-size: 0.875em; text-align: center; }
.pmfa-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 320px;
  width: 100%;
  align-self: flex-start;
}
.pmfa-preview-bubble, .pmfa-preview-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 12px;
  border-start-start-radius: 4px;
  background: var(--pmfa-c-in);
  box-shadow: var(--pmfa-c-bubble-shadow);
  overflow-wrap: anywhere;
}
.pmfa-preview-header { font-weight: 700; }
.pmfa-preview-body { margin: 0; white-space: pre-wrap; font-size: 0.9375em; }
.pmfa-preview-footer { color: var(--pmfa-c-muted); font-size: 0.8125em; }
.pmfa-preview-button {
  display: block;
  padding: 8px;
  border-radius: 10px;
  background: var(--pmfa-c-in);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-link);
  font-size: 0.875em;
  font-weight: 600;
  text-align: center;
}
.pmfa-preview-cards { display: flex; gap: 6px; overflow-x: auto; scroll-snap-type: x mandatory; }
.pmfa-preview-card { flex: 0 0 80%; scroll-snap-align: start; }

@media (prefers-reduced-motion: reduce) {
  .pmfa *, .pmfa *::before, .pmfa *::after, .pmfa-drawer {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
}
`;

const STYLE_TAG_ID = "pmfa-component-styles";

/**
 * Add the shared component stylesheet to a document once. Does nothing
 * without a document, so server rendering is unaffected.
 */
export function injectComponentStyles(
  target: Document | undefined = globalThis.document,
): void {
  if (target === undefined) return;
  if (target.getElementById(STYLE_TAG_ID) !== null) return;
  const tag = target.createElement("style");
  tag.id = STYLE_TAG_ID;
  tag.textContent = COMPONENT_STYLES;
  target.head.appendChild(tag);
}

/** Root class names for a component: base class plus the theme modifier. */
export function themeClassName(theme: "light" | "dark" | "system"): string {
  return theme === "dark"
    ? "pmfa pmfa-dark"
    : theme === "system"
      ? "pmfa pmfa-auto"
      : "pmfa";
}
