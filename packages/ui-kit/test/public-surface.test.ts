// @vitest-environment happy-dom
import { expect, it } from "vitest";
import * as react from "../src/react/index.js";
import * as elements from "../src/web-components/index.js";

it("keeps workflow conveniences out of the public React surface", () => {
  for (const name of [
    "TemplateManager",
    "SessionStatus",
    "ConnectWhatsAppButton",
  ]) {
    expect(react).not.toHaveProperty(name);
  }
  expect(react.Inbox).toBeTypeOf("function");
  expect(react.TemplateBuilder).toBeTypeOf("function");
});

it("registers the supported drop-ins without the removed workflow elements", () => {
  elements.defineDropInElements();
  expect(customElements.get("pmfa-inbox")).toBe(elements.PolymorfaInboxElement);
  expect(customElements.get("pmfa-quicklink-button")).toBe(
    elements.PolymorfaQuickLinkButtonElement,
  );
  for (const tag of [
    "pmfa-connect-whatsapp",
    "pmfa-session-status",
    "pmfa-template-manager",
  ]) {
    expect(customElements.get(tag)).toBeUndefined();
  }
  expect(elements).not.toHaveProperty("PolymorfaConnectWhatsAppElement");
  expect(elements).not.toHaveProperty("PolymorfaSessionStatusElement");
});
