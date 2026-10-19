// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { ConversationController } from "@polymorfa/browser";
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "../src/index.js";

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
