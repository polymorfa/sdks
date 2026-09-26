import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from polymorfa_sdk import (
    AuthenticationError,
    Client,
    PolymorfaError,
    Project,
    ProtocolError,
)

KEY = "pmfa_" + "A" * 72
ROOT = Path(__file__).resolve().parents[3]


class Server:
    def __init__(self, status=200, content_type="application/json", body=b"{}"):
        self.requests = []
        state = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                state.requests.append((self.path, dict(self.headers)))
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("X-Request-Id", "req_test")
                self.send_header("Polymorfa-Version", "2026-03-20")
                if status == 302:
                    self.send_header("Location", "/redirect-target")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_port}"


class ClientTests(unittest.TestCase):
    def test_project_list_contract_and_authentication(self):
        body = json.dumps(
            {
                "data": [
                    {
                        "_id": "project_1",
                        "name": "Support",
                        "slug": "support",
                        "stage": "development",
                        "isActive": True,
                        "activeSessions": 2,
                        "totalSessions": 3,
                        "totalMessages": 40,
                    }
                ]
            }
        ).encode()
        with Server(body=body) as server:
            response = Client(
                api_key=KEY, base_url=server.url, api_version="2026-03-20"
            ).projects.list()
            self.assertEqual(
                response.data,
                [
                    Project(
                        "project_1", "Support", "support", "development", True, 2, 3, 40
                    )
                ],
            )
            self.assertEqual(response.metadata.request_id, "req_test")
            self.assertEqual(response.metadata.api_version, "2026-03-20")
            self.assertEqual(len(server.requests), 1)
            path, headers = server.requests[0]
            self.assertEqual(path, "/platform/projects")
            self.assertEqual(headers["Authorization"], f"Bearer {KEY}")
            self.assertEqual(headers["Polymorfa-Version"], "2026-03-20")

    def test_rejects_non_team_credentials_and_remote_plaintext(self):
        for key in (
            "",
            "pmfa_pt_" + "A" * 94,
            "pmfa_ct_" + "A" * 40,
            "pmfa_" + "A" * 71,
        ):
            with self.subTest(key=key[:8]), self.assertRaises(ValueError):
                Client(api_key=key)
        with self.assertRaises(ValueError):
            Client(api_key=KEY, base_url="http://api.polymorfa.com")
        with self.assertRaises(ValueError):
            Client(api_key=KEY, base_url="https://user:secret@api.polymorfa.com")

    def test_401_and_html_errors_do_not_expose_secret_or_body(self):
        with Server(
            status=401, body=b'{"error":{"code":"unauthorized","message":"private"}}'
        ) as server:
            with self.assertRaises(AuthenticationError) as caught:
                Client(api_key=KEY, base_url=server.url).projects.list()
            self.assertEqual(caught.exception.status, 401)
            self.assertEqual(caught.exception.code, "unauthorized")
            self.assertEqual(caught.exception.request_id, "req_test")
            self.assertNotIn(KEY, str(caught.exception))
            self.assertNotIn("private", str(caught.exception))
        with Server(
            status=502, content_type="text/html", body=b"<b>proxy secret</b>"
        ) as server:
            with self.assertRaises(PolymorfaError) as caught:
                Client(api_key=KEY, base_url=server.url).projects.list()
            self.assertEqual(caught.exception.status, 502)
            self.assertNotIn("proxy secret", str(caught.exception))

    def test_redirect_does_not_forward_credential(self):
        with Server(status=302) as server:
            with self.assertRaises(PolymorfaError) as caught:
                Client(api_key=KEY, base_url=server.url).projects.list()
            self.assertEqual(caught.exception.status, 302)
            self.assertEqual(len(server.requests), 1)

    def test_server_failure_is_not_retried(self):
        with Server(
            status=503, body=b'{"error":{"code":"service_unavailable"}}'
        ) as server:
            with self.assertRaises(PolymorfaError) as caught:
                Client(api_key=KEY, base_url=server.url).projects.list()
            self.assertEqual(caught.exception.status, 503)
            self.assertEqual(caught.exception.code, "service_unavailable")
            self.assertEqual(len(server.requests), 1)

    def test_invalid_success_response_fails_closed(self):
        for content_type, body in (
            ("text/html", b"<html>"),
            ("application/json", b"not json"),
            ("application/json", b'{"data":{}}'),
        ):
            with (
                self.subTest(content_type=content_type, body=body),
                Server(content_type=content_type, body=body) as server,
                self.assertRaises(ProtocolError),
            ):
                Client(api_key=KEY, base_url=server.url).projects.list()

    def test_project_route_is_present_in_pinned_platform_contract(self):
        spec = json.loads((ROOT / "contracts/openapi.platform.json").read_text())
        operation = spec["paths"]["/platform/projects"]["get"]
        self.assertEqual(operation["operationId"], "listProjects")
        self.assertEqual(operation["x-polymorfa-resource-boundary"], "organization")
        self.assertEqual(operation["x-required-scope"], "sessions:read")
        self.assertIn({"ApiKeyAuth": []}, operation["security"])


if __name__ == "__main__":
    unittest.main()
