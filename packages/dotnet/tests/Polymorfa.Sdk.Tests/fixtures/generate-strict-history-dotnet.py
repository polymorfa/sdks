"""Independent Python-zlib provider, stored-block and gzip flag controls.

Run beside the exact shared strict-history.json. No SDK encoder is used.
"""
import base64
import binascii
import json
from pathlib import Path
import struct
import zlib

records = []


def add(name, data, plain, fmt):
    check = zlib.decompressobj({'raw': -15, 'gzip': 31, 'zlib': 15}[fmt])
    assert check.decompress(data) == plain and check.eof and not check.unused_data and not check.unconsumed_tail
    records.append(dict(name=name, input=base64.b64encode(data).decode(), plain=base64.b64encode(plain).decode(), format=fmt))


def varint(number):
    out = bytearray()
    while number > 127:
        out.append((number & 127) | 128)
        number >>= 7
    return bytes(out) + bytes([number])


plain = bytes.fromhex('0803')
raw = zlib.compress(plain, wbits=-15)
for flags in range(32):
    header = bytes([31, 139, 8, flags]) + bytes(6)
    if flags & 4:
        header += bytes.fromhex('0400') + b'test'
    if flags & 8:
        header += b'fixture-name\0'
    if flags & 16:
        header += b'fixture-comment\0'
    if flags & 2:
        header += struct.pack('<H', binascii.crc32(header) & 65535)
    add(f'flags-{flags}', header + raw + struct.pack('<II', binascii.crc32(plain), len(plain)), plain, 'gzip')
for size in [8191, 8192, 8193, 16383, 16384, 65534, 65535, 65536, 65537]:
    # Exact plaintext size with an opaque valid provider protobuf field.
    field_size = size - 8
    while 2 + 2 + len(varint(field_size)) + field_size != size:
        field_size += 1
    payload = bytes.fromhex('0803a206') + varint(field_size) + bytes(field_size)
    for fmt, bits in [('raw', -15), ('gzip', 31), ('zlib', 15)]:
        compressor = zlib.compressobj(level=0, wbits=bits)
        data = compressor.compress(payload) + compressor.flush()
        add(f'stored-{size}-{fmt}', data, payload, fmt)
for raw_size in [8191, 8192, 8193, 16384, 65535, 65536, 65537]:
    plain_size = raw_size - 5
    field_size = plain_size - 8
    while 4 + len(varint(field_size)) + field_size != plain_size:
        field_size += 1
    payload = bytes.fromhex('0803a206') + varint(field_size) + bytes(field_size)
    raw_body = b'\x01' + struct.pack('<HH', plain_size, plain_size ^ 65535) + payload
    assert len(raw_body) == raw_size
    add(f'raw-body-{raw_size}-raw', raw_body, payload, 'raw')
    add(f'raw-body-{raw_size}-gzip', bytes.fromhex('1f8b0800000000000003') + raw_body + struct.pack('<II', binascii.crc32(payload), len(payload)), payload, 'gzip')
    add(f'raw-body-{raw_size}-zlib', bytes.fromhex('7801') + raw_body + struct.pack('>I', zlib.adler32(payload)), payload, 'zlib')
for fmt, bits in [('raw', -15), ('gzip', 31), ('zlib', 15)]:
    compressor = zlib.compressobj(wbits=bits)
    data = compressor.compress(plain[:1]) + compressor.flush(zlib.Z_SYNC_FLUSH)
    data += compressor.compress(plain[1:]) + compressor.flush()
    add('multiblock-' + fmt, data, plain, fmt)
# Raw empty fixed block: its high six final-byte bits are unused, not a tail.
add('unused-final-bits', bytes.fromhex('03fc'), b'', 'raw')
Path(__file__).with_name('strict-history-dotnet.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'{len(records)} independently validated supplemental complete streams')
