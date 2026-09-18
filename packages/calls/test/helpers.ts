import { vi } from "vitest";
import type { CallsApi } from "../src/internal.js";

/** A WebSocket double that records sends and lets tests drive the server side. */
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  sent: (string | Uint8Array)[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  text(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  binary(bytes: Uint8Array): void {
    this.onmessage?.({
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    });
  }
  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }
  closed: { code?: number; reason?: string } | undefined;
  close(code?: number, reason?: string): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.closed = {
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    };
  }
  /** Server-side close: fires onclose like a real socket would. */
  drop(code = 1006, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
  /**
   * A failed handshake as Node 22 reports it: an error event, no close event,
   * and the socket left CONNECTING.
   */
  failHandshake(): void {
    this.onerror?.({});
  }
  /** Open and answer the auth frame with `ready`, as the platform does. */
  authenticate(ready: Record<string, unknown> = { session: "support" }): void {
    this.open();
    this.text({ type: "ready", ...ready });
  }
  /** Text frames sent so far, parsed. */
  get texts(): unknown[] {
    return this.sent
      .filter((x): x is string => typeof x === "string")
      .map((x) => JSON.parse(x) as unknown);
  }
  get lastText(): unknown {
    const s = [...this.sent].reverse().find((x) => typeof x === "string");
    return s === undefined ? undefined : JSON.parse(s as string);
  }
}

type FakeApi = {
  [K in keyof CallsApi]: ReturnType<typeof vi.fn> & CallsApi[K];
};

/** Typed against CallsApi field by field, so a signature drift fails here first. */
export function fakeApi(): FakeApi {
  const api: FakeApi = {
    token: vi.fn(async () => ({ value: "pmfa_ct_test" })),
    socketUrl: vi.fn((path: string) => `wss://api.example${path}`),
    place: vi.fn(async () => ({ callId: "CALL-OUT" })),
    accept: vi.fn(async () => ({
      answered: true,
      answeredBy: "client:self",
      exclusive: false,
    })),
    reject: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    report: vi.fn(async () => undefined),
    addParticipant: vi.fn(async (_id: string, to: string) => ({
      id: `p-${to}`,
      phoneNumber: to,
      audioMuted: false,
      video: false,
      state: "invited" as const,
    })),
  } satisfies FakeApi;
  return api;
}

export function timers() {
  const intervals: { fn: () => void; cleared?: boolean }[] = [];
  const timeouts: { fn: () => void; ms: number; cleared?: boolean }[] = [];
  return {
    intervals,
    timeouts,
    setInterval: ((fn: () => void) => {
      intervals.push({ fn });
      return intervals.length as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: ((h: number) => {
      const e = intervals[h - 1];
      if (e) e.cleared = true;
    }) as unknown as typeof globalThis.clearInterval,
    setTimeout: ((fn: () => void, ms: number) => {
      timeouts.push({ fn, ms });
      return timeouts.length as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof globalThis.setTimeout,
    clearTimeout: ((h: number) => {
      const e = timeouts[h - 1];
      if (e) e.cleared = true;
    }) as unknown as typeof globalThis.clearTimeout,
    beat: () => {
      for (const e of [...intervals]) if (!e.cleared) e.fn();
    },
    fireTimeouts: () => {
      for (const e of [...timeouts]) {
        if (e.cleared) continue;
        e.cleared = true;
        e.fn();
      }
    },
  };
}

export const flush = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
