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
  { id: "a", direction: "inbound", outcome: "missed", video: false, startedAt: now - 1_000, peer: { id: "1", name: "Ada", phoneNumber: "+15550001" }, conversationId: "1" },
  { id: "c", direction: "outbound", outcome: "answered", video: true, startedAt: now - 3_000, durationSeconds: 65, peer: { id: "2", name: "Grace", phoneNumber: "+15550002" }, conversationId: "2" },
];
const client = () =>
  new PolymorfaClient({
    fetch: vi.fn(async () =>
      Response.json({ value: "pmfa_ct_Zml4dHVyZQ", audience: "browser", expiresAt: Date.now() + 600_000, grant: { session: "support", conversations: "all", allow: ["read_messages"] } }),
    ),
  });

afterEach(() => {
  document.body.replaceChildren();
  resetDefineUiKit();
});

describe("<pmfa-call-log>", () => {
  it("renders calls and fires pmfa-open and pmfa-call", async () => {
    defineUiKit({ client: client() });
    const log = document.createElement("pmfa-call-log") as PolymorfaCallLogElement;
    log.source = { list: async () => ({ entries }) };
    const opened = vi.fn();
    const called = vi.fn();
    log.addEventListener("pmfa-open", (event) => opened((event as CustomEvent).detail));
    log.addEventListener("pmfa-call", (event) => called((event as CustomEvent).detail));
    document.body.append(log);
    await vi.waitFor(() => expect(log.shadowRoot!.querySelectorAll("[data-call-id]")).toHaveLength(2));
    const missed = log.shadowRoot!.querySelector("[data-call-id='a']")!;
    expect(missed.className).toContain("pmfa-call-missed");
    expect(log.shadowRoot!.textContent).toContain("1:05");
    log.shadowRoot!.querySelector<HTMLButtonElement>("[data-call-id='c']")!.click();
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    log.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Call Ada"]')!.click();
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
      conversation: () => ({ load: async () => ({ messages: [] }), subscribe: () => () => undefined, send: vi.fn() }),
    };
    inbox.source = source;
    inbox.callLog = { list: async () => ({ entries }) };
    document.body.append(inbox);
    await vi.waitFor(() => expect(inbox.shadowRoot!.querySelector("[data-inbox-view='calls']")).not.toBeNull());
    inbox.shadowRoot!.querySelector<HTMLButtonElement>("[data-inbox-view='calls']")!.click();
    const log = inbox.shadowRoot!.querySelector("pmfa-call-log") as PolymorfaCallLogElement;
    expect(log).not.toBeNull();
    expect(log.querySelector("[data-inbox-view='calls']")?.getAttribute("aria-pressed")).toBe("true");
    await vi.waitFor(() => expect(log.shadowRoot!.querySelectorAll("[data-call-id]")).toHaveLength(2));
    log.shadowRoot!.querySelector<HTMLButtonElement>("[data-call-id='a']")!.click();
    expect(inbox.shadowRoot!.querySelector(".pmfa-thread-name")?.textContent).toBe("Ada");
  });
});
