using Polymorfa.Sdk;

internal static class BillingTests
{
    private const string Id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    private const string Budget = "{\"scope\":\"project\",\"resourceId\":\"" + Id + "\",\"projectId\":\"" + Id + "\",\"name\":\"Support\",\"limitCredits\":null,\"spentCredits\":1.123456,\"reservedCredits\":0.25,\"revision\":2}";
    private const string Controls = "{\"data\":{\"budget\":" + Budget + ",\"priority\":3,\"priorityRevision\":4}}";
    private const string Priorities = "{\"data\":{\"revision\":4,\"projects\":[{\"id\":\"" + Id + "\",\"name\":\"Support\",\"priority\":3}],\"customers\":[],\"numbers\":[]}}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/billing", null, "{\"data\":{\"balanceCents\":1234,\"preferredCurrency\":\"USD\"}}", async c => ResourceTests.Equal((await c.Billing.RetrieveAsync()).Data.Data.BalanceCents, 1234L));
        await Organization("GET", "/platform/billing/usage", null, "{\"data\":{\"activeNumbers\":2,\"totalChargedCents\":35}}", async c => ResourceTests.Equal((await c.Billing.UsageAsync()).Data.Data.TotalChargedCents, 35L));
        await Organization("GET", "/platform/billing/transactions", null, "{\"data\":[{\"id\":\"tx\",\"amountCents\":25,\"balanceAfterCents\":1234,\"type\":\"credit\",\"description\":\"Top up\",\"sessionId\":null,\"projectId\":null,\"tier\":null,\"currency\":\"USD\",\"paymentStatus\":\"paid\",\"createdAt\":42}]}", async c => ResourceTests.Equal((await c.Billing.ListTransactionsAsync()).Data.Data[0].PaymentStatus, "paid"));
        await Organization("GET", "/platform/billing/pricing", null, "{\"data\":[{\"id\":\"tier\",\"tier\":\"standard\",\"dailyRateCents\":10,\"label\":\"Standard\",\"description\":\"Number\",\"features\":[\"messaging\"]}]}", async c => ResourceTests.Equal((await c.Billing.ListPricingAsync()).Data.Data[0].Features[0], "messaging"));
        await Organization("GET", "/platform/billing/controls/project/" + Id, null, Controls, async c => ResourceTests.Equal((await c.Billing.GetResourceControlsAsync("project", Id.ToUpperInvariant())).Data.Data.Budget.SpentCredits, 1.123456m));
        await Organization("PUT", "/platform/billing/controls/project/" + Id, "{\"limitCredits\":null,\"priority\":3,\"expectedBudgetRevision\":1,\"expectedPriorityRevision\":2}", Controls, async c => ResourceTests.Equal((await c.Billing.SetResourceControlsAsync("project", Id, new(null, 3, 1, 2))).Data.Data.PriorityRevision, 4L));
        await Organization("GET", "/platform/billing/limits?projectId=" + Id + "&scope=project", null, "{\"data\":{\"checkedAt\":\"2026-09-22\",\"periodStart\":\"2026-09-01\",\"periodEnd\":\"2026-10-01\",\"todayCredits\":1.123456,\"monthCredits\":2,\"daily\":[{\"date\":\"2026-09-22\",\"credits\":1.123456}],\"budgets\":[" + Budget + "]}}", async c => ResourceTests.Equal((await c.Billing.GetLimitsAsync(new(Id, "project"))).Data.Data.Daily[0].Credits, 1.123456m));
        await Organization("PUT", "/platform/billing/limits/project/" + Id, "{\"limitCredits\":1.123456,\"expectedRevision\":1}", "{\"data\":{\"saved\":true}}", async c => ResourceTests.True((await c.Billing.SetLimitAsync("project", Id, new(1.123456m, 1))).Data.Data.Saved));
        await Organization("GET", "/platform/billing/priorities?projectId=" + Id, null, Priorities, async c => ResourceTests.Equal((await c.Billing.GetPrioritiesAsync(new(Id))).Data.Data.Projects[0].Priority, 3));
        await Organization("PUT", "/platform/billing/priorities/project/" + Id, "{\"priority\":3,\"expectedRevision\":2}", Priorities, async c => ResourceTests.Equal((await c.Billing.SetPriorityAsync("project", Id, new(3, 2))).Data.Data.Revision, 4L));
        await Organization("PUT", "/platform/billing/priorities", "{\"scope\":\"project\",\"expectedRevision\":3,\"resourceIds\":[\"" + Id + "\"]}", Priorities, async c => ResourceTests.Equal((await c.Billing.ReorderPrioritiesAsync(new("project", 3, ResourceIds: [Id]))).Data.Data.Revision, 4L));
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        await Invalid(() => client.Billing.SetLimitAsync("project", Id, new(0.0000001m, 1)));
        await Invalid(() => client.Billing.SetLimitAsync("project", Id, new(-1, 1)));
        await Invalid(() => client.Billing.SetPriorityAsync("project", Id, new(1000001, 1)));
        await Invalid(() => client.Billing.SetLimitAsync("invalid", Id, new(null, 1)));
        await Invalid(() => client.Billing.ReorderPrioritiesAsync(new("project", 1, ResourceIds: [Id, Id])));
        Console.WriteLine("PASS 11 typed billing routes, decimal precision, null clearing and validation");
    }
    internal static async Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke)
    {
        var key = "pmfa_" + new string('a', 72);
        using var fixture = new WireFixture { Authorization = "Bearer " + key };
        var serving = fixture.ServeAsync(method, path, body, response);
        using var client = new OrganizationClient(Credential.OrganizationApiKey(key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0, Timeout = TimeSpan.FromSeconds(3) });
        try { await invoke(client); await serving; } catch { await serving; throw; }
    }
    private static async Task Invalid(Func<Task> action) { try { await action(); } catch (PolymorfaValidationException) { return; } throw new Exception("Expected preflight billing validation."); }
}
