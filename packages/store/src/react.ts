import { useEffect, useRef, useState } from "react";

import type { PolymorfaStore } from "./store.js";
import type { DataStoreName } from "./types.js";

export interface PolymorfaStoreQueryState<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
}

/**
 * Runs `query` and runs it again whenever one of `stores` changes, in this
 * tab or another. Pass a stable `key` that identifies the query inputs.
 */
export function usePolymorfaStoreQuery<T>(
  store: PolymorfaStore | undefined,
  stores: DataStoreName | readonly DataStoreName[],
  query: (store: PolymorfaStore) => Promise<T>,
  key: string = "",
): PolymorfaStoreQueryState<T> {
  const [state, setState] = useState<PolymorfaStoreQueryState<T>>({
    data: undefined,
    error: undefined,
    loading: store !== undefined,
  });
  const latestQuery = useRef(query);
  latestQuery.current = query;
  const names = (typeof stores === "string" ? [stores] : stores).join(",");

  useEffect(() => {
    if (store === undefined) return;
    let active = true;
    let generation = 0;
    const run = () => {
      const current = (generation += 1);
      setState((previous) => ({ ...previous, loading: true }));
      latestQuery.current(store).then(
        (data) => {
          if (active && current === generation)
            setState({ data, error: undefined, loading: false });
        },
        (error: unknown) => {
          if (active && current === generation)
            setState((previous) => ({ ...previous, error, loading: false }));
        },
      );
    };
    run();
    const unsubscribes = names
      .split(",")
      .map((name) => store.subscribe(name as DataStoreName, run));
    return () => {
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [store, names, key]);

  return state;
}
