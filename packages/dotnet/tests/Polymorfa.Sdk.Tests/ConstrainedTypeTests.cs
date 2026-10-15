using System.Diagnostics;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class ConstrainedTypeTests
{
    public static async Task RunAsync()
    {
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };
        SynthesizeVoiceAudioInput openai = new OpenAiVoiceAudioInput("Greeting", "Hello", OpenAiTtsVoice.Alloy, OpenAiTtsModel.Tts1);
        SynthesizeVoiceAudioInput elevenlabs = new ElevenLabsVoiceAudioInput("Greeting", "Hello", "customerVoice", ElevenLabsTtsModel.FlashV25);
        foreach (var (input, provider, voice, model) in new[] { (openai, "openai", "alloy", "tts-1"), (elevenlabs, "elevenlabs", "customerVoice", "eleven_flash_v2_5") })
        {
            var body = JsonSerializer.SerializeToElement(input, options); ResourceTests.Equal(body.GetProperty("provider").GetString(), provider); ResourceTests.Equal(body.GetProperty("voiceId").GetString(), voice); ResourceTests.Equal(body.GetProperty("model").GetString(), model);
            ResourceTests.Equal(JsonSerializer.Deserialize<SynthesizeVoiceAudioInput>(body.GetRawText(), options), input);
            await BillingTests.Organization("POST", "/platform/voice/audio/tts", body.GetRawText()[..^1] + ",\"projectId\":\"p1\"}", """{"data":{"id":"voice","projectId":"p1","name":"Greeting","source":"tts","status":"transcoding","inUseCount":0,"revision":1,"createdAt":"2026-10-14","updatedAt":"2026-10-14"}}""", async c => ResourceTests.Equal((await c.Voice.Audio.SynthesizeAsync(input, "p1")).Data.Status, "transcoding"));
        }
        foreach (var json in new[] { "{\"provider\":\"openai\",\"voiceId\":\"not_a_voice\"}", "{\"provider\":\"openai\",\"voiceId\":\"alloy\",\"model\":\"eleven_flash_v2_5\"}", "{\"provider\":\"future\"}" })
            try { JsonSerializer.Deserialize<SynthesizeVoiceAudioInput>(json, options); throw new Exception("Invalid synthesis type accepted"); } catch (JsonException) { }
        foreach (var json in new[] { "{\"header\":{\"format\":\"text\",\"text\":\"invalid\"},\"body\":\"Card\"}", "{\"header\":{\"format\":\"location\"},\"body\":\"Card\"}" })
            try { JsonSerializer.Deserialize<TemplateCarouselCard>(json, options); throw new Exception("Carousel accepted non-media header"); } catch (JsonException) { }
        foreach (var type in new[] { typeof(TemplateCategory), typeof(TemplateKind), typeof(TemplateVariableType), typeof(TemplateSurface), typeof(TemplateOtpType), typeof(OpenAiTtsVoice), typeof(OpenAiTtsModel), typeof(ElevenLabsTtsModel) })
        {
            foreach (var value in Enum.GetValues(type)) { var json = JsonSerializer.Serialize(value, type, options); ResourceTests.Equal(JsonSerializer.Deserialize(json, type, options), value); }
            try { JsonSerializer.Serialize(Enum.ToObject(type, 999), type, options); throw new Exception("Unknown enum value accepted"); } catch (JsonException) { }
        }
        try { JsonSerializer.Deserialize<TemplateDefinitionVersion>("2", options); throw new Exception("Template version accepted"); } catch (JsonException) { }
        var directory = new DirectoryInfo(AppContext.BaseDirectory); while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "tests/type-fixtures/invalid/Invalid.csproj"))) directory = directory.Parent;
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = directory!.FullName, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var argument in new[] { "build", "tests/type-fixtures/invalid/Invalid.csproj", "--nologo", "--configuration", "Release", "--verbosity", "quiet" }) start.ArgumentList.Add(argument);
        using var process = Process.Start(start)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync(); await process.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(1));
        ResourceTests.True(process.ExitCode != 0); var compiler = await output + await error; ResourceTests.True(compiler.Contains("CS1503", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("TemplateTextHeader", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("ElevenLabsTtsModel", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("OpenAiTtsVoice", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("TemplateDefinitionVersion", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("TemplateVariableType", StringComparison.Ordinal));
        ResourceTests.True(compiler.Contains("CS1061", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("WhatsAppEncryptedUploadBody", StringComparison.Ordinal)); ResourceTests.True(compiler.Contains("MediaKey", StringComparison.Ordinal));
        Console.WriteLine("PASS provider-specific voice, constrained templates, ciphertext-only custom transport types, invalid JSON refusal and compiler-negative fixtures");
    }
}
