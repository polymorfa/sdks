using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = await project.Campaigns.LaunchAsync("c", new LaunchPlatformCampaignRequest("p"));
        await Task.CompletedTask;
    }
}
