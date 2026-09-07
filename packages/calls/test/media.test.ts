import { describe, expect, it } from "vitest";

import { MediaSocket } from "../src/media.js";
import { FakeWebSocket, timers } from "./helpers.js";

const ticket = {
  token: "t",
  expiresAt: 1,
  url: "wss://pod.example/voip/sdk?callId=X",
};

function mediaWith(WS: unknown = FakeWebSocket) {
  FakeWebSocket.instances = [];
  const t = timers();
  const media = new MediaSocket({
    ticket,
    WebSocket: WS as typeof globalThis.WebSocket,
    setInterval: t.setInterval,
    clearInterval: t.clearInterval,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
  });
  return { media, t };
}

describe("MediaSocket.connect", () => {
  it("hands a second caller the in-flight attempt until ready settles it", async () => {
    const { media } = mediaWith();
    const first = media.connect();
    // `#socket` is already set here, but nothing has bridged: a second
    // connect() must wait on the same attempt, not resolve against it.
    const second = media.connect();
    expect(second).toBe(first);
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);
    ws.text({ type: "ready", sampleRate: 16_000, video: false });
    await expect(second).resolves.toBeUndefined();
    // Once bridged, connect() is a no-op that resolves on its own.
    await expect(media.connect()).resolves.toBeUndefined();
    media.close();
  });

  it("shares the attempt's failure with every caller", async () => {
    const { media } = mediaWith();
    const first = media.connect();
    const second = media.connect();
    media.close();
    await expect(first).rejects.toThrow(/closed/);
    await expect(second).rejects.toThrow(/closed/);
  });

  it("does not pin an attempt that failed synchronously", async () => {
    class Throwing {
      constructor() {
        throw new Error("bad url");
      }
    }
    const { media } = mediaWith(Throwing);
    await expect(media.connect()).rejects.toThrow("bad url");
    // The rejected attempt is not what a later connect() receives: it is a
    // fresh attempt that fails on its own.
    await expect(media.connect()).rejects.toThrow("bad url");
  });
});
