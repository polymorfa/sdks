"""Synchronous, server-only Platform API transport and project listing."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Generic, Literal, NoReturn, TypeVar
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .errors import (
    AuthenticationError,
    AuthorizationError,
    PolymorfaError,
    ProtocolError,
    TransportError,
)

T = TypeVar("T")
_API_KEY = re.compile(r"^pmfa_[A-Za-z0-9_-]{72}$")
_MAX_RESPONSE_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class ResponseMetadata:
    request_id: str | None
    api_version: str | None


@dataclass(frozen=True)
class Response(Generic[T]):
    data: T
    metadata: ResponseMetadata


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    slug: str
    stage: Literal["development", "production"]
    is_active: bool
    active_sessions: int
    total_sessions: int
    total_messages: int


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class Client:
    """A team API key client. This foundation exposes project listing only."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.polymorfa.com",
        api_version: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        if not _API_KEY.fullmatch(api_key):
            raise ValueError("A canonical team API key is required")
        address = urlsplit(base_url)
        if (
            address.scheme not in {"http", "https"}
            or not address.hostname
            or address.username
            or address.password
            or address.query
            or address.fragment
            or address.path not in {"", "/"}
            or (
                address.scheme == "http"
                and address.hostname not in {"localhost", "127.0.0.1", "::1"}
            )
        ):
            raise ValueError(
                "base_url must be an HTTPS origin or a loopback HTTP origin"
            )
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        if api_version is not None and not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}", api_version
        ):
            raise ValueError("api_version must be a YYYY-MM-DD date")
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._api_version = api_version
        self._timeout = timeout
        self._opener = build_opener(_NoRedirect())
        self.projects = ProjectsResource(self)

    def _get(self, path: str) -> tuple[object, ResponseMetadata]:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._api_key}",
            "User-Agent": "polymorfa-python-sdk/0.1",
        }
        if self._api_version is not None:
            headers["Polymorfa-Version"] = self._api_version
        request = Request(self._base_url + path, headers=headers, method="GET")
        try:
            response = self._opener.open(request, timeout=self._timeout)
        except HTTPError as error:
            self._raise_http(error)
        except (URLError, TimeoutError, OSError):
            raise TransportError("Polymorfa API connection failed") from None
        with response:
            metadata = ResponseMetadata(
                response.headers.get("X-Request-Id"),
                response.headers.get("Polymorfa-Version"),
            )
            if not response.headers.get_content_type() == "application/json":
                raise ProtocolError(
                    "Polymorfa API returned a non-JSON response",
                    status=response.status,
                    request_id=metadata.request_id,
                )
            try:
                body = response.read(_MAX_RESPONSE_BYTES + 1)
            except (OSError, TimeoutError):
                raise TransportError(
                    "Polymorfa API response was interrupted",
                    request_id=metadata.request_id,
                ) from None
            if len(body) > _MAX_RESPONSE_BYTES:
                raise ProtocolError(
                    "Polymorfa API response exceeded the size limit",
                    status=response.status,
                    request_id=metadata.request_id,
                )
            try:
                return json.loads(body), metadata
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise ProtocolError(
                    "Polymorfa API returned invalid JSON",
                    status=response.status,
                    request_id=metadata.request_id,
                ) from None

    def _raise_http(self, error: HTTPError) -> NoReturn:
        with error:
            request_id = error.headers.get("X-Request-Id")
            code = None
            if error.headers.get_content_type() == "application/json":
                try:
                    body = error.read(_MAX_RESPONSE_BYTES + 1)
                except (OSError, TimeoutError):
                    body = b""
                if len(body) <= _MAX_RESPONSE_BYTES:
                    try:
                        parsed = json.loads(body)
                        if isinstance(parsed, dict) and isinstance(
                            parsed.get("error"), dict
                        ):
                            raw_code = parsed["error"].get("code")
                            if isinstance(raw_code, str) and re.fullmatch(
                                r"[a-z0-9_]{1,80}", raw_code
                            ):
                                code = raw_code
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        pass
        error_type = {401: AuthenticationError, 403: AuthorizationError}.get(
            error.code, PolymorfaError
        )
        raise error_type(
            f"Polymorfa API request failed with HTTP {error.code}",
            status=error.code,
            code=code,
            request_id=request_id,
        ) from None


class ProjectsResource:
    def __init__(self, client: Client) -> None:
        self._client = client

    def list(self) -> Response[list[Project]]:
        """List projects for a team key with ``sessions:read`` scope."""
        payload, metadata = self._client._get("/platform/projects")
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ProtocolError(
                "Project list response has an unexpected shape",
                request_id=metadata.request_id,
            )
        projects: list[Project] = []
        for item in payload["data"]:
            if not isinstance(item, dict):
                raise ProtocolError(
                    "Project list response has an unexpected shape",
                    request_id=metadata.request_id,
                )
            fields = ("_id", "name", "slug", "stage")
            counts = ("activeSessions", "totalSessions", "totalMessages")
            if (
                any(not isinstance(item.get(field), str) for field in fields)
                or item["stage"] not in {"development", "production"}
                or type(item.get("isActive")) is not bool
                or any(
                    type(item.get(field)) is not int or item[field] < 0
                    for field in counts
                )
            ):
                raise ProtocolError(
                    "Project list response has an unexpected shape",
                    request_id=metadata.request_id,
                )
            projects.append(
                Project(
                    id=item["_id"],
                    name=item["name"],
                    slug=item["slug"],
                    stage=item["stage"],
                    is_active=item["isActive"],
                    active_sessions=item["activeSessions"],
                    total_sessions=item["totalSessions"],
                    total_messages=item["totalMessages"],
                )
            )
        return Response(projects, metadata)
