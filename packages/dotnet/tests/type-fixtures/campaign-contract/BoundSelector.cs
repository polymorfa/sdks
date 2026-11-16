using Polymorfa.Sdk;
internal static class Fixture
{
    private static void Variable(CampaignVariableValue value) { }
    private static void Attribute(AudienceProfileAttributeValue value) { }
    internal static async Task Check(ProjectClient project, TeamClient team)
    {
        _ = await project.Campaigns.GetReplyFlowAsync("id", projectId: "foreign");
        await Task.CompletedTask;
    }
}
