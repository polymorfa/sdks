import { describe, expect, it, vi } from "vitest";
import {
  BrowserValidationError,
  ContactDirectoryController,
  GroupController,
  InboxController,
  NewChatController,
  PolymorfaClient,
  createApiContactSource,
  createApiGroupSource,
  createHandlerInboxSource,
  filterContacts,
  phoneQuery,
  sortContacts,
  type BrowserGroup,
  type ContactDirectorySource,
  type DirectoryContact,
  type GroupSource,
  type InboxDataSource,
  type PolymorfaPermission,
} from "@polymorfa/ui-kit";

const people: DirectoryContact[] = [
  { id: "3", name: "Zoë Álvarez", phoneNumber: "+34600111222" },
  { id: "1", name: "Ada Lovelace", phoneNumber: "+15550001" },
  { id: "2", pushName: "grace", phoneNumber: "+15550002" },
  { id: "4", businessName: "Bakery Co", phoneNumber: "+15550004" },
  { id: "1", name: "Duplicate Ada" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function apiClient(
  allow: readonly PolymorfaPermission[],
  api: (method: string, path: string, body: unknown) => Response,
) {
  const calls: { method: string; path: string; body: unknown; key?: string }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "/api/polymorfa/token")
      return Response.json({
        value: "pmfa_ct_Zml4dHVyZQ",
        audience: "browser",
        expiresAt: Date.now() + 600_000,
        grant: { session: "support", conversations: "all", allow },
      });
    const parsed = new URL(url);
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
    const raw = input instanceof Request ? await input.text() : init?.body;
    const body = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : undefined;
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    calls.push({
      method,
      path: parsed.pathname + parsed.search,
      body,
      ...(headers.get("idempotency-key") === null
        ? {}
        : { key: headers.get("idempotency-key")! }),
    });
    return api(method, parsed.pathname + parsed.search, body);
  });
  const client = new PolymorfaClient({ fetch, baseUrl: "https://api.example" });
  return { client, calls, ready: client.refresh() };
}

describe("contact search", () => {
  it("sorts named contacts first, drops duplicate IDs and folds accents", () => {
    const sorted = sortContacts(people);
    expect(sorted.map((contact) => contact.id)).toEqual(["1", "4", "3", "2"]);
    expect(filterContacts(sorted, "zoe").map((contact) => contact.id)).toEqual(["3"]);
    expect(filterContacts(sorted, "ALVAREZ zo").map((contact) => contact.id)).toEqual(["3"]);
    expect(filterContacts(sorted, "grace").map((contact) => contact.id)).toEqual(["2"]);
    expect(filterContacts(sorted, "555 0002").map((contact) => contact.id)).toEqual(["2"]);
    // Two digits are too few to match a number.
    expect(filterContacts(sorted, "55")).toEqual([]);
  });

  it("reads a query as a phone number only when it is one", () => {
    expect(phoneQuery("+1 (555) 000-1234")).toBe("+15550001234");
    expect(phoneQuery("12345")).toBeUndefined();
    expect(phoneQuery("Ada 5550001")).toBeUndefined();
  });
});

describe("ContactDirectoryController", () => {
  it("loads, filters and keeps the query across reloads", async () => {
    const source: ContactDirectorySource = { list: vi.fn(async () => people) };
    const directory = new ContactDirectoryController(source);
    await directory.load();
    directory.setQuery("ada");
    expect(directory.getSnapshot().results.map((contact) => contact.name)).toEqual([
      "Ada Lovelace",
    ]);
    await directory.load();
    expect(directory.getSnapshot()).toMatchObject({ status: "ready", query: "ada" });
    expect(directory.getSnapshot().results).toHaveLength(1);
  });

  it("ignores an older load that finishes after a newer one", async () => {
    const first = deferred<readonly DirectoryContact[]>();
    const second = deferred<readonly DirectoryContact[]>();
    const list = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const directory = new ContactDirectoryController({ list });
    const a = directory.load();
    const b = directory.load();
    second.resolve([{ id: "9", name: "Newest" }]);
    await b;
    first.resolve(people);
    await a;
    expect(directory.getSnapshot().contacts.map((contact) => contact.id)).toEqual(["9"]);
    expect((list.mock.calls[0]![0] as AbortSignal).aborted).toBe(true);
  });

  it("drops results from the previous source after setSource", async () => {
    const old = deferred<readonly DirectoryContact[]>();
    const directory = new ContactDirectoryController({ list: () => old.promise });
    void directory.load();
    directory.setSource({ list: async () => [{ id: "7", name: "Other session" }] });
    old.resolve(people);
    await vi.waitFor(() =>
      expect(directory.getSnapshot().contacts.map((contact) => contact.id)).toEqual(["7"]),
    );
  });

  it("reports a missing permission without offering a retry", async () => {
    const { client, ready } = apiClient(["read_messages"], () => Response.json({}));
    await ready;
    const directory = new ContactDirectoryController(createApiContactSource(client));
    await directory.load();
    expect(directory.getSnapshot()).toMatchObject({ status: "error", errorKind: "permission" });
  });

  it("looks up an unsaved number and discards a stale answer", async () => {
    const answer = deferred<DirectoryContact | null>();
    const lookup = vi.fn(() => answer.promise);
    const directory = new ContactDirectoryController({ list: async () => [], lookup });
    await directory.load();
    directory.setQuery("+1 555 000 9999");
    expect(directory.getSnapshot().phone).toBe("+15550009999");
    const pending = directory.lookupPhone();
    expect(directory.getSnapshot().lookup).toEqual({ status: "checking", phone: "+15550009999" });
    directory.setQuery("+1 555 000 8888");
    answer.resolve({ id: "99", phoneNumber: "+15550009999" });
    await pending;
    expect(directory.getSnapshot().lookup).toEqual({ status: "idle" });
  });
});

describe("API contact source", () => {
  it("lists with read_contact and maps the account's contacts", async () => {
    const { client, calls, ready } = apiClient(["read_contact"], (_method, path) =>
      path.endsWith("/contacts")
        ? Response.json({
            success: true,
            data: [{ id: "1", name: "", pushName: "Ada", phoneNumber: "+15550001", profileUrl: "https://img/1" }],
          })
        : Response.json({ success: true, data: [{ exists: false }] }),
    );
    await ready;
    const source = createApiContactSource(client);
    expect(await source.list()).toEqual([
      { id: "1", pushName: "Ada", phoneNumber: "+15550001", avatarUrl: "https://img/1" },
    ]);
    expect(await source.lookup!("+15550009")).toBeNull();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /messaging/support/contacts",
      "GET /messaging/support/contacts/check?phone=%2B15550009",
    ]);
  });
});

describe("browser groups resource", () => {
  const group: BrowserGroup = {
    id: "120363",
    name: "Launch",
    description: "",
    ownerId: "1",
    createdAt: 1_700_000_000,
    participants: [{ id: "1", isAdmin: true, isSuperAdmin: true }],
  };

  it("calls the exact client-token group routes", async () => {
    const { client, calls, ready } = apiClient(["groups_read", "groups_manage"], (_method, path) =>
      Response.json(
        path.includes("invite-code")
          ? { success: true, data: { code: "abc" } }
          : path.endsWith("/groups") || path.endsWith("/120363")
            ? { success: true, data: group }
            : { success: true },
      ),
    );
    await ready;
    const groups = client.messaging().groups;
    await groups.create({ name: "Launch", participants: ["2"] });
    await groups.retrieve("120363");
    await groups.setSubject("120363", "Launch v2");
    await groups.setDescription("120363", "");
    await groups.addParticipants("120363", ["3"]);
    await groups.removeParticipants("120363", ["3"]);
    await groups.promote("120363", ["2"]);
    await groups.demote("120363", ["2"]);
    await groups.inviteCode("120363");
    await groups.revokeInviteCode("120363");
    await groups.setInfoEditing("120363", true);
    await groups.setMessaging("120363", false);
    await groups.setMemberAddMode("120363", "admin_add");
    await groups.setJoinApproval("120363", true);
    await groups.leave("120363");
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ["POST", "/messaging/support/groups", { name: "Launch", participants: ["2"] }],
      ["GET", "/messaging/support/groups/120363", undefined],
      ["PUT", "/messaging/support/groups/120363/subject", { value: "Launch v2" }],
      ["PUT", "/messaging/support/groups/120363/description", { value: "" }],
      ["POST", "/messaging/support/groups/120363/participants/add", { participants: ["3"] }],
      ["POST", "/messaging/support/groups/120363/participants/remove", { participants: ["3"] }],
      ["POST", "/messaging/support/groups/120363/admin/promote", { participants: ["2"] }],
      ["POST", "/messaging/support/groups/120363/admin/demote", { participants: ["2"] }],
      ["GET", "/messaging/support/groups/120363/invite-code", undefined],
      ["POST", "/messaging/support/groups/120363/invite-code/revoke", undefined],
      ["PUT", "/messaging/support/groups/120363/settings/info-edit", { adminsOnly: true }],
      ["PUT", "/messaging/support/groups/120363/settings/messages", { adminsOnly: false }],
      ["PUT", "/messaging/support/groups/120363/settings/member-add", { mode: "admin_add" }],
      ["PUT", "/messaging/support/groups/120363/settings/join-approval", { required: true }],
      ["POST", "/messaging/support/groups/120363/leave", undefined],
    ]);
    // Only creation is a non-idempotent create; it carries a key.
    expect(calls[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("validates IDs and names before any request", async () => {
    const { client, calls, ready } = apiClient(["groups_manage"], () => Response.json({}));
    await ready;
    const groups = client.messaging().groups;
    expect(() => groups.retrieve("../contacts")).toThrow(BrowserValidationError);
    expect(() => groups.create({ name: " ", participants: ["1"] })).toThrow(BrowserValidationError);
    expect(() => groups.addParticipants("120363", [])).toThrow(BrowserValidationError);
    expect(() => groups.addParticipants("120363", ["+1555"])).toThrow(BrowserValidationError);
    expect(calls).toEqual([]);
  });

  it("refuses group changes in the source when the token lacks groups_manage", async () => {
    const { client, calls, ready } = apiClient(["groups_read"], () =>
      Response.json({ success: true, data: group }),
    );
    await ready;
    const source = createApiGroupSource(client);
    await expect(source.leave("120363")).rejects.toMatchObject({ status: 403, code: "permission_missing" });
    await source.retrieve("120363");
    expect(calls.map((call) => call.path)).toEqual(["/messaging/support/groups/120363"]);
  });
});

function fakeGroups(overrides: Partial<GroupSource> = {}): GroupSource & { current: BrowserGroup } {
  const state = {
    current: {
      id: "120363",
      name: "Launch",
      description: "Ship it",
      ownerId: "1",
      createdAt: 1_700_000_000,
      participants: [
        { id: "1", isAdmin: true, isSuperAdmin: true },
        { id: "2", isAdmin: false, isSuperAdmin: false },
      ],
    } as BrowserGroup,
  };
  return Object.assign(state, {
    retrieve: vi.fn(async () => state.current),
    create: vi.fn(async (input: { name: string; participants: readonly string[] }) => ({
      ...state.current,
      id: "555",
      name: input.name,
    })),
    setSubject: vi.fn(async (_id: string, value: string) => {
      state.current = { ...state.current, name: value };
    }),
    setDescription: vi.fn(async () => undefined),
    participants: vi.fn(async () => undefined),
    inviteCode: vi.fn(async () => "abc"),
    revokeInviteCode: vi.fn(async () => "def"),
    setting: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    ...overrides,
  });
}

describe("GroupController", () => {
  it("reloads after a change and reports what happened", async () => {
    const source = fakeGroups();
    const group = new GroupController(source, "120363");
    await group.load();
    expect(await group.rename("  Launch v2 ")).toBe(true);
    expect(source.setSubject).toHaveBeenCalledWith("120363", "Launch v2");
    expect(group.getSnapshot()).toMatchObject({ status: "ready", done: "rename" });
    expect(group.getSnapshot().group?.name).toBe("Launch v2");
    expect(source.retrieve).toHaveBeenCalledTimes(2);
  });

  it("keeps the group and shows the error when WhatsApp refuses", async () => {
    const source = fakeGroups({
      participants: vi.fn(async () => {
        throw new Error("not an admin");
      }),
    });
    const group = new GroupController(source, "120363");
    await group.load();
    expect(await group.participants("remove", ["2"])).toBe(false);
    expect(group.getSnapshot()).toMatchObject({
      status: "ready",
      failed: "remove",
      error: "not an admin",
    });
    expect(group.getSnapshot().pending).toBeUndefined();
  });

  it("runs one change at a time and offers none without manage access", async () => {
    const slow = deferred<void>();
    const source = fakeGroups({ setDescription: vi.fn(() => slow.promise) });
    const group = new GroupController(source, "120363");
    await group.load();
    const first = group.describe("x");
    expect(await group.rename("y")).toBe(false);
    slow.resolve();
    await first;
    const readOnly = new GroupController(source, "120363", { canManage: false });
    expect(await readOnly.leave()).toBe(false);
    expect(source.leave).not.toHaveBeenCalled();
  });

  it("shows and resets the invite code, sets settings and leaves", async () => {
    const source = fakeGroups();
    const group = new GroupController(source, "120363");
    await group.load();
    await group.showInviteCode();
    expect(group.getSnapshot().inviteCode).toBe("abc");
    await group.revokeInviteCode();
    expect(group.getSnapshot().inviteCode).toBe("def");
    await group.changeSetting({ setting: "messaging", adminsOnly: true });
    expect(source.setting).toHaveBeenCalledWith("120363", { setting: "messaging", adminsOnly: true });
    expect(await group.leave()).toBe(true);
    expect(group.getSnapshot().status).toBe("left");
  });
});

describe("NewChatController", () => {
  it("opens the one-to-one conversation for a contact", () => {
    const onOpen = vi.fn();
    const chat = new NewChatController({ contacts: { list: async () => people }, onOpen });
    chat.open(people[1]!);
    expect(onOpen).toHaveBeenCalledWith({
      id: "1",
      kind: "direct",
      name: "Ada Lovelace",
      phoneNumber: "+15550001",
      lastActivity: 0,
      unreadCount: 0,
    });
    expect(chat.canCreateGroup).toBe(false);
    chat.startGroup();
    expect(chat.getSnapshot().view).toBe("contacts");
  });

  it("walks the new-group flow and opens the created group", async () => {
    const onOpen = vi.fn();
    const groups = fakeGroups();
    const chat = new NewChatController({
      contacts: { list: async () => people },
      groups,
      onOpen,
    });
    chat.startGroup();
    chat.next();
    expect(chat.getSnapshot().view).toBe("groupMembers");
    chat.toggle(people[1]!);
    chat.toggle(people[2]!);
    chat.toggle(people[2]!);
    chat.next();
    expect(chat.getSnapshot()).toMatchObject({ view: "groupDetails", selected: [people[1]] });
    expect(await chat.createGroup()).toBeUndefined();
    chat.setGroupName(" Book club ");
    await chat.createGroup();
    expect(groups.create).toHaveBeenCalledWith(
      { name: "Book club", participants: ["1"] },
      expect.any(AbortSignal),
    );
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "555", kind: "group", name: "Book club" }),
    );
    expect(chat.getSnapshot()).toMatchObject({ view: "contacts", selected: [] });
  });

  it("drops a creation that the user backed out of", async () => {
    const created = deferred<BrowserGroup>();
    const onOpen = vi.fn();
    const chat = new NewChatController({
      contacts: { list: async () => [] },
      groups: { create: () => created.promise },
      onOpen,
    });
    chat.startGroup();
    chat.toggle(people[1]!);
    chat.next();
    chat.setGroupName("x");
    const pending = chat.createGroup();
    chat.back();
    created.resolve(fakeGroups().current);
    expect(await pending).toBeUndefined();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("InboxController.open", () => {
  function source(): InboxDataSource & { push: (change: Parameters<NonNullable<InboxDataSource["subscribe"]>>[0] extends (c: infer C) => void ? C : never) => void } {
    let listener: ((change: never) => void) | undefined;
    return {
      listConversations: async () => ({
        conversations: [{ id: "1", name: "Ada", lastActivity: 5, unreadCount: 0 }],
      }),
      conversation: () => ({ load: async () => ({ messages: [] }) }),
      subscribe: (next) => {
        listener = next as never;
        return () => undefined;
      },
      push: (change) => listener?.(change as never),
    };
  }

  it("selects an existing row instead of drafting it", async () => {
    const inbox = new InboxController(source());
    await inbox.load();
    inbox.open({ id: "1", name: "Other", lastActivity: 0, unreadCount: 0 });
    expect(inbox.getSnapshot().draft).toBeUndefined();
    expect(inbox.selected?.name).toBe("Ada");
  });

  it("keeps a new chat as a draft until its first message", async () => {
    const feed = source();
    const inbox = new InboxController(feed);
    await inbox.load();
    inbox.open({ id: "2", kind: "direct", name: "Grace", lastActivity: 0, unreadCount: 0 });
    expect(inbox.selected).toMatchObject({ id: "2", name: "Grace" });
    expect(inbox.getSnapshot().conversations.map((row) => row.id)).toEqual(["1"]);
    await inbox.load();
    expect(inbox.selected?.id).toBe("2");
    feed.push({
      type: "activity",
      conversationId: "2",
      lastMessage: { text: "Hi", createdAt: 10, direction: "outbound" },
    });
    expect(inbox.getSnapshot().draft).toBeUndefined();
    expect(inbox.getSnapshot().conversations[0]).toMatchObject({ id: "2", name: "Grace", kind: "direct" });
    inbox.open({ id: "3", lastActivity: 0, unreadCount: 0 });
    inbox.select("1");
    expect(inbox.getSnapshot().draft).toBeUndefined();
  });
});

describe("handler source group events", () => {
  it("names group senders and never names the group after one", async () => {
    let onMessage: ((frame: { data: string }) => void) | undefined;
    class FakeEventSource {
      addEventListener(_type: string, listener: (frame: { data: string }) => void) {
        onMessage = listener;
      }
      close() {}
    }
    const { client, ready } = apiClient(["read_messages", "subscribe_events"], () => Response.json({}));
    await ready;
    const handler = createHandlerInboxSource(client, { EventSource: FakeEventSource });
    const inboxChanges: unknown[] = [];
    const threadChanges: unknown[] = [];
    handler.subscribe!((change) => inboxChanges.push(change));
    handler
      .conversation({ id: "120363", lastActivity: 0, unreadCount: 0 })
      .subscribe!((change) => threadChanges.push(change));
    onMessage!({
      data: JSON.stringify({
        id: "evt_1",
        session: "support",
        event: "message.received",
        timestamp: "2026-10-27T10:00:00Z",
        payload: {
          id: "m1",
          text: "Hello all",
          fromMe: false,
          isGroup: true,
          pushName: "Ada",
          conversation: { id: "120363", sender: { id: "1", phoneNumber: "+15550001" } },
        },
      }),
    });
    expect(inboxChanges[0]).toMatchObject({ type: "activity", conversationId: "120363", kind: "group" });
    expect(inboxChanges[0]).not.toHaveProperty("name");
    expect(threadChanges[0]).toMatchObject({
      type: "upsert",
      message: { id: "m1", sender: { id: "1", name: "Ada", phoneNumber: "+15550001" } },
    });
  });
});
