using System.Net;
using System.Text.Json;

namespace Polymorfa.Example.Maui.Bridge;

public sealed record BridgeResponse(int Status, string Body, string ContentType);

/// <summary>App authentication lives in native memory, separate from WebView cookies.</summary>
public sealed class ApplicationBridge : IDisposable
{
    private readonly HttpClient client;
    private readonly HttpClientHandler handler;
    private readonly Uri server;
    private readonly TimeSpan requestTimeout;
    private readonly CancellationTokenSource lifetime = new();
    private readonly SemaphoreSlim authentication = new(1, 1);
    public bool IsAuthenticated { get; private set; }
    public Uri Server => server;

    public ApplicationBridge(Uri trustedServer, TimeSpan? timeout = null)
    {
        if (!trustedServer.IsAbsoluteUri || trustedServer.UserInfo.Length != 0 || trustedServer.Query.Length != 0 || trustedServer.Fragment.Length != 0 || trustedServer.AbsolutePath != "/" ||
            (trustedServer.Scheme != "https" && !(trustedServer.Scheme == "http" && trustedServer.IsLoopback)))
            throw new ArgumentException("The application server must be HTTPS, or loopback HTTP for development, with no path or credentials.", nameof(trustedServer));
        requestTimeout = timeout ?? TimeSpan.FromSeconds(30);
        if (requestTimeout <= TimeSpan.Zero || requestTimeout > TimeSpan.FromSeconds(30)) throw new ArgumentOutOfRangeException(nameof(timeout));
        server = trustedServer;
        handler = new HttpClientHandler { CookieContainer = new CookieContainer(), UseCookies = true, AllowAutoRedirect = false };
        client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public async Task<bool> LoginAsync(string password, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(password) || System.Text.Encoding.UTF8.GetByteCount(password) > 1024) return false;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, cancellationToken);
        await authentication.WaitAsync(linked.Token);
        try
        {
            ClearCookies();
            using var request = Request(HttpMethod.Post, "/example/login");
            request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["password"] = password });
            var response = await SendAsync(request, linked.Token);
            IsAuthenticated = response.Status == 204;
            if (!IsAuthenticated) ClearCookies();
            return IsAuthenticated;
        }
        finally { authentication.Release(); }
    }

    /// <summary>Fixed app-owned routes. This deliberately is not a URL/header/body proxy.</summary>
    public async Task<BridgeResponse> RequestAsync(string action, CancellationToken cancellationToken = default)
    {
        var (method, path) = action switch
        {
            "config" => (HttpMethod.Get, "/example/config"),
            "token" => (HttpMethod.Post, "/api/polymorfa/token"),
            "conversations" => (HttpMethod.Get, "/api/polymorfa/history/conversations"),
            "connect" => (HttpMethod.Post, "/api/polymorfa/connect"),
            "logout" => (HttpMethod.Post, "/example/logout"),
            _ => throw new ArgumentException("Unknown application route.", nameof(action))
        };
        if (!IsAuthenticated && action is not "config" and not "logout") return new(401, "", "application/json");
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, cancellationToken);
        using var request = Request(method, path);
        try
        {
            var response = await SendAsync(request, linked.Token);
            if (response.Status == 401) ClearCookies();
            if (action == "config" && response.Status == 200)
            {
                using var json = JsonDocument.Parse(response.Body);
                if (!json.RootElement.TryGetProperty("apiBaseUrl", out var value) || !Uri.TryCreate(value.GetString(), UriKind.Absolute, out var uri) ||
                    (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)) || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0 || uri.Query.Length != 0)
                    throw new InvalidDataException("The application returned an invalid API URL.");
            }
            return response;
        }
        finally { if (action == "logout") ClearCookies(); }
    }

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, new Uri(server, path));
        if (method == HttpMethod.Post) request.Headers.Add("Origin", server.GetLeftPart(UriPartial.Authority));
        request.Headers.Add("Accept", "application/json");
        return request;
    }

    private async Task<BridgeResponse> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(requestTimeout);
        cancellationToken = deadline.Token;
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized) ClearCookies();
        // Do not follow redirects with app authentication or expose headers/cookies to JavaScript.
        if ((int)response.StatusCode is >= 300 and < 400) return new(502, "", "application/json");
        const int limit = 1024 * 1024;
        if (response.Content.Headers.ContentLength > limit) throw new InvalidDataException("Application response exceeded the byte limit.");
        using var body = new MemoryStream();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var buffer = new byte[16384];
        while (true)
        {
            var count = await stream.ReadAsync(buffer, cancellationToken);
            if (count == 0) break;
            if (body.Length + count > limit) throw new InvalidDataException("Application response exceeded the byte limit.");
            await body.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
        if (body.Length > 0 && !contentType.Equals("application/json", StringComparison.OrdinalIgnoreCase) && !contentType.EndsWith("+json", StringComparison.OrdinalIgnoreCase))
            return new(502, "{\"error\":{\"code\":\"invalid_response\",\"message\":\"The application server returned an invalid response.\"}}", "application/json");
        return new((int)response.StatusCode, System.Text.Encoding.UTF8.GetString(body.ToArray()), contentType.Length == 0 ? "application/json" : contentType);
    }

    private void ClearCookies() { foreach (Cookie cookie in handler.CookieContainer.GetAllCookies()) cookie.Expired = true; IsAuthenticated = false; }
    public void Dispose() { lifetime.Cancel(); client.Dispose(); lifetime.Dispose(); }
}
