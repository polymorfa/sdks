import { afterEach, describe, expect, it } from "vitest";

import { PolymorfaCancelledError } from "../src/errors.js";
import { RawClient } from "../src/raw.js";
import { HttpTransport } from "../src/transport/http.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

interface Item {
  readonly id: string;
}

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function paginatedClient(): Promise<{ raw: RawClient; server: TestServer }> {
  const server = await startTestServer((request) => {
    if (request.path.includes("cursor=next_1")) {
      return { body: '{"data":[{"id":"three"}],"nextCursor":null}' };
    }
    return { body: '{"data":[{"id":"one"},{"id":"two"}],"nextCursor":"next_1"}' };
  });
  servers.push(server);
  return {
    server,
    raw: new RawClient(
      new HttpTransport({
        baseUrl: server.url,
        authorization: "Bearer pmfa_example",
        timeoutMs: 500,
        maxNetworkRetries: 0,
      }),
    ),
  };
}

const decodePage = (data: unknown) => {
  const envelope = data as { data: Item[]; nextCursor: string | null };
  return { items: envelope.data, nextCursor: envelope.nextCursor };
};

describe("CursorPage", () => {
  it("exposes the first page and propagates the cursor to the next request", async () => {
    const { raw, server } = await paginatedClient();
    const first = await raw.paginate<Item>({ method: "GET", path: "/v1/items" }, decodePage);

    expect(first.items).toEqual([{ id: "one" }, { id: "two" }]);
    expect(first.nextCursor).toBe("next_1");
    expect(first.hasMore).toBe(true);

    const second = await first.nextPage();
    expect(second?.items).toEqual([{ id: "three" }]);
    expect(second?.hasMore).toBe(false);
    expect(server.requests[1]?.path).toBe("/v1/items?cursor=next_1");
    await expect(second?.nextPage()).resolves.toBeNull();
  });

  it("iterates items across every page in stable order", async () => {
    const { raw } = await paginatedClient();
    const page = await raw.paginate<Item>({ method: "GET", path: "/v1/items" }, decodePage);
    const ids: string[] = [];
    for await (const item of page) ids.push(item.id);
    expect(ids).toEqual(["one", "two", "three"]);
  });

  it("honors caller cancellation before loading the next page", async () => {
    const { raw } = await paginatedClient();
    const controller = new AbortController();
    const page = await raw.paginate<Item>(
      { method: "GET", path: "/v1/items", signal: controller.signal },
      decodePage,
    );
    controller.abort();
    await expect(page.nextPage()).rejects.toBeInstanceOf(PolymorfaCancelledError);
  });
});
