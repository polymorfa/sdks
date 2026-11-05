"""Structural validation for the separately pinned interactive-message supplement."""
from collections.abc import Mapping
from .errors import ValidationError


def validate_interactive(content: object) -> None:
    if not isinstance(content, Mapping):
        return

    def source(value: object) -> Mapping[str, object]:
        if not isinstance(value, Mapping) or (("url" in value) == ("base64" in value)):
            raise ValidationError("Interactive media requires exactly one URL or base64 source.")
        return value

    buttons = content.get("buttons")
    if isinstance(buttons, Mapping) and "media" in buttons:
        media = source(buttons["media"])
        kind = media.get("type")
        if "title" in buttons or kind not in ("image", "video", "document"):
            raise ValidationError("Invalid button media header.")
        if ("filename" in media and kind != "document") or ("thumbnail" in media and kind != "video"):
            raise ValidationError("Invalid button media fields.")
    carousel = content.get("carousel")
    if isinstance(carousel, Mapping):
        cards = carousel.get("cards")
        if not isinstance(cards, list) or not 2 <= len(cards) <= 10:
            raise ValidationError("A carousel requires 2–10 cards.")
        for card in cards:
            if not isinstance(card, Mapping) or "footer" in card or (("image" in card) == ("video" in card)):
                raise ValidationError("A card requires one image or video and has no footer.")
            source(card["image"] if "image" in card else card["video"])
