using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new StickerContent(new MediaContent(Url: "https://example.test"));
        await Task.CompletedTask;
    }
}
