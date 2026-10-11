"""Verify decrypted Flow forwarding bytes with the endpoint signing secret."""

import hashlib
import hmac
import math
import re
import time

FLOW_FORWARD_SIGNATURE_HEADER = "x-polymorfa-flow-signature"


def verify_flow_forward_signature(
    raw_body: bytes,
    signature_header: str | None,
    secret: str,
    *,
    tolerance_seconds: float = 300,
    now_unix_seconds: float | None = None,
) -> bool:
    if not isinstance(signature_header, str) or not isinstance(secret, str) or not secret:
        return False
    match = re.fullmatch(r"t=(\d{1,12}),v1=([a-fA-F0-9]{64})", signature_header.strip())
    now = time.time() if now_unix_seconds is None else now_unix_seconds
    if (
        not match
        or not math.isfinite(tolerance_seconds)
        or not math.isfinite(now)
        or tolerance_seconds < 0
        or abs(now - int(match[1])) > tolerance_seconds
    ):
        return False
    signed = match[1].encode("ascii") + b"." + raw_body
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(digest, bytes.fromhex(match[2]))
