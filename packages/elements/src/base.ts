import {
  appearanceToCssVariables,
  createLocale,
  defineAppearance,
  type AppearanceInput,
  type Locale,
} from "@polymorfa/ui";

export interface ElementController<T extends object> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export interface ElementConfiguration {
  readonly appearance?: AppearanceInput;
  readonly locale?: Locale;
}

const HTMLElementBase = (globalThis.HTMLElement ??
  class {}) as typeof HTMLElement;

export abstract class PolymorfaElement<
  T extends object,
> extends HTMLElementBase {
  #controller: ElementController<T> | undefined;
  #unsubscribe: (() => void) | undefined;
  #configuration: ElementConfiguration = {};
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
    return this.#configuration.locale ?? createLocale("en");
  }
  protected abstract renderContent(
    snapshot: T | undefined,
    locale: Locale,
  ): readonly Node[];

  protected render(): void {
    const appearance = defineAppearance(this.#configuration.appearance);
    const locale = this.locale();
    this.dir =
      appearance.layout.direction === "auto"
        ? locale.direction
        : appearance.layout.direction;
    for (const [name, value] of Object.entries(
      appearanceToCssVariables(appearance),
    ))
      this.style.setProperty(name, value);
    const style = document.createElement("style");
    style.textContent = BASE_STYLES;
    this.root.replaceChildren(
      style,
      ...this.renderContent(this.snapshot(), locale),
    );
    this.dispatchEvent(
      new CustomEvent("pmfa-render", { bubbles: true, composed: true }),
    );
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
): HTMLButtonElement {
  const value = document.createElement("button");
  value.type = "button";
  value.setAttribute("part", part);
  value.textContent = label;
  value.addEventListener("click", action);
  return value;
}

const BASE_STYLES = `
:host { color: var(--pmfa-color-foreground); font: var(--pmfa-font-size-base)/1.45 var(--pmfa-font-family); }
*, *::before, *::after { box-sizing: border-box; }
[part~="panel"] { background: var(--pmfa-color-background); border: 1px solid var(--pmfa-color-border); border-radius: var(--pmfa-radius-large); box-shadow: var(--pmfa-shadow-panel); padding: var(--pmfa-spacing-large); }
button, input, textarea, select { font: inherit; }
button { border: 0; border-radius: var(--pmfa-radius-medium); padding: var(--pmfa-spacing-small) var(--pmfa-spacing-medium); cursor: pointer; }
button[part~="primary"] { background: var(--pmfa-color-primary); color: white; }
[part~="muted"] { color: var(--pmfa-color-muted); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`;
