from collections.abc import Mapping

from .errors import ValidationError


def validate_webhook_batching(body: Mapping[str, object]) -> None:
    if "batching" not in body:
        return
    b = body["batching"]
    if (
        not isinstance(b, dict)
        or type(b.get("enabled")) is not bool
        or set(b) - {"enabled", "maxEvents", "windowMs"}
    ):
        raise ValidationError("Invalid webhook batching settings.")
    for key, lower, upper in (("maxEvents", 2, 100), ("windowMs", 100, 1000)):
        if key in b and (type(b[key]) is not int or not lower <= b[key] <= upper):
            raise ValidationError("Invalid webhook batching bounds.")
    if b["enabled"] and body.get("format") == "meta":
        raise ValidationError("Webhook batching supports native format only.")
