import { useEffect, useReducer, useRef, useSyncExternalStore } from "react";

export interface ReactController<TSnapshot> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

type Subscribable = { subscribe(listener: () => void): () => void };
const safeSubscriptions = new WeakMap<
  Subscribable,
  (listener: () => void) => () => void
>();

/**
 * `controller.subscribe`, except that a disposed controller yields a no-op
 * subscription. Under StrictMode an owned controller can be disposed and
 * replaced while a child is still subscribing to it; the child re-renders
 * with the replacement right after.
 * @internal
 */
export function safeSubscribe(
  controller: Subscribable,
): (listener: () => void) => () => void {
  let subscribe = safeSubscriptions.get(controller);
  if (subscribe === undefined) {
    subscribe = (listener) => {
      try {
        return controller.subscribe(listener);
      } catch (cause) {
        if (cause instanceof Error && / is disposed\.$/.test(cause.message))
          return () => undefined;
        throw cause;
      }
    };
    safeSubscriptions.set(controller, subscribe);
  }
  return subscribe;
}

export function useController<TSnapshot>(
  controller: ReactController<TSnapshot>,
): TSnapshot {
  return useSyncExternalStore(
    safeSubscribe(controller),
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

/**
 * The passed `controller`, or one made by `create` that this component owns
 * and disposes. Safe under StrictMode and `<Activity>`: when an effect
 * cleanup disposes the owned controller and the effect runs again, a fresh
 * controller replaces it and the component re-renders with it.
 * @internal
 */
export function useOwnedController<T extends { dispose(): void }>(
  controller: T | undefined,
  create: (() => T) | undefined,
): T | undefined {
  const owned = useRef<T | undefined>(undefined);
  const latestCreate = useRef(create);
  latestCreate.current = create;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  if (controller === undefined && owned.current === undefined && create)
    owned.current = create();
  const owning = controller === undefined;
  useEffect(() => {
    if (!owning) return;
    if (owned.current === undefined) {
      // The previous cleanup disposed the controller we rendered with.
      const make = latestCreate.current;
      if (make === undefined) return;
      owned.current = make();
      rerender();
    }
    return () => {
      const current = owned.current;
      owned.current = undefined;
      current?.dispose();
    };
  }, [owning]);
  return controller ?? owned.current;
}

export function useResolvedController<
  TSnapshot,
  TController extends ReactController<TSnapshot>,
>(
  controller: TController | undefined,
  createController: (() => TController) | undefined,
): TController {
  if (controller === undefined && createController === undefined)
    throw new Error("Pass controller or createController.");
  const resolved = useOwnedController(controller, createController);
  if (resolved === undefined) throw new Error("Controller resolution failed.");
  return resolved;
}
