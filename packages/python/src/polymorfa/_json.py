"""Reject non-JSON numeric constants accepted by Python's default decoder."""

import json
from typing import NoReturn


def _reject_constant(value: str) -> NoReturn:
    raise ValueError("Invalid JSON numeric constant.")


def loads(value: str | bytes) -> object:
    return json.loads(value, parse_constant=_reject_constant)
