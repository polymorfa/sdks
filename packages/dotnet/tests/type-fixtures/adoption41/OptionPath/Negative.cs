using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new RequestOptions { Path = "/replacement" };
        await Task.CompletedTask;
    }
}
