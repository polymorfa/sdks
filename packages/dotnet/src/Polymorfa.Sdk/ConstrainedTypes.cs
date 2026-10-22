using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

internal abstract class KnownStringEnumConverter<T>(IReadOnlyDictionary<T, string> names) : JsonConverter<T> where T : struct, Enum
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
            foreach (var pair in names) if (pair.Value == reader.GetString()) return pair.Key;
        throw new JsonException($"Unknown {typeof(T).Name} value.");
    }
    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        if (!names.TryGetValue(value, out var name)) throw new JsonException($"Unknown {typeof(T).Name} value.");
        writer.WriteStringValue(name);
    }
}
[JsonConverter(typeof(OpenAiTtsModelConverter))] public enum OpenAiTtsModel { Gpt4oMiniTts, Tts1, Tts1Hd }
internal sealed class OpenAiTtsModelConverter() : KnownStringEnumConverter<OpenAiTtsModel>(new Dictionary<OpenAiTtsModel, string> { [OpenAiTtsModel.Gpt4oMiniTts] = "gpt-4o-mini-tts", [OpenAiTtsModel.Tts1] = "tts-1", [OpenAiTtsModel.Tts1Hd] = "tts-1-hd" });
[JsonConverter(typeof(ElevenLabsTtsModelConverter))] public enum ElevenLabsTtsModel { MultilingualV2, FlashV25, TurboV25 }
internal sealed class ElevenLabsTtsModelConverter() : KnownStringEnumConverter<ElevenLabsTtsModel>(new Dictionary<ElevenLabsTtsModel, string> { [ElevenLabsTtsModel.MultilingualV2] = "eleven_multilingual_v2", [ElevenLabsTtsModel.FlashV25] = "eleven_flash_v2_5", [ElevenLabsTtsModel.TurboV25] = "eleven_turbo_v2_5" });
[JsonConverter(typeof(OpenAiTtsVoiceConverter))] public enum OpenAiTtsVoice { Alloy, Ash, Ballad, Coral, Echo, Fable, Nova, Onyx, Sage, Shimmer, Verse }
internal sealed class OpenAiTtsVoiceConverter() : KnownStringEnumConverter<OpenAiTtsVoice>(Enum.GetValues<OpenAiTtsVoice>().ToDictionary(v => v, v => v.ToString().ToLowerInvariant()));
[JsonConverter(typeof(TemplateKindConverter))] public enum TemplateKind { Standard, Carousel, Authentication, LimitedTimeOffer }
internal sealed class TemplateKindConverter() : KnownStringEnumConverter<TemplateKind>(new Dictionary<TemplateKind, string> { [TemplateKind.Standard] = "standard", [TemplateKind.Carousel] = "carousel", [TemplateKind.Authentication] = "authentication", [TemplateKind.LimitedTimeOffer] = "limited_time_offer" });
[JsonConverter(typeof(TemplateCategoryConverter))] public enum TemplateCategory { Marketing, Utility, Authentication }
internal sealed class TemplateCategoryConverter() : KnownStringEnumConverter<TemplateCategory>(Enum.GetValues<TemplateCategory>().ToDictionary(v => v, v => v.ToString().ToUpperInvariant()));
[JsonConverter(typeof(TemplateVariableTypeConverter))] public enum TemplateVariableType { Text, Number, Currency, DateTime }
internal sealed class TemplateVariableTypeConverter() : KnownStringEnumConverter<TemplateVariableType>(new Dictionary<TemplateVariableType, string> { [TemplateVariableType.Text] = "text", [TemplateVariableType.Number] = "number", [TemplateVariableType.Currency] = "currency", [TemplateVariableType.DateTime] = "date_time" });
[JsonConverter(typeof(TemplateSurfaceConverter))] public enum TemplateSurface { Cloud, Whatsmeow, Sandbox }
internal sealed class TemplateSurfaceConverter() : KnownStringEnumConverter<TemplateSurface>(Enum.GetValues<TemplateSurface>().ToDictionary(v => v, v => v.ToString().ToLowerInvariant()));
[JsonConverter(typeof(TemplateOtpTypeConverter))] public enum TemplateOtpType { CopyCode, OneTap }
internal sealed class TemplateOtpTypeConverter() : KnownStringEnumConverter<TemplateOtpType>(new Dictionary<TemplateOtpType, string> { [TemplateOtpType.CopyCode] = "copy_code", [TemplateOtpType.OneTap] = "one_tap" });
[JsonConverter(typeof(TemplateDefinitionVersionConverter))] public enum TemplateDefinitionVersion { V1 = 1 }
internal sealed class TemplateDefinitionVersionConverter : JsonConverter<TemplateDefinitionVersion>
{
    public override TemplateDefinitionVersion Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.TokenType == JsonTokenType.Number && reader.TryGetInt32(out var version) && version == 1 ? TemplateDefinitionVersion.V1 : throw new JsonException("Template definition version must be 1.");
    public override void Write(Utf8JsonWriter writer, TemplateDefinitionVersion value, JsonSerializerOptions options) { if (value != TemplateDefinitionVersion.V1) throw new JsonException("Template definition version must be 1."); writer.WriteNumberValue(1); }
}
