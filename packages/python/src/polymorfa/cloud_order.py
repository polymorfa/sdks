"""Incoming cart values validated by the API. No totals or payment state."""

from typing_extensions import NotRequired, TypedDict


class CloudOrderItem(TypedDict):
    productRetailerId: str
    quantity: int
    itemPrice: float
    currency: str


class CloudOrder(TypedDict):
    catalogId: str
    text: NotRequired[str]
    items: list[CloudOrderItem]
