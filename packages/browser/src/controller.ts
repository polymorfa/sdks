export interface ControllerSnapshot {
  readonly status: string;
  readonly revision: number;
  readonly updatedAt: number;
}

export type ControllerListener = () => void;

export abstract class ObservableController<
  TSnapshot extends ControllerSnapshot,
> {
  readonly #listeners = new Set<ControllerListener>();
  readonly #now: () => number;
  #snapshot: TSnapshot;
  #disposed = false;

  protected constructor(
    initial: Omit<TSnapshot, "revision" | "updatedAt">,
    now: () => number = Date.now,
  ) {
    this.#now = now;
    this.#snapshot = deepFreeze({
      ...initial,
      revision: 0,
      updatedAt: now(),
    }) as TSnapshot;
  }

  getSnapshot = (): TSnapshot => this.#snapshot;

  subscribe = (listener: ControllerListener): (() => void) => {
    this.assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  protected transition(next: Omit<TSnapshot, "revision" | "updatedAt">): void {
    this.assertActive();
    this.#snapshot = deepFreeze({
      ...next,
      revision: this.#snapshot.revision + 1,
      updatedAt: this.#now(),
    }) as TSnapshot;
    for (const listener of [...this.#listeners]) listener();
  }

  protected assertActive(): void {
    if (this.#disposed)
      throw new Error(`${this.constructor.name} is disposed.`);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    this.onDispose();
  }

  protected onDispose(): void {}
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
