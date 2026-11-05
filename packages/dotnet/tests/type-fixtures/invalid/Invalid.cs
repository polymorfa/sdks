using Polymorfa.Sdk;
public static class Invalid
{
    public static void CompileFailures()
    {
        _ = new OpenAiVoiceAudioInput("Greeting", "Hello", OpenAiTtsVoice.Alloy, ElevenLabsTtsModel.FlashV25);
        _ = new OpenAiVoiceAudioInput("Greeting", "Hello", "arbitrary_voice");
        _ = new TemplateCarouselCard(new TemplateTextHeader("No media"), "Card");
        _ = new TemplateDefinition(2, "arbitrary", "arbitrary", "en_US", "Hello", []);
        _ = new TemplateVariable("x", "arbitrary", "value");
    }
}
