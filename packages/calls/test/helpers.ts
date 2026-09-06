import { vi } from "vitest";
import type { CallsApi } from "../src/index.js";

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
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
  /** Server-side close: fires onclose like a real socket would. */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
  get lastText(): unknown {
    const s = [...this.sent].reverse().find((x) => typeof x === "string");
    return s === undefined ? undefined : JSON.parse(s as string);
  }
}

export function fakeApi(): CallsApi & {
  [K in keyof CallsApi]: ReturnType<typeof vi.fn>;
} {
  return {
    socketTicket: vi.fn(async (session: string) => ({
      ticket: "pmfa_wst_a",
      expiresAt: Date.now() + 60_000,
      url: `wss://api.example/voip/ws?ticket=pmfa_wst_a&s=${session}`,
    })),
    mediaTicket: vi.fn(async (callId: string) => ({
      token: `pmfa_at_${callId}`,
      expiresAt: Date.now() + 300_000,
      url: `wss://pod.example/voip/sdk?callId=${callId}`,
    })),
    place: vi.fn(async () => ({ callId: "CALL-OUT" })),
    accept: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    hangup: vi.fn(async () => undefined),
    addParticipant: vi.fn(async (_id: string, to: string) => ({
      id: `p-${to}`,
      handle: to,
      audioMuted: false,
      video: false,
      state: "invited" as const,
    })),
  } as never;
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
