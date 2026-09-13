import { useEffect, useRef, useSyncExternalStore } from "react";

export interface ReactController<TSnapshot> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function useController<TSnapshot>(
  controller: ReactController<TSnapshot>,
): TSnapshot {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

export function useResolvedController<
  TSnapshot,
  TController extends ReactController<TSnapshot>,
>(
  controller: TController | undefined,
  createController: (() => TController) | undefined,
): TController {
  const owned = useRef<TController | undefined>(undefined);
  if (controller === undefined && owned.current === undefined) {
    if (createController === undefined)
      throw new Error("Pass controller or createController.");
    owned.current = createController();
  }
  const resolved = controller ?? owned.current;
  if (resolved === undefined) throw new Error("Controller resolution failed.");
  useEffect(() => () => owned.current?.dispose(), []);
  return resolved;
}
