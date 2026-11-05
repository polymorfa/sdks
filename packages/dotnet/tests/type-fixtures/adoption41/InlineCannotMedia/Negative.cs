using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new DirectHistorySyncInlinePayload(new("wa", null), "FULL", 0, new("data")) { Media = new DirectHistoryMedia("/x", "key", "plain", "encrypted") };
        await Task.CompletedTask;
    }
}
