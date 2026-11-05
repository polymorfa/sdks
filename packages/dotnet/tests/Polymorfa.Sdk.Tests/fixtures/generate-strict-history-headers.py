"""Python stdlib gzip header boundary recipes, no SDK or flate2 encoder.

The two retained diagnostic vectors are represented exactly as repeated segments.
Their complete input hashes bind the original portable corpus without a second
multi-megabyte base64 copy. RFC-valid unsupported headers are separate from
malformed compression. Run this script beside strict-history.json.
"""
import base64
import binascii
import hashlib
import json
from pathlib import Path
import struct
import zlib


def packed(data):
    return {"base64": base64.b64encode(data).decode()}


def expand(segments):
    return b"".join(base64.b64decode(s["base64"]) if "base64" in s else bytes([s["byte"]]) * s["count"] for s in segments)


records = []
plain = b"\x08\x03"
compressor = zlib.compressobj(wbits=-15)
body = compressor.compress(plain) + compressor.flush()
trailer = struct.pack("<II", binascii.crc32(plain), len(plain))
for name_length, comment_length in [(65535, None), (65536, None), (None, 65535), (None, 65536), (65535, 65535), (65536, 65535), (65535, 65536)]:
    for fhcrc in [False, True]:
        flags = (8 if name_length is not None else 0) | (16 if comment_length is not None else 0) | (2 if fhcrc else 0)
        segments = [packed(bytes([31, 139, 8, flags]) + bytes(6))]
        for size, byte in [(name_length, 78), (comment_length, 67)]:
            if size is not None:
                segments.extend([{"byte": byte, "count": size}, packed(b"\0")])
        if fhcrc:
            segments.append(packed(struct.pack("<H", binascii.crc32(expand(segments)) & 65535)))
        segments.append(packed(body + trailer))
        data = expand(segments)
        assert zlib.decompress(data, wbits=31) == plain
        records.append({"name": f"name-{name_length}-comment-{comment_length}-fhcrc-{fhcrc}", "segments": segments, "sha256": hashlib.sha256(data).hexdigest(), "plain": base64.b64encode(plain).decode(), "compression": "valid", "supported": all(n is None or n <= 65535 for n in [name_length, comment_length])})

# Exact retained portable-history-decoder-investigation vectors.
segments = [packed(bytes.fromhex("1f8b081a0000000000ff")), {"byte": 78, "count": 1048576}, packed(b"\0"), {"byte": 67, "count": 1048576}, packed(bytes.fromhex("005792e360f4600000c95892dd04000000"))]
data = expand(segments)
assert zlib.decompress(data, wbits=31) == bytes.fromhex("08014800")
records.append({"name": "huge-name-comment", "segments": segments, "sha256": hashlib.sha256(data).hexdigest(), "plain": "CAFIAA==", "compression": "valid", "supported": False, "origin": "Retained portable corpus huge-name-comment, exact bytes"})
segments = [packed(bytes.fromhex("1f8b08080000000000ff")), {"byte": 78, "count": 1048576}]
data = expand(segments)
check = zlib.decompressobj(31)
check.decompress(data)
assert not check.eof
records.append({"name": "unterminated-name", "segments": segments, "sha256": hashlib.sha256(data).hexdigest(), "compression": "incomplete", "supported": False, "origin": "Retained portable corpus unterminated-name, exact bytes"})
Path(__file__).with_name("strict-history-headers.json").write_text(json.dumps(records, indent=2) + "\n")
print(f"{len(records)} header recipes: 6 supported, 9 valid-but-unsupported, 1 incomplete")
