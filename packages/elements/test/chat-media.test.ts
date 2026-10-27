// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { ConversationController } from "@polymorfa/browser";
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "../src/index.js";

it("renders the same voice, document and retained-media layouts as React", async () => {
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({
      messages: [
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
        {
          id: "doc",
          text: "Updated collection",
          createdAt: 3,
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
  const [voice, retained] = [
    ...root.querySelectorAll<HTMLElement>(".pmfa-att-audio"),
  ];
  expect(voice?.querySelector("audio")?.preload).toBe("none");
  expect(voice?.querySelectorAll(".pmfa-wave > span").length).toBeGreaterThan(
    0,
  );
  expect(voice?.querySelector(".pmfa-att-time")?.textContent).toBe("0:18");
  expect(voice?.querySelector(".pmfa-play")?.getAttribute("aria-label")).toBe(
    "Play: Voice message",
  );
  const rate = voice?.querySelector<HTMLButtonElement>(".pmfa-rate");
  rate?.click();
  expect(rate?.textContent).toBe("1.5×");
  expect(retained?.querySelector("audio")).toBeNull();
  expect(retained?.querySelector(".pmfa-wave")).toBeNull();
  expect(
    retained?.querySelector<HTMLButtonElement>(".pmfa-play")?.disabled,
  ).toBe(true);
  expect(retained?.textContent).toContain("Not available to play");
  expect(
    root.querySelector(".pmfa-att-file .pmfa-att-size")?.textContent,
  ).toMatch(/^PDF · 12 pages · 2\.4 MB$/);
  const space = root.querySelector(".pmfa-text .pmfa-meta-space");
  expect(space?.getAttribute("aria-hidden")).toBe("true");
  node.remove();
  conversation.dispose();
});
