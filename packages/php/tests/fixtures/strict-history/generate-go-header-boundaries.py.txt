"""Independent zlib controls for Go's existing header bound and unused bits."""
import base64
import binascii
import json
from pathlib import Path
import struct
import zlib

records = []
plain = b'\x08\x03'

def add(name, data, supported=True):
    records.append(dict(name=name, input=base64.b64encode(data).decode(), supported=supported))

for name, comment in [(511, None), (512, None), (None, 511), (None, 512), (511, 511), (512, 511), (511, 512)]:
    for crc in [False, True]:
        h = bytes([31, 139, 8, (8 if name else 0) | (16 if comment else 0) | (2 if crc else 0)]) + bytes(6)
        for n, byte in [(name, b'N'), (comment, b'C')]:
            if n is not None:
                h += byte * n + b'\0'
        if crc:
            h += struct.pack('<H', binascii.crc32(h) & 65535)
        c = zlib.compressobj(wbits=-15)
        data = h + c.compress(plain) + c.flush() + struct.pack('<II', binascii.crc32(plain), 2)
        assert zlib.decompress(data, 31) == plain
        add(f'name-{name}-comment-{comment}-crc-{crc}', data, all(n is None or n <= 511 for n in [name, comment]))
for label, raw in [('unused-final-bits', bytes.fromhex('e36006fc')), ('unused-stored-alignment', bytes.fromhex('f90200fdff0803'))]:
    for fmt, bits in [('raw', -15), ('gzip', 31), ('zlib', 15)]:
        data = raw if fmt == 'raw' else bytes.fromhex('1f8b0800000000000003') + raw + struct.pack('<II', binascii.crc32(plain), len(plain)) if fmt == 'gzip' else bytes.fromhex('7801') + raw + struct.pack('>I', zlib.adler32(plain))
        check = zlib.decompressobj(bits)
        assert check.decompress(data) == plain and check.eof and not check.unused_data
        add(label + '-' + fmt, data)
Path(__file__).with_name('go-header-boundaries.json').write_text(json.dumps(records, indent=2) + '\n')
