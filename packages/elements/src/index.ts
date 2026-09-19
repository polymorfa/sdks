export {
  PolymorfaElement,
  type ElementConfiguration,
  type ElementController,
  type ElementStylesheet,
} from "./base.js";
export {
  PolymorfaChatDrawerElement,
  PolymorfaComposeBoxElement,
  PolymorfaMessageListElement,
  defineChatElements,
  type ReplyHandler,
} from "./chat.js";
export type { QuickReplyOption } from "@polymorfa/ui";
export {
  PolymorfaTemplateBuilderElement,
  defineTemplateElements,
} from "./templates.js";
export { PolymorfaCallElement, defineCallElements } from "./calls.js";
export {
  PolymorfaConnectWhatsAppElement,
  PolymorfaInboxElement,
  PolymorfaSessionStatusElement,
  defineDropInElements,
  definePolymorfa,
  type DefinePolymorfaOptions,
} from "./dropin.js";
import { defineDropInElements } from "./dropin.js";
import { defineCallElements } from "./calls.js";
import { defineChatElements } from "./chat.js";
import { defineTemplateElements } from "./templates.js";
export function definePolymorfaElements(
  registry: CustomElementRegistry = customElements,
): void {
  defineChatElements(registry);
  defineTemplateElements(registry);
  defineCallElements(registry);
  defineDropInElements(registry);
}
