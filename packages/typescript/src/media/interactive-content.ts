import { PolymorfaConfigurationError } from "../errors.js";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new PolymorfaConfigurationError(message, "content");
}

function source(value: unknown): void {
  if (!object(value))
    invalid("Interactive media requires a URL or base64 source.");
  const url = value.url !== undefined;
  const base64 = value.base64 !== undefined;
  if (
    url === base64 ||
    (url && typeof value.url !== "string") ||
    (base64 && typeof value.base64 !== "string")
  )
    invalid("Interactive media requires exactly one URL or base64 source.");
}

/** @internal Preserve the same interactive unions for JavaScript callers. */
export function validateInteractiveContent(content: unknown): void {
  if (!object(content)) return;
  if (content.buttons !== undefined) {
    const buttons = content.buttons;
    if (!object(buttons)) invalid("Button content must be an object.");
    if (buttons.media !== undefined) {
      const media = buttons.media;
      if (!object(media)) invalid("A button media header must be an object.");
      if (buttons.title !== undefined)
        invalid("A button media header cannot have a title.");
      if (
        media.type !== "image" &&
        media.type !== "video" &&
        media.type !== "document"
      )
        invalid("Invalid button media kind.");
      if (
        (media.filename !== undefined && media.type !== "document") ||
        (media.thumbnail !== undefined && media.type !== "video")
      )
        invalid("Invalid button media fields.");
      source(media);
    }
  }
  if (content.carousel !== undefined) {
    const carousel = content.carousel;
    if (
      !object(carousel) ||
      !Array.isArray(carousel.cards) ||
      carousel.cards.length < 2 ||
      carousel.cards.length > 10
    ) {
      invalid("A carousel requires 2–10 cards.");
    }
    for (const card of carousel.cards) {
      if (
        !object(card) ||
        (card.image !== undefined) === (card.video !== undefined)
      ) {
        invalid("A carousel card requires exactly one image or video.");
      }
      if (card.thumbnail !== undefined)
        invalid("A carousel thumbnail belongs inside video media.");
      source(card.image ?? card.video);
    }
  }
}
