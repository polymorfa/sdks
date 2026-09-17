import type { Appearance, ElementAppearance } from "./appearance.js";

/**
 * Stable names for every structural node the chat and template components
 * render. React applies `appearance.elements[slot]` and `classNames[slot]` to
 * the node and sets `data-slot`; Web Components add the kebab-case name to the
 * node's `part` attribute.
 */
export const COMPONENT_SLOTS = [
  "messageList",
  "message",
  "bubble",
  "messageMeta",
  "messageActions",
  "replyButton",
  "retryButton",
  "attachment",
  "replyQuote",
  "dateSeparator",
  "loadMore",
  "empty",
  "composer",
  "composerInput",
  "composerSend",
  "composerAttach",
  "composerToolbar",
  "emojiButton",
  "emojiPicker",
  "voiceButton",
  "recordingBar",
  "quickReplyMenu",
  "attachmentChip",
  "replyBanner",
  "drawer",
  "drawerHeader",
  "drawerTitle",
  "drawerClose",
  "templateBuilder",
  "field",
  "label",
  "input",
  "actions",
  "primaryButton",
  "button",
  "preview",
  "error",
] as const;

export type ComponentSlot = (typeof COMPONENT_SLOTS)[number];

/** Per-slot class names a component adds on top of the appearance. */
export type SlotClassNames = Partial<Record<ComponentSlot, string>>;

const PART_NAME_OVERRIDES: Partial<Record<ComponentSlot, string>> = {
  // `preview` already names the template builder's Preview button.
  preview: "preview-panel",
};

/**
 * The CSS `part` name for a slot: `messageMeta` becomes `message-meta`. The
 * `preview` slot uses `preview-panel`, since `preview` names the button.
 */
export function slotPartName(slot: ComponentSlot): string {
  const override = PART_NAME_OVERRIDES[slot];
  if (override !== undefined) return override;
  return slot.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Normalise `ElementAppearance.styles` to CSS property names. Keys may be
 * camelCase (`backgroundColor`), kebab-case, or custom properties.
 */
export function slotStyleEntries(
  styles: ElementAppearance["styles"],
): readonly (readonly [string, string])[] {
  if (styles === undefined) return [];
  return Object.entries(styles).map(
    ([name, value]) =>
      [
        name.startsWith("--")
          ? name
          : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        value,
      ] as const,
  );
}

/** Class names for a slot: the base class, the appearance, then the prop. */
export function slotClassName(
  appearance: Appearance,
  slot: ComponentSlot,
  base: string,
  classNames?: SlotClassNames,
): string {
  return [base, appearance.elements[slot]?.className, classNames?.[slot]]
    .filter((value) => value !== undefined && value !== "")
    .join(" ");
}
