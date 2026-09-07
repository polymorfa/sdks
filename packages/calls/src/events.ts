/**
 * A small typed event emitter. Platform-neutral on purpose: the client model is
 * consumed both by Node bots and by the browser kit, so nothing here may reach
 * for `node:events`.
 */
export type Listener<T extends unknown[]> = (...args: T) => void;

export class Emitter<Events extends Record<string, unknown[]>> {
  readonly #listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>,
  ): () => void {
    let set = this.#listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>,
  ): () => void {
    const off = this.on(event, ((...args: Events[K]) => {
      off();
      listener(...args);
    }) as Listener<Events[K]>);
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.#listeners.get(event)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.#listeners.get(event);
    if (set === undefined) return;
    // Copy first: a listener may unsubscribe itself or others while we iterate.
    for (const listener of [...set]) (listener as Listener<Events[K]>)(...args);
  }

  protected removeAllListeners(): void {
    this.#listeners.clear();
  }
}
