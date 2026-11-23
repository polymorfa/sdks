// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallLogEntry, InboxDataSource } from "@polymorfa/ui-kit/internal";
import {
  PolymorfaCallLogElement,
  PolymorfaInboxElement,
  defineUiKit,
} from "../../src/web-components/index.js";
import { resetDefineUiKit } from "../../src/web-components/dropin.js";
import { PolymorfaClient } from "@polymorfa/ui-kit/internal";

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
    id: "c",
    direction: "outbound",
    outcome: "answered",
    video: true,
    startedAt: now - 3_000,
    durationSeconds: 65,
    peer: { id: "2", name: "Grace", phoneNumber: "+15550002" },
    conversationId: "2",
  },
];
const client = () =>
  new PolymorfaClient({
    fetch: vi.fn(async () =>
      Response.json({
        value: "pmfa_ct_Zml4dHVyZQ",
        audience: "browser",
        expiresAt: Date.now() + 600_000,
        grant: {
          connection: "support",
          conversations: "all",
          allow: ["read_messages"],
        },
      }),
    ),
  });

afterEach(() => {
  document.body.replaceChildren();
  resetDefineUiKit();
});

describe("<pmfa-call-log>", () => {
  it("keeps pagination reachable when the loaded page has no missed calls", async () => {
    defineUiKit({ client: client() });
    const log = document.createElement(
      "pmfa-call-log",
    ) as PolymorfaCallLogElement;
    const list = vi.fn(async (cursor?: string) =>
      cursor === undefined
        ? { entries: [entries[1]!], nextCursor: "older" }
        : { entries: [entries[0]!] },
    );
    log.source = { list };
    document.body.append(log);
    await vi.waitFor(() =>
      expect(
        log.shadowRoot!.querySelector("[data-call-id='c']"),
      ).not.toBeNull(),
    );
    [...log.shadowRoot!.querySelectorAll("button")]
      .find((button) => button.textContent === "Missed")!
      .click();
    expect(log.shadowRoot!.querySelectorAll("[data-call-id]")).toHaveLength(0);
    expect(log.shadowRoot!.textContent).not.toContain("No missed calls");
    const more =
      log.shadowRoot!.querySelector<HTMLButtonElement>(".pmfa-call-more");
    expect(more).not.toBeNull();
    more!.click();
    await vi.waitFor(() =>
      expect(
        log.shadowRoot!.querySelector("[data-call-id='a']"),
      ).not.toBeNull(),
    );
    expect(list).toHaveBeenLastCalledWith("older", expect.any(AbortSignal));
    expect(log.shadowRoot!.querySelector(".pmfa-call-more")).toBeNull();
  });

  it("shows a failed page beside the loaded calls", async () => {
    defineUiKit({ client: client() });
    const log = document.createElement(
      "pmfa-call-log",
    ) as PolymorfaCallLogElement;
    log.source = {
      list: async (cursor?: string) => {
        if (cursor !== undefined) throw new Error("offline");
        return { entries: [entries[1]!], nextCursor: "older" };
      },
    };
    document.body.append(log);
    await vi.waitFor(() =>
      expect(
        log.shadowRoot!.querySelector("[data-call-id='c']"),
      ).not.toBeNull(),
    );
    expect(log.shadowRoot!.querySelector("[role=alert]")).toBeNull();
    log
      .shadowRoot!.querySelector<HTMLButtonElement>(".pmfa-call-more")!
      .click();
    await vi.waitFor(() =>
      expect(log.shadowRoot!.querySelector("[role=alert]")?.textContent).toBe(
        "Unable to load calls",
      ),
    );
    expect(log.shadowRoot!.querySelector("[data-call-id='c']")).not.toBeNull();
    expect(log.shadowRoot!.querySelector(".pmfa-call-more")).not.toBeNull();
  });

  it("reads with the replacement client when the client changes", async () => {
    const callsClient = (callId: string) => {
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "/api/polymorfa/token")
          return Response.json({
            value: "pmfa_ct_Zml4dHVyZQ",
            audience: "browser",
            expiresAt: Date.now() + 600_000,
            grant: {
              connection: "support",
              conversations: "all",
              allow: ["read_calls"],
            },
          });
        return Response.json({
          success: true,
          data: [
            {
              callId,
              projectId: null,
              connectionId: "support",
              direction: "inbound",
              upstream: "linked_device",
              outcome: "missed",
              state: "ended",
              hasVideo: false,
              peer: { id: callId, phoneNumber: "+15550100" },
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
      return {
        fetch,
        client: new PolymorfaClient({ fetch, baseUrl: "https://api.example" }),
      };
    };
    const first = callsClient("first");
    const second = callsClient("second");
    await first.client.refresh();
    await second.client.refresh();
    const log = document.createElement(
      "pmfa-call-log",
    ) as PolymorfaCallLogElement;
    log.client = first.client;
    document.body.append(log);
    await vi.waitFor(() =>
      expect(
        log.shadowRoot!.querySelector("[data-call-id='first']"),
      ).not.toBeNull(),
    );
    const replaced = log.controller;
    log.client = second.client;
    await vi.waitFor(() =>
      expect(
        log.shadowRoot!.querySelector("[data-call-id='second']"),
      ).not.toBeNull(),
    );
    expect(log.controller).not.toBe(replaced);
    expect(log.shadowRoot!.querySelector("[data-call-id='first']")).toBeNull();
    expect(second.fetch).toHaveBeenCalledTimes(2);
    expect(first.fetch).toHaveBeenCalledTimes(2);
  });

  it("renders calls and fires pmfa-open and pmfa-call", async () => {
    defineUiKit({ client: client() });
    const log = document.createElement(
      "pmfa-call-log",
    ) as PolymorfaCallLogElement;
    log.source = { list: async () => ({ entries }) };
    const opened = vi.fn();
    const called = vi.fn();
    log.addEventListener("pmfa-open", (event) =>
      opened((event as CustomEvent).detail),
    );
    log.addEventListener("pmfa-call", (event) =>
      called((event as CustomEvent).detail),
    );
    document.body.append(log);
    await vi.waitFor(() =>
      expect(log.shadowRoot!.querySelectorAll("[data-call-id]")).toHaveLength(
        2,
      ),
    );
    const missed = log.shadowRoot!.querySelector("[data-call-id='a']")!;
    expect(missed.className).toContain("pmfa-call-missed");
    expect(log.shadowRoot!.textContent).toContain("1:05");
    log
      .shadowRoot!.querySelector<HTMLButtonElement>("[data-call-id='c']")!
      .click();
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    log
      .shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Call Ada"]')!
      .click();
    expect(called).toHaveBeenCalledWith(entries[0]);
    log.setAttribute("no-call-back", "");
    expect(log.shadowRoot!.querySelector(".pmfa-call-back")).toBeNull();
  });
});

describe("<pmfa-inbox> Calls view", () => {
  it("shows the switch, the call log and opens a chat", async () => {
    defineUiKit({ client: client() });
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    const source: InboxDataSource = {
      listConversations: async () => ({ conversations: [] }),
      conversation: () => ({
        load: async () => ({ messages: [] }),
        subscribe: () => () => undefined,
        send: vi.fn(),
      }),
    };
    inbox.source = source;
    inbox.callLog = { list: async () => ({ entries }) };
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(
        inbox.shadowRoot!.querySelector("[data-inbox-view='calls']"),
      ).not.toBeNull(),
    );
    inbox
      .shadowRoot!.querySelector<HTMLButtonElement>(
        "[data-inbox-view='calls']",
      )!
      .click();
    const log = inbox.shadowRoot!.querySelector(
      "pmfa-call-log",
    ) as PolymorfaCallLogElement;
    expect(log).not.toBeNull();
    expect(
      log
        .querySelector("[data-inbox-view='calls']")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    await vi.waitFor(() =>
      expect(log.shadowRoot!.querySelectorAll("[data-call-id]")).toHaveLength(
        2,
      ),
    );
    log
      .shadowRoot!.querySelector<HTMLButtonElement>("[data-call-id='a']")!
      .click();
    expect(
      inbox.shadowRoot!.querySelector(".pmfa-thread-name")?.textContent,
    ).toBe("Ada");
  });
});
