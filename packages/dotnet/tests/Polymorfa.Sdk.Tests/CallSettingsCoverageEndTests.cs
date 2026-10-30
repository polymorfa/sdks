using System.Text.Json;
using Polymorfa.Sdk;
using static ResourceTests;

internal static class CallSettingsCoverageEndTests
{
    public static async Task RunAsync()
    {
        var old = new SessionCallSettings(true, false, "clients", null, false, false, 2, null, false);
        var (enabled, conference, route, trunk, claim, hosted, revision, updated, simultaneous) = old;
        ResourceTests.Equal(revision, 2L);
        ResourceTests.Equal(old.SimultaneousCallsCoverageExcludedUntil, null);
        foreach (var item in new (bool On, string? Until)[] { (false, "2026-11-22T12:34:56.789Z"), (true, null), (false, null) })
            foreach (var method in new[] { "GET", "PUT" })
            {
                var until = item.Until;
                var data = new { callsEnabled = true, conferenceMode = false, inboundRoute = "clients", sipTrunkId = (string?)null, sipClaim = false, hostCloudApiCalls = false, revision = 2, updatedAt = (string?)null, simultaneousCalls = item.On, simultaneousCallsCoverageExcludedUntil = until };
                var response = JsonSerializer.Serialize(new { success = true, data });
                await Messaging(method, "/platform/sessions/s/call-settings", method == "GET" ? null : "{\"callsEnabled\":false}", response, async c =>
                {
                    var value = method == "GET" ? await c.Calls.RetrieveCallSettingsAsync("s") : await c.Calls.UpdateCallSettingsAsync("s", new(CallsEnabled: false));
                    ResourceTests.Equal(value.Data.Data.SimultaneousCallsCoverageExcludedUntil, until);
                    ResourceTests.Equal(value.Data.Data.Revision, 2L);
                    using var roundtrip = JsonDocument.Parse(JsonSerializer.Serialize(value.Data.Data, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
                    ResourceTests.Equal(roundtrip.RootElement.GetProperty("simultaneousCallsCoverageExcludedUntil").GetString(), until);
                });
            }
        True(typeof(UpdateCallSettingsRequest).GetProperty("SimultaneousCallsCoverageExcludedUntil") is null);
    }
}
