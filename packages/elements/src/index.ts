export {
  PolymorfaElement,
  type ElementConfiguration,
  type ElementController,
} from "./base.js";
export {
  PolymorfaChatDrawerElement,
  PolymorfaComposeBoxElement,
  PolymorfaMessageListElement,
  defineChatElements,
} from "./chat.js";
export {
  PolymorfaTemplateBuilderElement,
  defineTemplateElements,
} from "./templates.js";
export { PolymorfaCallElement, defineCallElements } from "./calls.js";
import { defineCallElements } from "./calls.js";
import { defineChatElements } from "./chat.js";
import { defineTemplateElements } from "./templates.js";
export function definePolymorfaElements(
  registry: CustomElementRegistry = customElements,
): void {
  defineChatElements(registry);
  defineTemplateElements(registry);
  defineCallElements(registry);
}
