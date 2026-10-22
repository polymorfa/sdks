using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new StickerContent(new WhatsAppMediaSendDescriptor("/x", new byte[32], new byte[32], new byte[32], 1, "image/webp", "https://example.test"));
        await Task.CompletedTask;
    }
}
