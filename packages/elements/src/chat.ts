import type {
  ConversationController,
  ConversationSnapshot,
  MessageComposerController,
  MessageComposerSnapshot,
} from "@polymorfa/browser";
import { PolymorfaElement, button, element, textElement } from "./base.js";

export class PolymorfaMessageListElement extends PolymorfaElement<ConversationSnapshot> {
  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    const list = element("ol", "message-list");
    list.setAttribute("aria-live", "polite");
    for (const message of snapshot?.messages ?? []) {
      const item = textElement(
        "li",
        message.text,
        `message ${message.direction}`,
      );
      item.dataset.messageId = message.id;
      list.append(item);
    }
    if ((snapshot?.messages.length ?? 0) === 0)
      list.append(textElement("li", "No messages yet", "empty muted"));
    if (snapshot?.hasMore)
      list.prepend(
        button(
          "Load earlier messages",
          "load-more",
          () =>
            void this.configuredController<ConversationController>()?.loadMore(),
        ),
      );
    return [list];
  }
}

export class PolymorfaComposeBoxElement extends PolymorfaElement<MessageComposerSnapshot> {
  protected renderContent(
    snapshot: MessageComposerSnapshot | undefined,
  ): readonly Node[] {
    const form = element("form", "composer") as HTMLFormElement;
    const input = document.createElement("textarea");
    input.part.add("input");
    input.placeholder = "Write a message";
    input.value = snapshot?.text ?? "";
    input.setAttribute("aria-label", "Message");
    input.addEventListener("input", () =>
      this.configuredController<MessageComposerController>()?.setText(
        input.value,
      ),
    );
    form.append(
      input,
      button(
        snapshot?.sending ? "Sending…" : "Send",
        "primary send",
        () =>
          void this.configuredController<MessageComposerController>()?.submit(),
      ),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.configuredController<MessageComposerController>()?.submit();
    });
    return [form];
  }
}

export class PolymorfaChatDrawerElement extends PolymorfaElement<ConversationSnapshot> {
  #open = true;
  #opener: HTMLElement | undefined;
  set open(value: boolean) {
    this.#open = value;
    this.render();
    if (!value) this.#opener?.focus();
  }
  get open(): boolean {
    return this.#open;
  }
  set opener(value: HTMLElement | undefined) {
    this.#opener = value;
  }
  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    if (!this.#open) return [];
    const panel = element("aside", "panel drawer");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Messages");
    panel.append(
      textElement("h2", "Messages", "title"),
      button("Close", "close", () => {
        this.open = false;
        this.dispatchEvent(
          new CustomEvent("pmfa-close", { bubbles: true, composed: true }),
        );
      }),
    );
    const list = new PolymorfaMessageListElement();
    list.controller = this.configuredController<ConversationController>();
    panel.append(list, document.createElement("slot"));
    if (snapshot?.status === "error")
      panel.append(
        textElement("p", snapshot.error ?? "Unable to load messages", "error"),
      );
    return [panel];
  }
}

export function defineChatElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-message-list") === undefined)
    registry.define("pmfa-message-list", PolymorfaMessageListElement);
  if (registry.get("pmfa-compose-box") === undefined)
    registry.define("pmfa-compose-box", PolymorfaComposeBoxElement);
  if (registry.get("pmfa-chat-drawer") === undefined)
    registry.define("pmfa-chat-drawer", PolymorfaChatDrawerElement);
}
