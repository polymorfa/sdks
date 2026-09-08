import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Client,
  PolymorfaCancelledError,
  PolymorfaTimeoutError,
} from "../src/index.js";

const operation = (status: "running" | "succeeded") => ({
  data: {
    id: "operation_1",
    organizationId: "organization_1",
    projectId: null,
    kind: "session_lifecycle",
    resource: { type: "session", id: "session_1" },
    status,
    sequence: status === "running" ? 1 : 2,
    capabilities: { cancellable: true, watchable: true },
    progress: null,
    result: status === "succeeded" ? { started: true } : null,
    error: null,
    actionRequired: null,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:01.000Z",
    completedAt: status === "succeeded" ? "2026-09-08T00:00:01.000Z" : null,
  },
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Client.operations.wait", () => {
  it("honors a larger server Retry-After before the next retrieval", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(operation("running"), {
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(Response.json(operation("succeeded")));
    const client = new Client({
      credential: { type: "organizationApiKey", value: "pmfa_operations" },
      baseUrl: "https://api.example.com",
      fetch,
    });

    const result = client.operations.wait("operation_1", {
      maxWaitMs: 2_000,
      pollIntervalMs: 250,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({
      data: { status: "succeeded", sequence: 2 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails locally on abort and total-wait timeout without cancelling remotely", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(operation("running")),
    );
    const client = new Client({
      credential: { type: "organizationApiKey", value: "pmfa_operations" },
      baseUrl: "https://api.example.com",
      fetch,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.operations.wait("operation_1", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PolymorfaCancelledError);
    await expect(
      client.operations.wait("operation_1", {
        maxWaitMs: 1,
        pollIntervalMs: 250,
      }),
    ).rejects.toBeInstanceOf(PolymorfaTimeoutError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});
