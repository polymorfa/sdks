using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new RequestOptions { ApiVersion = "2026-10-14" };
        await Task.CompletedTask;
    }
}
