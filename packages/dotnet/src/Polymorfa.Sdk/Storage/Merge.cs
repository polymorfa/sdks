using System.Globalization;
using System.Text.Json;
namespace Polymorfa.Sdk.Storage;

public static class StorageMerge
{
    public const double FinalVersion = 9007199254740991;
    internal static JsonElement Null { get; } = JsonSerializer.SerializeToElement<object?>(null);
    public static StorageRow EmptyRow(StorageEntity entity, IReadOnlyDictionary<string, string> key)
    {
        var definition = StorageSchema.Definition(entity); var id = StorageSchema.EncodeKey(entity, key); var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal); foreach (var name in definition.Key) fields[name] = JsonSerializer.SerializeToElement(key[name]); foreach (var field in definition.Fields.Keys) fields[field] = Null; foreach (var index in definition.Indexes) fields[index.Sort] = JsonSerializer.SerializeToElement(0); return new(id, 0, new Dictionary<string, double>(StringComparer.Ordinal), fields);
    }
    public static IReadOnlyDictionary<string, JsonElement> PublicRow(StorageEntity entity, StorageRow row) => StorageSchema.Definition(entity).Key.Concat(StorageSchema.Definition(entity).Fields.Keys).ToDictionary(name => name, name => row.Fields.TryGetValue(name, out var value) ? value.Clone() : Null, StringComparer.Ordinal);
    private static int Rank(JsonElement value) => value.ValueKind switch { JsonValueKind.Null or JsonValueKind.Undefined => 0, JsonValueKind.True or JsonValueKind.False => 1, JsonValueKind.Number => 2, JsonValueKind.String => 3, _ => 4 };
    public static int CompareValues(JsonElement a, JsonElement b)
    {
        var rank = Rank(a).CompareTo(Rank(b)); if (rank != 0) return rank;
        return a.ValueKind switch { JsonValueKind.Null or JsonValueKind.Undefined => 0, JsonValueKind.True or JsonValueKind.False => a.GetBoolean().CompareTo(b.GetBoolean()), JsonValueKind.Number => a.GetDouble().CompareTo(b.GetDouble()), JsonValueKind.String => StringComparer.Ordinal.Compare(a.GetString(), b.GetString()), _ => StringComparer.Ordinal.Compare(CanonicalJson(a), CanonicalJson(b)) };
    }
    public static string CanonicalJson(JsonElement value) => value.ValueKind switch { JsonValueKind.Null or JsonValueKind.Undefined => "null", JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.Number => JsNumber(value.GetDouble()), JsonValueKind.String => Quote(value.GetString()!), JsonValueKind.Array => "[" + string.Join(',', value.EnumerateArray().Select(CanonicalJson)) + "]", JsonValueKind.Object => "{" + string.Join(',', value.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => Quote(p.Name) + ":" + CanonicalJson(p.Value))) + "}", _ => throw new StorageValidationException("Invalid JSON field value.") };
    private static string Quote(string text)
    {
        var output = new System.Text.StringBuilder("\""); for (var i = 0; i < text.Length; i++) { var c = text[i]; switch (c) { case '\"': output.Append("\\\""); break; case '\\': output.Append("\\\\"); break; case '\b': output.Append("\\b"); break; case '\f': output.Append("\\f"); break; case '\n': output.Append("\\n"); break; case '\r': output.Append("\\r"); break; case '\t': output.Append("\\t"); break; default: if (c < 32 || char.IsSurrogate(c) && !(char.IsHighSurrogate(c) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))) { output.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture)); } else { output.Append(c); if (char.IsHighSurrogate(c)) output.Append(text[++i]); } break; } }
        return output.Append('\"').ToString();
    }
    private static string JsNumber(double number)
    {
        if (number == 0) return "0"; if (!double.IsFinite(number)) return "null";
        var raw = number.ToString("R", CultureInfo.InvariantCulture).ToLowerInvariant(); var negative = raw.StartsWith('-'); var text = raw.TrimStart('-'); var split = text.Split('e'); var mantissa = split[0]; var exponent = split.Length == 2 ? int.Parse(split[1], CultureInfo.InvariantCulture) : 0; var point = mantissa.IndexOf('.'); if (point < 0) point = mantissa.Length; var digits = mantissa.Replace(".", "", StringComparison.Ordinal); while (digits.Length > 1 && digits.EndsWith('0')) digits = digits[..^1]; var effective = point + exponent; var sign = negative ? "-" : "";
        if (effective > 0 && effective <= 21) return effective >= digits.Length ? sign + digits + new string('0', effective - digits.Length) : sign + digits[..effective] + "." + digits[effective..];
        if (effective <= 0 && effective > -6) return sign + "0." + new string('0', -effective) + digits;
        var exp = effective - 1; return sign + digits[0] + (digits.Length > 1 ? "." + digits[1..] : "") + "e" + (exp >= 0 ? "+" : "") + exp.ToString(CultureInfo.InvariantCulture);
    }
    public static (StorageRow Row, bool Changed) MergeFields(StorageEntity entity, StorageRow row, IReadOnlyDictionary<string, StorageFieldWrite> writes)
    {
        var definition = StorageSchema.Definition(entity); var fields = row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal); var versions = new Dictionary<string, double>(row.Versions, StringComparer.Ordinal); var changed = false;
        foreach (var (name, write) in writes)
        {
            if (!definition.Fields.TryGetValue(name, out var type) || !double.IsFinite(write.Version) || !Matches(write.Value, type)) throw new StorageValidationException("Invalid field write, type or version.");
            var current = fields.TryGetValue(name, out var value) ? value : Null; var hasVersion = versions.TryGetValue(name, out var old); var take = !hasVersion || write.Version != old && write.Version > old || write.Version == old && CompareValues(write.Value, current) > 0; if (!take) continue; if (hasVersion && old == write.Version && CompareValues(current, write.Value) == 0) continue; fields[name] = write.Value.Clone(); versions[name] = write.Version; changed = true;
        }
        return (changed ? new(row.Id, row.Revision, versions, fields) : row, changed);
    }
    private static bool Matches(JsonElement value, StorageFieldType type) => value.ValueKind != JsonValueKind.Undefined && (value.ValueKind == JsonValueKind.Null || type switch { StorageFieldType.String => value.ValueKind == JsonValueKind.String, StorageFieldType.Number => value.ValueKind == JsonValueKind.Number && double.IsFinite(value.GetDouble()), StorageFieldType.Boolean => value.ValueKind is JsonValueKind.True or JsonValueKind.False, StorageFieldType.Json => true, _ => false });
}
