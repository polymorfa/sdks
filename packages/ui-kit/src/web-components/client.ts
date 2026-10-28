import {
  PolymorfaClient,
  warnMissingPermission,
  type PolymorfaClientSnapshot,
  type PolymorfaPermission,
} from "../browser/index.js";
import { CHAT_ICONS, type ChatIconName } from "../appearance/index.js";
import { PolymorfaElement, type ElementConfiguration } from "./base.js";

/** The client and configuration `defineUiKit()` installs for every element. */
export const defaults: {
  client: PolymorfaClient | undefined;
  configuration: ElementConfiguration | undefined;
} = { client: undefined, configuration: undefined };

export function icon(name: ChatIconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "pmfa-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", CHAT_ICONS[name]);
  svg.append(path);
  return svg;
}

/** Shared base: a provider client, its permissions and one warning each. */
export abstract class ClientElement<T extends object> extends PolymorfaElement<T> {
  #client: PolymorfaClient | undefined;
  #unsubscribeClient: (() => void) | undefined;
  #configured = false;

  /** Defaults to the client from `defineUiKit()`. */
  get client(): PolymorfaClient | undefined {
    return this.#client ?? defaults.client;
  }
  set client(value: PolymorfaClient | undefined) {
    this.#unbindClient();
    this.#client = value;
    if (this.isConnected) this.#bindClient();
    this.render();
  }

  override connectedCallback(): void {
    if (!this.#configured && defaults.configuration !== undefined) {
      this.#configured = true;
      this.configuration = { ...defaults.configuration, ...this.configuration };
    }
    this.#bindClient();
    super.connectedCallback();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbindClient();
  }

  protected clientSnapshot(): PolymorfaClientSnapshot | undefined {
    return this.client?.getSnapshot();
  }
  /** Whether a control may render; warns once when a minted grant lacks it. */
  protected allowed(
    component: string,
    control: string,
    permission: PolymorfaPermission,
  ): boolean {
    const snapshot = this.clientSnapshot();
    if (snapshot === undefined) return false;
    const allowed = snapshot.grant?.allow.includes(permission) === true;
    if (!allowed && snapshot.grant !== undefined)
      warnMissingPermission(component, control, permission);
    return allowed;
  }
  protected onClientChange(): void {
    this.render();
  }

  #bindClient(): void {
    const client = this.client;
    if (client === undefined || this.#unsubscribeClient !== undefined) return;
    try {
      this.#unsubscribeClient = client.subscribe(() => this.onClientChange());
    } catch {
      // Disposed client.
    }
  }
  #unbindClient(): void {
    this.#unsubscribeClient?.();
    this.#unsubscribeClient = undefined;
  }
}

export function initials(name: string): string {
  const letters = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word)[0] ?? "");
  const first = letters[0] ?? "";
  const last = letters.length > 1 ? (letters[letters.length - 1] ?? "") : "";
  return (first + last).toUpperCase() || "#";
}

export function hue(id: string): number {
  let hash = 0;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 2654435761);
  return Math.round(Math.abs(hash % 360) * 137.508) % 360;
}
