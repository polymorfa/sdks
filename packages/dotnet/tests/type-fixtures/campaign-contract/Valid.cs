using Polymorfa.Sdk;
internal static class Fixture
{
    private static void Variable(CampaignVariableValue value) { }
    private static void Attribute(AudienceProfileAttributeValue value) { }
    internal static async Task Check(ProjectClient project, TeamClient team)
    {
        _ = team.AudienceProfiles;
        _ = team.Audiences;
        _ = team.OptOuts;
        _ = await team.Campaigns.GetSettingsAsync();
        _ = await project.Campaigns.GetReplyFlowAsync("11111111-1111-4111-8111-111111111111");
        _ = new CreateCampaignReplyFlowRequest("name", new("entry", []));
        _ = project.ProjectId;
        _ = new RequestOptions { ApiVersion = "2026-10-14" };
        Variable("text"); Variable(1d); Variable(false);
        Attribute("text"); Attribute(1d); Attribute(false); Attribute(AudienceProfileAttributeValue.Null);
        _ = new ProjectSignalCustodyUpdate(0, SignalCustodyMode.Standard);
        _ = new CustomerSignalCustodyUpdate(0, null);
        ApiResponse<SignalCustodyDefault> response = await project.SignalCustody.RetrieveAsync();
        _ = response.Data.EffectiveSignalMode;
        await Task.CompletedTask;
    }
}
