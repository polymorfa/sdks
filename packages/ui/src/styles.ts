/**
 * Stylesheet shared by the chat and template surfaces of `@polymorfa/react`
 * and `@polymorfa/elements`. Both render the same `pmfa-*` class names, so a
 * host restyling one package gets the same result in the other.
 *
 * Colors come from the appearance variables. The dark palette applies to
 * `.pmfa-dark` roots, and to `.pmfa-auto` roots when the system prefers dark.
 */
export const COMPONENT_STYLES = `
.pmfa {
  --pmfa-c-bg: var(--pmfa-color-background, #ffffff);
  --pmfa-c-fg: var(--pmfa-color-foreground, #17151f);
  --pmfa-c-muted: var(--pmfa-color-muted, #6d6878);
  --pmfa-c-border: var(--pmfa-color-border, #dedbe5);
  --pmfa-c-primary: var(--pmfa-color-primary, #5b4bf7);
  --pmfa-c-danger: var(--pmfa-color-danger, #c62828);
  --pmfa-c-surface: color-mix(in srgb, var(--pmfa-c-fg) 4%, var(--pmfa-c-bg));
  --pmfa-c-in: color-mix(in srgb, var(--pmfa-c-fg) 6%, var(--pmfa-c-bg));
  --pmfa-c-out: var(--pmfa-c-primary);
  --pmfa-c-on-out: #ffffff;
  --pmfa-c-chat: color-mix(in srgb, var(--pmfa-c-fg) 2%, var(--pmfa-c-bg));
  --pmfa-r-s: var(--pmfa-radius-small, 6px);
  --pmfa-r-m: var(--pmfa-radius-medium, 10px);
  --pmfa-r-l: var(--pmfa-radius-large, 16px);
  --pmfa-s-s: var(--pmfa-spacing-small, 8px);
  --pmfa-s-m: var(--pmfa-spacing-medium, 12px);
  --pmfa-s-l: var(--pmfa-spacing-large, 20px);
  box-sizing: border-box;
  color: var(--pmfa-c-fg);
  font-family: var(--pmfa-font-family, system-ui, sans-serif);
  font-size: var(--pmfa-font-size-base, 16px);
  line-height: 1.45;
  -webkit-text-size-adjust: 100%;
}
.pmfa *, .pmfa *::before, .pmfa *::after { box-sizing: border-box; }
.pmfa-dark {
  --pmfa-c-bg: #17161c;
  --pmfa-c-fg: #f1eff6;
  --pmfa-c-muted: #a39fae;
  --pmfa-c-border: #34313d;
  --pmfa-c-danger: #ff7a7a;
  --pmfa-c-in: #25232d;
  --pmfa-c-chat: #121116;
}
@media (prefers-color-scheme: dark) {
  .pmfa-auto {
    --pmfa-c-bg: #17161c;
    --pmfa-c-fg: #f1eff6;
    --pmfa-c-muted: #a39fae;
    --pmfa-c-border: #34313d;
    --pmfa-c-danger: #ff7a7a;
    --pmfa-c-in: #25232d;
    --pmfa-c-chat: #121116;
  }
}

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
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.pmfa-btn:hover:not(:disabled) { background: var(--pmfa-c-surface); }
.pmfa-btn:focus-visible, .pmfa-input:focus-visible {
  outline: 2px solid var(--pmfa-c-primary);
  outline-offset: 2px;
}
.pmfa-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pmfa-btn-primary {
  border-color: transparent;
  background: var(--pmfa-c-primary);
  color: #ffffff;
}
.pmfa-btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pmfa-c-primary) 88%, #000000);
}
.pmfa-btn-danger { border-color: transparent; background: var(--pmfa-c-danger); color: #ffffff; }
.pmfa-btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pmfa-c-danger) 88%, #000000);
}
.pmfa-btn-ghost { border-color: transparent; background: transparent; }
.pmfa-btn-icon { width: 40px; padding: 0; }
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
.pmfa-input::placeholder { color: var(--pmfa-c-muted); }
.pmfa-error { margin: 0; color: var(--pmfa-c-danger); font-size: 0.875em; }

/* Message list */
.pmfa-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: var(--pmfa-s-m);
  list-style: none;
  background: var(--pmfa-c-chat);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pmfa-list > li { display: flex; flex-direction: column; min-width: 0; }
.pmfa-loadmore { align-self: center; margin-bottom: var(--pmfa-s-s); }
.pmfa-loadmore .pmfa-btn { min-height: 32px; border-radius: 999px; font-size: 0.8125em; }
.pmfa-empty {
  align-self: center;
  margin: auto;
  padding: var(--pmfa-s-l);
  color: var(--pmfa-c-muted);
  font-size: 0.875em;
}
.pmfa-msg { max-width: min(80%, 34em); }
.pmfa-msg-in { align-self: flex-start; align-items: flex-start; }
.pmfa-msg-out { align-self: flex-end; align-items: flex-end; }
.pmfa-msg + .pmfa-msg-in:not(.pmfa-msg-in + .pmfa-msg-in),
.pmfa-msg + .pmfa-msg-out:not(.pmfa-msg-out + .pmfa-msg-out) { margin-top: 8px; }
.pmfa-bubble {
  padding: 7px 12px 8px;
  border-radius: 18px;
  background: var(--pmfa-c-in);
  color: var(--pmfa-c-fg);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pmfa-msg-in .pmfa-bubble { border-end-start-radius: 6px; }
.pmfa-msg-out .pmfa-bubble {
  border-end-end-radius: 6px;
  background: var(--pmfa-c-out);
  color: var(--pmfa-c-on-out);
}
.pmfa-msg-pending .pmfa-bubble { opacity: 0.7; }
.pmfa-msg-failed .pmfa-bubble {
  background: color-mix(in srgb, var(--pmfa-c-danger) 14%, var(--pmfa-c-bg));
  color: var(--pmfa-c-fg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pmfa-c-danger) 45%, transparent);
}
.pmfa-meta {
  margin: 2px 6px 0;
  color: var(--pmfa-c-muted);
  font-size: 0.6875em;
  font-variant-numeric: tabular-nums;
}
.pmfa-msg-failed .pmfa-meta { color: var(--pmfa-c-danger); font-weight: 600; }

/* Composer */
.pmfa-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--pmfa-s-s);
  margin: 0;
  padding: var(--pmfa-s-s);
  border-top: 1px solid var(--pmfa-c-border);
  background: var(--pmfa-c-bg);
}
.pmfa-composer .pmfa-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  max-height: 160px;
  border-radius: 20px;
  padding: 9px 16px;
  resize: none;
  field-sizing: content;
}
.pmfa-composer .pmfa-btn { border-radius: 20px; flex: none; }
.pmfa-composer-standalone {
  border: 1px solid var(--pmfa-c-border);
  border-radius: var(--pmfa-r-l);
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
.pmfa-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pmfa-s-s);
  min-height: 56px;
  padding-block: max(8px, env(safe-area-inset-top)) 8px;
  padding-inline: var(--pmfa-s-l) 8px;
  border-bottom: 1px solid var(--pmfa-c-border);
}
.pmfa-drawer-title { margin: 0; font-size: 1.0625em; font-weight: 650; }
.pmfa-drawer .pmfa-list { flex: 1; min-height: 0; }
.pmfa-drawer-footer { padding-bottom: env(safe-area-inset-bottom); }
.pmfa-drawer-footer .pmfa-composer { border-top: 1px solid var(--pmfa-c-border); }
.pmfa-drawer .pmfa-error { padding: var(--pmfa-s-s) var(--pmfa-s-l); }
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
  background: var(--pmfa-c-bg);
  box-shadow: 0 1px 1px rgb(0 0 0 / 0.08);
  overflow-wrap: anywhere;
}
.pmfa-preview-header { font-weight: 700; }
.pmfa-preview-body { margin: 0; white-space: pre-wrap; font-size: 0.9375em; }
.pmfa-preview-footer { color: var(--pmfa-c-muted); font-size: 0.8125em; }
.pmfa-preview-button {
  display: block;
  padding: 8px;
  border-radius: 10px;
  background: var(--pmfa-c-bg);
  box-shadow: 0 1px 1px rgb(0 0 0 / 0.08);
  color: #0a84c7;
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
