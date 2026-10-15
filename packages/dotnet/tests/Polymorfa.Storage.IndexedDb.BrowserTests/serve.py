"""Serve only the published synthetic fixture on loopback, including its opaque-origin denial test."""
import argparse
import http.server
from functools import partial

class FixtureHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Blazor's loader fetches its static resources with credentials. This
        # permits only the synthetic sandbox's opaque origin, not another site.
        if self.headers.get("Origin") == "null":
            self.send_header("Access-Control-Allow-Origin", "null")
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

parser = argparse.ArgumentParser()
parser.add_argument("--root", required=True)
parser.add_argument("--port", type=int, default=54865)
args = parser.parse_args()
http.server.ThreadingHTTPServer(("127.0.0.1", args.port), partial(FixtureHandler, directory=args.root)).serve_forever()
