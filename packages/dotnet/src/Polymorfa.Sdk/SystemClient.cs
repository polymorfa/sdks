namespace Polymorfa.Sdk;

public sealed record SystemStatus(string Status, string Uptime, string Version, string Env);
public sealed record SystemVersion(string Version, string BuildTime, string Env, string ApiVersion, string MinSupportedVersion);
public sealed record HealthCheck(string Status, string? Error = null);
public sealed record SystemHealth(string Status, IReadOnlyDictionary<string, HealthCheck> Checks);
public sealed record SystemPing(string Status);
/// <summary>Credential-free API version, liveness and readiness probes.</summary>
public sealed class SystemClient : IDisposable
{
    private readonly HttpTransport http;
    public SystemClient(ClientOptions? options = null) => http = new(null, options ?? new());
    public Task<ApiResponse<SystemStatus>> StatusAsync(RequestOptions? options = null) => http.RequestAsync<SystemStatus>(HttpMethod.Get, "/messaging/info/status", null, options);
    public Task<ApiResponse<SystemVersion>> VersionAsync(RequestOptions? options = null) => http.RequestAsync<SystemVersion>(HttpMethod.Get, "/messaging/info/version", null, options);
    public Task<ApiResponse<SystemHealth>> HealthAsync(RequestOptions? options = null) => http.RequestAsync<SystemHealth>(HttpMethod.Get, "/health", null, options);
    public Task<ApiResponse<SystemPing>> PingAsync(RequestOptions? options = null) => http.RequestAsync<SystemPing>(HttpMethod.Get, "/ping", null, options);
    public void Dispose() => http.Dispose();
}
public sealed record BridgeRoute(string WsUrl, string Region, string Kind, string Signal, string TokenKind, long ExpiresAt);
public sealed class BridgeClient : IDisposable
{
    private readonly HttpTransport http;
    public BridgeRoutes Routes { get; }
    public BridgeClient(Credential credential, ClientOptions? options = null)
    {
        credential.RequireServer();
        if (credential.Kind != CredentialKind.ProjectToken) throw new PolymorfaConfigurationException("BridgeClient requires a project token.");
        http = new(credential, options ?? new()); Routes = new(http);
    }
    public void Dispose() => http.Dispose();
}
public sealed class BridgeRoutes
{
    private readonly HttpTransport http;
    internal BridgeRoutes(HttpTransport http) => this.http = http;
    public Task<ApiResponse<BridgeRoute>> ResolveAsync(RequestOptions? options = null) => http.RequestAsync<BridgeRoute>(HttpMethod.Get, "/messaging/bridge/route", null, options);
}
