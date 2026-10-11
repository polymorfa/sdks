using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed class OrganizationClient : IDisposable
{
    private readonly HttpTransport http;
    public PlatformCampaigns Campaigns { get; }
    public Audiences Audiences { get; }
    public CallRecords Calls { get; }
    public Analytics Analytics { get; }
    public QuickLinkSettingsResource QuickLinkSettings { get; }
    public Projects Projects { get; }
    public PlatformSessions Sessions { get; }
    public ConfigurationResource Configuration { get; }
    public SipTrunks SipTrunks { get; }
    public Operations Operations { get; }
    public CallPolicyResource CallPolicy { get; }
    public CallOptOuts CallOptOuts { get; }
    public CallRetentionResource CallRetention { get; }
    public PlatformMedia Media { get; }
    public Billing Billing { get; }
    public Customers Customers { get; }
    public Organizations Organizations { get; }
    public Members Members { get; }
    public ApiKeys ApiKeys { get; }
    public ProjectTokens ProjectTokens { get; }
    public OptOuts OptOuts { get; }
    public BanSafe BanSafe { get; }
    public AuditLogs AuditLogs { get; }
    public SecurityIncidents SecurityIncidents { get; }
    public SessionBans SessionBans { get; }
    public Events Events { get; }
    public Voice Voice { get; }
    public Usage Usage { get; }
    public PlatformWebhooks Webhooks { get; }
    public WebhookDeliveries WebhookDeliveries { get; }
    public OrganizationClient(Credential credential, ClientOptions? options = null)
    {
        credential.RequireServer();
        if (credential.Kind != CredentialKind.OrganizationApiKey) throw new PolymorfaConfigurationException("OrganizationClient requires an organization API key.");
        http = new(credential, options ?? new()); Audiences = new(http); Campaigns = new(http); QuickLinkSettings = new(http, null); Calls = new(http, null); Analytics = new(http, null); Projects = new(http); Sessions = new(http); Configuration = new(http, null); SipTrunks = new(http, null); Operations = new(http, null); CallPolicy = new(http); CallOptOuts = new(http); CallRetention = new(http); Media = new(http); Billing = new(http); Customers = new(http); Organizations = new(http); Members = new(http); ApiKeys = new(http); ProjectTokens = new(http); BanSafe = new(http); OptOuts = new(http); Voice = new(http, null); Usage = new(http, null); AuditLogs = new(http); SecurityIncidents = new(http); SessionBans = new(http); Events = new(http, "/platform", null); Webhooks = new(http, null); WebhookDeliveries = new(http, null);
    }
    public ProjectClient Project(string projectId) => new(http, projectId);
    public Task<ApiResponse<T>> RawAsync<T>(HttpMethod method, string path, JsonElement? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null) => http.RequestAsync<T>(method, path, body, options, query);
    public void Dispose() => http.Dispose();
}
public sealed class ProjectClient : IDisposable
{
    private readonly HttpTransport http;
    private readonly bool ownsTransport;
    public string ProjectId { get; }
    public CallRecords Calls { get; }
    public Analytics Analytics { get; }
    public QuickLinkSettingsResource QuickLinkSettings { get; }
    public ProjectSettings Settings { get; }
    public Functions Functions { get; }
    public Flows Flows { get; }
    public ConfigurationResource Configuration { get; }
    public SipTrunks SipTrunks { get; }
    public Operations Operations { get; }
    public CallRetentionResource CallRetention { get; }
    public Events Events { get; }
    public Voice Voice { get; }
    public Usage Usage { get; }
    public PlatformWebhooks Webhooks { get; }
    public WebhookDeliveries WebhookDeliveries { get; }
    private string Prefix => $"/platform/projects/{Uri.EscapeDataString(ProjectId)}";
    public ProjectClient(Credential credential, string projectId, ClientOptions? options = null) : this(new HttpTransport(RequireServer(credential), options ?? new()), projectId) => ownsTransport = true;
    private static Credential RequireServer(Credential credential) { credential.RequireServer(); return credential; }
    internal ProjectClient(HttpTransport http, string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId)) throw new PolymorfaConfigurationException("A non-empty projectId is required.");
        this.http = http; ProjectId = projectId; QuickLinkSettings = new(http, projectId); Calls = new(http, projectId); Analytics = new(http, projectId); Settings = new(http, projectId); Functions = new(http, projectId); Flows = new(http, projectId); Voice = new(http, projectId); Usage = new(http, projectId); Configuration = new(http, projectId); SipTrunks = new(http, projectId); Operations = new(http, projectId); CallRetention = new(http); Events = new(http, Prefix, ProjectId); Webhooks = new(http, ProjectId); WebhookDeliveries = new(http, ProjectId);
    }
    public ProjectClient Project(string projectId)
    {
        if (http.Credential.Kind == CredentialKind.ProjectToken && ProjectId != projectId) throw new PolymorfaConfigurationException("A project token cannot be rebound to another project.");
        return new(http, projectId);
    }
    public Task<ApiResponse<T>> RawAsync<T>(HttpMethod method, string relativePath, JsonElement? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null)
    {
        HttpTransport.ValidatePath(relativePath);
        if (Uri.UnescapeDataString(relativePath).StartsWith("/platform/projects/", StringComparison.Ordinal)) throw new PolymorfaValidationException("Raw paths must be relative to the bound project.", "invalid_project_request_path");
        return http.RequestAsync<T>(method, Prefix + relativePath, body, options, query);
    }
    public void Dispose() { if (ownsTransport) http.Dispose(); }
}
public sealed partial class Projects
{
    private readonly HttpTransport http;
    internal Projects(HttpTransport http) => this.http = http;
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<ProjectWithStats>>>> ListAsync(RequestOptions? options = null) => http.RequestAsync<DataEnvelope<IReadOnlyList<ProjectWithStats>>>(HttpMethod.Get, "/platform/projects", null, options);
    public Task<ApiResponse<DataEnvelope<CreatedProject>>> CreateAsync(CreateProjectRequest body, RequestOptions? options = null) => http.RequestAsync<DataEnvelope<CreatedProject>>(HttpMethod.Post, "/platform/projects", body, options);
    public Task<ApiResponse<DataEnvelope<ProductionEnrollmentResult>>> RequestProductionEnrollmentAsync(string projectId, ProductionEnrollmentRequest body, RequestOptions? options = null) => http.RequestAsync<DataEnvelope<ProductionEnrollmentResult>>(HttpMethod.Post, $"/platform/projects/{Uri.EscapeDataString(projectId)}/promote", body, options);
    public Task<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> ApproveProductionEnrollmentAsync(string projectId, string operationId, RequestOptions? options = null) => http.RequestAsync<DataEnvelope<ProductionEnrollmentCommandResult>>(HttpMethod.Post, $"/platform/projects/{Uri.EscapeDataString(projectId)}/production-enrollments/{Uri.EscapeDataString(operationId)}/approve", null, options);
    public Task<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> CancelProductionEnrollmentAsync(string projectId, string operationId, RequestOptions? options = null) => http.RequestAsync<DataEnvelope<ProductionEnrollmentCommandResult>>(HttpMethod.Post, $"/platform/projects/{Uri.EscapeDataString(projectId)}/production-enrollments/{Uri.EscapeDataString(operationId)}/cancel", null, options);
}
public sealed class Events
{
    private readonly HttpTransport http;
    private readonly string prefix;
    private readonly string? projectId;
    internal Events(HttpTransport http, string prefix, string? projectId) { this.http = http; this.prefix = prefix; this.projectId = projectId; }
    public async Task<ApiResponse<EventRecord>> RetrieveAsync(string id, RetrieveEventParameters? parameters = null, RequestOptions? options = null)
    {
        var response = await http.RequestAsync<DataEnvelope<EventRecord>>(HttpMethod.Get, $"{prefix}/events/{Uri.EscapeDataString(id)}", null, options, Resource.Query(parameters)).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
    public Task<CursorPage<EventRecord>> ListAsync(ListEventsParameters? parameters = null, RequestOptions? options = null) => CursorPage<EventRecord>.LoadAsync(http, prefix + "/events", Resource.Query(parameters), options ?? new());
    public Task<IndexedEventPage<EventRecord>> ListIndexedAsync(ListIndexedEventsParameters parameters, RequestOptions? options = null) => IndexedEventPage<EventRecord>.LoadAsync(http, prefix + "/events", parameters, options ?? new());
    public async Task<ApiResponse<EventReplayReceipt>> ReplayAsync(string id, ReplayEventRequest body, RequestOptions? options = null)
    {
        var response = await http.RequestAsync<DataEnvelope<EventReplayReceipt>>(HttpMethod.Post, $"{prefix}/events/{Uri.EscapeDataString(id)}/replays", body, options);
        return new(response.Data.Data, response.Metadata);
    }
    public EventStream Stream(EventStreamOptions? options = null)
    {
        options ??= new();
        var project = projectId ?? options.ProjectId;
        if (string.IsNullOrWhiteSpace(project)) throw new PolymorfaConfigurationException("Organization event streams require projectId.");
        return new(http, $"/platform/projects/{Uri.EscapeDataString(project)}/events/stream", options);
    }
    public async Task<ApiResponse<EventStreamAcknowledgementReceipt>> AcknowledgeStreamAsync(string streamId, EventStreamAcknowledgement body, RequestOptions? options = null, string? projectId = null)
    {
        var project = this.projectId ?? projectId;
        if (string.IsNullOrWhiteSpace(project)) throw new PolymorfaConfigurationException("Organization stream acknowledgement requires projectId.");
        var streamPrefix = $"/platform/projects/{Uri.EscapeDataString(project)}";
        var response = await http.RequestAsync<DataEnvelope<EventStreamAcknowledgementReceipt>>(HttpMethod.Post, $"{streamPrefix}/events/stream/{Uri.EscapeDataString(streamId)}/ack", body, options).ConfigureAwait(false);
        return new(response.Data.Data, response.Metadata);
    }
}
public sealed class CursorPage<T> : IAsyncEnumerable<T>
{
    public IReadOnlyList<T> Items { get; }
    public string? NextCursor { get; }
    public bool HasMore => NextCursor is not null;
    public ResponseMetadata Metadata { get; }
    private readonly HttpTransport http;
    private readonly string path;
    private readonly IReadOnlyList<KeyValuePair<string, string>> query;
    private readonly RequestOptions options;
    private CursorPage(HttpTransport http, string path, IReadOnlyList<KeyValuePair<string, string>> query, RequestOptions options, ApiResponse<CursorEnvelope<T>> response)
    {
        this.http = http; this.path = path; this.query = query.ToArray(); this.options = options;
        Items = Array.AsReadOnly(response.Data.Data.ToArray()); NextCursor = response.Data.Page?.NextCursor; Metadata = response.Metadata;
    }
    internal static async Task<CursorPage<T>> LoadAsync(HttpTransport http, string path, IReadOnlyList<KeyValuePair<string, string>> query, RequestOptions options, CancellationToken? requestCancellation = null)
    {
        var response = await http.RequestAsync<CursorEnvelope<T>>(HttpMethod.Get, path, null, requestCancellation is null ? options : options with { CancellationToken = requestCancellation.Value }, query).ConfigureAwait(false);
        if (response.Data.Data is null) throw new PolymorfaServerException("Invalid collection envelope.", "invalid_response", response.Metadata);
        return new(http, path, query, options, response);
    }
    public Task<CursorPage<T>?> NextPageAsync(CancellationToken cancellationToken = default) => LoadNextAsync(cancellationToken);
    private async Task<CursorPage<T>?> LoadNextAsync(CancellationToken cancellationToken)
    {
        if (NextCursor is null) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, options.CancellationToken);
        var nextQuery = query.Where(p => p.Key != "cursor").Append(new("cursor", NextCursor)).ToArray();
        return await LoadAsync(http, path, nextQuery, options, linked.Token).ConfigureAwait(false);
    }
    public async IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        CursorPage<T>? page = this;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        while (page is not null)
        {
            if (page.NextCursor is not null && !seen.Add(page.NextCursor)) throw new PolymorfaServerException("The API repeated a collection cursor.", "invalid_response", page.Metadata);
            foreach (var item in page.Items) { cancellationToken.ThrowIfCancellationRequested(); yield return item; }
            page = await page.NextPageAsync(cancellationToken).ConfigureAwait(false);
        }
    }
}
