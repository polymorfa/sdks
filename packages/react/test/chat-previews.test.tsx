// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConversationController,
  MessageComposerController,
} from "@polymorfa/browser";
import { ComposeBox, MessageList, PolymorfaProvider } from "../src/index.js";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const JPEG = "/9j/4AAQSkZJRgABAQ==";
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function list(messages: unknown[]) {
  const conversation = new ConversationController({
    load: async () => ({ messages: messages as never }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(() =>
    root.render(
      <PolymorfaProvider>
        <MessageList controller={conversation} />
      </PolymorfaProvider>,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
    conversation.dispose();
  };
  return host;
}

it("shows the embedded thumbnail until a picture loads, then upgrades to HD on request", async () => {
  const probes: { onload?: () => void; src?: string }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        probes.push(this);
        (this as { url?: string }).url = value;
      }
    },
  );
  const host = await list([
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
          hd: { url: "https://cdn.example/hd.jpg", width: 4000, height: 3000 },
        },
      ],
    },
  ]);
  const frame = host.querySelector<HTMLElement>(".pmfa-att-frame")!;
  expect(frame.style.getPropertyValue("--pmfa-ratio")).toBe(String(1280 / 960));
  expect(
    host
      .querySelector<HTMLImageElement>(".pmfa-att-thumb")
      ?.getAttribute("src"),
  ).toBe(`data:image/jpeg;base64,${JPEG}`);
  const full = host.querySelector<HTMLImageElement>(
    ".pmfa-att-media img:not(.pmfa-att-thumb)",
  )!;
  expect(full.getAttribute("src")).toBe("https://cdn.example/sd.jpg");
  act(() => {
    full.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector(".pmfa-att-thumb")).toBeNull();
  const hd = host.querySelector<HTMLButtonElement>("button.pmfa-hd")!;
  expect(hd.getAttribute("aria-label")).toBe("Load HD version");
  // Nothing loads until asked.
  expect(probes).toHaveLength(0);
  act(() => hd.click());
  expect(hd.getAttribute("aria-label")).toBe("Loading HD version");
  act(() => probes[0]?.onload?.());
  expect(
    host
      .querySelector(".pmfa-att-media img:not(.pmfa-att-thumb)")
      ?.getAttribute("src"),
  ).toBe("https://cdn.example/hd.jpg");
  expect(hd.getAttribute("aria-pressed")).toBe("true");
  // The badge switches back to standard, and to HD again without reloading.
  act(() => hd.click());
  expect(
    host
      .querySelector(".pmfa-att-media img:not(.pmfa-att-thumb)")
      ?.getAttribute("src"),
  ).toBe("https://cdn.example/sd.jpg");
  act(() => hd.click());
  expect(probes).toHaveLength(1);
  vi.unstubAllGlobals();
});

it("renders a safe link preview card and rejects non-JPEG thumbnail data", async () => {
  const host = await list([
    {
      id: "l",
      text: "https://www.example.com/page",
      createdAt: 1,
      direction: "inbound",
      status: "sent",
      linkPreview: {
        url: "https://www.example.com/page",
        title: "Example page",
        description: "A description",
        thumbnail: { contentType: "image/jpeg", data: "PHN2Zz4=" },
      },
    },
    {
      id: "x",
      text: "bad",
      createdAt: 2,
      direction: "inbound",
      status: "sent",
      linkPreview: { url: "javascript:alert(1)", title: "Nope" },
    },
  ]);
  const cards = host.querySelectorAll<HTMLAnchorElement>(".pmfa-link-preview");
  expect(cards).toHaveLength(1);
  expect(cards[0]?.getAttribute("href")).toBe("https://www.example.com/page");
  expect(cards[0]?.getAttribute("aria-label")).toBe("Open link: example.com");
  expect(cards[0]?.textContent).toContain("Example page");
  // Base64 that is not JPEG data never becomes an image.
  expect(cards[0]?.querySelector("img")).toBeNull();
});

it("lets the sender choose HD for an attached picture and sends it with the draft", async () => {
  const send = vi.fn(async () => undefined);
  const composer = new MessageComposerController({
    upload: async (attachment) => ({
      id: "up",
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType,
    }),
    send,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(() =>
    root.render(
      <PolymorfaProvider>
        <ComposeBox controller={composer} voiceNotes={false} />
      </PolymorfaProvider>,
    ),
  );
  await act(() =>
    composer.addAttachment({
      id: "a",
      name: "photo.png",
      size: 10,
      contentType: "image/png",
    }),
  );
  const toggle = host.querySelector<HTMLButtonElement>("button.pmfa-quality")!;
  expect(toggle.textContent).toBe("HD");
  expect(toggle.getAttribute("aria-label")).toBe("Send in HD");
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  act(() => toggle.click());
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  await act(() => composer.submit());
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      attachments: [expect.objectContaining({ quality: "hd" })],
    }),
    expect.anything(),
  );
  act(() => root.unmount());
  host.remove();
  composer.dispose();
});
