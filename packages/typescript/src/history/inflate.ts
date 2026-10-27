/*!
pako 3.0.2 (MIT AND Zlib)
https://github.com/nodeca/pako/tree/3.0.2

(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Zlib notice for the compression implementation:

(C) 1995-2013 Jean-loup Gailly and Mark Adler
(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
  claim that you wrote the original software. If you use this software
  in a product, an acknowledgment in the product documentation would be
  appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
  misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
*/
import {
  ZStream,
  zlibInflateInit2,
  zlibInflate,
  zlibInflateEnd,
  Z_NO_FLUSH,
  Z_OK,
  Z_STREAM_END,
  Z_BUF_ERROR,
  Z_DATA_ERROR,
  Z_NEED_DICT,
  Z_STREAM_ERROR,
  Z_MEM_ERROR,
} from "pako";
import {
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
} from "../errors.js";

export function checkHistoryCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PolymorfaCancelledError("The history download was cancelled.", {
      code: "request_cancelled",
      cause: signal.reason,
    });
  }
}

function corrupt(): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(
    "The history chunk is not valid compressed data.",
    "media_invalid_ciphertext",
  );
}

function decoderFailure(status: number): Error {
  if (status === Z_MEM_ERROR) {
    return new RangeError("The history decoder could not allocate memory.");
  }
  if (status === Z_STREAM_ERROR) {
    return new PolymorfaConfigurationError(
      "The history decoder has an invalid stream state.",
      "historyDecoder",
    );
  }
  return new PolymorfaConfigurationError(
    "The history decoder returned an unexpected status.",
    "historyDecoder",
  );
}

function windowBits(header: Uint8Array): number {
  // Keep the existing gzip/zlib/raw detection. Validation belongs to pako.
  if (header[0] === 0x1f && header[1] === 0x8b) return 31;
  if (
    header.length >= 2 &&
    (header[0]! & 0x0f) === 8 &&
    ((header[0]! << 8) | header[1]!) % 31 === 0
  ) {
    return 15;
  }
  return -15;
}

function endDecoder(stream: ZStream, failed: boolean): void {
  try {
    const ended = zlibInflateEnd(stream);
    if (ended !== Z_OK) throw decoderFailure(ended);
  } catch (error) {
    if (!failed) throw error;
  }
}

/** Private adapter: one stream, bounded calls, no header capture or resets. */
export async function inflateHistory(
  compressed: Uint8Array,
  limit: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  checkHistoryCancellation(signal);
  // Own the bytes before the first yield, including Buffer-backed inputs.
  const snapshot = new Uint8Array(compressed);
  if (snapshot.length === 0) throw corrupt();
  const stream = new ZStream();
  const initialized = zlibInflateInit2(stream, windowBits(snapshot));
  if (initialized !== Z_OK) throw decoderFailure(initialized);
  let failed = false;
  try {
    stream.input = snapshot;
    const chunks: Uint8Array[] = [];
    let total = 0;
    let calls = 0;
    for (;;) {
      checkHistoryCancellation(signal);
      if (stream.avail_in === 0) {
        stream.avail_in = Math.min(8192, snapshot.length - stream.next_in);
      }
      const output = new Uint8Array(Math.min(65536, limit - total + 1));
      stream.output = output;
      stream.next_out = 0;
      stream.avail_out = output.length;
      const previousInput = stream.total_in;
      const previousOutput = stream.total_out;
      const status = zlibInflate(stream, Z_NO_FLUSH);
      // Output quota precedes a bad checksum/trailer discovered in this call.
      if (total + stream.next_out > limit) {
        throw new PolymorfaMediaIntegrityError(
          "The inflated history chunk exceeds the permitted size.",
          "media_too_large",
        );
      }
      if (stream.next_out > 0) {
        chunks.push(output.slice(0, stream.next_out));
        total += stream.next_out;
      }
      if (status === Z_STREAM_END) {
        // Include input not offered yet. Never reset into another member.
        if (stream.total_in !== snapshot.length || stream.avail_in !== 0) {
          throw corrupt();
        }
        break;
      }
      if (status === Z_DATA_ERROR || status === Z_NEED_DICT) throw corrupt();
      if (status !== Z_OK && status !== Z_BUF_ERROR) {
        throw decoderFailure(status);
      }
      if (
        stream.total_in === previousInput &&
        stream.total_out === previousOutput
      ) {
        throw corrupt();
      }
      if (++calls % 32 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    checkHistoryCancellation(signal);
    const result = new Uint8Array(total);
    let offset = 0;
    let copies = 0;
    for (const chunk of chunks) {
      checkHistoryCancellation(signal);
      result.set(chunk, offset);
      offset += chunk.length;
      if (++copies % 32 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    checkHistoryCancellation(signal);
    return result;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Exactly once after successful initialization. A primary error wins.
    endDecoder(stream, failed);
  }
}
