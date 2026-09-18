import type { DevAssistant, DevAssistantSnapshot } from "./model.js";

export type DevAssistantPosition =
  "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface MountDevAssistantOptions {
  /** Corner for the launcher. Defaults to `"bottom-left"`. */
  readonly position?: DevAssistantPosition;
  /** Open the panel on first mount. Defaults to `false`. */
  readonly defaultOpen?: boolean;
  /** Distance from the viewport edges in pixels. Defaults to 16 each. */
  readonly offset?: { readonly x?: number; readonly y?: number };
  /** Element to mount into. Defaults to `document.body`. */
  readonly parent?: HTMLElement;
}

export interface MountedDevAssistant {
  /** Host element; the launcher and panel live in its open shadow root. */
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

const STORAGE_KEY = "polymorfa:devtools:open";

function readOpen(): boolean | undefined {
  try {
    const value = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    return value === "1" ? true : value === "0" ? false : undefined;
  } catch {
    return undefined;
  }
}

function writeOpen(open: boolean): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Storage can be blocked; the state then lasts for this page only.
  }
}

const STYLES = `
:host {
  all: initial;
  --bg: #ffffff;
  --fg: #17151f;
  --muted: #6d6878;
  --border: #e4e1ea;
  --surface: #f5f4f8;
  --accent: #5b4bf7;
  --on-accent: #ffffff;
  --shadow: 0 24px 60px rgb(23 21 31 / 0.18), 0 2px 8px rgb(23 21 31 / 0.08);
  position: fixed;
  z-index: 2147483647;
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--fg);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #1c1b22;
    --fg: #f1eff6;
    --muted: #a19cae;
    --border: #34313e;
    --surface: #26242e;
    --accent: #8b80ff;
    --on-accent: #120f2b;
    --shadow: 0 24px 60px rgb(0 0 0 / 0.5), 0 2px 8px rgb(0 0 0 / 0.3);
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
button, select { font: inherit; color: inherit; }
.launcher {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg);
  color: var(--accent);
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.16);
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 120ms ease, transform 120ms ease, background-color 120ms ease;
}
.launcher:hover, .launcher[aria-expanded="true"] { opacity: 1; }
.launcher[aria-expanded="true"] { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.launcher:active { transform: scale(0.94); }
.launcher svg { width: 20px; height: 20px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.panel {
  position: absolute;
  width: min(320px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 88px));
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  box-shadow: var(--shadow);
  transform-origin: var(--origin);
  transition: opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms;
}
.panel[hidden] { display: block; visibility: hidden; opacity: 0; transform: scale(0.96); pointer-events: none; }
.panel:not([hidden]) { transition-delay: 0s; }
:host([data-position^="bottom"]) .panel { bottom: 48px; }
:host([data-position^="top"]) .panel { top: 48px; }
:host([data-position$="left"]) .panel { left: 0; }
:host([data-position$="right"]) .panel { right: 0; }
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 10px 14px;
  border-bottom: 1px solid var(--border);
}
h2 { flex: 1; margin: 0; font-size: 13px; font-weight: 650; }
.icon-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.icon-button:hover { background: var(--surface); color: var(--fg); }
.icon-button svg { width: 16px; height: 16px; }
.body { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 14px; }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
legend, .label { display: block; margin-bottom: 6px; padding: 0; color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--surface);
}
.segmented label { flex: 1; position: relative; }
.segmented input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.segmented span {
  display: block;
  padding: 5px 4px;
  border-radius: 7px;
  color: var(--muted);
  font-weight: 550;
  text-align: center;
  text-transform: capitalize;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.segmented input:checked + span { background: var(--bg); color: var(--fg); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
.segmented input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: -2px; }
.select { position: relative; }
.select select {
  appearance: none;
  width: 100%;
  min-height: 32px;
  padding: 5px 30px 5px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  text-transform: capitalize;
  cursor: pointer;
}
.select svg { position: absolute; right: 10px; top: 50%; width: 14px; height: 14px; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.events { flex: 1; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.button {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  cursor: pointer;
}
.button:hover { filter: brightness(1.08); }
@media (prefers-reduced-motion: reduce) {
  .launcher, .panel, .segmented span { transition: none; }
}
`;

const SVG = "http://www.w3.org/2000/svg";
function svgIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

const ICONS = {
  wrench:
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z",
  close: "M18 6 6 18M6 6l12 12",
  chevron: "m6 9 6 6 6-6",
};

let instance = 0;

function isOptions(
  value: HTMLElement | MountDevAssistantOptions | undefined,
): value is MountDevAssistantOptions {
  return (
    value !== undefined &&
    !(typeof HTMLElement !== "undefined" && value instanceof HTMLElement)
  );
}

/**
 * Mount the development panel: a small launcher in a corner that opens the
 * panel next to it. Returns `null` when the assistant is disabled. The
 * second argument may also be the parent element, as in earlier versions.
 */
export function mountDevAssistant(
  assistant: DevAssistant,
  options: MountDevAssistantOptions | HTMLElement = {},
): MountedDevAssistant | null {
  if (!assistant.getSnapshot().enabled) return null;
  const settings: MountDevAssistantOptions = isOptions(options)
    ? options
    : { parent: options };
  const parent = settings.parent ?? document.body;
  const position = settings.position ?? "bottom-left";
  const x = settings.offset?.x ?? 16;
  const y = settings.offset?.y ?? 16;
  const id = `pmfa-devtools-${++instance}`;

  const host = document.createElement("div");
  host.dataset.polymorfaDevtools = "";
  host.dataset.position = position;
  const [vertical, horizontal] = position.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  host.style.setProperty(vertical, `${y}px`);
  host.style.setProperty(horizontal, `${x}px`);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", "Polymorfa dev mode");
  launcher.setAttribute("aria-controls", `${id}-panel`);
  launcher.title = "Polymorfa dev mode";
  launcher.append(svgIcon(ICONS.wrench));

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = `${id}-panel`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Polymorfa developer assistant");
  panel.style.setProperty("--origin", `${vertical} ${horizontal}`);

  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = "Polymorfa dev mode";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-button";
  close.setAttribute("aria-label", "Close dev mode");
  close.append(svgIcon(ICONS.close));
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "body";
  const controls = [
    segmented(`${id}-theme`, "Theme", ["system", "light", "dark"], (value) =>
      assistant.configure({ theme: value as "system" | "light" | "dark" }),
    ),
    segmented(`${id}-direction`, "Direction", ["auto", "ltr", "rtl"], (value) =>
      assistant.configure({ direction: value as "auto" | "ltr" | "rtl" }),
    ),
    segmented(
      `${id}-motion`,
      "Motion",
      ["system", "full", "reduced"],
      (value) =>
        assistant.configure({
          motion: value as "system" | "full" | "reduced",
        }),
    ),
    select(
      `${id}-viewport`,
      "Viewport",
      ["responsive", "mobile", "tablet", "desktop"],
      (value) =>
        assistant.configure({
          viewport: value as DevAssistantSnapshot["viewport"],
        }),
    ),
    segmented(
      `${id}-network`,
      "Network",
      ["online", "slow", "offline"],
      (value) =>
        assistant.configure({
          network: value as DevAssistantSnapshot["network"],
        }),
    ),
  ];
  body.append(...controls.map((control) => control.node));

  const footer = document.createElement("footer");
  const events = document.createElement("span");
  events.className = "events";
  events.setAttribute("aria-live", "polite");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button";
  copy.textContent = "Copy configuration";
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  copy.addEventListener("click", () => {
    void navigator.clipboard
      ?.writeText(assistant.copyableConfig())
      .then(() => {
        copy.textContent = "Copied";
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copy.textContent = "Copy configuration";
        }, 1500);
      })
      .catch(() => undefined);
  });
  footer.append(events, copy);
  panel.append(header, body, footer);
  shadow.append(style, panel, launcher);
  parent.append(host);

  let isOpen = readOpen() ?? settings.defaultOpen ?? false;
  const apply = () => {
    panel.hidden = !isOpen;
    launcher.setAttribute("aria-expanded", String(isOpen));
  };
  const setOpen = (next: boolean, focus: boolean) => {
    if (next === isOpen) return;
    isOpen = next;
    writeOpen(next);
    apply();
    if (!focus) return;
    if (next)
      panel
        .querySelector<HTMLElement>("input:checked, select, button")
        ?.focus();
    else launcher.focus();
  };
  apply();
  // Opening from the launcher moves focus into the panel, which precedes the
  // launcher in tab order; closing leaves focus on the launcher itself.
  launcher.addEventListener("click", () => setOpen(!isOpen, true));
  close.addEventListener("click", () => setOpen(false, true));
  shadow.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key !== "Escape" || !isOpen || key.isComposing) return;
    key.preventDefault();
    key.stopPropagation();
    setOpen(false, true);
  });

  const render = (): void => {
    const snapshot = assistant.getSnapshot();
    panel.dir = snapshot.direction === "rtl" ? "rtl" : "ltr";
    const values = [
      snapshot.appearance.theme,
      snapshot.direction,
      snapshot.motion,
      snapshot.viewport,
      snapshot.network,
    ];
    controls.forEach((control, index) => control.set(values[index] ?? ""));
    const count = snapshot.events.length;
    events.textContent = `${count} redacted request event${count === 1 ? "" : "s"}`;
  };
  const unsubscribe = assistant.subscribe(render);
  render();

  return {
    element: host,
    get isOpen() {
      return isOpen;
    },
    open: () => setOpen(true, false),
    close: () => setOpen(false, false),
    toggle: () => setOpen(!isOpen, false),
    dispose: () => {
      unsubscribe();
      clearTimeout(copyTimer);
      host.remove();
    },
  };
}

interface Control {
  readonly node: HTMLElement;
  set(value: string): void;
}

function segmented(
  name: string,
  label: string,
  options: readonly string[],
  onChange: (value: string) => void,
): Control {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = label;
  const group = document.createElement("div");
  group.className = "segmented";
  const inputs = options.map((option) => {
    const wrapper = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option;
    input.addEventListener("change", () => {
      if (input.checked) onChange(option);
    });
    const text = document.createElement("span");
    text.textContent = option;
    wrapper.append(input, text);
    group.append(wrapper);
    return input;
  });
  fieldset.append(legend, group);
  return {
    node: fieldset,
    set: (value) => {
      for (const input of inputs) input.checked = input.value === value;
    },
  };
}

function select(
  id: string,
  label: string,
  options: readonly string[],
  onChange: (value: string) => void,
): Control {
  const wrapper = document.createElement("div");
  const caption = document.createElement("label");
  caption.className = "label";
  caption.htmlFor = id;
  caption.textContent = label;
  const box = document.createElement("div");
  box.className = "select";
  const control = document.createElement("select");
  control.id = id;
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    control.add(item);
  }
  control.addEventListener("change", () => onChange(control.value));
  box.append(control, svgIcon(ICONS.chevron));
  wrapper.append(caption, box);
  return {
    node: wrapper,
    set: (value) => {
      if (control.value !== value) control.value = value;
    },
  };
}
