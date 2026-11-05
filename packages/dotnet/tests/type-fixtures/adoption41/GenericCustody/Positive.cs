using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new SessionConfigurationOverrides(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor));
        await Task.CompletedTask;
    }
}
