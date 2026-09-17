import {
  COMPONENT_STYLES,
  ENGLISH_MESSAGES,
  appearanceToCssVariables,
  createLocale,
  defineAppearance,
  slotPartName,
  slotStyleEntries,
  themeClassName,
  type Appearance,
  type AppearanceInput,
  type ComponentSlot,
  type Locale,
  type MessageKey,
} from "@polymorfa/ui";

export interface ElementController<T extends object> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

/** CSS adopted inside the shadow root after the default stylesheet. */
export type ElementStylesheet =
  string | CSSStyleSheet | readonly (string | CSSStyleSheet)[];

export interface ElementConfiguration {
  readonly appearance?: AppearanceInput;
  readonly locale?: Locale;
  /**
   * Extra CSS for the shadow root, applied after the default stylesheet (or
   * alone when `appearance.unstyled` is set).
   */
  readonly stylesheet?: ElementStylesheet;
}

const HTMLElementBase = (globalThis.HTMLElement ??
  class {}) as typeof HTMLElement;

const BASE_STYLES = `
:host { display: block; color: var(--pmfa-color-foreground); font: var(--pmfa-font-size-base)/1.45 var(--pmfa-font-family); }
*, *::before, *::after { box-sizing: border-box; }
[part~="panel"] { background: var(--pmfa-c-bg, var(--pmfa-color-background)); color: var(--pmfa-c-fg, inherit); border: 1px solid var(--pmfa-c-border, var(--pmfa-color-border)); border-radius: var(--pmfa-radius-large); box-shadow: var(--pmfa-shadow-panel); padding: var(--pmfa-spacing-large); }
button, input, textarea, select { font: inherit; }
button { border: 0; border-radius: var(--pmfa-radius-medium); padding: var(--pmfa-spacing-small) var(--pmfa-spacing-medium); cursor: pointer; }
button[part~="primary"] { background: var(--pmfa-color-primary); color: white; }
[part~="call"] { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pmfa-spacing-small); }
[part~="call"] > h2, [part~="call"] > p { flex: 1 1 100%; margin: 0; }
[part~="call"] > [part~="peer"] { color: var(--pmfa-c-muted, var(--pmfa-color-muted)); font-variant-numeric: tabular-nums; margin-bottom: var(--pmfa-spacing-small); }
[part~="muted"] { color: var(--pmfa-color-muted); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`;

const DEFAULT_STYLES = `@layer polymorfa {${BASE_STYLES}}\n${COMPONENT_STYLES}`;

function supportsAdoptedSheets(): boolean {
  return (
    typeof CSSStyleSheet === "function" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function" &&
    typeof ShadowRoot === "function" &&
    "adoptedStyleSheets" in ShadowRoot.prototype
  );
}

// Constructable sheets are shared by every element in the document.
let defaultSheet: CSSStyleSheet | undefined;
/** Custom CSS text sheets, least recently used first. */
const textSheets = new Map<string, CSSStyleSheet>();
const MAX_TEXT_SHEETS = 32;

function constructedSheet(css: string): CSSStyleSheet {
  if (css === DEFAULT_STYLES) {
    if (defaultSheet === undefined) {
      defaultSheet = new CSSStyleSheet();
      defaultSheet.replaceSync(css);
    }
    return defaultSheet;
  }
  let sheet = textSheets.get(css);
  if (sheet === undefined) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
  } else textSheets.delete(css);
  textSheets.set(css, sheet);
  while (textSheets.size > MAX_TEXT_SHEETS) {
    const oldest = textSheets.keys().next().value;
    if (oldest === undefined) break;
    textSheets.delete(oldest);
  }
  return sheet;
}

/** @internal Number of cached custom CSS text sheets, for tests. */
export function cachedTextSheetCount(): number {
  return textSheets.size;
}

function sheetText(sheet: string | CSSStyleSheet): string {
  if (typeof sheet === "string") return sheet;
  try {
    return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
  } catch {
    return "";
  }
}

function sameNodes(current: NodeListOf<ChildNode>, next: readonly Node[]) {
  if (current.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1)
    if (current[index] !== next[index]) return false;
  return true;
}

export abstract class PolymorfaElement<
  T extends object,
> extends HTMLElementBase {
  #controller: ElementController<T> | undefined;
  #unsubscribe: (() => void) | undefined;
  #configuration: ElementConfiguration = {};
  #appearance: Appearance = defineAppearance();
  #locale: Locale = createLocale("en");
  #styleNodes: HTMLStyleElement[] = [];
  #adoptedKey: readonly (string | CSSStyleSheet)[] = [];
  #variables = new Set<string>();
  /** Bumped whenever configuration changes; cached nodes compare it. */
  protected generation = 0;
  protected readonly root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open", delegatesFocus: true });
  }

  get controller(): ElementController<T> | undefined {
    return this.#controller;
  }
  set controller(controller: ElementController<T> | undefined) {
    if (controller === this.#controller) return;
    this.#unsubscribe?.();
    this.#controller = controller;
    this.#unsubscribe = undefined;
    if (this.isConnected) this.#bind();
    this.render();
  }

  get configuration(): ElementConfiguration {
    return this.#configuration;
  }
  set configuration(configuration: ElementConfiguration) {
    this.#configuration = configuration;
    this.#appearance = defineAppearance(configuration.appearance);
    this.#locale = configuration.locale ?? createLocale("en");
    this.generation += 1;
    this.render();
  }

  connectedCallback(): void {
    this.#bind();
    this.render();
  }
  disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  protected snapshot(): T | undefined {
    return this.#controller?.getSnapshot();
  }
  protected configuredController<TController>(): TController | undefined {
    return this.#controller as TController | undefined;
  }
  protected locale(): Locale {
    return this.#locale;
  }
  protected appearance(): Appearance {
    return this.#appearance;
  }
  /** Root classes for the rendered surface: theme plus the given names. */
  protected rootClass(names: string): string {
    return `${themeClassName(this.#appearance.theme)} ${names}`;
  }
  protected text(
    key: MessageKey,
    values: Readonly<Record<string, string>> = {},
  ): string {
    const template = this.#locale.messages[key] ?? ENGLISH_MESSAGES[key];
    return template.replace(
      /\{(\w+)\}/g,
      (_, name: string) => values[name] ?? "",
    );
  }
  /**
   * Mark a node as a slot: add its kebab-case part name, and apply
   * `appearance.elements[slot]` as a class and inline styles.
   */
  protected decorate<N extends Element>(node: N, slot: ComponentSlot): N {
    node.setAttribute(
      "part",
      [
        ...new Set([
          ...(node.getAttribute("part") ?? "").split(/\s+/),
          slotPartName(slot),
        ]),
      ]
        .filter(Boolean)
        .join(" "),
    );
    const element = this.#appearance.elements[slot];
    if (element?.className !== undefined && element.className !== "")
      node.classList.add(...element.className.split(/\s+/).filter(Boolean));
    if (node instanceof HTMLElement || node instanceof SVGElement)
      for (const [name, value] of slotStyleEntries(element?.styles))
        node.style.setProperty(name, value);
    return node;
  }
  protected abstract renderContent(
    snapshot: T | undefined,
    locale: Locale,
  ): readonly Node[];

  protected render(): void {
    const appearance = this.#appearance;
    const locale = this.#locale;
    this.dir =
      appearance.layout.direction === "auto"
        ? locale.direction
        : appearance.layout.direction;
    const variables: Record<string, string> = {
      ...appearanceToCssVariables(appearance),
      "--pmfa-drawer-width": appearance.layout.drawerWidth,
    };
    for (const name of this.#variables)
      if (!(name in variables)) this.style.removeProperty(name);
    this.#variables = new Set(Object.keys(variables));
    for (const [name, value] of Object.entries(variables))
      if (this.style.getPropertyValue(name) !== value)
        this.style.setProperty(name, value);
    const styles = this.#styles();
    const content = this.renderContent(this.snapshot(), locale);
    const next = [...styles, ...content];
    // Replace only when the node list changed, so stable nodes keep focus,
    // scroll position, and their live-region state.
    if (!sameNodes(this.root.childNodes, next))
      this.root.replaceChildren(...next);
    this.dispatchEvent(
      new CustomEvent("pmfa-render", { bubbles: true, composed: true }),
    );
  }

  /** Adopt the shared sheets, or keep `<style>` fallbacks up to date. */
  #styles(): readonly Node[] {
    const extra = this.#configuration.stylesheet;
    const sheets: (string | CSSStyleSheet)[] = [
      ...(this.#appearance.unstyled === true ? [] : [DEFAULT_STYLES]),
      ...(extra === undefined
        ? []
        : typeof extra === "string" || !Array.isArray(extra)
          ? [extra as string | CSSStyleSheet]
          : extra),
    ];
    if (supportsAdoptedSheets()) {
      const changed =
        sheets.length !== this.#adoptedKey.length ||
        sheets.some((sheet, index) => sheet !== this.#adoptedKey[index]);
      if (changed) {
        this.#adoptedKey = sheets;
        this.root.adoptedStyleSheets = sheets.map((sheet) =>
          typeof sheet === "string" ? constructedSheet(sheet) : sheet,
        );
      }
      return [];
    }
    const texts = sheets.map(sheetText);
    this.#styleNodes = texts.map((css, index) => {
      const node = this.#styleNodes[index] ?? document.createElement("style");
      if (node.textContent !== css) node.textContent = css;
      return node;
    });
    return this.#styleNodes;
  }

  #bind(): void {
    if (this.#controller === undefined || this.#unsubscribe !== undefined)
      return;
    this.#unsubscribe = this.#controller.subscribe(() => {
      this.render();
      this.dispatchEvent(
        new CustomEvent("pmfa-state-change", {
          detail: this.#controller?.getSnapshot(),
          bubbles: true,
          composed: true,
        }),
      );
    });
  }
}

export function element(name: string, part?: string): HTMLElement {
  const value = document.createElement(name);
  if (part !== undefined) value.setAttribute("part", part);
  return value;
}

export function textElement(
  name: string,
  text: string,
  part?: string,
): HTMLElement {
  const value = element(name, part);
  value.textContent = text;
  return value;
}

export function button(
  label: string,
  part: string,
  action: () => void,
  className = "pmfa-btn",
): HTMLButtonElement {
  const value = document.createElement("button");
  value.type = "button";
  value.className = className;
  value.setAttribute("part", part);
  value.textContent = label;
  value.addEventListener("click", action);
  return value;
}
