// @vitest-environment happy-dom
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationDataSource,
  ConversationEvent,
  ConversationMessage,
  InboxDataSource,
} from "@polymorfa/ui-kit";
import { messagePresentationStatus } from "@polymorfa/ui-kit/appearance";

// The native web-host examples' own browser bridges, driven against a stubbed
// host API that returns the receipt strings their servers actually store.
const root = resolve(fileURLToPath(import.meta.url), "../../../../..");
const bridges = [
  { name: "Go", path: "examples/go/web-host/bridge.js", start: "load" },
  { name: "Python", path: "examples/python/web_host/bridge.js", start: "load" },
  { name: "PHP", path: "examples/php/web-host/bridge.js", start: "load" },
  {
    name: "Rust",
    path: "examples/rust/yew/frontend/bridge.js",
    start: "window",
  },
  {
    name: "C#",
    path: "packages/dotnet/examples/aspnet-core/wwwroot/elements.ts",
    start: "mount",
  },
] as const;

const message = (
  id: string,
  direction: "inbound" | "outbound",
  receipt: string,
  createdAt: number,
) => ({ id, text: id, createdAt, direction, status: "sent", receipt });

const snapshot = {
  peer: "15550001",
  session: "support",
  receivedEvents: 3,
  lastEvent: "message.ack",
  localTest: true,
  messages: [
    message("read", "outbound", "read", 1),
    message("delivery", "outbound", "delivery", 2),
    message("delivered", "outbound", "delivered", 3),
    message("played", "outbound", "played", 4),
    message("accepted", "outbound", "server", 5),
    message("unknown", "outbound", "constructor", 6),
    message("inbound", "inbound", "received", 7),
    message("latest", "outbound", "PENDING", 8),
  ],
};

const expected: Record<string, string> = {
  read: "read",
  delivery: "delivered",
  delivered: "delivered",
  played: "played",
  accepted: "sent",
  unknown: "sent",
  inbound: "sent",
  latest: "sent",
};

let stop: (() => void) | undefined;
let current: typeof snapshot = snapshot;

afterEach(() => {
  stop?.();
  stop = undefined;
  current = snapshot;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function start(bridge: (typeof bridges)[number]) {
  document.body.innerHTML =
    '<pmfa-inbox></pmfa-inbox><p id="native-status"></p><p id="transport-label"></p>';
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/send"))
      return Response.json({
        ...message("sent_now", "outbound", "server", 9),
        clientId: (init?.headers as Record<string, string>)["Idempotency-Key"],
      });
    return Response.json(current);
  });
  vi.stubGlobal("fetch", fetch);
  const module = (await import(
    /* @vite-ignore */ resolve(root, bridge.path)
  )) as { mount?: () => Promise<{ dispose(): void }> };
  const scope = window as unknown as {
    startPolymorfa?: () => void;
    stopPolymorfa?: () => void;
  };
  if (bridge.start === "window") {
    scope.startPolymorfa?.();
    stop = () => scope.stopPolymorfa?.();
  } else if (bridge.start === "mount") {
    const handle = await module.mount!();
    stop = () => handle.dispose();
  } else {
    stop = () => {
      document.querySelector("pmfa-inbox")?.remove();
      document.dispatchEvent(new Event("htmx:afterSwap"));
    };
  }
  const inbox = document.querySelector("pmfa-inbox") as unknown as {
    source: InboxDataSource;
  };
  expect(inbox.source).toBeDefined();
  return { source: inbox.source, fetch };
}

const statuses = (messages: readonly ConversationMessage[]) =>
  Object.fromEntries(messages.map((m) => [m.id, messagePresentationStatus(m)]));

describe.each(bridges)("$name web-host bridge receipts", (bridge) => {
  it(
    "maps only observed ack receipts on load, upsert and send",
    { timeout: 10_000 },
    async () => {
      const { source, fetch } = await start(bridge);
      const conversation: ConversationDataSource = source.conversation({
        id: snapshot.peer,
        lastActivity: 0,
        unreadCount: 0,
      });

      const loaded = (await conversation.load()).messages;
      expect(statuses(loaded)).toEqual(expected);
      expect(loaded.find((m) => m.id === "read")?.receipt).toEqual({
        state: "read",
      });
      // Acceptance, unknown and inbound strings never become receipts.
      for (const id of ["accepted", "unknown", "inbound", "latest"])
        expect(loaded.find((m) => m.id === id)).not.toHaveProperty("receipt");

      const upserts: ConversationMessage[] = [];
      const unsubscribe = conversation.subscribe((event: ConversationEvent) => {
        if (event.type === "upsert") upserts.push(event.message);
      });
      // A new ack changes the host snapshot; the bridge's poll re-emits it.
      current = { ...snapshot, receivedEvents: 4 };
      await vi.waitFor(() => expect(upserts.length).toBe(8), { timeout: 3000 });
      unsubscribe();
      expect(statuses(upserts)).toEqual(expected);

      const sent = await conversation.send({
        clientId: "client_1",
        text: "hello",
      });
      expect(sent).not.toHaveProperty("receipt");
      expect(messagePresentationStatus(sent)).toBe("sent");
      expect(fetch).toHaveBeenCalledWith(
        "/api/polymorfa/send",
        expect.objectContaining({ method: "POST" }),
      );

      // The host's raw status line keeps the server string.
      await vi.waitFor(
        () =>
          expect(
            document.querySelector("#native-status")?.textContent,
          ).toContain("Latest send: PENDING"),
        { timeout: 3000 },
      );
    },
  );
});
