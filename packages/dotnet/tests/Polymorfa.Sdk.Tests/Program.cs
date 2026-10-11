using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

var directory = new DirectoryInfo(AppContext.BaseDirectory);
while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "contracts/fixtures/behavior.json"))) directory = directory.Parent;
var root = directory?.FullName ?? throw new Exception("SDK repository root not found.");
using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "contracts/fixtures/behavior.json")));
var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
start.ArgumentList.Add("scripts/sdk-fixture-server.mjs"); start.ArgumentList.Add("--port"); start.ArgumentList.Add("0");
using var server = Process.Start(start) ?? throw new Exception("Cannot start fixture server.");
try
{
    using var ready = JsonDocument.Parse(await server.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)) ?? throw new Exception("Fixture server exited."));
    var baseUrl = new Uri(ready.RootElement.GetProperty("url").GetString()!);
    var key = fixtures.RootElement.GetProperty("organizationCredential").GetString()!;
    using var control = new HttpClient();
    var count = 0;
    foreach (var scenario in fixtures.RootElement.GetProperty("scenarios").EnumerateArray())
    {
        var id = scenario.GetProperty("id").GetString()!;
        var expected = scenario.GetProperty("request"); var outcome = scenario.GetProperty("outcome");
        using var client = new MessagingClient(Credential.OrganizationApiKey(key), new ClientOptions { BaseUrl = baseUrl });
        using var cancellation = new CancellationTokenSource();
        if (outcome.TryGetProperty("cancelAfterMs", out var cancel)) cancellation.CancelAfter(cancel.GetInt32());
        var options = new RequestOptions
        {
            Headers = new Dictionary<string, string> { ["x-polymorfa-fixture"] = id },
            IdempotencyKey = expected.GetProperty("headers").TryGetProperty("idempotency-key", out var idem) ? idem.GetString() : null,
            ApiVersion = expected.GetProperty("headers").GetProperty("polymorfa-version").GetString(),
            MaxNetworkRetries = outcome.TryGetProperty("maxNetworkRetries", out var retries) ? retries.GetInt32() : null,
            Timeout = outcome.TryGetProperty("timeoutMs", out var timeout) ? TimeSpan.FromMilliseconds(timeout.GetInt32()) : null,
            CancellationToken = cancellation.Token
        };
        PolymorfaException? failure = null;
        ResponseMetadata? metadata = null;
        try
        {
            if (id == "sessions-list")
            {
                var response = await client.Sessions.ListAsync(options); metadata = response.Metadata;
                Equal(response.Data.Data[0].Name, "support", id);
            }
            else if (id == "message-send")
            {
                var response = await client.Messages.SendAsync("support", new(new(PhoneNumber: "+15551234567"), new TextContent("Hello")), options); metadata = response.Metadata;
                Equal(response.Data.Data.Id, "msg_fixture", id); Equal(response.Data.Data.WhatsAppIds.LinkedDevices, "provider_fixture", id);
            }
            else
            {
                var query = new List<KeyValuePair<string, string>>();
                if (expected.TryGetProperty("query", out var queryJson))
                    foreach (var property in queryJson.EnumerateObject())
                        if (property.Value.ValueKind == JsonValueKind.Array) foreach (var value in property.Value.EnumerateArray()) query.Add(new(property.Name, value.GetString()!));
                        else query.Add(new(property.Name, property.Value.GetString()!));
                var response = await client.RawAsync<JsonElement>(new(expected.GetProperty("method").GetString()!), expected.GetProperty("path").GetString()!, expected.TryGetProperty("body", out var body) ? body : null, options, query);
                metadata = response.Metadata;
            }
        }
        catch (PolymorfaException error) { failure = error; metadata = error.Metadata; }
        var errorKind = outcome.TryGetProperty("error", out var kind) ? kind.GetString() : null;
        Equal(failure is null ? null : Kind(failure), errorKind, id);
        if (outcome.TryGetProperty("operationId", out var operationId)) Equal(metadata?.OperationId, operationId.GetString(), id);
        if (outcome.TryGetProperty("code", out var code)) Equal(failure?.Code, code.GetString(), id);
        if (outcome.TryGetProperty("requestId", out var requestId)) Equal(failure?.RequestId, requestId.GetString(), id);
        if (outcome.TryGetProperty("metadataRequestId", out var metadataId)) Equal(metadata?.RequestId, metadataId.GetString(), id);
        if (metadata is not null) Equal(metadata.Attempts, outcome.GetProperty("attempts").GetInt32(), id);
        using var state = JsonDocument.Parse(await control.GetStringAsync(new Uri(baseUrl, $"/__fixtures/{id}/state")));
        Equal(state.RootElement.GetProperty("attempts").GetInt32(), outcome.GetProperty("attempts").GetInt32(), id);
        Equal(state.RootElement.GetProperty("mismatches").GetArrayLength(), 0, id);
        Console.WriteLine($"PASS HTTP {id}"); count++;
    }
    foreach (var fixture in fixtures.RootElement.GetProperty("webhooks").EnumerateArray())
    {
        var id = fixture.GetProperty("id").GetString()!; var body = Encoding.UTF8.GetBytes(fixture.GetProperty("body").GetString()!); var signature = fixture.GetProperty("signature").GetString()!; var secret = fixture.GetProperty("secret").GetString()!;
        var valid = true;
        try
        {
            var parsed = fixture.GetProperty("protocol").GetString() == "native" ? Webhooks.ConstructEvent(body, signature, secret) : Webhooks.ConstructLocalEvent(body, signature, secret, fixture.GetProperty("nowUnixSeconds").GetInt64(), fixture.GetProperty("toleranceSeconds").GetInt64());
            if (parsed is not UnknownWebhookEvent || parsed.Envelope.Payload.GetProperty("capability").GetInt32() != 42) throw new Exception("Unknown payload was lost.");
        }
        catch (WebhookSignatureException) { valid = false; }
        Equal(valid, fixture.GetProperty("valid").GetBoolean(), id); Console.WriteLine($"PASS webhook {id}"); count++;
    }
    foreach (var fixture in fixtures.RootElement.GetProperty("configuration").EnumerateArray())
    {
        var id = fixture.GetProperty("id").GetString()!; var valid = true;
        try
        {
            var value = fixture.GetProperty("credential").GetString()!;
            var credential = fixture.GetProperty("credentialType").GetString() switch { "projectToken" => Credential.ProjectToken(value), "clientToken" => Credential.ClientToken(value), _ => Credential.OrganizationApiKey(value) };
            var options = new ClientOptions { BaseUrl = fixture.TryGetProperty("baseUrl", out var url) ? new(url.GetString()!) : baseUrl, MaxNetworkRetries = fixture.TryGetProperty("maxNetworkRetries", out var retries) ? retries.GetInt32() : 2, Timeout = fixture.TryGetProperty("timeoutMs", out var timeout) ? TimeSpan.FromMilliseconds(timeout.GetInt32()) : TimeSpan.FromSeconds(30) };
            using IDisposable client = fixture.GetProperty("client").GetString() == "messaging" ? new MessagingClient(credential, options) : credential.Kind == CredentialKind.ProjectToken ? new ProjectClient(credential, fixture.TryGetProperty("projectId", out var project) ? project.GetString()! : "", options) : new OrganizationClient(credential, options);
            if (credential.ToString().Contains(value)) throw new Exception("Credential string leaked.");
        }
        catch (PolymorfaConfigurationException) { valid = false; }
        Equal(valid, fixture.GetProperty("valid").GetBoolean(), id); Console.WriteLine($"PASS configuration {id}"); count++;
    }
    WebhookTests.Run();
    await SystemTests.RunAsync();
    await MediaTests.RunAsync(root);
    await ResourceTests.RunAsync();
    await AccountTests.RunAsync();
await UsageTests.RunAsync();
await BanSafeTests.RunAsync();
await VoiceTests.RunAsync();
await FunctionTests.RunAsync();
await MessageContentTests.RunAsync();
await OfficialGroupTests.RunAsync();
await TemplateTests.RunAsync();
await OnboardingTests.RunAsync();
await MessagingUtilityTests.RunAsync();
await MediaApiTests.RunAsync();
    await BusinessTests.RunAsync();
    await ChannelCloudTests.RunAsync();
    await CallsTests.RunAsync();
    await BillingTests.RunAsync();
    await CustomerTests.RunAsync();
    await PlatformWebhookTests.RunAsync();
    await CallConsentTests.RunAsync();
    await SessionTests.RunAsync();
    await ProjectSettingsTests.RunAsync();
    await FlowTests.RunAsync();
    await SipTests.RunAsync();
    await EventsTests.RunAsync();
    await OperationsTests.RunAsync();
    Console.WriteLine($"Passed {count} shared behavior cases and media integrity tests.");
}
finally { if (!server.HasExited) server.Kill(entireProcessTree: true); await server.WaitForExitAsync(); }
static void Equal<T>(T actual, T expected, string name) { if (!EqualityComparer<T>.Default.Equals(actual, expected)) throw new Exception($"{name}: expected {expected}, received {actual}"); }
static string Kind(PolymorfaException error) => error switch
{
    PolymorfaValidationException => "validation",
    PolymorfaAuthenticationException => "authentication",
    PolymorfaAuthorizationException => "authorization",
    PolymorfaPaymentRequiredException => "payment_required",
    PolymorfaNotFoundException => "not_found",
    PolymorfaConflictException => "conflict",
    PolymorfaRateLimitException => "rate_limit",
    PolymorfaServerException => "server",
    PolymorfaTimeoutException => "timeout",
    PolymorfaConnectionException => "connection",
    PolymorfaCancelledException => "cancelled",
    _ => throw new Exception($"Unmapped error {error.GetType().Name}")
};
