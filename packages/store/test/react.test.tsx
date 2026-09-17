// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { usePolymorfaStoreQuery } from "../src/react.js";
import type { PolymorfaStore } from "../src/index.js";
import { openStore, received } from "./helpers.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Unread({ store }: { store: PolymorfaStore }) {
  const { data, loading } = usePolymorfaStoreQuery(
    store,
    "conversations",
    (current) => current.conversations.list({ limit: 10 }),
  );
  if (loading && data === undefined) return <p>loading</p>;
  return <p>{data?.map((row) => `${row.id}:${row.unreadCount}`).join(",")}</p>;
}

describe("usePolymorfaStoreQuery", () => {
  it("re-runs the query when the store changes", async () => {
    const store = await openStore({ indexedDB: null });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Unread store={store} />));
    await act(async () => undefined);
    expect(container.textContent).toBe("");
    await act(async () => {
      await store.ingest(received("m1", "hi"));
    });
    await act(async () => undefined);
    expect(container.textContent).toBe("chat_1:1");
    await act(async () => root.unmount());
    store.close();
  });
});
