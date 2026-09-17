// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationController,
  MessageComposerController,
  TemplateBuilderController,
  createConversationComposerActions,
  type ConversationMessage,
} from "@polymorfa/browser";
import {
  ChatDrawer,
  ComposeBox,
  PolymorfaProvider,
  MessageList,
  TemplateBuilder,
  useController,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureController() {
  let snapshot = {
    messages: [],
    hasMore: false,
    revision: 0,
    updatedAt: 0,
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(),
    loadMore: vi.fn(async () => undefined),
    update: () => {
      snapshot = { messages: [], hasMore: false, revision: 1, updatedAt: 1 };
      for (const listener of listeners) listener();
    },
  };
}

describe("React bindings", () => {
  it("subscribes through useSyncExternalStore and applies provider direction", () => {
    const controller = fixtureController();
    let renders = 0;
    function Probe() {
      useController(controller);
      renders += 1;
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(
        <PolymorfaProvider
          locale={{ code: "ar", direction: "rtl", messages: {} as never }}
        >
          <Probe />
          <MessageList controller={controller as never} />
        </PolymorfaProvider>,
      );
    });
    expect(
      host.querySelector('[data-pmfa="message-list"]')?.getAttribute("dir"),
    ).toBe("rtl");
    act(() => controller.update());
    expect(renders).toBeGreaterThan(1);
    act(() => root.unmount());
    expect(controller.dispose).not.toHaveBeenCalled();
  });

  it("owns and disposes only factory-created controllers", () => {
    const controller = fixtureController();
    const root = createRoot(document.createElement("div"));
    act(() =>
      root.render(<MessageList createController={() => controller as never} />),
    );
    act(() => root.unmount());
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it("edits and previews canonical template structures", async () => {
    const templateDocument = {
      id: "tpl-1",
      name: "order_ready",
      category: "UTILITY",
      language: "en_US",
      status: "draft",
      kind: "standard",
      definition: {
        version: 1 as const,
        kind: "standard" as const,
        category: "UTILITY" as const,
        language: "en_US",
        header: { format: "text" as const, text: "Order {{order_id}}" },
        body: "Hello {{name}}",
        footer: "Thanks",
        buttons: [{ type: "quick_reply" as const, text: "Track order" }],
        variables: [
          { name: "order_id", type: "text" as const, example: "A-100" },
          { name: "name", type: "text" as const, example: "Ada" },
        ],
      },
      sampleValues: { order_id: "A-100", name: "Ada" },
      cloudLinks: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const controller = new TemplateBuilderController({
      load: async () => templateDocument,
      save: async () => templateDocument,
      preview: async () => ({
        surface: "preview",
        rendered: {
          kind: "standard",
          category: "UTILITY",
          header: { format: "text", text: "Order A-100" },
          body: "Hello Ada",
          footer: "Thanks",
          buttons: [{ type: "quick_reply", text: "Track order" }],
          cards: [],
        },
      }),
      submitToMeta: async () => ({ ...templateDocument, status: "PENDING" }),
      delete: async () => undefined,
    });
    await controller.load("tpl-1");
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<TemplateBuilder controller={controller} />));

    expect(host.querySelector('[data-field="header"]')).not.toBeNull();
    const body = host.querySelector(
      '[data-field="body"]',
    ) as HTMLTextAreaElement;
    expect(body.value).toBe("Hello {{name}}");
    expect(
      host.querySelector('[aria-label="Variable name example"]'),
    ).not.toBeNull();

    await act(async () => controller.refreshPreview());
    expect(host.querySelector("output")?.textContent).toContain("Hello Ada");
    expect(host.querySelector("output")?.textContent).toContain("Track order");
    expect(host.textContent).toContain("Save draft");
    expect(host.textContent).toContain("Submit to Meta");
    act(() => root.unmount());
  });
  it("renders messages oldest first with direction, status, and labels", () => {
    const messages = [
      {
        id: "b",
        text: "Second",
        createdAt: 2_000,
        direction: "outbound",
        status: "failed",
      },
      {
        id: "a",
        text: "First",
        createdAt: 1_000,
        direction: "inbound",
        status: "sent",
      },
      {
        id: "c",
        text: "No time",
        createdAt: Number.NaN,
        direction: "inbound",
        status: "pending",
      },
      {
        id: "d",
        text: "Out of range",
        createdAt: 9e15,
        direction: "inbound",
        status: "sent",
      },
    ];
    const snapshot = {
      status: "ready",
      messages,
      hasMore: false,
      revision: 0,
      updatedAt: 0,
    };
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      dispose: vi.fn(),
      loadMore: vi.fn(),
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <PolymorfaProvider appearance={{ theme: "dark" }}>
          <MessageList controller={controller as never} />
        </PolymorfaProvider>,
      ),
    );
    const list = host.querySelector('[data-pmfa="message-list"]');
    expect(list?.className).toContain("pmfa-dark");
    const items = [...host.querySelectorAll("li.pmfa-msg")];
    expect(items.map((item) => item.getAttribute("data-message-id"))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(items[1]?.className).toContain("pmfa-msg-out");
    expect(items[1]?.textContent).toContain("Not delivered");
    expect(items[2]?.querySelector("time")).toBeNull();
    expect(items[2]?.textContent).toContain("Sending");
    expect(document.getElementById("pmfa-component-styles")).not.toBeNull();
    act(() => root.unmount());
  });
});

function source(messages: readonly ConversationMessage[]) {
  return {
    load: async () => ({ messages }),
    subscribe: () => () => undefined,
    send: async (message: { clientId: string; text: string }) => ({
      id: `server-${message.clientId}`,
      clientId: message.clientId,
      text: message.text,
      createdAt: Date.now(),
      direction: "outbound" as const,
      status: "sent" as const,
    }),
  };
}

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function setFiles(input: HTMLInputElement, files: readonly File[]) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: Object.assign([...files], {
      item: (index: number) => files[index] ?? null,
    }),
  });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const now = Date.now();
const chat: ConversationMessage[] = [
  {
    id: "m1",
    text: "Where is my order?",
    createdAt: now - 2 * 86_400_000,
    direction: "inbound",
    status: "sent",
  },
  {
    id: "m2",
    text: "",
    createdAt: now - 1,
    direction: "inbound",
    status: "sent",
    attachments: [
      {
        id: "a1",
        name: "photo.png",
        size: 2048,
        contentType: "image/png",
        previewUrl: "https://cdn.example/photo-small.png",
        url: "https://cdn.example/photo.png",
      },
      {
        id: "a2",
        name: "invoice.pdf",
        size: 1_572_864,
        contentType: "application/pdf",
        url: "https://cdn.example/invoice.pdf",
      },
    ],
  },
  {
    id: "m3",
    clientId: "c3",
    text: "It ships today",
    createdAt: now,
    direction: "outbound",
    status: "failed",
    replyTo: "m1",
  },
];

describe("React chat features", () => {
  it("renders attachments, reply quotes, date separators, and status", async () => {
    const conversation = new ConversationController(source(chat));
    await conversation.load();
    const view = mount(<MessageList controller={conversation} />);
    const log = view.host.querySelector('[data-pmfa="message-list"]');
    expect(log?.getAttribute("role")).toBe("log");
    expect(log?.getAttribute("aria-live")).toBe("polite");
    const separators = [
      ...view.host.querySelectorAll('[data-slot="dateSeparator"]'),
    ].map((node) => node.textContent);
    expect(separators).toHaveLength(2);
    expect(separators[1]).toBe("Today");
    expect(separators[0]).not.toBe("Yesterday");

    const image = view.host.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("photo.png");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");
    expect(image?.getAttribute("src")).toBe(
      "https://cdn.example/photo-small.png",
    );
    expect(image?.closest("a")?.getAttribute("href")).toBe(
      "https://cdn.example/photo.png",
    );
    const file = view.host.querySelector(".pmfa-att-file");
    expect(file?.tagName).toBe("A");
    expect(file?.textContent).toContain("invoice.pdf");
    expect(file?.textContent).toContain("1.5 MB");

    const failed = view.host.querySelector('[data-message-id="m3"]');
    expect(failed?.querySelector(".pmfa-status")).not.toBeNull();
    expect(failed?.textContent).toContain("Not delivered");
    const quote = failed?.querySelector(
      '[data-slot="replyQuote"]',
    ) as HTMLButtonElement;
    expect(quote.textContent).toContain("Where is my order?");
    act(() => quote.click());
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m1");
    // No onReply: no Reply action.
    expect(view.host.querySelector('[data-slot="replyButton"]')).toBeNull();
    view.unmount();
    conversation.dispose();
  });

  it("retries a failed message and absorbs the rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      const retry = vi.fn(async () => {
        throw new Error("still offline");
      });
      const snapshot = {
        status: "ready",
        messages: chat,
        hasMore: false,
        revision: 0,
        updatedAt: 0,
      };
      const controller = {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
        dispose: vi.fn(),
        loadMore: vi.fn(),
        retry,
      };
      const view = mount(<MessageList controller={controller as never} />);
      const button = view.host.querySelector(
        '[data-slot="retryButton"]',
      ) as HTMLButtonElement;
      expect(button.getAttribute("aria-label")).toBe("Retry sending");
      act(() => button.click());
      expect(retry).toHaveBeenCalledWith("c3");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      view.unmount();
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("wires drawer replies to the built-in composer and manages focus", async () => {
    const conversation = new ConversationController(source(chat));
    await conversation.load();
    const composer = new MessageComposerController(
      createConversationComposerActions(conversation, vi.fn()),
    );
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onReply = vi.fn();
    const onClose = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <ChatDrawer
          open={open}
          onClose={onClose}
          conversation={conversation}
          composerController={composer}
          onReply={onReply}
          title="Support"
          autoFocus
        />
      );
    }
    const view = mount(<Harness open />);
    const dialog = view.host.querySelector('[role="dialog"]');
    const titleId = dialog?.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? "")?.textContent).toBe("Support");
    const textarea = view.host.querySelector("textarea");
    expect(document.activeElement).toBe(textarea);

    const reply = view.host.querySelector(
      '[data-message-id="m1"] [data-slot="replyButton"]',
    ) as HTMLButtonElement;
    expect(reply.getAttribute("aria-label")).toBe("Reply");
    act(() => reply.click());
    expect(onReply).toHaveBeenCalledWith(chat[0]);
    expect(composer.getSnapshot().replyTo).toBe("m1");
    const banner = view.host.querySelector('[data-slot="replyBanner"]');
    expect(banner?.textContent).toContain("Replying to Contact");
    expect(banner?.textContent).toContain("Where is my order?");
    act(() =>
      (
        banner?.querySelector('[aria-label="Cancel reply"]') as HTMLElement
      ).click(),
    );
    expect(composer.getSnapshot().replyTo).toBeUndefined();

    let escape: KeyboardEvent | undefined;
    act(() => {
      escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      textarea?.dispatchEvent(escape);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(escape?.defaultPrevented).toBe(true);
    act(() => view.root.render(<Harness open={false} />));
    expect(document.activeElement).toBe(opener);
    view.unmount();
    opener.remove();
    composer.dispose();
    conversation.dispose();
  });

  it("uploads, shows progress, removes, and reports rejected attachments", async () => {
    let report: ((progress: number) => void) | undefined;
    const composer = new MessageComposerController(
      {
        upload: (_attachment, onProgress) => {
          report = onProgress;
          return new Promise(() => undefined);
        },
        send: vi.fn(async () => undefined),
      },
      { maxAttachmentSize: 10 },
    );
    const view = mount(<ComposeBox controller={composer} accept="image/*" />);
    const input = view.host.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);
    expect(input.tabIndex).toBe(-1);
    const send = view.host.querySelector(
      '[data-slot="composerSend"]',
    ) as HTMLButtonElement;
    expect(send.getAttribute("aria-label")).toBe("Send");
    expect(send.disabled).toBe(true);
    expect(
      view.host
        .querySelector('[data-slot="composerAttach"]')
        ?.getAttribute("aria-label"),
    ).toBe("Attach files");

    setFiles(input, [new File(["12345"], "small.txt", { type: "text/plain" })]);
    act(() => report?.(0.5));
    const chip = view.host.querySelector('[data-slot="attachmentChip"]');
    expect(chip?.textContent).toContain("small.txt");
    const progress = chip?.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuenow")).toBe("50");
    expect(send.disabled).toBe(true);
    act(() =>
      (
        chip?.querySelector('[aria-label="Remove small.txt"]') as HTMLElement
      ).click(),
    );
    expect(composer.getSnapshot().attachments).toEqual([]);
    expect(view.host.querySelector('[data-slot="attachmentChip"]')).toBeNull();

    setFiles(input, [new File(["x".repeat(20)], "big.bin")]);
    await act(async () => undefined);
    expect(view.host.querySelector('[role="alert"]')?.textContent).toBe(
      "Attachment exceeds 10 bytes.",
    );
    view.unmount();
    composer.dispose();
  });

  it("marks a failed upload and enables send for a ready attachment", async () => {
    let finish: (() => void) | undefined;
    const composer = new MessageComposerController({
      upload: async (attachment) => {
        if (attachment.name === "bad.txt") throw new Error("Upload refused");
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return { ...attachment, url: "https://cdn.example/good.txt" };
      },
      send: vi.fn(async () => undefined),
    });
    const view = mount(<ComposeBox controller={composer} />);
    const input = view.host.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    setFiles(input, [new File(["a"], "good.txt"), new File(["b"], "bad.txt")]);
    await act(async () => undefined);
    const failed = view.host.querySelector(".pmfa-chip-failed");
    expect(failed?.textContent).toContain("Upload refused");
    await act(async () => finish?.());
    act(() =>
      (
        view.host.querySelector('[aria-label="Remove bad.txt"]') as HTMLElement
      ).click(),
    );
    const send = view.host.querySelector(
      '[data-slot="composerSend"]',
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    view.unmount();
    composer.dispose();
  });

  it("applies slot classes, styles, and classNames", () => {
    const snapshot = {
      status: "ready",
      messages: chat,
      hasMore: true,
      revision: 0,
      updatedAt: 0,
    };
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      dispose: vi.fn(),
      loadMore: vi.fn(),
    };
    const view = mount(
      <PolymorfaProvider
        appearance={{
          elements: {
            bubble: {
              className: "brand-bubble",
              styles: { backgroundColor: "rgb(1, 2, 3)", "--x": "1" },
            },
            messageList: { className: "brand-list" },
          },
        }}
      >
        <MessageList
          controller={controller as never}
          className="outer"
          classNames={{ bubble: "prop-bubble", loadMore: "prop-more" }}
        />
      </PolymorfaProvider>,
    );
    const bubble = view.host.querySelector(
      '[data-slot="bubble"]',
    ) as HTMLElement;
    expect(bubble.className).toBe("pmfa-bubble brand-bubble prop-bubble");
    expect(bubble.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(bubble.style.getPropertyValue("--x")).toBe("1");
    const list = view.host.querySelector('[data-slot="messageList"]');
    expect(list?.className).toContain("pmfa-list brand-list outer");
    expect(
      view.host.querySelector('[data-slot="loadMore"]')?.className,
    ).toContain("prop-more");
    for (const slot of ["message", "messageMeta", "attachment", "replyQuote"])
      expect(
        view.host.querySelector(`[data-slot="${slot}"]`),
        slot,
      ).not.toBeNull();
    view.unmount();
  });

  it("renders custom attachments", async () => {
    const conversation = new ConversationController(source(chat));
    await conversation.load();
    const view = mount(
      <MessageList
        controller={conversation}
        renderAttachment={(attachment) => (
          <em className="custom">{attachment.id}</em>
        )}
      />,
    );
    expect(
      [...view.host.querySelectorAll(".custom")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["a1", "a2"]);
    view.unmount();
    conversation.dispose();
  });

  it("skips the bundled stylesheets when unstyled", () => {
    document.getElementById("pmfa-component-styles")?.remove();
    document.getElementById("pmfa-calls-styles")?.remove();
    const controller = fixtureController();
    const view = mount(
      <PolymorfaProvider appearance={{ unstyled: true }}>
        <MessageList controller={controller as never} />
        <ComposeBox
          createController={() =>
            new MessageComposerController({
              upload: vi.fn(),
              send: vi.fn(),
            })
          }
        />
      </PolymorfaProvider>,
    );
    expect(document.getElementById("pmfa-component-styles")).toBeNull();
    expect(view.host.querySelector(".pmfa-list")).not.toBeNull();
    expect(view.host.querySelector('[data-slot="composer"]')).not.toBeNull();
    view.unmount();
    const styled = mount(<MessageList controller={controller as never} />);
    const tag = document.getElementById("pmfa-component-styles");
    expect(tag?.textContent?.trimStart().startsWith("@layer polymorfa")).toBe(
      true,
    );
    styled.unmount();
  });

  it("emits dark color variables on the component root", () => {
    const controller = fixtureController();
    const view = mount(
      <PolymorfaProvider
        appearance={{
          theme: "dark",
          darkVariables: { colorPrimary: "#8ab4ff" },
        }}
      >
        <MessageList controller={controller as never} />
      </PolymorfaProvider>,
    );
    const list = view.host.querySelector(".pmfa-list") as HTMLElement;
    expect(list.style.getPropertyValue("--pmfa-dark-color-primary")).toBe(
      "#8ab4ff",
    );
    view.unmount();
  });

  it("never renders unsafe attachment URLs as links or images", () => {
    const message: ConversationMessage = {
      id: "x1",
      text: "",
      createdAt: now,
      direction: "inbound",
      status: "sent",
      attachments: [
        {
          id: "a1",
          name: "doc.pdf",
          size: 1,
          contentType: "application/pdf",
          url: "javascript:alert(document.domain)",
        },
        {
          id: "a2",
          name: "pic.png",
          size: 1,
          contentType: "image/png",
          url: "javascript:alert(1)",
          previewUrl: "https://cdn.example/pic.png",
        },
        {
          id: "a3",
          name: "bad.png",
          size: 1,
          contentType: "image/png",
          url: "data:text/html,<script>alert(1)</script>",
          previewUrl: "javascript:alert(1)",
        },
        {
          id: "a4",
          name: "ok.pdf",
          size: 1,
          contentType: "application/pdf",
          url: "blob:https://app.example/1",
        },
      ],
    };
    const controller = fixtureController();
    const snapshot = {
      messages: [message],
      hasMore: false,
      revision: 0,
      updatedAt: 0,
    };
    controller.getSnapshot = () => snapshot as never;
    const view = mount(<MessageList controller={controller as never} />);
    const hrefs = [...view.host.querySelectorAll("a")].map((node) =>
      node.getAttribute("href"),
    );
    expect(hrefs).toEqual(["blob:https://app.example/1"]);
    const sources = [...view.host.querySelectorAll("img")].map((node) =>
      node.getAttribute("src"),
    );
    expect(sources).toEqual(["https://cdn.example/pic.png"]);
    const cards = view.host.querySelectorAll('[data-slot="attachment"]');
    expect(cards).toHaveLength(4);
    expect(cards[0]?.tagName).toBe("DIV");
    expect(cards[0]?.textContent).toContain("doc.pdf");
    expect(cards[1]?.tagName).toBe("DIV");
    expect(cards[2]?.tagName).toBe("DIV");
    expect(cards[2]?.textContent).toContain("bad.png");
    view.unmount();
  });

  it("keeps factory controllers usable under StrictMode", async () => {
    const conversations: ConversationController[] = [];
    const composers: MessageComposerController[] = [];
    const view = mount(
      <StrictMode>
        <ChatDrawer
          createController={() => {
            const made = new ConversationController(source(chat));
            conversations.push(made);
            return made;
          }}
          createComposerController={() => {
            const made = new MessageComposerController({
              upload: vi.fn(),
              send: vi.fn(async () => undefined),
            });
            composers.push(made);
            return made;
          }}
        />
      </StrictMode>,
    );
    const composer = composers.at(-1);
    const conversation = conversations.at(-1);
    expect(() => composer?.setText("hi")).not.toThrow();
    await act(async () => {
      await conversation?.load();
    });
    const textarea = view.host.querySelector("textarea");
    expect(textarea?.value).toBe("hi");
    expect(view.host.textContent).toContain("Where is my order?");
    const reply = view.host.querySelector(
      '[data-message-id="m1"] [data-slot="replyButton"]',
    ) as HTMLButtonElement;
    act(() => reply.click());
    expect(composer?.getSnapshot().replyTo).toBe("m1");
    // Every controller except the live one was disposed.
    for (const made of [...composers, ...conversations].filter(
      (item) => item !== composer && item !== conversation,
    ))
      expect(
        () => made.getSnapshot() && made.subscribe(() => undefined),
      ).toThrow();
    view.unmount();
    expect(() => composer?.setText("bye")).toThrow(/disposed/);
    expect(() => conversation?.subscribe(() => undefined)).toThrow(/disposed/);
  });

  it("keeps a createController list usable under StrictMode", async () => {
    let made: ConversationController | undefined;
    const view = mount(
      <StrictMode>
        <MessageList
          createController={() =>
            (made = new ConversationController(source(chat)))
          }
        />
      </StrictMode>,
    );
    await act(async () => {
      await made?.load();
    });
    expect(view.host.textContent).toContain("Where is my order?");
    view.unmount();
    expect(() => made?.subscribe(() => undefined)).toThrow(/disposed/);
  });

  it("moves drawer focus only on open, and closes on Escape from inside", () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const conversation = fixtureController();
    const onClose = vi.fn();
    let setOpen: (open: boolean) => void = () => undefined;
    function Harness() {
      const [open, update] = useState(true);
      setOpen = update;
      return (
        <>
          <ChatDrawer
            open={open}
            onClose={onClose}
            controller={conversation as never}
            title="First"
          />
          <ChatDrawer
            onClose={onClose}
            controller={conversation as never}
            title="Second"
          />
        </>
      );
    }
    const view = mount(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    expect(document.activeElement).toBe(outside);

    // Escape outside every drawer closes nothing.
    act(() => {
      outside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();

    // An IME composition keeps the drawer open.
    const [first] = view.host.querySelectorAll('[role="dialog"]');
    act(() => {
      first?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          isComposing: true,
        }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => setOpen(false));
    act(() => setOpen(true));
    const reopened = view.host.querySelector('[role="dialog"]');
    const close = reopened?.querySelector('[data-slot="drawerClose"]');
    expect(document.activeElement).toBe(close);
    act(() => {
      close?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => setOpen(false));
    expect(document.activeElement).toBe(outside);
    view.unmount();
    outside.remove();
  });

  it("clears a rejected-file error after a send, an edit, or a reset", async () => {
    const composer = new MessageComposerController(
      {
        upload: vi.fn(),
        send: vi.fn(async () => undefined),
      },
      { maxAttachmentSize: 1 },
    );
    const view = mount(<ComposeBox controller={composer} />);
    const input = view.host.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const reject = async () => {
      setFiles(input, [new File(["too big"], "big.txt")]);
      await act(async () => undefined);
      expect(view.host.querySelector('[role="alert"]')?.textContent).toBe(
        "Attachment exceeds 1 bytes.",
      );
    };
    await reject();
    act(() => composer.setText("hello"));
    expect(view.host.querySelector('[role="alert"]')).toBeNull();

    await reject();
    await act(async () => {
      await composer.submit();
    });
    expect(view.host.querySelector('[role="alert"]')).toBeNull();

    await reject();
    act(() => composer.reset());
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    view.unmount();
    composer.dispose();
  });
});
