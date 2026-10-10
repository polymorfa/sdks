// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConversationController } from "@polymorfa/browser";
import { MessageList, PolymorfaProvider } from "../src/index.js";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(messages: unknown[]) {
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
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
      conversation.dispose();
    },
  };
}

it("plays voice notes lazily and only draws supplied waveform levels", async () => {
  const view = await mount([
    {
      id: "voice",
      text: "",
      createdAt: 1,
      direction: "inbound",
      status: "sent",
      attachments: [
        {
          id: "v",
          name: "voice.ogg",
          size: 1,
          contentType: "audio/ogg",
          url: "https://media.example/voice.ogg",
          voice: true,
          durationSeconds: 18,
          waveform: [0.2, 0.9, 0.4],
        },
      ],
    },
    {
      id: "retained",
      text: "",
      createdAt: 2,
      direction: "inbound",
      status: "sent",
      attachments: [
        {
          id: "r",
          name: "call.mp3",
          size: 0,
          contentType: "audio/mpeg",
          durationSeconds: 65,
        },
      ],
    },
  ]);
  const [voice, retained] = [
    ...view.host.querySelectorAll<HTMLElement>(".pmfa-att-audio"),
  ];
  expect(voice?.classList.contains("pmfa-att-voice")).toBe(true);
  expect(voice?.querySelector("audio")?.getAttribute("preload")).toBe("none");
  expect(voice?.querySelectorAll(".pmfa-wave > span").length).toBeGreaterThan(
    0,
  );
  expect(voice?.querySelector(".pmfa-att-time")?.textContent).toBe("0:18");
  expect(voice?.querySelector(".pmfa-play")?.getAttribute("aria-label")).toBe(
    "Play: Voice message",
  );
  expect(voice?.querySelector(".pmfa-rate")?.textContent).toBe("1×");
  // Retained metadata without a URL never looks playable or gains a waveform.
  expect(retained?.classList.contains("pmfa-att-voice")).toBe(false);
  expect(retained?.querySelector("audio")).toBeNull();
  expect(retained?.querySelector(".pmfa-wave")).toBeNull();
  expect(retained?.querySelector(".pmfa-line")).not.toBeNull();
  expect(
    retained?.querySelector<HTMLButtonElement>(".pmfa-play")?.disabled,
  ).toBe(true);
  expect(retained?.querySelector(".pmfa-rate")).toBeNull();
  expect(retained?.textContent).toContain("1:05");
  expect(retained?.textContent).toContain("Not available to play");
  view.unmount();
});

it("describes documents and reserves meta width with a hidden spacer", async () => {
  const view = await mount([
    {
      id: "doc",
      text: "Updated collection",
      createdAt: 1,
      direction: "outbound",
      status: "sent",
      attachments: [
        {
          id: "d",
          name: "Oak.pdf",
          size: 2_480_000,
          contentType: "application/pdf",
          pageCount: 12,
        },
      ],
    },
    {
      id: "clip",
      text: "",
      createdAt: 2,
      direction: "inbound",
      status: "sent",
      attachments: [
        {
          id: "c",
          name: "Walkthrough.mp4",
          size: 0,
          contentType: "video/mp4",
          durationSeconds: 74,
        },
      ],
    },
  ]);
  const file = view.host.querySelector(".pmfa-att-file");
  expect(file?.querySelector("[data-extension='PDF']")).not.toBeNull();
  expect(file?.querySelector(".pmfa-att-size")?.textContent).toMatch(
    /^PDF · 12 pages · 2\.4 MB$/,
  );
  const space = view.host.querySelector(".pmfa-text .pmfa-meta-space");
  expect(space?.getAttribute("aria-hidden")).toBe("true");
  expect(space?.querySelector(".pmfa-meta-space-icon")).not.toBeNull();
  const clip = view.host.querySelector(".pmfa-att-placeholder");
  expect(clip?.textContent).toContain("Walkthrough.mp4");
  expect(clip?.querySelector(".pmfa-att-duration")?.textContent).toBe("1:14");
  expect(clip?.querySelector("video")).toBeNull();
  view.unmount();
});
