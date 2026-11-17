// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CallLogEntry,
  CallLogSource,
  InboxDataSource,
} from "@polymorfa/ui-kit";
import { CallLog, Inbox, PolymorfaProvider } from "../../src/react/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const now = Date.now();
const entries: CallLogEntry[] = [
  {
    id: "a",
    direction: "inbound",
    outcome: "missed",
    video: false,
    startedAt: now - 1_000,
    peer: { id: "1", name: "Ada", phoneNumber: "+15550001" },
    conversationId: "1",
  },
  {
    id: "b",
    direction: "inbound",
    outcome: "missed",
    video: false,
    startedAt: now - 2_000,
    peer: { id: "1", name: "Ada", phoneNumber: "+15550001" },
    conversationId: "1",
  },
  {
    id: "c",
    direction: "outbound",
    outcome: "answered",
    video: true,
    startedAt: now - 3_000,
    durationSeconds: 125,
    peer: { id: "2", name: "Grace", phoneNumber: "+15550002" },
    conversationId: "2",
  },
];
const source = (): CallLogSource => ({
  list: vi.fn(async () => ({ entries })),
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(node: React.ReactNode) {
  await act(async () =>
    root.render(<PolymorfaProvider>{node}</PolymorfaProvider>),
  );
  for (let index = 0; index < 4; index += 1) await act(async () => undefined);
}

describe("<CallLog/>", () => {
  it("can page to older missed calls when the loaded page has no matches", async () => {
    const list = vi.fn(async (cursor?: string) =>
      cursor === undefined
        ? { entries: [entries[2]!], nextCursor: "older" }
        : { entries: [entries[0]!] },
    );
    await render(<CallLog source={{ list }} />);
    act(() =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Missed")!
        .click(),
    );
    expect(host.querySelectorAll("[data-call-id]")).toHaveLength(0);
    expect(host.textContent).not.toContain("No missed calls");
    const more = host.querySelector<HTMLButtonElement>(".pmfa-call-more");
    expect(more).not.toBeNull();
    await act(async () => more!.click());
    expect(list).toHaveBeenLastCalledWith("older", expect.any(AbortSignal));
    expect(host.querySelector("[data-call-id='a']")).not.toBeNull();
    expect(host.querySelector(".pmfa-call-more")).toBeNull();
  });

  it("shows a failed page beside the loaded calls", async () => {
    const list = vi.fn(async (cursor?: string) => {
      if (cursor !== undefined) throw new Error("offline");
      return { entries: [entries[2]!], nextCursor: "older" };
    });
    await render(<CallLog source={{ list }} />);
    expect(host.querySelector("[role=alert]")).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".pmfa-call-more")!.click(),
    );
    expect(host.querySelector("[role=alert]")?.textContent).toBe(
      "Unable to load calls",
    );
    expect(host.querySelector("[data-call-id='c']")).not.toBeNull();
    expect(host.querySelector(".pmfa-call-more")).not.toBeNull();
  });

  it("waits for the initial grant before loading calls", async () => {
    let finish!: (response: Response) => void;
    const token = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/polymorfa/token") return token;
      expect(new URL(String(input)).pathname).toBe("/messaging/support/calls");
      return Response.json({
        success: true,
        data: [
          {
            callId: "c1",
            projectId: null,
            connectionId: "support",
            direction: "inbound",
            upstream: "linked_device",
            outcome: "missed",
            state: "ended",
            hasVideo: false,
            peer: { id: "15550100", phoneNumber: "+15550100" },
            startedAt: new Date(now).toISOString(),
            connectedAt: null,
            endedAt: null,
            durationSeconds: null,
            endReason: null,
          },
        ],
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    await act(async () =>
      root.render(
        <PolymorfaProvider tokenEndpoint="/api/polymorfa/token">
          <CallLog />
        </PolymorfaProvider>,
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "Loading",
    );
    await act(async () =>
      finish(
        Response.json({
          value: "pmfa_ct_Zml4dHVyZQ",
          audience: "browser",
          expiresAt: Date.now() + 600_000,
          grant: {
            connection: "support",
            conversations: "all",
            allow: ["read_calls"],
          },
        }),
      ),
    );
    for (let index = 0; index < 4; index += 1) await act(async () => undefined);
    expect(host.querySelector("[data-call-id='c1']")).not.toBeNull();
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("merges repeat calls, marks missed ones and opens the chat", async () => {
    const onOpen = vi.fn();
    const onCall = vi.fn();
    await render(<CallLog source={source()} onOpen={onOpen} onCall={onCall} />);
    const rows = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-call-id]"),
    ];
    expect(rows.map((row) => row.getAttribute("data-call-id"))).toEqual([
      "a",
      "c",
    ]);
    expect(rows[0]!.className).toContain("pmfa-call-missed");
    expect(rows[0]!.textContent).toContain("Ada (2)");
    expect(rows[0]!.getAttribute("aria-label")).toMatch(
      /^Ada \(2\), Missed voice call · /,
    );
    expect(rows[1]!.textContent).toContain("Outgoing video call");
    expect(rows[1]!.textContent).toContain("2:05");
    act(() => rows[1]!.click());
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", kind: "direct", name: "Grace" }),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Video call Grace"]')!
        .click(),
    );
    expect(onCall).toHaveBeenCalledWith(entries[2]);
  });

  it("filters to missed calls and shows the empty state", async () => {
    await render(
      <CallLog source={{ list: async () => ({ entries: [entries[2]!] }) }} />,
    );
    act(() =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Missed")!
        .click(),
    );
    expect(host.textContent).toContain("No missed calls");
    // No client: no call-back button is offered.
    await render(<CallLog source={source()} />);
    expect(host.querySelector(".pmfa-call-back")).toBeNull();
  });
});

describe("<Inbox/> Calls view", () => {
  const inbox: InboxDataSource = {
    listConversations: async () => ({ conversations: [] }),
    conversation: () => ({
      load: async () => ({ messages: [] }),
      subscribe: () => () => undefined,
      send: vi.fn(),
    }),
  };

  it("switches between Chats and Calls and opens a chat from a call", async () => {
    await render(<Inbox source={inbox} callLog={source()} />);
    const calls = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Calls",
    )!;
    expect(calls.getAttribute("aria-pressed")).toBe("false");
    await act(async () => calls.click());
    for (let index = 0; index < 3; index += 1) await act(async () => undefined);
    expect(host.querySelector("[data-pmfa=call-log]")).not.toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-call-id='c']")!.click(),
    );
    expect(host.querySelector(".pmfa-thread-name")?.textContent).toBe("Grace");
    expect(host.querySelector("[data-pmfa=call-log]")).not.toBeNull();
  });
});
