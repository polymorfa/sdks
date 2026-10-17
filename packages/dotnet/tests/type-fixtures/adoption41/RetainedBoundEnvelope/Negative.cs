using Polymorfa.Sdk;
internal static class Fixture
{
    private static void Variable(CampaignVariableValue value) { }
    private static void Attribute(AudienceProfileAttributeValue value) { }
    internal static async Task Check(ProjectClient project, OrganizationClient organization)
    {
        ApiResponse<DataEnvelope<SignalCustodyDefault>> response = await project.SignalCustody.RetrieveAsync(); _ = response;
        await Task.CompletedTask;
    }
}
