/**
 * Extracts a filename from a `Content-Disposition` header value.
 *
 * `filename*` (RFC 6266 / RFC 8187) takes precedence over `filename`. The
 * result is reduced to its final path segment and stripped of control
 * characters. Treat it as a display name, never as a trusted path.
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
): string | undefined {
  if (header === null || header === undefined || header.length > 8192) {
    return undefined;
  }
  const parameters = parseParameters(header);
  const extended = parameters.get("filename*");
  if (extended !== undefined) {
    const decoded = decodeExtendedValue(extended);
    if (decoded !== undefined) return sanitizeFilename(decoded);
  }
  const plain = parameters.get("filename");
  return plain === undefined ? undefined : sanitizeFilename(plain);
}

function isSpace(character: string | undefined): boolean {
  return character === " " || character === "\t";
}

function parseParameters(header: string): Map<string, string> {
  const result = new Map<string, string>();
  let index = header.indexOf(";");
  while (index !== -1 && index < header.length) {
    index += 1;
    while (isSpace(header[index])) index += 1;
    const equals = header.indexOf("=", index);
    if (equals === -1) break;
    const name = header.slice(index, equals).trim().toLowerCase();
    index = equals + 1;
    while (isSpace(header[index])) index += 1;
    let value = "";
    if (header[index] === '"') {
      index += 1;
      while (index < header.length && header[index] !== '"') {
        if (header[index] === "\\" && index + 1 < header.length) index += 1;
        value += header[index];
        index += 1;
      }
      index = header.indexOf(";", index);
    } else {
      const end = header.indexOf(";", index);
      value = header.slice(index, end === -1 ? undefined : end).trim();
      index = end;
    }
    if (name.length > 0 && !result.has(name)) result.set(name, value);
  }
  return result;
}

function decodeExtendedValue(value: string): string | undefined {
  const match = /^([A-Za-z0-9!#$%&+\-^_`{}~]+)'[A-Za-z0-9-]*'(.*)$/.exec(value);
  if (match === null) return undefined;
  const charset = match[1]!.toLowerCase();
  const encoded = match[2]!;
  if (!/^(?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})*$/.test(encoded)) {
    return undefined;
  }
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  const data = Uint8Array.from(bytes);
  if (charset === "utf-8") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return undefined;
    }
  }
  if (charset === "iso-8859-1") {
    return String.fromCharCode(...data);
  }
  return undefined;
}

function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

function sanitizeFilename(value: string): string | undefined {
  const segment = value.split(/[\\/]/).pop() ?? "";
  const cleaned = Array.from(segment)
    .filter((character) => !isControl(character.charCodeAt(0)))
    .join("")
    .trim();
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") {
    return undefined;
  }
  return cleaned;
}
