"""Semantic failures without credentials or upstream HTML in error messages."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .transport import ResponseMetadata


class PolymorfaError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status: int | None = None,
        request_id: str | None = None,
        request_log_url: str | None = None,
        doc_url: str | None = None,
        rate_limit_reason: str | None = None,
        details: object = None,
        metadata: ResponseMetadata | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.request_id = request_id
        self.request_log_url = request_log_url
        self.doc_url = doc_url
        self.rate_limit_reason = rate_limit_reason
        self.details = details
        self.metadata = metadata


class ConfigurationError(PolymorfaError):
    def __init__(self, field: str) -> None:
        super().__init__(f"Invalid configuration field: {field}.", code="configuration_error")
        self.field = field


class ValidationError(PolymorfaError):
    pass


class AuthenticationError(PolymorfaError):
    pass


class AuthorizationError(PolymorfaError):
    pass


class PaymentRequiredError(PolymorfaError):
    pass


class NotFoundError(PolymorfaError):
    pass


class ConflictError(PolymorfaError):
    pass


class RateLimitError(PolymorfaError):
    pass


class ServerError(PolymorfaError):
    pass


class ConnectionError(PolymorfaError):
    pass


class TimeoutError(PolymorfaError):
    pass


class CancelledError(PolymorfaError):
    pass


class MediaIntegrityError(PolymorfaError):
    pass


class WebhookSignatureError(PolymorfaError):
    pass
