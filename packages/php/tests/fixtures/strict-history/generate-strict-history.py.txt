"""Independent Python stdlib compression and manually encoded provider protobuf.

Run from any directory to regenerate strict-history.json. Invalid cases are
recipes over these bytes so prefixes do not duplicate megabytes in the fixture.
No SDK, pako, or generated protobuf encoder computes the expected results.
"""
import base64
import binascii
import gzip
import json
from pathlib import Path
import random
import struct
import zlib


def varint(value):
    result = bytearray()
    while value > 127:
        result.append((value & 127) | 128)
        value >>= 7
    return bytes(result + bytes([value]))


def field(number, value):
    return varint(number * 8 + 2) + varint(len(value)) + value


# whatsapp.proto: HistorySync.syncType=1, conversations=2, chunkOrder=5,
# progress=6; Conversation.id=1, lastMsgTimestamp=5, unreadCount=6.
conversation = field(1, b"fixture-user@s.whatsapp.net") + b"\x28" + varint(2**64 - 1) + b"\x30\x03"
provider = b"\x08\x03" + field(2, conversation) + b"\x28\x07\x30\x5c" + field(100, b"unknown provider data")
plain = {
    "provider": provider,
    "empty": b"",
    "invalid-protobuf": b"\xff",
    "repeat": b"\x08\x03" + field(100, bytes(150000)),
    "random": b"\x08\x03" + field(100, random.Random(1781).randbytes(72000)),
    "large": b"\x08\x03" + field(100, bytes(4 * 1024 * 1024)),
}
streams = {}
invalid = []


def add(name, data, payload, fmt):
    # Independently establish each complete stream's exact expected output.
    bits = {"gzip": 31, "zlib": 15, "raw": -15}[fmt]
    check = zlib.decompressobj(bits)
    assert check.decompress(data) == payload
    assert check.eof and not check.unused_data and not check.unconsumed_tail
    streams[name] = {"input": base64.b64encode(data).decode(), "plain": next(k for k, v in plain.items() if v == payload), "format": fmt}


for label, payload in plain.items():
    for fmt, bits in [("raw", -15), ("zlib", 15), ("gzip", 31)]:
        compressor = zlib.compressobj(wbits=bits)
        add(label + "-" + fmt, compressor.compress(payload) + compressor.flush(), payload, fmt)

for strategy in [zlib.Z_FIXED, zlib.Z_DEFAULT_STRATEGY, zlib.Z_HUFFMAN_ONLY]:
    compressor = zlib.compressobj(level=6, wbits=-15, strategy=strategy)
    add("strategy-" + str(strategy), compressor.compress(plain["repeat"]) + compressor.flush(), plain["repeat"], "raw")
compressor = zlib.compressobj(level=0, wbits=-15)
add("stored", compressor.compress(plain["random"]) + compressor.flush(), plain["random"], "raw")

raw = base64.b64decode(streams["provider-raw"]["input"])
trailer = struct.pack("<II", binascii.crc32(provider), len(provider))
for flags in range(16):
    # All combinations of FTEXT, FHCRC, FEXTRA, FNAME and FCOMMENT.
    f = ((flags & 1) * 2) | ((flags & 2) * 2) | ((flags & 4) * 2) | ((flags & 8) * 2) | 1
    header = b"\x1f\x8b\x08" + bytes([f]) + bytes(6)
    if f & 4:
        header += b"\x04\x00test"
    if f & 8:
        header += b"fixture-name\x00"
    if f & 16:
        header += b"fixture-comment\x00"
    if f & 2:
        header += struct.pack("<H", binascii.crc32(header) & 65535)
    add("optional-" + str(flags), header + raw + trailer, provider, "gzip")
    if f & 2:
        invalid.append({"name": "bad-fhcrc-" + str(flags), "base": "optional-" + str(flags), "flip": len(header) - 1})

for name, stream in streams.items():
    if name.startswith("large-"):
        continue
    size = len(base64.b64decode(stream["input"]))
    for suffix in ["00", "000000", "747261696c"]:
        invalid.append({"name": name + "-tail-" + suffix, "base": name, "tailHex": suffix})
    invalid.append({"name": name + "-concat", "base": name, "append": name})
    empty = "empty-" + stream["format"]
    invalid.extend([
        {"name": name + "-empty-last", "base": name, "append": empty},
        {"name": name + "-empty-first", "base": empty, "append": name},
    ])
    prefixes = range(size) if size < 512 else sorted({0, 1, 2, 3, 7, 10, 31, size // 2, size - 9, size - 5, size - 1})
    for end in prefixes:
        invalid.append({"name": name + "-prefix-" + str(end), "base": name, "cut": end})

for name, offset in [("bad-crc", -8), ("bad-isize", -4), ("bad-method", 2), ("bad-reserved", 3)]:
    invalid.append({"name": name, "base": "provider-gzip", "flip": offset, "mask": 128 if offset == 3 else 1})
invalid.append({"name": "bad-adler", "base": "provider-zlib", "flip": -1})
invalid.extend([
    {"name": "bad-zlib-method", "hex": "7900"},
    {"name": "bad-zlib-window", "hex": "881c"},
    {"name": "bad-zlib-header-check", "hex": "789d"},
    {"name": "invalid-block", "hex": "07"},
])
dictionary = zlib.compressobj(wbits=15, zdict=b"unsupported-dictionary")
invalid.append({"name": "dictionary", "hex": (dictionary.compress(provider) + dictionary.flush()).hex()})
result = {"generator": "Python stdlib zlib/gzip/binascii, manual whatsapp.proto wire fields", "streams": streams, "plain": {k: ({"zeroFieldBytes": 150000 if k == "repeat" else 4 * 1024 * 1024} if k in ["repeat", "large"] else {"base64": base64.b64encode(v).decode()}) for k, v in plain.items()}, "invalid": invalid}
Path(__file__).with_name("strict-history.json").write_text(json.dumps(result, indent=2) + "\n")
print(f"{len(streams)} complete streams, {len(invalid)} invalid stream recipes")
