// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  ConversationController,
  type ConversationMessage,
} from "@polymorfa/ui-kit";
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "../../src/web-components/index.js";

it("renders bounded received carts and hides unavailable bodies and quote snippets", async () => {
  defineChatElements();
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
            catalogId: "private-catalog",
            items: Array.from({ length: 21 }, (_, index) => ({
              productRetailerId: `product-${index}`,
              quantity: 1,
              itemPrice: 1.235,
              currency: "USD",
            })),
          },
        },
        {
          id: "missing",
          text: "stale body",
          createdAt: 2,
          direction: "inbound",
          status: "sent",
          contentState: "not_retained",
          attachments: [
            {
              id: "hidden",
              name: "hidden.png",
              contentType: "image/png",
              size: 1,
              url: "https://example.test/hidden.png",
            },
          ],
        },
        {
          id: "reply",
          text: "Reply",
          createdAt: 3,
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
  const node = document.createElement(
    "pmfa-chat-window",
  ) as PolymorfaChatWindowElement;
  node.controller = conversation;
  document.body.append(node);
  try {
    const root = node.shadowRoot!;
    expect(root.textContent).toContain("$1.235");
    expect(root.textContent).not.toContain("private-catalog");
    expect(root.textContent).not.toContain("stale body");
    expect(root.querySelector("img")).toBeNull();
    const heading = root.querySelector("h3.pmfa-order-header");
    expect(heading?.textContent).toContain("Order");
    expect(
      root.querySelector("section.pmfa-order")?.getAttribute("aria-labelledby"),
    ).toBe(heading?.id);
    expect(root.querySelectorAll('[part~="order-item"]')).toHaveLength(20);
    const toggle = root.querySelector<HTMLButtonElement>(
      '[part~="order-toggle"]',
    )!;
    toggle.focus();
    toggle.click();
    expect(root.querySelectorAll('[part~="order-item"]')).toHaveLength(21);
    expect(root.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      root.querySelector('[data-message-id="reply"] .pmfa-quote-text')
        ?.textContent,
    ).toBe("Message content was not retained");
  } finally {
    node.remove();
    conversation.dispose();
  }
});

function mountWindow(messages: ConversationMessage[]) {
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({ messages }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  const node = document.createElement(
    "pmfa-chat-window",
  ) as PolymorfaChatWindowElement;
  node.controller = conversation;
  return { conversation, node };
}

it("gives an empty available body a line for its time without relabelling it", async () => {
  const { conversation, node } = mountWindow([
    {
      id: "empty",
      text: "",
      createdAt: 1,
      direction: "inbound",
      status: "sent",
    },
    {
      id: "gone",
      text: "",
      createdAt: 2,
      direction: "inbound",
      status: "sent",
      contentState: "deleted",
    },
  ]);
  await conversation.load();
  document.body.append(node);
  try {
    const root = node.shadowRoot!;
    // Empty and available: no label, but a line that reserves the time.
    const empty = root.querySelector('[data-message-id="empty"]')!;
    expect(empty.querySelector(".pmfa-content-unavailable")).toBeNull();
    const line = empty.querySelector(".pmfa-text");
    expect(line?.firstChild).toBe(line?.querySelector(".pmfa-meta-space"));
    expect(
      line?.querySelector(".pmfa-meta-space")?.getAttribute("aria-hidden"),
    ).toBe("true");
    // Unavailable bodies keep their label and get no text line.
    const gone = root.querySelector('[data-message-id="gone"]')!;
    expect(gone.querySelector(".pmfa-content-unavailable")?.textContent).toBe(
      "This message was deleted",
    );
    expect(gone.querySelector(".pmfa-text")).toBeNull();
  } finally {
    node.remove();
    conversation.dispose();
  }
});

it("keeps the cart toggle in place inside the message list when items change above it", async () => {
  const { conversation, node } = mountWindow([
    {
      id: "cart",
      text: "",
      createdAt: 1,
      direction: "inbound",
      status: "sent",
      order: {
        catalogId: "c",
        items: Array.from({ length: 23 }, (_, index) => ({
          productRetailerId: `product-${index}`,
          quantity: 1,
          itemPrice: null,
          currency: null,
        })),
      },
    },
  ]);
  await conversation.load();
  document.body.append(node);
  try {
    const root = node.shadowRoot!;
    const scroller = root.querySelector<HTMLElement>(".pmfa-list")!;
    scroller.style.overflowY = "auto";
    scroller.scrollTop = 1000;
    const toggle = root.querySelector<HTMLButtonElement>(
      '[part~="order-toggle"]',
    )!;
    // Layout: three added items push the toggle 284px down, then back up.
    const tops = [400, 684, 684, 400];
    vi.spyOn(toggle, "getBoundingClientRect").mockImplementation(
      () => ({ top: tops.shift() ?? 400 }) as DOMRect,
    );
    const pageScroll = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    toggle.focus();
    toggle.click();
    expect(root.querySelectorAll('[part~="order-item"]')).toHaveLength(23);
    expect(scroller.scrollTop).toBe(1284);
    expect(root.activeElement).toBe(toggle);
    toggle.click();
    expect(scroller.scrollTop).toBe(1000);
    expect(root.activeElement).toBe(toggle);
    expect(pageScroll).not.toHaveBeenCalled();
  } finally {
    node.remove();
    conversation.dispose();
  }
});
