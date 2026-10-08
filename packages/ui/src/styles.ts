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
  --pmfa-c-on-primary: #ffffff;
  --pmfa-c-on-danger: #ffffff;
  /* Chat surfaces. Each reads an optional public variable first. */
  --pmfa-c-panel: var(--pmfa-chat-panel, var(--pmfa-c-bg));
  --pmfa-c-chat: var(--pmfa-chat-background, color-mix(in srgb, var(--pmfa-c-primary) 3%, color-mix(in srgb, var(--pmfa-c-fg) 4%, var(--pmfa-c-bg))));
  --pmfa-c-in: var(--pmfa-bubble-incoming, var(--pmfa-c-bg));
  --pmfa-c-out: var(--pmfa-bubble-outgoing, color-mix(in srgb, var(--pmfa-c-primary) 13%, var(--pmfa-c-bg)));
  --pmfa-c-on-out: var(--pmfa-bubble-outgoing-text, var(--pmfa-c-fg));
  --pmfa-c-meta: color-mix(in srgb, var(--pmfa-c-muted) 90%, var(--pmfa-c-in));
  --pmfa-c-meta-out: color-mix(in srgb, var(--pmfa-c-on-out) 55%, var(--pmfa-c-out));
  --pmfa-c-receipt: var(--pmfa-receipt-read, #1d8fe0);
  --pmfa-c-field: color-mix(in srgb, var(--pmfa-c-fg) 5.5%, var(--pmfa-c-panel));
  --pmfa-c-hover: color-mix(in srgb, var(--pmfa-c-fg) 4%, var(--pmfa-c-panel));
  --pmfa-c-selected: color-mix(in srgb, var(--pmfa-c-fg) 8%, var(--pmfa-c-panel));
  --pmfa-c-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 14%, var(--pmfa-c-panel));
  --pmfa-c-on-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 75%, var(--pmfa-c-fg));
  --pmfa-c-unread: var(--pmfa-unread, var(--pmfa-c-primary));
  --pmfa-c-on-unread: #ffffff;
  --pmfa-c-bubble-shadow: 0 1px 0.5px rgb(17 15 30 / 0.12);
  --pmfa-r-s: var(--pmfa-radius-small, 6px);
  --pmfa-r-m: var(--pmfa-radius-medium, 10px);
  --pmfa-r-l: var(--pmfa-radius-large, 16px);
  --pmfa-r-bubble: var(--pmfa-bubble-radius, 8px);
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
  --pmfa-c-panel: var(--pmfa-dark-chat-panel, var(--pmfa-c-bg));
  --pmfa-c-chat: var(--pmfa-dark-chat-background, color-mix(in srgb, #000000 32%, var(--pmfa-c-bg)));
  --pmfa-c-in: var(--pmfa-dark-bubble-incoming, color-mix(in srgb, var(--pmfa-c-fg) 10%, var(--pmfa-c-bg)));
  --pmfa-c-out: var(--pmfa-dark-bubble-outgoing, color-mix(in srgb, var(--pmfa-c-primary) 42%, var(--pmfa-c-bg)));
  --pmfa-c-on-out: var(--pmfa-dark-bubble-outgoing-text, var(--pmfa-c-fg));
  --pmfa-c-receipt: var(--pmfa-dark-receipt-read, #53b6f5);
  --pmfa-c-field: color-mix(in srgb, var(--pmfa-c-fg) 8%, var(--pmfa-c-panel));
  --pmfa-c-hover: color-mix(in srgb, var(--pmfa-c-fg) 5%, var(--pmfa-c-panel));
  --pmfa-c-selected: color-mix(in srgb, var(--pmfa-c-fg) 11%, var(--pmfa-c-panel));
  --pmfa-c-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 30%, var(--pmfa-c-panel));
  --pmfa-c-on-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 25%, #ffffff);
  --pmfa-c-bubble-shadow: 0 1px 0.5px rgb(0 0 0 / 0.3);
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
    --pmfa-c-panel: var(--pmfa-dark-chat-panel, var(--pmfa-c-bg));
    --pmfa-c-chat: var(--pmfa-dark-chat-background, color-mix(in srgb, #000000 32%, var(--pmfa-c-bg)));
    --pmfa-c-in: var(--pmfa-dark-bubble-incoming, color-mix(in srgb, var(--pmfa-c-fg) 10%, var(--pmfa-c-bg)));
    --pmfa-c-out: var(--pmfa-dark-bubble-outgoing, color-mix(in srgb, var(--pmfa-c-primary) 42%, var(--pmfa-c-bg)));
    --pmfa-c-on-out: var(--pmfa-dark-bubble-outgoing-text, var(--pmfa-c-fg));
    --pmfa-c-receipt: var(--pmfa-dark-receipt-read, #53b6f5);
    --pmfa-c-field: color-mix(in srgb, var(--pmfa-c-fg) 8%, var(--pmfa-c-panel));
    --pmfa-c-hover: color-mix(in srgb, var(--pmfa-c-fg) 5%, var(--pmfa-c-panel));
    --pmfa-c-selected: color-mix(in srgb, var(--pmfa-c-fg) 11%, var(--pmfa-c-panel));
    --pmfa-c-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 30%, var(--pmfa-c-panel));
    --pmfa-c-on-selected-chip: color-mix(in srgb, var(--pmfa-c-primary) 25%, #ffffff);
    --pmfa-c-bubble-shadow: 0 1px 0.5px rgb(0 0 0 / 0.3);
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
.pmfa-icon { display: inline-block; flex: none; width: 20px; height: 20px; vertical-align: middle; }

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

/* Inline chat window: the host supplies a bounded height. */
.pmfa-chat-window { display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; background: var(--pmfa-c-chat); color: var(--pmfa-c-fg); container-type: inline-size; }
.pmfa-chat-window > .pmfa-list { flex: 1; min-height: 0; }
.pmfa-chat-header, .pmfa-chat-footer { flex: 0 0 auto; }
.pmfa-chat-footer { border-top: 1px solid var(--pmfa-c-border); background: var(--pmfa-c-panel); padding-bottom: env(safe-area-inset-bottom); }
.pmfa-chat-footer fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.pmfa-latest {
  position: sticky;
  bottom: 12px;
  align-self: flex-end;
  flex: 0 0 auto;
  width: 40px;
  min-height: 40px;
  margin-top: -40px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--pmfa-c-in);
  color: var(--pmfa-c-muted);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 4px 12px rgb(0 0 0 / 0.08);
}
.pmfa-latest:hover:not(:disabled) { background: var(--pmfa-c-in); color: var(--pmfa-c-fg); }
.pmfa-latest[hidden] { display: none; }

/* Message list */
.pmfa-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 12px clamp(12px, 5cqi, 64px) 16px;
  background-color: var(--pmfa-c-chat);
  background-image: var(--pmfa-chat-pattern, radial-gradient(color-mix(in srgb, var(--pmfa-c-fg) 6%, transparent) 1px, transparent 1.2px));
  background-size: 20px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-block: 48px 16px;
}
.pmfa-items {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pmfa-items > li { display: flex; flex-direction: column; min-width: 0; }
.pmfa-loadmore { align-self: center; margin-bottom: 8px; }
.pmfa-loadmore .pmfa-btn { min-height: 32px; border: 0; border-radius: 999px; background: var(--pmfa-c-in); box-shadow: var(--pmfa-c-bubble-shadow); font-size: 0.8125em; }
.pmfa-empty {
  align-self: center;
  margin: auto;
  padding: 6px 14px;
  border-radius: 8px;
  background: var(--pmfa-c-in);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-muted);
  font-size: 0.8125em;
}
.pmfa-items > .pmfa-date {
  align-self: center;
  margin: 12px 0 8px;
  padding: 5px 12px 6px;
  border-radius: 8px;
  background: var(--pmfa-c-in);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-muted);
  font-size: 0.75em;
  font-weight: 500;
  line-height: 1.2;
}
.pmfa-items > .pmfa-date:first-child { margin-top: 0; }
.pmfa-items > .pmfa-msg { position: relative; max-width: min(76%, 38em); outline: none; }
.pmfa-items > .pmfa-msg-in { align-self: flex-start; align-items: flex-start; }
.pmfa-items > .pmfa-msg-out { align-self: flex-end; align-items: flex-end; }
.pmfa-items > .pmfa-msg-start { margin-top: 10px; }
.pmfa-items > .pmfa-date + .pmfa-msg-start, .pmfa-items > .pmfa-loadmore + .pmfa-msg-start { margin-top: 0; }
@container (max-width: 599px) { .pmfa-items > .pmfa-msg { max-width: 88%; } }
.pmfa-row {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

/*
 * Bubbles. Text flows inline so the time and receipt can share its last
 * line; a spacer after the text reserves their width.
 */
.pmfa-bubble {
  --pmfa-bubble-bg: var(--pmfa-c-in);
  --pmfa-meta-space: 4.5em;
  position: relative;
  display: block;
  min-width: 0;
  padding: 6px 8px 7px 9px;
  border-radius: var(--pmfa-r-bubble);
  background: var(--pmfa-bubble-bg);
  box-shadow: var(--pmfa-c-bubble-shadow);
  color: var(--pmfa-c-fg);
  font-size: var(--pmfa-message-font-size, 0.9375em);
  line-height: 1.38;
  overflow-wrap: anywhere;
}
.pmfa-msg-out .pmfa-bubble { --pmfa-bubble-bg: var(--pmfa-c-out); --pmfa-meta-space: 5.75em; color: var(--pmfa-c-on-out); }
.pmfa-msg-out .pmfa-bubble a { color: inherit; }
.pmfa-text { white-space: pre-wrap; }
.pmfa-meta-space {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 1px;
  padding-inline: 10px 2px;
  overflow: hidden;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  visibility: hidden;
}
.pmfa-meta-space-icon { display: inline-block; width: 16px; }
/* Custom message content has no spacer, so reserve a typical width. */
.pmfa-text:not(:has(.pmfa-meta-space))::after { content: ""; display: inline-block; width: var(--pmfa-meta-space); height: 1px; }
.pmfa-msg-start .pmfa-bubble::before {
  content: "";
  position: absolute;
  top: 0;
  width: 8px;
  height: 13px;
  background: var(--pmfa-bubble-bg);
}
.pmfa-msg-in.pmfa-msg-start .pmfa-bubble { border-start-start-radius: 0; }
.pmfa-msg-in.pmfa-msg-start .pmfa-bubble::before { inset-inline-start: -7px; clip-path: polygon(0 0, 100% 0, 100% 100%, 85% 80%); border-start-start-radius: 2px; }
.pmfa-msg-out.pmfa-msg-start .pmfa-bubble { border-start-end-radius: 0; }
.pmfa-msg-out.pmfa-msg-start .pmfa-bubble::before { inset-inline-end: -7px; clip-path: polygon(0 0, 100% 0, 15% 80%, 0 100%); border-start-end-radius: 2px; }
[dir="rtl"] .pmfa-msg-in.pmfa-msg-start .pmfa-bubble::before, [dir="rtl"].pmfa-msg-in.pmfa-msg-start .pmfa-bubble::before { clip-path: polygon(0 0, 100% 0, 15% 80%, 0 100%); }
[dir="rtl"] .pmfa-msg-out.pmfa-msg-start .pmfa-bubble::before, [dir="rtl"].pmfa-msg-out.pmfa-msg-start .pmfa-bubble::before { clip-path: polygon(0 0, 100% 0, 100% 100%, 85% 80%); }
.pmfa-msg-failed .pmfa-bubble {
  --pmfa-bubble-bg: color-mix(in srgb, var(--pmfa-c-danger) 10%, var(--pmfa-c-in));
  color: var(--pmfa-c-fg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pmfa-c-danger) 45%, transparent);
}
.pmfa-msg-flash .pmfa-bubble { animation: pmfa-flash 1.2s ease-out; }
@keyframes pmfa-flash {
  0%, 30% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pmfa-c-primary) 55%, transparent); }
}
.pmfa-meta {
  position: absolute;
  inset-inline-end: 8px;
  bottom: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 15px;
  margin: 0;
  color: var(--pmfa-c-meta);
  font-size: 0.6875rem;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
.pmfa-msg-out .pmfa-meta { color: var(--pmfa-c-meta-out); }
.pmfa-meta .pmfa-status { width: 16px; height: 16px; stroke-width: 2.2; }
.pmfa-meta .pmfa-status-read, .pmfa-meta .pmfa-status-played { color: var(--pmfa-c-receipt); }
.pmfa-meta .pmfa-status-failed { color: var(--pmfa-c-danger); }
/* Failure text needs its own line. */
.pmfa-msg-failed .pmfa-text::after, .pmfa-msg-failed .pmfa-meta-space { display: none; }
.pmfa-msg-failed .pmfa-meta { position: static; display: flex; justify-content: flex-end; margin-top: 2px; color: var(--pmfa-c-danger); font-weight: 600; }
/* Without text, the time sits under files and audio, or over pictures. */
.pmfa-bubble:not(:has(.pmfa-text)) { padding-bottom: 22px; }
.pmfa-bubble:not(:has(.pmfa-text)):has(.pmfa-att-media) { padding-bottom: 3px; }
.pmfa-bubble:not(:has(.pmfa-text)):has(.pmfa-att-media) > .pmfa-meta {
  inset-inline-end: 8px;
  bottom: 8px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.45);
  color: #ffffff;
}
.pmfa-msg-failed .pmfa-bubble:not(:has(.pmfa-text)) { padding-bottom: 7px; }
.pmfa-msg-error { margin: 3px 4px 0; color: var(--pmfa-c-danger); font-size: 0.75em; }

/* Reply quote */
.pmfa-quote {
  appearance: none;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  min-width: min(12em, 100%);
  min-height: 44px;
  margin: 0 0 5px;
  padding: 6px 10px 7px 12px;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--pmfa-c-fg) 6%, var(--pmfa-bubble-bg));
  color: var(--pmfa-c-fg);
  font: inherit;
  font-size: 0.875em;
  line-height: 1.3;
  text-align: start;
  cursor: pointer;
  overflow: hidden;
}
.pmfa-quote::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 0; width: 4px; background: var(--pmfa-c-link); }
.pmfa-quote:hover { background: color-mix(in srgb, var(--pmfa-c-fg) 10%, var(--pmfa-bubble-bg)); }
.pmfa-quote-name { color: var(--pmfa-c-link); font-weight: 600; }
.pmfa-quote-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  color: var(--pmfa-c-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Message actions */
/* Actions float beside the bubble, so showing them never reflows it. */
.pmfa-actions-msg {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 120ms ease;
}
.pmfa-msg-in .pmfa-actions-msg { inset-inline-start: calc(100% + 6px); }
.pmfa-msg-out .pmfa-actions-msg { inset-inline-end: calc(100% + 6px); flex-direction: row-reverse; }
.pmfa-msg:hover .pmfa-actions-msg,
.pmfa-msg:focus-within .pmfa-actions-msg,
.pmfa-msg-failed .pmfa-actions-msg { opacity: 1; }
@media (hover: none), (pointer: coarse) {
  .pmfa-actions-msg { opacity: 1; }
}
.pmfa-actions-msg .pmfa-btn-icon {
  width: 32px;
  min-height: 32px;
  background: var(--pmfa-c-in);
  color: var(--pmfa-c-muted);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}
.pmfa-actions-msg .pmfa-btn-icon .pmfa-icon { width: 17px; height: 17px; }
@media (pointer: coarse) { .pmfa-actions-msg .pmfa-btn-icon { width: 40px; min-height: 40px; } }
.pmfa-action-retry { color: var(--pmfa-c-danger); }

/* Attachments */
.pmfa-icon-fill { fill: currentColor; stroke: none; }
.pmfa-atts { display: flex; flex-direction: column; gap: 3px; min-width: 0; margin-bottom: 4px; }
.pmfa-bubble > .pmfa-atts:last-child, .pmfa-bubble > .pmfa-atts:has(+ .pmfa-meta) { margin-bottom: 0; }
.pmfa-att { display: flex; min-width: 0; color: inherit; text-decoration: none; }
.pmfa-att:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: 2px; }
.pmfa-bubble:has(.pmfa-att-media) { width: min(330px, 70vw); padding: 3px 3px 7px; }
.pmfa-bubble:has(.pmfa-att-media) > :is(.pmfa-text, .pmfa-quote) { margin-inline: 6px 5px; }
.pmfa-bubble:has(.pmfa-att-media) > .pmfa-quote { width: calc(100% - 11px); margin-top: 0; }
.pmfa-bubble:has(.pmfa-att-media) > .pmfa-text { display: block; padding-top: 3px; }
.pmfa-att-media {
  position: relative;
  overflow: hidden;
  border-radius: calc(var(--pmfa-r-bubble) - 2px);
  background: color-mix(in srgb, var(--pmfa-c-fg) 6%, var(--pmfa-bubble-bg));
}
.pmfa-att-media img, .pmfa-att-media video { display: block; width: 100%; max-height: 360px; object-fit: cover; }
.pmfa-att-player { flex-direction: column; }
.pmfa-att-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 240px;
  color: var(--pmfa-c-muted);
}
.pmfa-att-placeholder { align-content: center; gap: 8px; padding: 12px; }
.pmfa-att-placeholder > .pmfa-icon { width: 32px; height: 32px; stroke-width: 1.5; opacity: 0.7; }
.pmfa-att-placeholder > .pmfa-att-name { max-width: 100%; font-size: 0.8125em; }
.pmfa-att-duration {
  position: absolute;
  inset-inline-start: 8px;
  bottom: 8px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.45);
  color: #ffffff;
  font-size: 0.6875rem;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
.pmfa-att-file {
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: min(240px, 60vw);
  padding: 8px 10px 8px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--pmfa-c-fg) 5%, var(--pmfa-bubble-bg));
}
a.pmfa-att-file:hover { background: color-mix(in srgb, var(--pmfa-c-fg) 9%, var(--pmfa-bubble-bg)); }
.pmfa-att-tile {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 42px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--pmfa-c-primary) 14%, var(--pmfa-c-bg));
  color: color-mix(in srgb, var(--pmfa-c-primary) 80%, var(--pmfa-c-fg));
}
.pmfa-att-tile .pmfa-icon { width: 20px; height: 20px; stroke-width: 1.75; }
.pmfa-att-tile[data-extension] .pmfa-icon { display: none; }
.pmfa-att-tile[data-extension]::after { content: attr(data-extension); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em; }
.pmfa-att-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; line-height: 1.3; }
.pmfa-att-name {
  overflow: hidden;
  font-size: 0.9375em;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmfa-att-size { color: var(--pmfa-c-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }

/* Voice notes and audio */
.pmfa-att-audio {
  align-items: center;
  gap: 8px;
  width: min(280px, 64vw);
  padding: 4px 2px 0 0;
}
.pmfa-att-audio .pmfa-att-tile { width: 44px; height: 44px; border-radius: 999px; }
.pmfa-play {
  appearance: none;
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--pmfa-c-muted);
  cursor: pointer;
}
.pmfa-play .pmfa-icon { width: 26px; height: 26px; }
.pmfa-play:hover:not(:disabled) { color: var(--pmfa-c-fg); }
.pmfa-play:disabled { opacity: 0.45; cursor: not-allowed; }
.pmfa-play:focus-visible, .pmfa-rate:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: 1px; }
.pmfa-track { position: relative; display: flex; flex: 1; flex-direction: column; justify-content: center; min-width: 0; height: 40px; }
.pmfa-wave { display: flex; align-items: center; gap: 2px; height: 26px; overflow: hidden; }
.pmfa-wave > span { flex: 1 1 0; min-width: 1px; max-width: 4px; min-height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--pmfa-c-fg) 28%, transparent); }
.pmfa-wave > span[data-played] { background: var(--pmfa-c-link); }
.pmfa-line { position: relative; height: 4px; margin-block: 11px; border-radius: 999px; background: color-mix(in srgb, var(--pmfa-c-fg) 18%, transparent); }
.pmfa-line::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 0; width: calc(var(--pmfa-progress, 0) * 100%); border-radius: inherit; background: var(--pmfa-c-link); }
.pmfa-line::after { content: ""; position: absolute; top: 50%; inset-inline-start: calc(var(--pmfa-progress, 0) * 100%); width: 12px; height: 12px; margin-inline-start: -6px; border-radius: 999px; background: var(--pmfa-c-link); transform: translateY(-50%); }
.pmfa-seek { position: absolute; inset: 0 0 12px; width: 100%; height: auto; margin: 0; opacity: 0; cursor: pointer; }
.pmfa-seek:disabled { cursor: default; }
.pmfa-track:has(.pmfa-seek:focus-visible) { outline: 2px solid var(--pmfa-c-primary); outline-offset: 2px; border-radius: 4px; }
.pmfa-att-time { position: absolute; inset-inline-start: 0; bottom: -14px; color: var(--pmfa-c-meta); font-size: 0.6875rem; line-height: 15px; font-variant-numeric: tabular-nums; }
.pmfa-msg-out .pmfa-att-time { color: var(--pmfa-c-meta-out); }
.pmfa-rate {
  appearance: none;
  flex: none;
  min-width: 36px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pmfa-c-fg) 10%, transparent);
  color: var(--pmfa-c-fg);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.pmfa-att-audio audio { display: none; }
.pmfa-bubble:has(.pmfa-text) .pmfa-att-audio { margin-bottom: 14px; }

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
.pmfa-attachment-picker { position: relative; flex: none; }
.pmfa-attachment-menu {
  position: absolute; bottom: calc(100% + 8px); inset-inline-start: 0; z-index: 30;
  width: 190px; max-width: calc(100vw - 48px); padding: 6px;
  border: 1px solid var(--pmfa-c-border); border-radius: 12px;
  background: var(--pmfa-c-bg); color: var(--pmfa-c-fg);
  box-shadow: 0 8px 28px #0002;
}
.pmfa-attachment-menu .pmfa-btn { width: 100%; min-height: 44px; justify-content: flex-start; gap: 12px; border-radius: 7px; }
.pmfa-chip-preview { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; }
.pmfa-chip-player { display: block; width: 220px; max-width: 100%; }
video.pmfa-chip-player { max-height: 120px; border-radius: 6px; }
.pmfa-composer .pmfa-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
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
.pmfa-composer-row { align-items: flex-end; gap: 2px; }
.pmfa-composer-actions { display: flex; flex: none; align-items: center; gap: 2px; min-height: 40px; }
.pmfa-composer-actions:empty { display: none; }
.pmfa-composer-actions > * { flex: none; }
.pmfa-composer .pmfa-input {
  margin-inline: 4px;
  max-height: calc(var(--pmfa-composer-max-rows, 8) * 1.45em + 18px);
  overflow-y: auto;
}
.pmfa-composer .pmfa-btn-ghost[aria-expanded="true"] { color: var(--pmfa-c-primary); background: var(--pmfa-c-surface); }
.pmfa-send, .pmfa-voice { transition: transform 140ms ease, background-color 120ms ease; }
.pmfa-voice { color: var(--pmfa-c-muted); }
.pmfa-composer-row[hidden], .pmfa-recording[hidden] { display: none; }

/*
 * Inside a chat window the writing field is a pill between its emoji and
 * attachment buttons and a round send or record button.
 */
.pmfa-chat-window .pmfa-chat-footer, .pmfa-chat-window .pmfa-drawer-footer { padding: 8px clamp(8px, 2cqi, 16px) max(8px, env(safe-area-inset-bottom)); border-top: 0; }
.pmfa-chat-window .pmfa-chat-footer > fieldset + * { margin-top: 6px; }
.pmfa-chat-window .pmfa-composer { gap: 6px; padding: 0; border: 0; border-radius: 0; background: transparent; }
.pmfa-chat-window .pmfa-composer-row { flex-wrap: nowrap; gap: 4px; align-items: flex-end; }
.pmfa-chat-window .pmfa-composer-actions { min-height: 44px; gap: 0; }
.pmfa-chat-window .pmfa-composer-actions .pmfa-btn-icon { width: 40px; min-height: 40px; margin-block: 2px; color: var(--pmfa-c-muted); }
.pmfa-chat-window .pmfa-composer-actions .pmfa-btn-icon .pmfa-icon { width: 22px; height: 22px; }
.pmfa-chat-window .pmfa-composer .pmfa-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  margin: 0;
  padding: 11px 16px;
  border: 1px solid transparent;
  border-radius: 22px;
  background: var(--pmfa-c-field);
  font-size: var(--pmfa-message-font-size, 0.9375em);
  line-height: 1.4;
}
.pmfa-chat-window .pmfa-composer .pmfa-input:hover { border-color: transparent; }
.pmfa-chat-window .pmfa-composer .pmfa-input:focus-visible { outline: none; border-color: color-mix(in srgb, var(--pmfa-c-fg) 22%, transparent); background: var(--pmfa-c-field); }
.pmfa-chat-window .pmfa-send, .pmfa-chat-window .pmfa-voice { flex: none; width: 44px; min-height: 44px; border-radius: 999px; }
.pmfa-chat-window .pmfa-send { border-color: transparent; background: var(--pmfa-c-primary); color: var(--pmfa-c-on-primary); }
.pmfa-chat-window .pmfa-send:hover:not(:disabled) { background: color-mix(in srgb, var(--pmfa-c-primary) 88%, #000000); }
.pmfa-chat-window .pmfa-voice .pmfa-icon { width: 22px; height: 22px; }
.pmfa-chat-window .pmfa-reply-banner { margin-inline: 44px 48px; border-radius: 8px; background: var(--pmfa-c-field); }
.pmfa-chat-window .pmfa-chips { padding-inline: 4px; }
@media (max-width: 360px) {
  .pmfa-composer { padding-inline: 4px; }
  .pmfa-composer .pmfa-input { margin-inline: 2px; padding-inline: 12px; }
}

/* Recording bar */
.pmfa-recording {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  min-width: 0;
}
.pmfa-recording-status {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 40px;
  padding-inline: 14px;
  border-radius: 20px;
  background: var(--pmfa-c-surface);
}
.pmfa-rec-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pmfa-c-danger);
  animation: pmfa-rec-pulse 1.2s ease-in-out infinite;
}
@keyframes pmfa-rec-pulse { 50% { opacity: 0.25; } }
.pmfa-rec-time { flex: none; min-width: 4ch; font-size: 0.9375em; font-variant-numeric: tabular-nums; }
.pmfa-rec-level {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 3px;
  min-width: 0;
  height: 24px;
  overflow: hidden;
}
.pmfa-rec-level > span {
  flex: 0 0 3px;
  height: 100%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--pmfa-c-muted) 70%, transparent);
  transform: scaleY(var(--pmfa-level, 0.12));
  transition: transform 80ms linear;
}
.pmfa-recording .pmfa-rec-cancel { color: var(--pmfa-c-danger); }

/* Popovers */
.pmfa-popover {
  position: fixed;
  z-index: 2147483600;
  display: flex;
  flex-direction: column;
  top: var(--pmfa-pop-top, auto);
  left: var(--pmfa-pop-left, auto);
  max-height: var(--pmfa-pop-max, 420px);
  border: 1px solid var(--pmfa-c-border);
  border-radius: 14px;
  background: var(--pmfa-c-bg);
  color: var(--pmfa-c-fg);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.08);
  overflow: hidden;
  animation: pmfa-pop 140ms ease-out;
}
.pmfa-popover:focus { outline: none; }
.pmfa-popover[data-measuring] { visibility: hidden; animation: none; }
.pmfa-popover[data-placement="bottom"] { animation-name: pmfa-pop-down; }
@keyframes pmfa-pop { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
@keyframes pmfa-pop-down { from { opacity: 0; transform: translateY(-6px) scale(0.98); } }
.pmfa-emoji {
  width: 360px;
  height: 400px;
}
.pmfa-emoji-search {
  position: relative;
  flex: none;
  padding: 10px 10px 6px;
}
.pmfa-emoji-search .pmfa-icon {
  position: absolute;
  inset-inline-start: 22px;
  top: 50%;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  transform: translateY(-50%);
  color: var(--pmfa-c-muted);
  pointer-events: none;
}
.pmfa-emoji-search .pmfa-input {
  min-height: 36px;
  padding-block: 6px;
  padding-inline: 36px 12px;
  border-color: transparent;
  border-radius: 10px;
  background: var(--pmfa-c-surface);
  font-size: max(16px, 0.875em);
}
.pmfa-emoji-search .pmfa-input:focus-visible { outline-offset: 0; background: var(--pmfa-c-bg); }
.pmfa-emoji-tabs {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 0 6px;
  border-bottom: 1px solid var(--pmfa-c-border);
  overflow-x: auto;
  scrollbar-width: none;
}
.pmfa-emoji-tab {
  appearance: none;
  position: relative;
  display: grid;
  flex: 1 0 34px;
  place-items: center;
  min-width: 34px;
  height: 40px;
  padding: 0;
  border: 0;
  background: none;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  filter: grayscale(1);
  opacity: 0.6;
  transition: opacity 120ms ease, filter 120ms ease;
}
.pmfa-emoji-tab:hover { opacity: 0.9; }
.pmfa-emoji-tab[aria-selected="true"] { filter: none; opacity: 1; }
.pmfa-emoji-tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  inset-inline: 6px;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--pmfa-c-primary);
}
.pmfa-emoji-tab:focus-visible, .pmfa-emoji-cell:focus-visible, .pmfa-qr-option:focus-visible {
  outline: 2px solid var(--pmfa-c-primary);
  outline-offset: -2px;
}
.pmfa-emoji-body { flex: 1; min-height: 0; padding: 6px 8px 8px; overflow-y: auto; overscroll-behavior: contain; }
.pmfa-emoji-heading {
  margin: 4px 4px 6px;
  color: var(--pmfa-c-muted);
  font-size: 0.75em;
  font-weight: 650;
}
.pmfa-emoji-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
.pmfa-emoji-cell {
  appearance: none;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: none;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 80ms ease, transform 80ms ease;
}
.pmfa-emoji-cell:hover, .pmfa-emoji-cell:focus-visible { background: var(--pmfa-c-surface); }
.pmfa-emoji-cell:active { transform: scale(0.9); }
.pmfa-emoji-empty { margin: 32px 12px; color: var(--pmfa-c-muted); font-size: 0.875em; text-align: center; }
@media (max-width: 600px) {
  .pmfa-popover.pmfa-emoji {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: min(360px, 60vh);
    max-height: 60vh;
    padding-bottom: env(safe-area-inset-bottom);
    border-width: 1px 0 0;
    border-radius: 16px 16px 0 0;
    animation-name: pmfa-sheet;
  }
  .pmfa-emoji::before {
    content: "";
    flex: none;
    align-self: center;
    width: 36px;
    height: 4px;
    margin-top: 8px;
    border-radius: 2px;
    background: var(--pmfa-c-border);
  }
  .pmfa-emoji-grid { grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); }
}
@media (max-width: 360px) {
  .pmfa-emoji-tab { flex-basis: 28px; min-width: 28px; font-size: 16px; }
}
@keyframes pmfa-sheet { from { transform: translateY(100%); } }

/* Quick replies */
.pmfa-qr {
  position: absolute;
  inset-inline: 8px;
  bottom: calc(100% + 4px);
  z-index: 3;
  max-height: min(280px, 50vh);
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--pmfa-c-border);
  border-radius: 12px;
  background: var(--pmfa-c-bg);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.16);
  animation: pmfa-pop 120ms ease-out;
}
.pmfa-qr ul { margin: 0; padding: 0; list-style: none; }
.pmfa-qr-title { padding: 4px 10px 6px; color: var(--pmfa-c-muted); font-size: 0.75em; font-weight: 650; }
.pmfa-qr-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 44px;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.pmfa-qr-option[aria-selected="true"] { background: color-mix(in srgb, var(--pmfa-c-primary) 12%, var(--pmfa-c-bg)); }
.pmfa-qr-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.pmfa-qr-shortcut { flex: none; color: var(--pmfa-c-link); font-weight: 650; font-size: 0.875em; }
.pmfa-qr-description { overflow: hidden; color: var(--pmfa-c-muted); font-size: 0.75em; text-overflow: ellipsis; white-space: nowrap; }
.pmfa-qr-text {
  overflow: hidden;
  color: color-mix(in srgb, var(--pmfa-c-fg) 85%, var(--pmfa-c-bg));
  font-size: 0.8125em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.pmfa-drawer.pmfa-chat-window { position: static; inset: auto; z-index: auto; width: 100%; border: 0; border-radius: 0; box-shadow: none; animation: none; }
@media (max-width: 600px) { .pmfa-btn-icon { min-width: 44px; min-height: 44px; } }
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

/* Inbox */
.pmfa-inbox {
  container-type: inline-size;
  position: relative;
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-l);
  background: var(--pmfa-c-panel);
}
.pmfa-inbox[data-contact-open] { grid-template-columns: minmax(280px, 360px) minmax(0, 1fr) minmax(260px, 320px); }
.pmfa-inbox-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-inline-end: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-panel);
}
.pmfa-inbox-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 10px;
}
.pmfa-inbox-heading { display: flex; align-items: center; justify-content: space-between; min-height: 36px; }
.pmfa-inbox-heading .pmfa-btn-icon { width: 36px; min-height: 36px; color: var(--pmfa-c-muted); }
.pmfa-inbox-title { margin: 0; font-size: 1.375em; font-weight: 700; letter-spacing: -0.015em; }
.pmfa-search { position: relative; display: flex; align-items: center; }
.pmfa-search .pmfa-icon {
  position: absolute;
  inset-inline-start: 14px;
  width: 16px;
  height: 16px;
  color: var(--pmfa-c-muted);
  pointer-events: none;
}
.pmfa-search .pmfa-input {
  min-height: 38px;
  padding-block: 7px;
  padding-inline: 40px 14px;
  border-color: transparent;
  border-radius: 10px;
  background: var(--pmfa-c-field);
  font-size: 0.9375em;
}
.pmfa-search .pmfa-input:hover { border-color: transparent; }
.pmfa-search .pmfa-input:focus-visible { outline: none; border-color: color-mix(in srgb, var(--pmfa-c-fg) 22%, transparent); background: var(--pmfa-c-panel); }
.pmfa-inbox-filters { display: flex; gap: 6px; margin-inline: -16px; padding-inline: 16px; overflow-x: auto; scrollbar-width: none; }
.pmfa-inbox-filters::-webkit-scrollbar { display: none; }
.pmfa-inbox-filters button {
  flex: none;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--pmfa-c-field);
  color: var(--pmfa-c-muted);
  font: inherit;
  font-size: 0.8125em;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.pmfa-inbox-filters button:hover { color: var(--pmfa-c-fg); }
.pmfa-inbox-filters button[aria-pressed="true"] { background: var(--pmfa-c-selected-chip); color: var(--pmfa-c-on-selected-chip); }
.pmfa-inbox-filters button:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: 1px; }
.pmfa-convs {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 2px 8px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}
.pmfa-conv-entry { position: relative; }
.pmfa-conv {
  appearance: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "avatar name time" "avatar preview badge" "avatar subtitle subtitle";
  column-gap: 12px;
  row-gap: 1px;
  align-items: center;
  width: 100%;
  min-height: 68px;
  padding: 10px 12px 10px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 100ms ease;
}
.pmfa-conv:hover { background: var(--pmfa-c-hover); }
.pmfa-conv:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: -2px; }
.pmfa-conv[aria-current="true"] { background: var(--pmfa-c-selected); }
.pmfa-conv > .pmfa-avatar { grid-area: avatar; grid-row: 1 / -1; width: 48px; height: 48px; }
.pmfa-conv-name {
  grid-area: name;
  overflow: hidden;
  font-size: 0.9875em;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmfa-conv-time {
  grid-area: time;
  align-self: end;
  color: var(--pmfa-c-muted);
  font-size: 0.75em;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pmfa-conv-preview {
  grid-area: preview;
  overflow: hidden;
  color: var(--pmfa-c-muted);
  font-size: 0.875em;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmfa-conv-preview .pmfa-icon { width: 16px; height: 16px; vertical-align: -3px; margin-inline-end: 3px; stroke-width: 2.2; }
.pmfa-conv-preview .pmfa-icon:is([class~="pmfa-status-read"]) { color: var(--pmfa-c-receipt); }
.pmfa-draft-label { color: var(--pmfa-c-success); font-weight: 600; }
.pmfa-conv-subtitle { grid-area: subtitle; overflow: hidden; color: var(--pmfa-c-muted); font-size: 0.6875em; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.pmfa-conv-indicators { grid-area: badge; display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 20px; }
.pmfa-conv-indicators > .pmfa-icon { width: 15px; height: 15px; color: var(--pmfa-c-muted); }
.pmfa-conv[data-unread] .pmfa-conv-name { font-weight: 650; }
.pmfa-conv[data-unread] .pmfa-conv-time { color: var(--pmfa-c-unread); font-weight: 600; }
.pmfa-conv[data-unread] .pmfa-conv-preview { color: var(--pmfa-c-fg); }
/* The row menu appears on hover or focus; touch screens always show it. */
.pmfa-conv-entry:has(.pmfa-conv-menu) .pmfa-conv { padding-inline-end: 12px; }
.pmfa-conv-entry:has(.pmfa-conv-menu) .pmfa-conv-time { transition: opacity 100ms ease; }
.pmfa-conv-menu { position: absolute; inset-inline-end: 6px; bottom: 8px; z-index: 1; opacity: 0; transition: opacity 100ms ease; }
.pmfa-conv-entry:hover .pmfa-conv-menu, .pmfa-conv-entry:focus-within .pmfa-conv-menu, .pmfa-conv-menu[open] { opacity: 1; }
.pmfa-conv-entry:is(:hover, :focus-within) .pmfa-conv-indicators,
.pmfa-conv-entry:has(.pmfa-conv-menu[open]) .pmfa-conv-indicators { visibility: hidden; }
@media (hover: none), (pointer: coarse) {
  .pmfa-conv-menu { opacity: 1; top: 50%; bottom: auto; transform: translateY(-50%); }
  .pmfa-conv-entry:has(.pmfa-conv-menu) .pmfa-conv { padding-inline-end: 48px; }
  .pmfa-conv-entry:is(:hover, :focus-within) .pmfa-conv-indicators { visibility: visible; }
}
.pmfa-conv-menu[open] { z-index: 4; }
.pmfa-conv-menu summary { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; color: var(--pmfa-c-muted); cursor: pointer; list-style: none; }
.pmfa-conv-menu summary:hover { background: var(--pmfa-c-field); color: var(--pmfa-c-fg); }
.pmfa-conv-menu summary::-webkit-details-marker { display: none; }
.pmfa-conv-menu summary .pmfa-icon { width: 18px; height: 18px; }
.pmfa-conv-menu summary:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: 0; }
@media (pointer: coarse) { .pmfa-conv-menu summary { width: 44px; height: 44px; } }
.pmfa-conv-menu-items { position: absolute; inset-inline-end: 0; top: calc(100% + 4px); min-width: 196px; padding: 6px; border: 1px solid var(--pmfa-c-border); border-radius: 12px; background: var(--pmfa-c-panel); box-shadow: 0 2px 6px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.14); }
.pmfa-conv-menu-items button { display: block; width: 100%; min-height: 40px; border: 0; padding: 8px 12px; border-radius: 8px; background: none; color: inherit; font: inherit; font-size: 0.875em; text-align: start; cursor: pointer; }
.pmfa-conv-menu-items button:hover, .pmfa-conv-menu-items button:focus-visible { background: var(--pmfa-c-hover); outline: none; }
.pmfa-conv-menu-items button:disabled { opacity: .5; cursor: wait; }
.pmfa-conv-error { margin: 0; padding: 0 12px 8px 70px; color: var(--pmfa-c-danger); font-size: .8125em; }
.pmfa-badge {
  grid-area: badge;
  justify-self: end;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pmfa-c-unread);
  color: var(--pmfa-c-on-unread);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.pmfa-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, hsl(var(--pmfa-avatar-hue, 250) 65% 55%) 20%, var(--pmfa-c-panel));
  color: color-mix(in srgb, hsl(var(--pmfa-avatar-hue, 250) 70% 38%) 85%, var(--pmfa-c-fg));
  font-size: 0.9375em;
  font-weight: 600;
  letter-spacing: 0.02em;
  user-select: none;
}
.pmfa-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pmfa-avatar-s { width: 40px; height: 40px; font-size: 0.8125em; }
.pmfa-avatar-l { width: 80px; height: 80px; font-size: 1.5em; }
.pmfa-inbox-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--pmfa-s-l);
  color: var(--pmfa-c-muted);
  font-size: 0.9375em;
  text-align: center;
}
.pmfa-inbox-state > .pmfa-icon { width: 32px; height: 32px; opacity: 0.6; }
.pmfa-skeleton { display: flex; flex-direction: column; gap: 4px; padding: 0 8px; }
.pmfa-skeleton > span {
  display: block;
  height: 68px;
  border-radius: 10px;
  background: linear-gradient(90deg, var(--pmfa-c-field), color-mix(in srgb, var(--pmfa-c-fg) 9%, var(--pmfa-c-panel)), var(--pmfa-c-field));
  background-size: 200% 100%;
  animation: pmfa-shimmer 1.4s ease-in-out infinite;
}
@keyframes pmfa-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.pmfa-thread {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--pmfa-c-chat);
  container-type: inline-size;
}
.pmfa-thread > .pmfa-list { flex: 1; min-height: 0; }
.pmfa-thread-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 8px 10px 8px 16px;
  border-bottom: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-panel);
}
.pmfa-thread-who { display: flex; flex: 1; flex-direction: column; min-width: 0; line-height: 1.3; }
.pmfa-thread-name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.pmfa-thread-sub { overflow: hidden; color: var(--pmfa-c-muted); font-size: 0.8125em; text-overflow: ellipsis; white-space: nowrap; }
.pmfa-thread-actions { display: flex; flex: none; align-items: center; gap: 2px; }
.pmfa-thread-actions .pmfa-btn-icon { color: var(--pmfa-c-muted); }
.pmfa-thread-actions .pmfa-btn-ghost[aria-expanded="true"], .pmfa-thread-actions .pmfa-btn-ghost[aria-pressed="true"] { color: var(--pmfa-c-fg); background: var(--pmfa-c-field); }
.pmfa-back { display: none; }
.pmfa-back .pmfa-icon { width: 22px; height: 22px; }
[dir="rtl"] .pmfa-back .pmfa-icon, .pmfa-back:dir(rtl) .pmfa-icon { transform: scaleX(-1); }
.pmfa-thread-foot { border-top: 1px solid var(--pmfa-c-border); background: var(--pmfa-c-panel); }
.pmfa-readonly { margin: 0; padding: 14px var(--pmfa-s-l); color: var(--pmfa-c-muted); font-size: 0.875em; text-align: center; }
.pmfa-contact {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border-inline-start: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-panel);
}
.pmfa-contact-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 8px 8px 8px var(--pmfa-s-l);
  border-bottom: 1px solid var(--pmfa-c-border);
}
.pmfa-contact-head h3 { margin: 0; font-size: 1em; font-weight: 600; }
.pmfa-contact-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 28px var(--pmfa-s-m) 20px;
  text-align: center;
}
.pmfa-contact-name { margin: 8px 0 0; font-size: 1.1875em; font-weight: 600; overflow-wrap: anywhere; }
.pmfa-contact-phone { color: var(--pmfa-c-muted); font-size: 0.9375em; font-variant-numeric: tabular-nums; }
.pmfa-contact-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 10px; }
.pmfa-contact-fields { display: flex; flex-direction: column; margin: 0; padding: 0 var(--pmfa-s-l) var(--pmfa-s-l); }
.pmfa-contact-fields > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; border-top: 1px solid var(--pmfa-c-border); }
.pmfa-contact-fields dt { color: var(--pmfa-c-muted); font-size: 0.75em; font-weight: 500; }
.pmfa-contact-fields dd { margin: 0; font-size: 0.9375em; overflow-wrap: anywhere; }
/* Container queries match the inbox's children; the inbox is the container. */
@container (max-width: 1023px) {
  .pmfa-inbox > .pmfa-thread { grid-column: 2 / -1; }
  .pmfa-inbox .pmfa-contact {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 3;
    width: min(320px, 100%);
    box-shadow: var(--pmfa-shadow-panel, 0 18px 50px rgb(23 21 31 / 0.16));
    animation: pmfa-slide 180ms ease-out;
  }
}
@container (max-width: 699px) {
  .pmfa-inbox > .pmfa-inbox-list, .pmfa-inbox > .pmfa-thread { grid-column: 1 / -1; grid-row: 1; border-inline-end: 0; }
  .pmfa-inbox[data-view="thread"] .pmfa-inbox-list { display: none; }
  .pmfa-inbox[data-view="list"] .pmfa-thread { display: none; }
  .pmfa-inbox .pmfa-back { display: inline-flex; }
  .pmfa-inbox .pmfa-contact { width: 100%; border-inline-start: 0; }
  .pmfa-thread-head { padding-inline-start: 4px; }
}

/* Connect, status, call */
.pmfa-connect .pmfa-icon { width: 18px; height: 18px; }
.pmfa-connect[aria-busy="true"] { cursor: progress; }
.pmfa-session {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--pmfa-c-border);
  border-radius: 999px;
  background: var(--pmfa-c-bg);
  color: var(--pmfa-c-fg);
  font-size: 0.8125em;
  font-weight: 600;
  white-space: nowrap;
}
.pmfa-session-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--pmfa-c-muted); }
.pmfa-session[data-status="ready"] .pmfa-session-dot, .pmfa-session[data-status="refreshing"] .pmfa-session-dot { background: var(--pmfa-c-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pmfa-c-success) 22%, transparent); }
.pmfa-session[data-status="loading"] .pmfa-session-dot, .pmfa-session[data-status="retrying"] .pmfa-session-dot { background: #d9a400; animation: pmfa-pulse 1.2s ease-in-out infinite; }
.pmfa-session[data-status="error"] .pmfa-session-dot, .pmfa-session[data-status="unauthenticated"] .pmfa-session-dot { background: var(--pmfa-c-danger); }
.pmfa-session .pmfa-btn { min-height: 22px; margin-inline-end: -8px; padding: 0 8px; border-radius: 999px; font-size: 0.9em; }
@keyframes pmfa-pulse { 50% { opacity: 0.35; } }

/* Template manager */
.pmfa-tm {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--pmfa-s-m);
}
.pmfa-tm-head { display: flex; align-items: center; justify-content: space-between; gap: var(--pmfa-s-s); }
.pmfa-tm-head h2 { margin: 0; font-size: 1.25em; font-weight: 700; }
.pmfa-tm-list {
  display: grid;
  gap: var(--pmfa-s-s);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}
.pmfa-tm-item {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: var(--pmfa-s-m);
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-m);
  background: var(--pmfa-c-bg);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.pmfa-tm-item:hover { border-color: color-mix(in srgb, var(--pmfa-c-primary) 45%, var(--pmfa-c-border)); }
.pmfa-tm-item:focus-visible { outline: 2px solid var(--pmfa-c-primary); outline-offset: 2px; }
.pmfa-tm-name { font-weight: 650; overflow-wrap: anywhere; }
.pmfa-tm-body {
  display: -webkit-box;
  overflow: hidden;
  color: var(--pmfa-c-muted);
  font-size: 0.875em;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.pmfa-tm-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
.pmfa-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--pmfa-c-surface);
  color: var(--pmfa-c-muted);
  font-size: 0.6875em;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.pmfa-tag[data-status="APPROVED"], .pmfa-tag[data-status="approved"] { background: color-mix(in srgb, var(--pmfa-c-success) 15%, var(--pmfa-c-bg)); color: var(--pmfa-c-success); }
.pmfa-tag[data-status="REJECTED"], .pmfa-tag[data-status="rejected"] { background: color-mix(in srgb, var(--pmfa-c-danger) 13%, var(--pmfa-c-bg)); color: var(--pmfa-c-danger); }

@media (prefers-reduced-motion: reduce) {
  .pmfa *, .pmfa *::before, .pmfa *::after, .pmfa-drawer, .pmfa-popover {
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
