import { describe, expect, it, vi } from "vitest";
import { BrowserValidationError, PolymorfaClient } from "@polymorfa/ui-kit";

async function messaging() {
  const calls: [string, string, unknown][] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "/api/polymorfa/token")
      return Response.json({ value: "pmfa_ct_Zml4dHVyZQ", audience: "browser", expiresAt: Date.now() + 600_000, grant: { session: "support", conversations: "all", allow: [] } });
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
    const raw = input instanceof Request ? await input.text() : init?.body;
    const parsed = new URL(url);
    calls.push([method, parsed.pathname + parsed.search, typeof raw === "string" && raw !== "" ? JSON.parse(raw) : undefined]);
    return Response.json({ success: true, data: [] });
  });
  const client = new PolymorfaClient({ fetch, baseUrl: "https://api.example" });
  await client.refresh();
  return { m: client.messaging(), calls };
}

describe("browser frontend resources", () => {
  it("call the exact client-token routes", async () => {
    const { m, calls } = await messaging();
    await m.chats.list({ kind: "group", limit: 20 });
    await m.chats.messages("15550100", { types: ["text", "image"], order: "asc" });
    await m.chats.media("15550100", "m1");
    await m.chats.archive("15550100");
    await m.chats.setDisappearing("120363", 604_800);
    await m.chats.editMessage("15550100", "m1", "fixed");
    await m.chats.deleteMessage("15550100", "m1");
    await m.labels.create({ name: "VIP", color: 3 });
    await m.labels.setForChat("15550100", ["1"]);
    await m.contacts.block("15550100");
    await m.contacts.info("15550100");
    await m.profile.setPicture("aGk=");
    await m.profile.setPrivacy("last", "contacts");
    await m.profile.setDefaultDisappearing(86_400);
    await m.channels.follow("c1");
    await m.catalog.catalog();
    await m.presence.set("available");
    await m.groups.setPicture("120363", "aGk=");
    expect(calls).toEqual([
      ["GET", "/messaging/support/chats?kind=group&limit=20", undefined],
      ["GET", "/messaging/support/chats/15550100/messages?order=asc&types=text%2Cimage", undefined],
      ["GET", "/messaging/support/chats/15550100/messages/m1/media", undefined],
      ["POST", "/messaging/support/chats/15550100/archive", undefined],
      ["PUT", "/messaging/support/chats/120363/disappearing", { durationSeconds: 604800 }],
      ["PUT", "/messaging/support/chats/15550100/messages/m1", { text: "fixed" }],
      ["DELETE", "/messaging/support/chats/15550100/messages/m1", undefined],
      ["POST", "/messaging/support/labels", { name: "VIP", color: 3 }],
      ["PUT", "/messaging/support/labels/chats/15550100", { labels: ["1"] }],
      ["POST", "/messaging/support/contacts/15550100/block", undefined],
      ["GET", "/messaging/support/contacts/15550100/info", undefined],
      ["PUT", "/messaging/support/profile/picture", { base64: "aGk=" }],
      ["PUT", "/messaging/support/privacy/last", { value: "contacts" }],
      ["PUT", "/messaging/support/privacy/disappearing/default", { durationSeconds: 86400 }],
      ["POST", "/messaging/support/channels/c1/follow", undefined],
      ["GET", "/messaging/support/business/catalog", undefined],
      ["POST", "/messaging/support/presence", { presence: "available" }],
      ["PUT", "/messaging/support/groups/120363/picture", { base64: "aGk=" }],
    ]);
  });

  it("validates before sending", async () => {
    const { m, calls } = await messaging();
    expect(() => m.chats.setDisappearing("1", 60 as never)).toThrow(BrowserValidationError);
    expect(() => m.chats.archive("a/b")).toThrow(BrowserValidationError);
    expect(() => m.labels.update("1", {})).toThrow(BrowserValidationError);
    expect(() => m.profile.setPicture("")).toThrow(BrowserValidationError);
    expect(calls).toEqual([]);
  });
});
