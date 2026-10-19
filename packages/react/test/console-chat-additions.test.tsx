// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConversationController,
  MessageComposerController,
  MessageFilterController,
  createConversationComposerActions,
  type ConversationMessage,
} from "@polymorfa/browser";
import {
  ChatDetails,
  ChatWindow,
  OrderCartView,
  PolymorfaProvider,
} from "../src/index.js";
import { createLocale } from "@polymorfa/ui";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}
function click(target: Element | null) {
  if (!target) throw new Error("Missing control");
  act(() => (target as HTMLElement).click());
}

it("filters the loaded thread by query, type and direction without reloading history or sending", async () => {
  const source = {
    load: vi.fn(async () => ({
      messages: [
        {
          id: "in",
          text: "Ana",
          createdAt: 1,
          direction: "inbound",
          status: "sent",
        },
        {
          id: "out",
          text: "Receipt",
          createdAt: 2,
          direction: "outbound",
          status: "sent",
          messageType: "document",
          attachments: [
            {
              id: "a",
              name: "Ana.pdf",
              size: 3,
              contentType: "application/pdf",
            },
          ],
        },
      ] as ConversationMessage[],
    })),
    subscribe: () => () => undefined,
    send: vi.fn(),
  };
  const conversation = new ConversationController(source);
  await conversation.load();
  const filter = new MessageFilterController();
  cleanups.push(() => {
    conversation.dispose();
    filter.dispose();
  });
  const host = mount(
    <ChatWindow
      controller={conversation}
      filterController={filter}
      search
      filters
    />,
  );
  const messages = () =>
    [...host.querySelectorAll("[data-message-id]")].map((node) =>
      node.getAttribute("data-message-id"),
    );
  expect(messages()).toEqual(["in", "out"]);
  click(host.querySelector('[aria-controls][aria-expanded="false"]'));
  const search = host.querySelector('input[type="search"]') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, "ANA");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(messages()).toEqual(["in", "out"]);
  act(() => filter.setType("document"));
  expect(messages()).toEqual(["out"]);
  act(() => filter.setDirection("inbound"));
  expect(messages()).toEqual([]);
  expect(host.querySelector('[data-slot="empty"]')?.textContent).toBe(
    "No loaded messages match",
  );
  click(
    [...host.querySelectorAll("button")].find(
      (node) => node.textContent === "Clear filters",
    ) ?? null,
  );
  expect(messages()).toEqual(["in", "out"]);
  expect(host.querySelector('input[type="search"]')).toBeNull();
  // Closing search drops its query so no hidden filter keeps hiding messages.
  click(host.querySelector('[aria-controls][aria-expanded="false"]'));
  const reopened = host.querySelector(
    'input[type="search"]',
  ) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(reopened, "receipt");
    reopened.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(messages()).toEqual(["out"]);
  act(() =>
    reopened.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(filter.getSnapshot().query).toBe("");
  expect(messages()).toEqual(["in", "out"]);
  expect(source.load).toHaveBeenCalledOnce();
  expect(source.send).not.toHaveBeenCalled();
});

it("renders typed carts and missing-content states through ChatWindow without Console render overrides", async () => {
  const conversation = new ConversationController({
    load: async () => ({
      messages: [
        {
          id: "cart",
          text: "",
          createdAt: 1,
          direction: "inbound",
          status: "sent",
          order: {
            catalogId: "raw-catalog-id",
            items: [
              {
                productRetailerId: "shirt",
                quantity: 2,
                itemPrice: 1.235,
                currency: "USD",
              },
            ],
          },
        },
        {
          id: "missing",
          text: "Must not appear",
          createdAt: 2,
          direction: "inbound",
          status: "sent",
          contentState: "not_retained",
          attachments: [
            {
              id: "a",
              name: "hidden",
              size: 2,
              contentType: "image/png",
              url: "https://example.test/hidden.png",
            },
          ],
        },
        {
          id: "empty",
          text: "",
          createdAt: 3,
          direction: "inbound",
          status: "sent",
        },
        {
          id: "reply",
          text: "Reply",
          createdAt: 4,
          direction: "outbound",
          status: "sent",
          replyTo: "missing",
        },
      ],
    }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  cleanups.push(() => conversation.dispose());
  const host = mount(
    <ChatWindow
      controller={conversation}
      classNames={{
        orderCart: "custom-order",
        contentUnavailable: "custom-unavailable",
      }}
    />,
  );
  expect(host.querySelector(".custom-order")).not.toBeNull();
  expect(host.querySelector(".custom-unavailable")).not.toBeNull();
  expect(
    host.querySelector('[data-message-id="reply"] .pmfa-quote-text')
      ?.textContent,
  ).toBe("Message content was not retained");
  expect(host.textContent).toContain("$1.235");
  expect(host.textContent).not.toContain("raw-catalog-id");
  expect(
    host.querySelector('[data-message-id="missing"]')?.textContent,
  ).toContain("Message content was not retained");
  expect(host.textContent).not.toContain("Must not appear");
  expect(host.querySelector("img")).toBeNull();
  expect(
    host.querySelector(
      '[data-message-id="empty"] [data-slot="contentUnavailable"]',
    ),
  ).toBeNull();
});

it("bounds cart lines, preserves expansion focus and uses the SDK Portuguese bundle", () => {
  const order = {
    catalogId: "internal",
    items: Array.from({ length: 21 }, (_, i) => ({
      productRetailerId: `product-${i}`,
      quantity: 1,
      itemPrice: null,
      currency: null,
    })),
  };
  const host = mount(
    <PolymorfaProvider locale={createLocale("pt-BR")}>
      <OrderCartView order={order} />
    </PolymorfaProvider>,
  );
  const heading = host.querySelector("h3");
  expect(heading?.textContent).toContain("Pedido");
  expect(host.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
    heading?.id,
  );
  expect(host.textContent).toContain("Não informado");
  expect(host.querySelectorAll('[data-slot="orderItem"]')).toHaveLength(20);
  const toggle = host.querySelector("button")!;
  toggle.focus();
  click(toggle);
  expect(host.querySelectorAll('[data-slot="orderItem"]')).toHaveLength(21);
  expect(document.activeElement).toBe(toggle);
  expect(toggle.textContent).toBe("Mostrar menos");
  click(toggle);
  expect(host.querySelectorAll('[data-slot="orderItem"]')).toHaveLength(20);
});

it("renders customer details and a host extension without requiring a client or exposing technical fields", () => {
  const host = mount(
    <ChatDetails
      name="Ana"
      labels={["Customer"]}
      sendingNumber="Support"
      retentionDays={30}
    >
      <button>Developer details</button>
    </ChatDetails>,
  );
  expect(host.textContent).toContain("Ana");
  expect(host.textContent).toContain("30 days");
  expect(host.textContent).toContain("Support");
  expect(host.querySelectorAll('[data-slot="chatDetailsField"]')).toHaveLength(
    2,
  );
  expect(host.textContent).toContain("Developer details");
});

it("offers Reply only when the data source accepts replies, even with a composer", async () => {
  const messages: ConversationMessage[] = [
    {
      id: "m1",
      text: "Hello",
      createdAt: 1,
      direction: "inbound",
      status: "sent",
    },
  ];
  const conversation = new ConversationController({
    load: async () => ({ messages }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const composer = new MessageComposerController(
    createConversationComposerActions(conversation, async () => {
      throw new Error("no uploads");
    }),
  );
  const onReply = vi.fn();
  cleanups.push(() => {
    composer.dispose();
    conversation.dispose();
  });
  const replyButtons = (host: HTMLElement) =>
    host.querySelectorAll('button[aria-label="Reply"]');
  const supported = mount(
    <ChatWindow controller={conversation} composerController={composer} />,
  );
  expect(replyButtons(supported)).toHaveLength(1);
  const regional = mount(
    <ChatWindow
      controller={conversation}
      composerController={composer}
      replies={false}
      onReply={onReply}
    />,
  );
  expect(replyButtons(regional)).toHaveLength(0);
  expect(regional.querySelector("textarea")).not.toBeNull();
  expect(composer.getSnapshot().replyTo).toBeUndefined();
  expect(onReply).not.toHaveBeenCalled();
});
