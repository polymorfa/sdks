"""RFC 6266 display filenames; returned names are never trusted file paths."""

import re
from urllib.parse import unquote_to_bytes


def parse_content_disposition_filename(header: str | None) -> str | None:
    if header is None or len(header) > 8192:
        return None
    parameters: dict[str, str] = {}
    index = header.find(";")
    while index >= 0 and index < len(header):
        index += 1
        while index < len(header) and header[index] in " \t":
            index += 1
        equals = header.find("=", index)
        if equals < 0:
            break
        name, index = header[index:equals].strip().lower(), equals + 1
        while index < len(header) and header[index] in " \t":
            index += 1
        if index < len(header) and header[index] == '"':
            index += 1
            characters = []
            while index < len(header) and header[index] != '"':
                if header[index] == "\\" and index + 1 < len(header):
                    index += 1
                characters.append(header[index])
                index += 1
            value = "".join(characters)
            index = header.find(";", index)
        else:
            end = header.find(";", index)
            value = header[index : end if end >= 0 else len(header)].strip()
            index = end
        if name and name not in parameters:
            parameters[name] = value
    extended = parameters.get("filename*")
    if extended is not None:
        match = re.fullmatch(r"([A-Za-z0-9!#$%&+\-^_`{}~]+)'[A-Za-z0-9-]*'(.*)", extended)
        if match and re.fullmatch(r"(?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})*", match[2]):
            charset = match[1].lower()
            if charset in ("utf-8", "iso-8859-1"):
                try:
                    return _sanitize(unquote_to_bytes(match[2]).decode(charset))
                except UnicodeDecodeError:
                    pass
    plain = parameters.get("filename")
    return _sanitize(plain) if plain is not None else None


def _sanitize(value: str) -> str | None:
    segment = re.split(r"[\\/]", value)[-1]
    cleaned = "".join(c for c in segment if ord(c) >= 32 and ord(c) != 127).strip()
    return cleaned if cleaned and cleaned not in (".", "..") else None
