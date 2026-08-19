import {
  definePolymorfaElements,
  type PolymorfaQuickLinkElement,
} from "@polymorfa/elements";
import { QuickLinkController } from "@polymorfa/browser";

definePolymorfaElements();

const controller = new QuickLinkController({
  create: async () => ({
    id: "quicklink_1",
    qrCode: "data:image/png;base64,...",
    expiresAt: Date.now() + 60_000,
  }),
  recover: async () => ({
    id: "quicklink_1",
    qrCode: "data:image/png;base64,...",
    expiresAt: Date.now() + 60_000,
  }),
  cancel: async () => undefined,
  subscribe: () => () => undefined,
});

const element = document.querySelector<PolymorfaQuickLinkElement>(
  "polymorfa-quicklink",
);
if (element) element.controller = controller;
