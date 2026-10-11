using Polymorfa.Sdk;

internal static class VoiceTests
{
    private const string Asset = """{"id":"a1","projectId":"p1","name":"Greeting","source":"upload","status":"ready","failureReason":null,"originalFormat":"ogg","originalContentType":"audio/ogg","sizeBytes":3,"durationMs":500,"contentSha256":"abcdef","tts":null,"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":2,"createdAt":"2026-09-22","updatedAt":"2026-09-22","readyAt":"2026-09-22"}""";
    private const string CredentialJson = """{"id":"c1","projectId":null,"provider":"openai","label":"Voice","keyFingerprint":"1234abcd","status":"future_status","verifiedAt":"2026-09-22","lastError":null,"revision":2,"createdAt":"2026-09-22","updatedAt":"2026-09-22"}""";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/voice/audio?projectId=p1&status=ready&limit=2", null, "{\"data\":[" + Asset + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.Voice.Audio.ListAsync("p1", new(Status: "ready", Limit: 2))).Items[0].DurationMs, 500L));
        await Organization("POST", "/platform/voice/audio", """{"name":"Greeting","contentType":"audio/ogg","sizeBytes":3,"projectId":"p1"}""", "{\"data\":{\"asset\":" + Asset + ",\"upload\":{\"url\":\"https://storage.example/once\",\"method\":\"POST\",\"headers\":{\"x-upload\":\"fixture\"},\"maxBytes\":16777216,\"expiresAt\":\"2026-09-22\"}}}", async c => { var u = (await c.Voice.Audio.CreateUploadAsync(new("Greeting", "audio/ogg", 3), "p1")).Data; ResourceTests.Equal(u.Upload.MaxBytes, 16777216L); ResourceTests.True(!u.Upload.ToString().Contains("/once")); });
        await Organization("POST", "/platform/voice/audio/tts", """{"name":"Greeting","text":"Hello","provider":"openai","voiceId":"alloy","model":"tts-1","projectId":"p1"}""", Envelope(Asset.Replace("\"tts\":null", "\"tts\":{\"provider\":\"openai\",\"voiceId\":\"alloy\",\"model\":\"tts-1\",\"text\":\"Hello\",\"characters\":5,\"keySource\":\"managed\",\"credentialId\":null}")), async c => ResourceTests.Equal((await c.Voice.Audio.SynthesizeAsync(new("Greeting", "Hello", "openai", "alloy", "tts-1"), "p1")).Data.Tts!.Characters, 5L));
        await Organization("GET", "/platform/voice/audio/a1", null, Envelope(Asset), async c => ResourceTests.Equal((await c.Voice.Audio.RetrieveAsync("a1")).Data.ContentSha256, "abcdef"));
        await Organization("POST", "/platform/voice/audio/a1/complete", null, Envelope(Asset), async c => ResourceTests.Equal((await c.Voice.Audio.CompleteAsync("a1")).Data.Status, "ready"));
        await Organization("PATCH", "/platform/voice/audio/a1", """{"expectedRevision":1,"retentionDays":null}""", Envelope(Asset), async c => ResourceTests.Equal((await c.Voice.Audio.UpdateAsync("a1", new(ExpectedRevision: 1, RetentionDays: PatchValue<int?>.Set(null)))).Data.Revision, 2L));
        await Organization("DELETE", "/platform/voice/audio/a1", null, """{"data":{"id":"a1","deleted":true}}""", async c => ResourceTests.True((await c.Voice.Audio.DeleteAsync("a1")).Data.Deleted));
        await Organization("GET", "/platform/voice/audio/a1/preview", null, """{"data":{"url":"https://storage.example/once","contentType":"audio/ogg","expiresAt":"2026-09-22"}}""", async c => ResourceTests.True(!(await c.Voice.Audio.PreviewUrlAsync("a1")).Data.ToString().Contains("/once")));
        await Organization("GET", "/platform/voice/provider-credentials?projectId=p1", null, "{\"data\":[" + CredentialJson + "]}", async c => ResourceTests.Equal((await c.Voice.ProviderCredentials.ListAsync("p1")).Data[0].Status, "future_status"));
        await Organization("POST", "/platform/voice/provider-credentials", """{"provider":"openai","label":"Voice","apiKey":"fixture-key","projectId":null}""", Envelope(CredentialJson), async c => ResourceTests.Equal((await c.Voice.ProviderCredentials.CreateAsync(new("openai", "Voice", "fixture-key", PatchValue<string>.Set(null)))).Data.KeyFingerprint, "1234abcd"));
        await Organization("GET", "/platform/voice/provider-credentials/c1", null, Envelope(CredentialJson), async c => ResourceTests.Equal((await c.Voice.ProviderCredentials.RetrieveAsync("c1")).Data.ProjectId, null));
        await Organization("POST", "/platform/voice/provider-credentials/c1/verify", null, Envelope(CredentialJson), async c => ResourceTests.Equal((await c.Voice.ProviderCredentials.VerifyAsync("c1")).Data.Revision, 2L));
        await Organization("DELETE", "/platform/voice/provider-credentials/c1", null, """{"data":{"id":"c1","deleted":true}}""", async c => ResourceTests.True((await c.Voice.ProviderCredentials.DeleteAsync("c1")).Data.Deleted));
        await Confine(); await WaitTerminal(); await WaitDeadline(); await UploadTls();
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        try { await client.Voice.Audio.UploadAsync(new("Greeting", "audio/ogg", 4), new byte[3], "p1"); throw new Exception("Size mismatch accepted"); } catch (PolymorfaValidationException) { }
        try { await client.Voice.Audio.ListAsync(); throw new Exception("Missing project accepted"); } catch (PolymorfaConfigurationException) { }
        ResourceTests.True(!new CreateVoiceProviderCredentialInput("openai", "Voice", "fixture-key").ToString().Contains("fixture-key"));
        Console.WriteLine("PASS 13 typed Voice APIs, retention nulls, provider redaction, project confinement and bounded ready waits");
    }
    private static string Envelope(string json) => "{\"data\":" + json + "}";
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
    private static async Task Confine()
    {
        foreach (var team in new[] { false, true })
        {
            using var fixture = new WireFixture { AbsentHeaders = ["idempotency-key"] };
            var serving = fixture.ServeAsync("GET", team ? "/platform/voice/provider-credentials/c1" : "/platform/voice/audio/a1", null, Envelope(team ? CredentialJson : Asset.Replace("\"p1\"", "\"other\"")));
            using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url }); var bound = client.Project("p1");
            try { if (team) await bound.Voice.ProviderCredentials.DeleteAsync("c1", new() { IdempotencyKey = "mutation-key" }); else await bound.Voice.Audio.DeleteAsync("a1", new() { IdempotencyKey = "mutation-key" }); throw new Exception("Project escaped confinement"); }
            catch (PolymorfaAuthorizationException) when (team) { }
            catch (PolymorfaNotFoundException) when (!team) { }
            await serving;
        }
    }
    private static async Task WaitTerminal()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/platform/voice/audio/a1", null, Envelope(Asset.Replace("\"ready\"", "\"failed\""))); using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url }); ResourceTests.Equal((await client.Voice.Audio.WaitUntilReadyAsync("a1", new(TimeSpan.FromSeconds(1)))).Data.Status, "failed"); await serving;
    }
    private static async Task WaitDeadline()
    {
        using var fixture = new WireFixture(); using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url });
        var started = System.Diagnostics.Stopwatch.GetTimestamp(); try { await client.Voice.Audio.WaitUntilReadyAsync("a1", new(TimeSpan.FromMilliseconds(20))); throw new Exception("Wait ignored budget"); } catch (PolymorfaTimeoutException) { ResourceTests.True(System.Diagnostics.Stopwatch.GetElapsedTime(started) < TimeSpan.FromSeconds(1)); }
    }
    private static async Task UploadTls()
    {
        // Public test certificate, never installed in a system trust store.
#pragma warning disable SYSLIB0057 // The package supports .NET 8, before X509CertificateLoader.
        using var cert = new System.Security.Cryptography.X509Certificates.X509Certificate2(Convert.FromBase64String("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"), "", System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.Exportable);
#pragma warning restore SYSLIB0057
        using var storage = new WireFixture(cert) { AbsentHeaders = ["authorization", "cookie", "idempotency-key", "x-private", "polymorfa-version"], ExpectedHeaders = new Dictionary<string, string> { ["x-upload"] = "fixture", ["content-type"] = "audio/ogg" } };
        using var api = new WireFixture();
        var servingApi = Serve(); var servingStorage = storage.ServeAsync("POST", "/upload", "bytes:b2dn", "", 204);
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = api.Url, StorageTransportHandlerFactory = () => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, SslOptions = new System.Net.Security.SslClientAuthenticationOptions { RemoteCertificateValidationCallback = (_, peer, _, _) => peer?.GetCertHashString() == cert.GetCertHashString() } } });
        ResourceTests.Equal((await client.Voice.Audio.UploadAsync(new("Greeting", "audio/ogg", 3), System.Text.Encoding.UTF8.GetBytes("ogg"), "p1", new() { IdempotencyKey = "create", Headers = new Dictionary<string, string> { ["x-private"] = "fixture" } })).Data.Status, "ready");
        await Task.WhenAll(servingApi, servingStorage);
        async Task Serve()
        {
            await api.ServeAsync("POST", "/platform/voice/audio", "{\"name\":\"Greeting\",\"contentType\":\"audio/ogg\",\"sizeBytes\":3,\"projectId\":\"p1\"}", "{\"data\":{\"asset\":" + Asset + ",\"upload\":{\"url\":\"" + new Uri(storage.Url, "/upload") + "\",\"method\":\"POST\",\"headers\":{\"x-upload\":\"fixture\",\"content-type\":\"audio/ogg\"},\"maxBytes\":16777216,\"expiresAt\":\"2026-09-22\"}}}", expectedHeaders: new Dictionary<string, string> { ["idempotency-key"] = "create" });
            await api.ServeAsync("POST", "/platform/voice/audio/a1/complete", null, Envelope(Asset), absentHeader: "idempotency-key");
        }
    }

}
