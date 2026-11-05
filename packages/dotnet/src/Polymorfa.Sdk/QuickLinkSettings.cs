using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record QuickLinkSettings(string Id, string? ProjectId, bool Enabled, string? SuccessCallbackUrl, string? FailureCallbackUrl, string? BusinessName, string? Headline, string? Description, string? SuccessMessage, string? SupportUrl, string? PrivacyUrl, string? TermsUrl, string? Accent, string Theme, bool HideWatermark, bool AllowPhoneChange, string? Shape, decimal? RadiusPx, string LogoMode, string? LogoStorageId, string? LogoSourceStorageId, string? LogoUrl, string HistorySync, IReadOnlyList<string>? Methods, string? DefaultMethod, long CreatedAt, long UpdatedAt);
public sealed record UpdateQuickLinkSettingsRequest
{
    public bool? Enabled { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> SuccessCallbackUrl { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> FailureCallbackUrl { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> BusinessName { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> Headline { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> Description { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> SuccessMessage { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> SupportUrl { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> PrivacyUrl { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> TermsUrl { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> Accent { get; init; }
    public string? Theme { get; init; }
    public bool? HideWatermark { get; init; }
    public bool? AllowPhoneChange { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> Shape { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<decimal?> RadiusPx { get; init; }
    public string? LogoMode { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> LogoStorageId { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> LogoSourceStorageId { get; init; }
    public string? HistorySync { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<IReadOnlyList<string>> Methods { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public PatchValue<string> DefaultMethod { get; init; }
}
public sealed class QuickLinkSettingsResource : Resource
{
    private readonly string? projectId;
    internal QuickLinkSettingsResource(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    public async Task<ApiResponse<QuickLinkSettings?>> RetrieveAsync(RequestOptions? options = null) { var r = await Get<DataEnvelope<QuickLinkSettings?>>("/platform/quicklink", options, new { projectId }).ConfigureAwait(false); return new(r.Data.Data, r.Metadata); }
    public async Task<ApiResponse<QuickLinkSettings>> UpdateAsync(UpdateQuickLinkSettingsRequest? input = null, RequestOptions? options = null)
    {
        var json = System.Text.Json.JsonSerializer.SerializeToElement(input ?? new(), HttpTransport.Json);
        var body = json.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        if (projectId is not null) body["projectId"] = System.Text.Json.JsonSerializer.SerializeToElement(projectId);
        var r = await Put<DataEnvelope<QuickLinkSettings>>("/platform/quicklink", body, options).ConfigureAwait(false); return new(r.Data.Data, r.Metadata);
    }
}
