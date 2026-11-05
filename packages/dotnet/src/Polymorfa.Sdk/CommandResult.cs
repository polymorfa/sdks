using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

/// <summary>A completed RPC value or the request ID returned for asynchronous execution.</summary>
[JsonConverter(typeof(CommandResultConverter))]
public abstract record CommandResult<T>;
public sealed record CompletedCommand<T>(T Value) : CommandResult<T>;
public sealed record AcceptedCommand<T>(string RequestId) : CommandResult<T>;
internal sealed class CommandResultConverter : JsonConverterFactory
{
    public override bool CanConvert(Type type) => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(CommandResult<>);
    public override JsonConverter CreateConverter(Type type, JsonSerializerOptions options) => (JsonConverter)Activator.CreateInstance(typeof(Converter<>).MakeGenericType(type.GetGenericArguments()))!;
    private sealed class Converter<T> : JsonConverter<CommandResult<T>>
    {
        public override CommandResult<T> Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        {
            using var document = JsonDocument.ParseValue(ref reader);
            var json = document.RootElement;
            if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("requestId", out var id) && id.ValueKind == JsonValueKind.String) return new AcceptedCommand<T>(id.GetString()!);
            return new CompletedCommand<T>(json.Deserialize<T>(options) ?? throw new JsonException("Invalid RPC response."));
        }
        public override void Write(Utf8JsonWriter writer, CommandResult<T> result, JsonSerializerOptions options)
        {
            if (result is CompletedCommand<T> completed) JsonSerializer.Serialize(writer, completed.Value, options);
            else if (result is AcceptedCommand<T> accepted) JsonSerializer.Serialize(writer, new { accepted.RequestId }, options);
            else throw new JsonException("Unknown RPC result.");
        }
    }
}
