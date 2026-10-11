using Polymorfa.Sdk;
using static BillingTests;

internal static class CallConsentTests
{
    private const string Retention = "{\"data\":{\"policy\":\"custom\",\"retentionDays\":30,\"appliesTo\":[\"recordings\",\"transcripts\"],\"revision\":2,\"updatedAt\":null}}";
    private const string Policy = "{\"data\":{\"blockedCountryCodes\":[\"1\"],\"optOutCount\":2,\"revision\":3,\"updatedAt\":null}}";
    private const string OptOut = "{\"id\":\"opt\",\"phoneNumber\":\"+15551234567\",\"bsuid\":null,\"note\":\"Request\",\"source\":\"api\",\"createdAt\":\"2026-09-22\"}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/call-retention", null, Retention, async c => ResourceTests.Equal((await c.CallRetention.RetrieveAsync()).Data.RetentionDays, 30));
        await Organization("PUT", "/platform/call-retention", "{\"policy\":\"custom\",\"retentionDays\":30,\"expectedRevision\":1}", Retention, async c => ResourceTests.Equal((await c.CallRetention.UpdateAsync(new("custom", 30, 1))).Data.AppliesTo[0], "recordings"));
        await Organization("GET", "/platform/call-policy", null, Policy, async c => ResourceTests.Equal((await c.CallPolicy.RetrieveAsync()).Data.OptOutCount, 2L));
        await Organization("PUT", "/platform/call-policy", "{\"blockedCountryCodes\":[\"1\"],\"expectedRevision\":2}", Policy, async c => ResourceTests.Equal((await c.CallPolicy.UpdateAsync(new(["1"], 2))).Data.Revision, 3L));
        await Organization("GET", "/platform/call-opt-outs?limit=10&phoneNumber=%2B15551234567", null, "{\"data\":[" + OptOut + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.CallOptOuts.ListAsync(new(Limit: 10, PhoneNumber: "+15551234567"))).Items[0].Note, "Request"));
        await Organization("POST", "/platform/call-opt-outs", "{\"phoneNumber\":\"+15551234567\",\"note\":\"Request\"}", "{\"data\":" + OptOut + "}", async c => ResourceTests.Equal((await c.CallOptOuts.CreateAsync(new(PhoneNumber: "+15551234567", Note: "Request"))).Data.Source, "api"));
        await Organization("POST", "/platform/call-opt-outs/import", "{\"entries\":[{\"bsuid\":\"peer\"}]}", "{\"data\":{\"added\":1,\"existing\":2,\"rejected\":[{\"index\":3,\"reason\":\"invalid_bsuid\"}]}}", async c => ResourceTests.Equal((await c.CallOptOuts.ImportAsync(new([new(Bsuid: "peer")]))).Data.Rejected[0].Reason, "invalid_bsuid"));
        await Organization("DELETE", "/platform/call-opt-outs/opt", null, "{\"data\":{\"id\":\"opt\",\"deleted\":true}}", async c => ResourceTests.True((await c.CallOptOuts.DeleteAsync("opt")).Data.Deleted));
        Console.WriteLine("PASS 8 typed team call retention, policy and opt-out routes");
    }
}
