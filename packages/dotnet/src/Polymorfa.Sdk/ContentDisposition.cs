using System.Text;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

/// <summary>Parses a display filename; never treat it as an authorized path.</summary>
public static partial class ContentDisposition
{
    public static string? ParseFilename(string? header)
    {
        if (header is null || header.Length > 8192) return null;
        var parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var index = header.IndexOf(';');
        while (index >= 0 && index < header.Length)
        {
            index++; while (index < header.Length && header[index] is ' ' or '\t') index++;
            var equals = header.IndexOf('=', index); if (equals < 0) break;
            var name = header[index..equals].Trim(); index = equals + 1;
            while (index < header.Length && header[index] is ' ' or '\t') index++;
            string value;
            if (index < header.Length && header[index] == '"')
            {
                index++; var text = new StringBuilder();
                while (index < header.Length && header[index] != '"') { if (header[index] == '\\' && index + 1 < header.Length) index++; text.Append(header[index++]); }
                value = text.ToString(); index = header.IndexOf(';', index);
            }
            else { var end = header.IndexOf(';', index); value = header[index..(end < 0 ? header.Length : end)].Trim(); index = end; }
            if (name.Length > 0) parameters.TryAdd(name, value);
        }
        if (parameters.TryGetValue("filename*", out var extended) && DecodeExtended(extended) is { } decoded) return Sanitize(decoded);
        return parameters.TryGetValue("filename", out var plain) ? Sanitize(plain) : null;
    }
    private static string? DecodeExtended(string value)
    {
        var match = Extended().Match(value); if (!match.Success) return null;
        var charset = match.Groups[1].Value.ToLowerInvariant(); var encoded = match.Groups[2].Value;
        if (!Encoded().IsMatch(encoded)) return null;
        var bytes = new List<byte>();
        for (var i = 0; i < encoded.Length; i++)
        {
            if (encoded[i] == '%') { bytes.Add(Convert.ToByte(encoded.Substring(i + 1, 2), 16)); i += 2; }
            else bytes.Add((byte)encoded[i]);
        }
        try { return charset switch { "utf-8" => new UTF8Encoding(false, true).GetString(bytes.ToArray()), "iso-8859-1" => Encoding.Latin1.GetString(bytes.ToArray()), _ => null }; }
        catch (DecoderFallbackException) { return null; }
    }
    private static string? Sanitize(string value)
    {
        var last = Math.Max(value.LastIndexOf('/'), value.LastIndexOf('\\'));
        var cleaned = new string(value[(last + 1)..].Where(character => character >= 0x20 && character != 0x7f).ToArray()).Trim();
        return cleaned is "" or "." or ".." ? null : cleaned;
    }
    [GeneratedRegex("^([A-Za-z0-9!#$%&+\\-^_`{}~]+)'[A-Za-z0-9-]*'(.*)$")]
    private static partial Regex Extended();
    [GeneratedRegex("^(?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})*$")]
    private static partial Regex Encoded();
}
