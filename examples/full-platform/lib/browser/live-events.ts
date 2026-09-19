import type { LiveEvent, LiveEventName } from "../realtime.js";

export type { LiveEvent, LiveEventName };

export type LiveHandlers = {
  readonly [K in LiveEventName]?: (event: LiveEvent<K>) => void;
};

export type LiveState = "connecting" | "open" | "closed";

/**
 * Live changes after the initial history load. Events use the Polymorfa
 * webhook envelope, so a source can relay webhooks unchanged.
 *
 * `AppLiveEvents` streams from this app's `/api/events` route. A future
 * implementation can read Polymorfa's planned client-token event stream
 * instead (webhook-like events limited by the token's client rules), so the
 * browser no longer holds a connection to this backend.
 */
export interface LiveEvents {
  subscribe(handlers: LiveHandlers): () => void;
  onState(listener: (state: LiveState) => void): () => void;
}

/** One shared EventSource per tab, opened on first use and closed after the last. */
export class AppLiveEvents implements LiveEvents {
  #source: EventSource | undefined;
  #subscribers = 0;
  readonly #stateListeners = new Set<(state: LiveState) => void>();

  constructor(private readonly path = "/api/events") {}

  #state(): LiveState {
    switch (this.#source?.readyState) {
      case EventSource.OPEN:
        return "open";
      case EventSource.CONNECTING:
        return "connecting";
      default:
        return "closed";
    }
  }

  #connection(): EventSource {
    if (this.#source === undefined) {
      const source = new EventSource(this.path);
      const report = () => {
        const state = this.#state();
        for (const listener of this.#stateListeners) listener(state);
      };
      source.addEventListener("open", report);
      source.addEventListener("error", report);
      this.#source = source;
    }
    return this.#source;
  }

  subscribe(handlers: LiveHandlers): () => void {
    const source = this.#connection();
    this.#subscribers += 1;
    const entries = Object.entries(handlers).map(([name, handler]) => {
      const listener = (message: MessageEvent<string>) => {
        let event: LiveEvent;
        try {
          event = JSON.parse(message.data) as LiveEvent;
        } catch {
          return; // Ignore a malformed frame.
        }
        if (event.event === name) {
          (handler as (event: LiveEvent) => void)(event);
        }
      };
      source.addEventListener(name, listener);
      return [name, listener] as const;
    });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const [name, listener] of entries) {
        source.removeEventListener(name, listener);
      }
      this.#subscribers -= 1;
      if (this.#subscribers === 0) {
        source.close();
        this.#source = undefined;
      }
    };
  }

  onState(listener: (state: LiveState) => void): () => void {
    this.#stateListeners.add(listener);
    if (this.#source !== undefined) listener(this.#state());
    return () => this.#stateListeners.delete(listener);
  }
}

/** The live event source this app uses. */
export const liveEvents: LiveEvents = new AppLiveEvents();
