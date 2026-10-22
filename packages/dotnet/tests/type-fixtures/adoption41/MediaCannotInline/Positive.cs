using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new DirectHistorySyncMediaPayload(new("wa", null), "FULL", 0, new("/x", "key", "plain", "encrypted"));
        await Task.CompletedTask;
    }
}
