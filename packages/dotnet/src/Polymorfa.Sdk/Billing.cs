using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record BillingBalance(decimal BalanceCents, string PreferredCurrency);
public sealed record BillingUsage(long ActiveNumbers, decimal TotalChargedCents);
public sealed record BillingTransaction(string Id, decimal AmountCents, decimal BalanceAfterCents, string Type, string Description, string? SessionId, string? ProjectId, string? Tier, string? Currency, string PaymentStatus, long CreatedAt);
public sealed record TierPricing(string Id, string Tier, decimal DailyRateCents, string Label, string Description, IReadOnlyList<string> Features);
public sealed record BillingPriority(string Id, string Name, int Priority);
public sealed record ProjectResourcePriority(string Id, string Name, int Priority, string ProjectId);
public sealed record BillingPriorities(long Revision, IReadOnlyList<BillingPriority> Projects, IReadOnlyList<ProjectResourcePriority> Customers, IReadOnlyList<ProjectResourcePriority> Numbers);
public sealed record BillingLimit(string Scope, string ResourceId, string ProjectId, string Name, decimal? LimitCredits, decimal SpentCredits, decimal ReservedCredits, long Revision);
public sealed record DailyCredits(string Date, decimal Credits);
public sealed record BillingLimits(string CheckedAt, string PeriodStart, string PeriodEnd, decimal TodayCredits, decimal MonthCredits, IReadOnlyList<DailyCredits> Daily, IReadOnlyList<BillingLimit> Budgets);
public sealed record ResourceBillingControls(BillingLimit Budget, int Priority, long PriorityRevision);
public sealed record BillingReadParameters(string? ProjectId = null, string? Scope = null);
public sealed record SetBillingLimitRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? LimitCredits, long ExpectedRevision);
public sealed record SetBillingPriorityRequest(int Priority, long ExpectedRevision);
public sealed record SetResourceBillingControlsRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? LimitCredits, int Priority, long ExpectedBudgetRevision, long ExpectedPriorityRevision);
public sealed record SavedResult(bool Saved);
public sealed record BillingResourceOrder(string Scope, string ResourceId);
public sealed record ReorderBillingPrioritiesRequest(string Scope, long ExpectedRevision, string? ProjectId = null, IReadOnlyList<string>? ResourceIds = null, IReadOnlyList<BillingResourceOrder>? Resources = null);
public sealed class Billing : Resource
{
    internal Billing(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<BillingBalance>>> RetrieveAsync(RequestOptions? options = null) => Get<DataEnvelope<BillingBalance>>("/platform/billing", options);
    public Task<ApiResponse<DataEnvelope<BillingUsage>>> UsageAsync(RequestOptions? options = null) => Get<DataEnvelope<BillingUsage>>("/platform/billing/usage", options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<BillingTransaction>>>> ListTransactionsAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<BillingTransaction>>>("/platform/billing/transactions", options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<TierPricing>>>> ListPricingAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<TierPricing>>>("/platform/billing/pricing", options);
    public Task<ApiResponse<DataEnvelope<ResourceBillingControls>>> GetResourceControlsAsync(string scope, string resourceId, RequestOptions? options = null) => Get<DataEnvelope<ResourceBillingControls>>(Path("controls", scope, resourceId), options);
    public Task<ApiResponse<DataEnvelope<ResourceBillingControls>>> SetResourceControlsAsync(string scope, string resourceId, SetResourceBillingControlsRequest body, RequestOptions? options = null)
    {
        Limit(body.LimitCredits); Priority(body.Priority); Revision(body.ExpectedBudgetRevision); Revision(body.ExpectedPriorityRevision);
        return Put<DataEnvelope<ResourceBillingControls>>(Path("controls", scope, resourceId), body, options);
    }
    public Task<ApiResponse<DataEnvelope<BillingLimits>>> GetLimitsAsync(BillingReadParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<BillingLimits>>("/platform/billing/limits", options, Read(parameters));
    public Task<ApiResponse<DataEnvelope<SavedResult>>> SetLimitAsync(string scope, string resourceId, SetBillingLimitRequest body, RequestOptions? options = null) { Limit(body.LimitCredits); Revision(body.ExpectedRevision); return Put<DataEnvelope<SavedResult>>(Path("limits", scope, resourceId), body, options); }
    public Task<ApiResponse<DataEnvelope<BillingPriorities>>> GetPrioritiesAsync(BillingReadParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<BillingPriorities>>("/platform/billing/priorities", options, Read(parameters));
    public Task<ApiResponse<DataEnvelope<BillingPriorities>>> SetPriorityAsync(string scope, string resourceId, SetBillingPriorityRequest body, RequestOptions? options = null) { Priority(body.Priority); Revision(body.ExpectedRevision); return Put<DataEnvelope<BillingPriorities>>(Path("priorities", scope, resourceId), body, options); }
    public Task<ApiResponse<DataEnvelope<BillingPriorities>>> ReorderPrioritiesAsync(ReorderBillingPrioritiesRequest body, RequestOptions? options = null)
    {
        Revision(body.ExpectedRevision);
        if (body.Scope == "resource")
        {
            var resources = body.Resources ?? throw Invalid("resources is required.");
            if (body.ResourceIds is not null || resources.Count > 1000000) throw Invalid("Invalid resource ordering.");
            var normalized = resources.Select(row => row.Scope is "customer" or "number" ? new BillingResourceOrder(row.Scope, Id(row.ResourceId)) : throw Invalid("Resource scope must be customer or number.")).ToArray();
            if (normalized.Distinct().Count() != normalized.Length) throw Invalid("Resources must be unique.");
            return Put<DataEnvelope<BillingPriorities>>("/platform/billing/priorities", body with { ProjectId = Id(body.ProjectId!), Resources = normalized }, options);
        }
        Scope(body.Scope);
        var ids = (body.ResourceIds ?? throw Invalid("resourceIds is required.")).Select(Id).ToArray();
        if (body.Resources is not null || ids.Distinct().Count() != ids.Length) throw Invalid("Resource IDs must be unique.");
        return Put<DataEnvelope<BillingPriorities>>("/platform/billing/priorities", body with { ResourceIds = ids, ProjectId = body.Scope == "project" ? null : Id(body.ProjectId!) }, options);
    }
    private static string Path(string group, string scope, string id) { Scope(scope); return $"/platform/billing/{group}/{scope}/{Id(id)}"; }
    private static BillingReadParameters? Read(BillingReadParameters? parameters)
    {
        if (parameters?.Scope is not null && parameters.Scope != "project") throw Invalid("Read scope must be project.");
        return parameters?.ProjectId is null ? parameters : parameters with { ProjectId = Id(parameters.ProjectId) };
    }
    internal static string Id(string value) { if (value is null || !Regex.IsMatch(value, "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")) throw Invalid("Resource ID must be a UUID."); return value.ToLowerInvariant(); }
    internal static void Scope(string value) { if (value is not ("project" or "customer" or "number")) throw Invalid("Scope must be project, customer, or number."); }
    internal static void Revision(long value) { if (value is < 0 or > 2147483646) throw Invalid("Invalid expected revision."); }
    internal static void Priority(int value) { if (value is < 0 or > 1000000) throw Invalid("Priority must be between 0 and 1000000."); }
    internal static void Limit(decimal? value) { if (value is < 0 or > 1000000 || value is decimal number && decimal.Round(number, 6) != number) throw Invalid("Credit limits require at most six decimal places and must be between 0 and 1000000."); }
    private static PolymorfaValidationException Invalid(string message) => new(message, "invalid_billing_control");
}
