using System.Text.Json;

namespace Polymorfa.Sdk;

internal static class ConfigurationContract
{
    private static void Invalid(string field) => throw new PolymorfaConfigurationException("Invalid configuration field: " + field + ".");
    internal static JsonElement Capture(object body, SessionConfigurationPatch patch, out bool intent)
    {
        var value = CampaignContractValidation.Capture(body);
        var configuration = value.GetProperty("configuration");
        CampaignContractValidation.Fields(configuration, ["set", "reset"], []);
        intent = false;
        if (configuration.TryGetProperty("set", out var set))
        {
            CampaignContractValidation.Fields(set, ["historySync", "observation", "hms"], []);
            if (set.TryGetProperty("historySync", out var history)) { History(history, false); intent = history.TryGetProperty("delivery", out _); }
        }
        if (configuration.TryGetProperty("reset", out var reset))
        {
            if (reset.ValueKind != JsonValueKind.Array) Invalid("reset");
            foreach (var item in reset.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.String || item.GetString() is not ("historySync" or "historySync.mode" or "historySync.requestFull" or "historySync.delivery" or "observation" or "observation.presenceMode" or "observation.typingMode" or "observation.labelMode" or "observation.quickReplyMode" or "hms" or "hms.enabled" or "hms.region" or "hms.policy" or "hms.retentionDays" or "hms.policyVersion" or "hms.legalHold")) Invalid("reset");
                if (item.GetString() == "historySync.delivery") intent = true;
            }
        }
        return value;
    }
    private static void History(JsonElement history, bool quicklink)
    {
        CampaignContractValidation.Fields(history, quicklink ? ["mode", "requestFull", "delivery", "consent"] : ["mode", "requestFull", "delivery"], []);
        if (history.TryGetProperty("delivery", out var delivery) && (delivery.ValueKind != JsonValueKind.String || delivery.GetString() != "descriptor")) Invalid("historySync.delivery");
        if (history.TryGetProperty("mode", out var mode) && (mode.ValueKind != JsonValueKind.String || mode.GetString() is not ("off" or "metadata_only" or "deliver"))) Invalid("historySync.mode");
        if (history.TryGetProperty("requestFull", out var full) && full.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) Invalid("historySync.requestFull");
    }
    internal static JsonElement QuickLink(CreateQuickLinkRequest body, out bool intent)
    {
        var value = CampaignContractValidation.Capture(body);
        CampaignContractValidation.Fields(value, ["purpose", "session", "projectId", "customerId", "externalId", "connectionGoal", "addConnection", "configuration", "billingControls", "signalMode"], []);
        var purpose = body.Purpose ?? "initial";
        if (purpose is not ("initial" or "add_connection")) Invalid("purpose");
        if (purpose == "add_connection")
        {
            if (string.IsNullOrEmpty(body.Session) || body.AddConnection is not ("linked_devices" or "official_api") || body.CustomerId is not null || body.ExternalId is not null || body.BillingControls is not null || body.SignalMode.IsSpecified || body.ConnectionGoal is not (null or "hybrid")) Invalid("add_connection");
        }
        else if (body.Session is not null || body.AddConnection is not null) Invalid("initial");
        intent = false;
        if (value.TryGetProperty("signalMode", out var mode))
        {
            if (mode.ValueKind != JsonValueKind.String || mode.GetString() is not ("standard" or "zero_knowledge")) Invalid("signalMode");
            intent = true;
        }
        if (value.TryGetProperty("configuration", out var config))
        {
            CampaignContractValidation.Fields(config, ["connectionPreference", "connectionEnforcement", "methods", "defaultMethod", "prefillPhone", "allowPhoneChange", "historySync", "observation", "hms", "testing"], []);
            if (config.TryGetProperty("historySync", out var history)) { History(history, true); intent |= history.TryGetProperty("delivery", out _); }
        }
        return value;
    }
}
