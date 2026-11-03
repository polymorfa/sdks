import { expect, it } from "vitest";
import {
  inboxActionsFor,
  formatOrderUnitPrice,
} from "../../src/appearance/index.js";

it("offers state-appropriate pin, archive and read actions", () => {
  expect(
    inboxActionsFor({ archived: false, pinned: false, unreadCount: 0 }),
  ).toEqual(["pin", "archive", "mark-unread"]);
  expect(
    inboxActionsFor({ archived: true, pinned: false, markedUnread: true }),
  ).toEqual(["unarchive", "mark-read"]);
  expect(
    inboxActionsFor({ archived: false, pinned: true, unreadCount: 2 }),
  ).toEqual(["unpin", "archive", "mark-read"]);
});
it("keeps reported unit-price precision and does not invent missing prices", () => {
  expect(
    formatOrderUnitPrice({ itemPrice: 1.235, currency: "USD" }, "en-US"),
  ).toBe("$1.235");
  expect(
    formatOrderUnitPrice({ itemPrice: null, currency: "USD" }, "en-US"),
  ).toBeUndefined();
});

it("preserves reported price precision, including small exponent values, and explicit missing prices", () => {
  expect(
    formatOrderUnitPrice({ itemPrice: 1.235, currency: "USD" }, "en-US"),
  ).toBe("$1.235");
  expect(
    formatOrderUnitPrice({ itemPrice: 1e-7, currency: "USD" }, "en-US"),
  ).toBe("$0.0000001");
  expect(
    formatOrderUnitPrice({ itemPrice: null, currency: "USD" }, "en-US"),
  ).toBeUndefined();
  expect(
    formatOrderUnitPrice({ itemPrice: Infinity, currency: "USD" }, "en-US"),
  ).toBeUndefined();
});
