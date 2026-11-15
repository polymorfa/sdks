using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using static Adoption41Fixtures;
using static CampaignExistingTests;

internal static class Configuration41Tests
{
    internal static async Task RunAsync()
    {
        foreach (var source in new[] { "platform", "team", "project", "connection" })
        {
            var config = Config.Replace("\"historySync.delivery\":\"platform\"", "\"historySync.delivery\":\"" + source + "\"");
            await Team("GET", "/platform/connection-configuration", null, Envelope(config, false), async c =>
            {
                var r = (await c.Configuration.RetrieveAsync(new() { ApiVersion = "2026-10-14" })).Data;
                Check(r.RequestedHistory.Delivery == HistorySyncDelivery.Descriptor && r.Effective.HistorySync.Mode == "metadata_only" && r.Sources.HistorySyncMode == "consent" && r.Revisions.Team == 0 && r.Sources.HistorySyncDelivery is not null, "Delivery and consent fields");
            }, version: "2026-10-14");
        }
        var legacy = Config.Replace(",\"delivery\":\"descriptor\"", "").Replace("\"overrides\":{\"historySync\":{\"delivery\":\"descriptor\"}}", "\"overrides\":{}").Replace(",\"historySync.delivery\":\"platform\"", "");
        await Team("GET", "/platform/connection-configuration", null, Envelope(legacy, false), async c => Check((await c.Configuration.RetrieveAsync()).Data.RequestedHistory.Delivery is null, "Legacy GET"));
        await Team("GET", "/platform/connection-configuration", null, Envelope(Config.Replace("descriptor", "archive").Replace("\"overrides\":{\"historySync\":{\"delivery\":\"archive\"}}", "\"overrides\":{}"), false), async c => Check((await c.Configuration.RetrieveAsync(new() { ApiVersion = "2026-10-14" })).Data.Effective.HistorySync.Delivery == HistorySyncDelivery.Archive, "Archive read"), version: "2026-10-14");
        foreach (var patch in new[] { new ConnectionConfigurationPatch(Set: new(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor))), new ConnectionConfigurationPatch(Reset: ["historySync.delivery"]) })
        {
            var expected = patch.Set is not null ? "{\"configuration\":{\"set\":{\"historySync\":{\"delivery\":\"descriptor\"}}},\"revision\":0}" : "{\"configuration\":{\"reset\":[\"historySync.delivery\"]},\"revision\":0}";
            await Team("PUT", "/platform/connection-configuration", expected, Envelope(Config, false), async c => Check((await c.Configuration.UpdateAsync(new(patch, 0))).Data.Revisions.Connection == 0, "Configuration revision0"), version: "2026-10-14");
            await Team("PUT", "/platform/connection-configuration", expected, "{\"error\":{\"code\":\"invalid_parameter\",\"message\":\"Explicit old contract\"}}", async c => { try { await c.Configuration.UpdateAsync(new(patch, 0), new() { ApiVersion = "2026-09-22" }); throw new Exception("Old override lost"); } catch (PolymorfaValidationException e) { Check(e.Status == 400, "Old version error preserved"); } }, 400);
        }
        await Team("PUT", "/platform/connection-configuration", "{\"configuration\":{\"reset\":[\"historySync\"]},\"revision\":0}", Envelope(Config, false), async c => { await c.Configuration.UpdateAsync(new(new(Reset: ["historySync"]), 0)); });
        foreach (var mode in new[] { "standard", "zero_knowledge" })
            await Team("GET", "/platform/connections/s", null, Envelope(ConnectionJson.Replace("zero_knowledge", mode)), async c => Check((await c.Connections.RetrieveAsync("s")).Data.Data.SignalMode is not null, "Immutable fact"));
        await Team("GET", "/platform/connections/s", null, Envelope(Change(ConnectionJson, "signalMode", null, true)), async c => Check((await c.Connections.RetrieveAsync("s")).Data.Data.SignalMode is null, "Legacy optional fact"));
        await Team("GET", "/platform/connections/s", null, Envelope(Change(ConnectionJson, "signalMode", null)), c => InvalidResponse(async () => { await c.Connections.RetrieveAsync("s"); }));
        var update = new UpdateConnectionRequest(new(Set: new(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor))), 0);
        foreach (var messaging in new[] { false, true })
        {
            var expected = "{\"configuration\":{\"set\":{\"historySync\":{\"delivery\":\"descriptor\"}}},\"revision\":0}";
            if (messaging) await Messaging("PUT", "/platform/connections/s", expected, Envelope(ConnectionJson), async c => { await c.Connections.UpdateAsync("s", update); }, version: "2026-10-14");
            else await Team("PUT", "/platform/connections/s", expected, Envelope(ConnectionJson), async c => { await c.Connections.UpdateAsync("s", update); }, version: "2026-10-14");
        }
        foreach (var config in new[] { Config.Replace("\"historySync.delivery\":\"platform\"", "\"historySync.delivery\":\"consent\""), Config.Replace("\"delivery\":\"descriptor\"", "\"delivery\":null") })
            await Team("GET", "/platform/connection-configuration", null, Envelope(config, false), c => InvalidResponse(async () => { await c.Configuration.RetrieveAsync(); }));
        await NoHttp(async (_, c) => { await c.Configuration.UpdateAsync(new(new(Set: new(HistorySync: new(Delivery: PatchValue<HistorySyncDeliveryOverride?>.Set(null)))), 0)); });
        await NoHttp(async (_, c) => { await c.Configuration.UpdateAsync(new(new(Set: new(HistorySync: new(Delivery: (HistorySyncDeliveryOverride)1))), 0)); });
        await Messaging("POST", "/messaging/quicklinks", "{}", Envelope(QuickLinkJson), async c => { await c.QuickLinks.CreateAsync(); });
        foreach (var mode in new[] { SignalCustodyMode.Standard, SignalCustodyMode.ZeroKnowledge })
        {
            var modeText = mode == SignalCustodyMode.Standard ? "standard" : "zero_knowledge";
            await Messaging("POST", "/messaging/quicklinks", "{\"signalMode\":\"" + modeText + "\"}", Envelope(QuickLinkJson), async c => { await c.QuickLinks.CreateAsync(new(SignalMode: mode)); }, version: "2026-10-14");
            await Messaging("POST", "/messaging/quicklinks", "{\"signalMode\":\"" + modeText + "\"}", Envelope(QuickLinkJson), async c => { await c.QuickLinks.CreateAsync(new(SignalMode: mode), new() { ApiVersion = "2026-09-22" }); });
        }
        await Messaging("POST", "/messaging/quicklinks", "{\"configuration\":{\"historySync\":{\"consent\":\"force_off\",\"delivery\":\"descriptor\"}}}", Envelope(QuickLinkJson), async c => { await c.QuickLinks.CreateAsync(new(Configuration: new(HistorySync: new(Consent: "force_off", Delivery: HistorySyncDeliveryOverride.Descriptor)))); }, version: "2026-10-14");
        await Messaging("POST", "/messaging/quicklinks", "{\"purpose\":\"add_method\",\"connection\":\"s\",\"connectionGoal\":\"hybrid\",\"addMethod\":\"linked_devices\"}", Envelope(QuickLinkJson.Replace("initial", "add_method")), async c => { await c.QuickLinks.CreateAsync(new(Purpose: "add_method", Connection: "s", AddMethod: "linked_devices", ConnectionGoal: "hybrid")); });
        foreach (var body in new[] { new CreateQuickLinkRequest(Connection: "s"), new CreateQuickLinkRequest(AddMethod: "linked_devices"), new CreateQuickLinkRequest(Purpose: "reauthorization"), new CreateQuickLinkRequest(Purpose: "add_method", Connection: "s"), new CreateQuickLinkRequest(Purpose: "add_method", Connection: "s", AddMethod: "linked_devices", SignalMode: SignalCustodyMode.Standard), new CreateQuickLinkRequest(Purpose: "add_method", Connection: "s", AddMethod: "linked_devices", CustomerId: Project), new CreateQuickLinkRequest(Purpose: "add_method", Connection: "s", AddMethod: "linked_devices", ExternalId: "external"), new CreateQuickLinkRequest(Purpose: "add_method", Connection: "s", AddMethod: "linked_devices", ConnectionGoal: "single"), new CreateQuickLinkRequest(SignalMode: PatchValue<SignalCustodyMode?>.Set(null)), new CreateQuickLinkRequest(Configuration: new(HistorySync: new(Delivery: PatchValue<HistorySyncDeliveryOverride?>.Set(null)))) })
            await NoHttp(async (c, _) => { await c.QuickLinks.CreateAsync(body); });
        foreach (var alias in new[] { "signalMode", "zeroKnowledge", "signal_mode", "signalModeDefault", "signalRelay" })
        {
            try { JsonSerializer.Deserialize<QuickLinkConfiguration>("{\"" + alias + "\":false}", new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }); throw new Exception("Reserved alias accepted"); } catch (JsonException) { Check(true, "Closed configuration"); }
        }
        Console.WriteLine("PASS configuration41 actual GET/update and QuickLinkJson branch/version controls");
    }
}
