import type { BrowserDiagnosticEvent } from "@polymorfa/browser";
import {
  defineAppearance,
  redactDiagnostic,
  type Appearance,
  type AppearanceInput,
  type Direction,
  type MotionPreference,
  type Theme,
} from "@polymorfa/ui";

export type RuntimeEnvironment =
  "development" | "test" | "preview" | "production";
export type NetworkProfile = "online" | "slow" | "offline";
export type ViewportPreset = "responsive" | "mobile" | "tablet" | "desktop";

export interface DevAssistantSettings {
  readonly appearance: Appearance;
  readonly locale: string;
  readonly direction: Direction;
  readonly motion: MotionPreference;
  readonly viewport: ViewportPreset;
  readonly network: NetworkProfile;
}

export interface DevAssistantOptions {
  /** Must come from trusted build or server configuration, never the URL. */
  readonly environment: RuntimeEnvironment;
  /** Environment asserted by the client-token minting service. */
  readonly tokenEnvironment: RuntimeEnvironment;
  readonly appearance?: AppearanceInput;
  readonly locale?: string;
  readonly maxEvents?: number;
}

export interface DevAssistantSnapshot extends DevAssistantSettings {
  readonly enabled: boolean;
  readonly events: readonly unknown[];
}

export class DevAssistant {
  readonly #enabled: boolean;
  readonly #maxEvents: number;
  readonly #listeners = new Set<() => void>();
  #settings: DevAssistantSettings;
  #events: unknown[] = [];

  constructor(options: DevAssistantOptions) {
    this.#enabled =
      options.environment !== "production" &&
      options.tokenEnvironment !== "production" &&
      options.environment === options.tokenEnvironment;
    this.#maxEvents = Math.max(1, Math.floor(options.maxEvents ?? 50));
    const appearance = defineAppearance(options.appearance);
    this.#settings = Object.freeze({
      appearance,
      locale: options.locale ?? "en",
      direction: appearance.layout.direction,
      motion: appearance.variables.motion,
      viewport: "responsive" as const,
      network: "online" as const,
    });
  }

  getSnapshot = (): DevAssistantSnapshot =>
    Object.freeze({
      ...this.#settings,
      enabled: this.#enabled,
      events: Object.freeze([...this.#events]),
    });

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  diagnosticSink = (event: BrowserDiagnosticEvent): void => {
    if (!this.#enabled) return;
    this.#events = [...this.#events, redactDiagnostic(event)].slice(
      -this.#maxEvents,
    );
    this.#emit();
  };

  configure(input: {
    readonly theme?: Theme;
    readonly locale?: string;
    readonly direction?: Direction;
    readonly motion?: MotionPreference;
    readonly viewport?: ViewportPreset;
    readonly network?: NetworkProfile;
  }): void {
    if (!this.#enabled) return;
    const appearance = defineAppearance({
      ...this.#settings.appearance,
      ...(input.theme === undefined ? {} : { theme: input.theme }),
      variables: {
        ...this.#settings.appearance.variables,
        ...(input.motion === undefined ? {} : { motion: input.motion }),
      },
      layout: {
        ...this.#settings.appearance.layout,
        ...(input.direction === undefined
          ? {}
          : { direction: input.direction }),
      },
    });
    this.#settings = Object.freeze({
      appearance,
      locale: input.locale ?? this.#settings.locale,
      direction: input.direction ?? this.#settings.direction,
      motion: input.motion ?? this.#settings.motion,
      viewport: input.viewport ?? this.#settings.viewport,
      network: input.network ?? this.#settings.network,
    });
    this.#emit();
  }

  copyableConfig(): string {
    return JSON.stringify(this.#settings, null, 2);
  }

  clearEvents(): void {
    if (!this.#enabled) return;
    this.#events = [];
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
