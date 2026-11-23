using Polymorfa.Sdk;
internal static class Fixture
{
    internal static async Task Check(ProjectClient project, MessageResponse message, WhatsAppEncryptedUploadBody body)
    {
        _ = new ConnectionConfigurationOverrides(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor));
        await Task.CompletedTask;
    }
}
