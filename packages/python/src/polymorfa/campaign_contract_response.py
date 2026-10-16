"""Validate declared response structure without applying outbound normalization."""

from __future__ import annotations

import math
import types
from collections.abc import Awaitable, Callable
from functools import cache, wraps
from typing import Literal, TypeVar, Union, cast, get_args, get_origin, get_type_hints

from typing_extensions import NotRequired, ParamSpec, Required, is_typeddict

from .errors import ServerError
from .transport import ApiResponse

P = ParamSpec("P")
T = TypeVar("T")


@cache
def hints(model: object) -> dict[str, object]:
    return get_type_hints(model, include_extras=True)


def matches(value: object, model: object, variables: dict[object, object] | None = None) -> bool:
    variables = variables or {}
    model = variables.get(model, model)
    origin = get_origin(model)
    args = get_args(model)
    if origin in (NotRequired, Required):
        return matches(value, args[0], variables)
    if origin in (Union, types.UnionType):
        return any(matches(value, part, variables) for part in args)
    if origin is Literal:
        return any(type(value) is type(part) and value == part for part in args)
    if model is type(None):
        return value is None
    if model is object:
        return True
    if origin is list:
        return isinstance(value, list) and all(matches(item, args[0], variables) for item in value)
    if origin is dict:
        return isinstance(value, dict) and all(
            matches(k, args[0], variables) and matches(v, args[1], variables)
            for k, v in value.items()
        )
    target = origin or model
    if is_typeddict(target):
        if not isinstance(value, dict):
            return False
        if getattr(target, "__name__", "") == "Envelope" and value.get("success") is not True:
            return False
        bindings = {**variables, **dict(zip(getattr(target, "__parameters__", ()), args))}
        for key, expected in hints(target).items():
            optional = get_origin(expected) is NotRequired
            # Every new response model is total; optional fields carry NotRequired.
            if key not in value:
                if not optional:
                    return False
            elif not matches(value[key], expected, bindings):
                return False
        return True
    if model is int:
        return type(value) is int and -(2**53 - 1) <= value <= 2**53 - 1
    if model is float:
        try:
            return type(value) in (int, float) and math.isfinite(cast(float, value))
        except (OverflowError, ValueError):
            return False
    if model in (str, bool):
        return type(value) is model
    return False


def checked(
    function: Callable[P, Awaitable[ApiResponse[T]]],
) -> Callable[P, Awaitable[ApiResponse[T]]]:
    @wraps(function)
    async def run(*args: P.args, **kwargs: P.kwargs) -> ApiResponse[T]:
        result = await function(*args, **kwargs)
        model = get_args(get_type_hints(function)["return"])[0]
        if not matches(result.data, model):
            raise ServerError(
                "Invalid API response structure.",
                code="invalid_response",
                status=result.metadata.status,
                metadata=result.metadata,
            )
        return result

    return run
