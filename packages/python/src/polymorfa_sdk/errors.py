"""Errors expose safe status and request identifiers, never credentials or raw bodies."""


class PolymorfaError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id


class AuthenticationError(PolymorfaError):
    """The API refused the server credential."""


class AuthorizationError(PolymorfaError):
    """The credential lacks permission for the operation."""


class TransportError(PolymorfaError):
    """No trustworthy API response was received; no retry was attempted."""


class ProtocolError(PolymorfaError):
    """The API response did not match this method's documented shape."""
