using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using static Adoption41Fixtures;
using static CampaignExistingTests;

internal static class Configuration41Tests
{
    internal static async Task RunAsync()
    {
        foreach (var source in new[] { "platform", "team", "project", "session" })
        {
            var config = Config.Replace("\"historySync.delivery\":\"platform\"", "\"historySync.delivery\":\"" + source + "\"");
            await Organization("GET", "/platform/session-configuration", null, Envelope(config, false), async c =>
            {
                var r = (await c.Configuration.RetrieveAsync(new() { ApiVersion = "2026-10-14" })).Data;
                Check(r.RequestedHistory.Delivery == HistorySyncDelivery.Descriptor && r.Effective.HistorySync.Mode == "metadata_only" && r.Sources.HistorySyncMode == "consent" && r.Revisions.Team == 0 && r.Sources.HistorySyncDelivery is not null, "Delivery and consent fields");
            }, version: "2026-10-14");
        }
        var legacy = Config.Replace(",\"delivery\":\"descriptor\"", "").Replace("\"overrides\":{\"historySync\":{\"delivery\":\"descriptor\"}}", "\"overrides\":{}").Replace(",\"historySync.delivery\":\"platform\"", "");
        await Organization("GET", "/platform/session-configuration", null, Envelope(legacy, false), async c => Check((await c.Configuration.RetrieveAsync()).Data.RequestedHistory.Delivery is null, "Legacy GET"));
        await Organization("GET", "/platform/session-configuration", null, Envelope(Config.Replace("descriptor", "archive").Replace("\"overrides\":{\"historySync\":{\"delivery\":\"archive\"}}", "\"overrides\":{}"), false), async c => Check((await c.Configuration.RetrieveAsync(new() { ApiVersion = "2026-10-14" })).Data.Effective.HistorySync.Delivery == HistorySyncDelivery.Archive, "Archive read"), version: "2026-10-14");
        foreach (var patch in new[] { new SessionConfigurationPatch(Set: new(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor))), new SessionConfigurationPatch(Reset: ["historySync.delivery"]) })
        {
            var expected = patch.Set is not null ? "{\"configuration\":{\"set\":{\"historySync\":{\"delivery\":\"descriptor\"}}},\"revision\":0}" : "{\"configuration\":{\"reset\":[\"historySync.delivery\"]},\"revision\":0}";
            await Organization("PUT", "/platform/session-configuration", expected, Envelope(Config, false), async c => Check((await c.Configuration.UpdateAsync(new(patch, 0))).Data.Revisions.Session == 0, "Configuration revision0"), version: "2026-10-14");
            await Organization("PUT", "/platform/session-configuration", expected, "{\"error\":{\"code\":\"invalid_parameter\",\"message\":\"Explicit old contract\"}}", async c => { try { await c.Configuration.UpdateAsync(new(patch, 0), new() { ApiVersion = "2026-09-22" }); throw new Exception("Old override lost"); } catch (PolymorfaValidationException e) { Check(e.Status == 400, "Old version error preserved"); } }, 400);
        }
        await Organization("PUT", "/platform/session-configuration", "{\"configuration\":{\"reset\":[\"historySync\"]},\"revision\":0}", Envelope(Config, false), async c => { await c.Configuration.UpdateAsync(new(new(Reset: ["historySync"]), 0)); });
        foreach (var mode in new[] { "standard", "zero_knowledge" })
            await Organization("GET", "/platform/sessions/s", null, Envelope(SessionJson.Replace("zero_knowledge", mode)), async c => Check((await c.Sessions.RetrieveAsync("s")).Data.Data.SignalMode is not null, "Immutable fact"));
        await Organization("GET", "/platform/sessions/s", null, Envelope(Change(SessionJson, "signalMode", null, true)), async c => Check((await c.Sessions.RetrieveAsync("s")).Data.Data.SignalMode is null, "Legacy optional fact"));
        await Organization("GET", "/platform/sessions/s", null, Envelope(Change(SessionJson, "signalMode", null)), c => InvalidResponse(async () => { await c.Sessions.RetrieveAsync("s"); }));
        var update = new UpdateSessionRequest(new(Set: new(HistorySync: new(Delivery: HistorySyncDeliveryOverride.Descriptor))), 0);
        foreach (var messaging in new[] { false, true })
        {
            var expected = "{\"configuration\":{\"set\":{\"historySync\":{\"delivery\":\"descriptor\"}}},\"revision\":0}";
            if (messaging) await Messaging("PUT", "/platform/sessions/s", expected, Envelope(SessionJson), async c => { await c.Sessions.UpdateAsync("s", update); }, version: "2026-10-14");
            else await Organization("PUT", "/platform/sessions/s", expected, Envelope(SessionJson), async c => { await c.Sessions.UpdateAsync("s", update); }, version: "2026-10-14");
        }
        foreach (var config in new[] { Config.Replace("\"historySync.delivery\":\"platform\"", "\"historySync.delivery\":\"consent\""), Config.Replace("\"delivery\":\"descriptor\"", "\"delivery\":null") })
            await Organization("GET", "/platform/session-configuration", null, Envelope(config, false), c => InvalidResponse(async () => { await c.Configuration.RetrieveAsync(); }));
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
        await Messaging("POST", "/messaging/quicklinks", "{\"purpose\":\"add_connection\",\"session\":\"s\",\"connectionGoal\":\"hybrid\",\"addConnection\":\"linked_devices\"}", Envelope(QuickLinkJson.Replace("initial", "add_connection")), async c => { await c.QuickLinks.CreateAsync(new(Purpose: "add_connection", Session: "s", AddConnection: "linked_devices", ConnectionGoal: "hybrid")); });
        foreach (var body in new[] { new CreateQuickLinkRequest(Session: "s"), new CreateQuickLinkRequest(AddConnection: "linked_devices"), new CreateQuickLinkRequest(Purpose: "reauthorization"), new CreateQuickLinkRequest(Purpose: "add_connection", Session: "s"), new CreateQuickLinkRequest(Purpose: "add_connection", Session: "s", AddConnection: "linked_devices", SignalMode: SignalCustodyMode.Standard), new CreateQuickLinkRequest(Purpose: "add_connection", Session: "s", AddConnection: "linked_devices", CustomerId: Project), new CreateQuickLinkRequest(Purpose: "add_connection", Session: "s", AddConnection: "linked_devices", ExternalId: "external"), new CreateQuickLinkRequest(Purpose: "add_connection", Session: "s", AddConnection: "linked_devices", ConnectionGoal: "single"), new CreateQuickLinkRequest(SignalMode: PatchValue<SignalCustodyMode?>.Set(null)), new CreateQuickLinkRequest(Configuration: new(HistorySync: new(Delivery: PatchValue<HistorySyncDeliveryOverride?>.Set(null)))) })
            await NoHttp(async (c, _) => { await c.QuickLinks.CreateAsync(body); });
        foreach (var alias in new[] { "signalMode", "zeroKnowledge", "signal_mode", "signalModeDefault", "signalRelay" })
        {
            try { JsonSerializer.Deserialize<QuickLinkConfiguration>("{\"" + alias + "\":false}", new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }); throw new Exception("Reserved alias accepted"); } catch (JsonException) { Check(true, "Closed configuration"); }
        }
        Console.WriteLine("PASS configuration41 actual GET/update and QuickLinkJson branch/version controls");
    }
}
