import { describe, expect, it, vi } from "vitest";
import {
  MessageFilterController,
  conversationMessageKind,
  messageMatchesFilters,
  type ConversationMessage,
} from "../../src/browser/index.js";

const text: ConversationMessage = {
  id: "one",
  text: "Olá, Ana",
  createdAt: 1,
  direction: "inbound",
  status: "sent",
};

describe("loaded message filters", () => {
  it("combines query, media kind and direction without mutating message content", () => {
    const filter = new MessageFilterController();
    const changed = vi.fn();
    const unsubscribe = filter.subscribe(changed);
    filter.setQuery("ANA");
    expect(filter.matches(text, "pt-BR")).toBe(true);
    filter.setDirection("outbound");
    expect(filter.matches(text)).toBe(false);
    filter.setDirection("inbound");
    filter.setType("image");
    expect(filter.matches(text)).toBe(false);
    const image = {
      ...text,
      text: "",
      messageType: "image" as const,
      attachments: [
        { id: "a", name: "Ana.png", contentType: "image/png", size: 10 },
      ],
    };
    expect(filter.matches(image)).toBe(true);
    filter.clear();
    expect(filter.matches(text)).toBe(true);
    expect(changed).toHaveBeenCalledTimes(5);
    expect(text.text).toBe("Olá, Ana");
    unsubscribe();
    filter.dispose();
  });
  it("finds orders and attachment names while excluding unavailable content from search", () => {
    const cart = {
      ...text,
      text: "",
      order: {
        catalogId: "catalog",
        items: [
          {
            productRetailerId: "blue-shirt",
            quantity: 2,
            itemPrice: 1.235,
            currency: "USD",
          },
        ],
        text: "Gift",
      },
    };
    expect(conversationMessageKind(cart)).toBe("order");
    expect(
      messageMatchesFilters(cart, {
        query: "SHIRT",
        type: "order",
        direction: "all",
      }),
    ).toBe(true);
    expect(
      messageMatchesFilters(
        { ...cart, contentState: "not_retained" },
        { query: "shirt", type: "all", direction: "all" },
      ),
    ).toBe(false);
    expect(
      messageMatchesFilters(
        { ...text, text: "" },
        { query: "", type: "text", direction: "all" },
      ),
    ).toBe(true);
  });
});
