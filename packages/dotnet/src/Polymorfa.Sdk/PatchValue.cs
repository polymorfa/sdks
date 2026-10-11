using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

/// <summary>Distinguishes an omitted patch field from an explicitly supplied value, including null.</summary>
[JsonConverter(typeof(PatchValueConverterFactory))]
public readonly struct PatchValue<T> : IEquatable<PatchValue<T>>
{
    public bool IsSpecified { get; }
    public T? Value { get; }
    private PatchValue(T? value) { Value = value; IsSpecified = true; }
    public static PatchValue<T> Set(T? value) => new(value);
    public static implicit operator PatchValue<T>(T? value) => new(value);
    public bool Equals(PatchValue<T> other) => IsSpecified == other.IsSpecified && EqualityComparer<T?>.Default.Equals(Value, other.Value);
    public override bool Equals(object? other) => other is PatchValue<T> value && Equals(value);
    public override int GetHashCode() => HashCode.Combine(IsSpecified, Value);
}
internal sealed class PatchValueConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type type) => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(PatchValue<>);
    public override JsonConverter CreateConverter(Type type, JsonSerializerOptions options) => (JsonConverter)Activator.CreateInstance(typeof(Converter<>).MakeGenericType(type.GetGenericArguments()))!;
    private sealed class Converter<T> : JsonConverter<PatchValue<T>>
    {
        public override bool HandleNull => true;
        public override PatchValue<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => PatchValue<T>.Set(JsonSerializer.Deserialize<T>(ref reader, options));
        public override void Write(Utf8JsonWriter writer, PatchValue<T> value, JsonSerializerOptions options)
        {
            if (!value.IsSpecified) throw new JsonException("Omitted patch fields require JsonIgnoreCondition.WhenWritingDefault.");
            JsonSerializer.Serialize(writer, value.Value, options);
        }
    }
}
