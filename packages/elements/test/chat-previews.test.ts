// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { ConversationController } from "@polymorfa/browser";
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "../src/index.js";

const JPEG = "/9j/4AAQSkZJRgABAQ==";

it("renders thumbnails, HD upgrades and link previews like React", async () => {
  const probes: { onload?: () => void }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        probes.push(this);
      }
    },
  );
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({
      messages: [
        {
          id: "p",
          text: "",
          createdAt: 1,
          direction: "inbound",
          status: "sent",
          attachments: [
            {
              id: "a",
              name: "photo.jpg",
              size: 1,
              contentType: "image/jpeg",
              url: "https://cdn.example/sd.jpg",
              width: 1280,
              height: 960,
              thumbnail: { contentType: "image/jpeg", data: JPEG },
              hd: { url: "https://cdn.example/hd.jpg" },
            },
          ],
        },
        {
          id: "l",
          text: "https://example.com",
          createdAt: 2,
          direction: "inbound",
          status: "sent",
          linkPreview: { url: "https://example.com", title: "Example" },
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
  await Promise.resolve();
  const root = node.shadowRoot!;
  expect(root.querySelector(".pmfa-att-thumb")?.getAttribute("src")).toBe(
    `data:image/jpeg;base64,${JPEG}`,
  );
  const full = () =>
    root.querySelector<HTMLImageElement>(
      ".pmfa-att-media img:not(.pmfa-att-thumb)",
    )!;
  full().dispatchEvent(new Event("load"));
  expect(root.querySelector(".pmfa-att-thumb")).toBeNull();
  const hd = root.querySelector<HTMLButtonElement>("button.pmfa-hd")!;
  expect(probes).toHaveLength(0);
  hd.click();
  expect(hd.getAttribute("aria-label")).toBe("Loading HD version");
  probes[0]?.onload?.();
  expect(full().getAttribute("src")).toBe("https://cdn.example/hd.jpg");
  hd.click();
  expect(full().getAttribute("src")).toBe("https://cdn.example/sd.jpg");
  const card = root.querySelector<HTMLAnchorElement>(".pmfa-link-preview");
  expect(card?.getAttribute("href")).toBe("https://example.com/");
  expect(card?.textContent).toContain("Example");
  node.remove();
  conversation.dispose();
  vi.unstubAllGlobals();
});
