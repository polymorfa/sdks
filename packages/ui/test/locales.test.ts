import { expect, it } from "vitest";
import {
  createLocale,
  ENGLISH_MESSAGES,
  PT_BR_MESSAGES,
} from "../src/index.js";

it("owns the Console Portuguese chat/inbox strings while preserving caller overrides and fallback", () => {
  const locale = createLocale("pt-BR");
  expect(locale.messages["inbox.search"]).toBe("Buscar conversas");
  expect(locale.messages["chat.searchMessages"]).toBe(
    "Buscar nas mensagens carregadas",
  );
  expect(locale.messages["order.quantity"]).toBe("Quantidade");
  for (const key of Object.keys(PT_BR_MESSAGES))
    expect(key in ENGLISH_MESSAGES).toBe(true);
  expect(
    createLocale("pt-BR", { "order.title": "Meu pedido" }).messages[
      "order.title"
    ],
  ).toBe("Meu pedido");
  expect(createLocale("fr").messages["order.title"]).toBe("Order");
});
