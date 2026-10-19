import type { ConversationMessage } from "@polymorfa/browser";

const t0 = Date.parse("2026-10-19T09:00:00Z");
const at = (minutes: number) => t0 + minutes * 60_000;
const manyItems = Array.from({ length: 23 }, (_, i) => ({
  productRetailerId: `SKU-${String(i + 1).padStart(3, "0")}`,
  quantity: (i % 3) + 1,
  itemPrice: i % 4 === 0 ? null : 12.5 + i,
  currency: i % 4 === 0 ? null : "BRL",
}));
export const messages: ConversationMessage[] = [
  { id: "m1", text: "Hi, I'd like to order", createdAt: at(0), direction: "inbound", status: "sent" },
  { id: "m2", text: "", createdAt: at(1), direction: "inbound", status: "sent", messageType: "order",
    order: { catalogId: "CAT-1", text: "Two shirts please", items: [
      { productRetailerId: "SHIRT-BLUE-M", quantity: 2, itemPrice: 79.9, currency: "BRL" },
      { productRetailerId: "SOCKS-3PK", quantity: 1, itemPrice: null, currency: null },
    ] } },
  { id: "m3", text: "", createdAt: at(2), direction: "inbound", status: "sent", messageType: "order", order: { catalogId: "CAT-1", items: manyItems } },
  { id: "m4", text: "", createdAt: at(3), direction: "inbound", status: "sent", messageType: "order", order: "unreadable" },
  { id: "m5", text: "", createdAt: at(4), direction: "outbound", status: "sent", contentState: "not_retained" },
  { id: "m6", text: "", createdAt: at(5), direction: "inbound", status: "sent", contentState: "deleted" },
  { id: "m7", text: "", createdAt: at(6), direction: "inbound", status: "sent", contentState: "unavailable" },
  { id: "m8", text: "", createdAt: at(7), direction: "inbound", status: "sent" },
  { id: "m9", text: "Your order ships today", createdAt: at(8), direction: "outbound", status: "sent", receipt: { state: "read" } },
];

