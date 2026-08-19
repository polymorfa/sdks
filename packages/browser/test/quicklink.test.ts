import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QuickLinkController,
  type QuickLinkEvent,
  type QuickLinkSession,
  type QuickLinkTransport,
} from "../src/index.js";

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

function fixtureTransport() {
  let listener: ((event: QuickLinkEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const transport: QuickLinkTransport = {
    create: vi.fn(async () => ({
      id: "ql_123",
      expiresAt: Date.now() + 60_000,
      qrCode: "qr-fixture",
      link: "https://connect.polymorfa.com/ql_123",
    })),
    recover: vi.fn(async (id) => ({
      id,
      expiresAt: Date.now() + 60_000,
      qrCode: "qr-recovered",
    })),
    cancel: vi.fn(async () => undefined),
    subscribe: vi.fn((_id, next) => {
      listener = next;
      return unsubscribe;
    }),
  };
  return {
    transport,
    emit: (event: QuickLinkEvent) => listener?.(event),
    unsubscribe,
  };
}

afterEach(() => vi.useRealTimers());

describe("QuickLinkController", () => {
  it("launches, publishes progress, and completes", async () => {
    const fixture = fixtureTransport();
    const controller = new QuickLinkController(fixture.transport);
    await controller.launch();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      sessionId: "ql_123",
      qrCode: "qr-fixture",
    });
    fixture.emit({
      type: "progress",
      step: "pairing",
      detail: "Waiting for device",
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "progress",
      step: "pairing",
    });
    fixture.emit({ type: "complete", connectionId: "session_123" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "complete",
      connectionId: "session_123",
    });
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("expires on its local deadline and can recover", async () => {
    vi.useFakeTimers();
    const fixture = fixtureTransport();
    vi.mocked(fixture.transport.create).mockResolvedValueOnce({
      id: "ql_expiring",
      expiresAt: Date.now() + 100,
    });
    const controller = new QuickLinkController(fixture.transport);
    await controller.launch();
    await vi.advanceTimersByTimeAsync(101);
    expect(controller.getSnapshot()).toMatchObject({
      status: "expired",
      sessionId: "ql_expiring",
    });
    await controller.retry();
    expect(fixture.transport.recover).toHaveBeenCalledWith(
      "ql_expiring",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      qrCode: "qr-recovered",
    });
  });

  it("cancels the remote session and ignores later events", async () => {
    const fixture = fixtureTransport();
    const controller = new QuickLinkController(fixture.transport);
    await controller.launch();
    await controller.cancel();
    expect(fixture.transport.cancel).toHaveBeenCalledWith(
      "ql_123",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot().status).toBe("cancelled");
    fixture.emit({ type: "complete", connectionId: "late" });
    expect(controller.getSnapshot().status).toBe("cancelled");
  });

  it("prevents a stale launch from overwriting a newer launch", async () => {
    const first = deferred<QuickLinkSession>();
    const second = deferred<QuickLinkSession>();
    const fixture = fixtureTransport();
    vi.mocked(fixture.transport.create)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = new QuickLinkController(fixture.transport);
    const firstLaunch = controller.launch();
    const secondLaunch = controller.launch();
    second.resolve({ id: "ql_new", expiresAt: Date.now() + 60_000 });
    await secondLaunch;
    first.resolve({ id: "ql_old", expiresAt: Date.now() + 60_000 });
    await firstLaunch;
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      sessionId: "ql_new",
    });
  });

  it("surfaces recoverable errors and disposes subscriptions and work", async () => {
    const fixture = fixtureTransport();
    vi.mocked(fixture.transport.create).mockRejectedValueOnce(
      new Error("offline"),
    );
    const controller = new QuickLinkController(fixture.transport);
    await controller.launch();
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "quicklink_failed" },
    });
    await controller.retry();
    expect(controller.getSnapshot().status).toBe("ready");
    controller.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
