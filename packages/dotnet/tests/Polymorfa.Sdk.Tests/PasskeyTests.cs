using System.Text.Json;
using Polymorfa.Sdk;

internal static class PasskeyTests
{
    private sealed class BrokenHandler(bool nonJson) : HttpMessageHandler
    {
        internal int Count;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Count++;
            if (request.Content is not null) await request.Content.ReadAsByteArrayAsync(cancellationToken);
            if (!nonJson) throw new HttpRequestException("Connection lost after upload.");
            return new HttpResponseMessage(System.Net.HttpStatusCode.BadGateway) { Content = new StringContent("<html>unavailable</html>", System.Text.Encoding.UTF8, "text/html") };
        }
    }
    public static async Task RunAsync()
    {
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var fixturePath = Environment.GetEnvironmentVariable("PASSKEY_FIXTURE");
        if (fixturePath is null)
        {
            DirectoryInfo? root = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (root is not null && !File.Exists(System.IO.Path.Combine(root.FullName, "contracts/fixtures/passkeys.candidate.json"))) root = root.Parent;
            fixturePath = root is null ? throw new Exception("Passkey fixture root not found.") : System.IO.Path.Combine(root.FullName, "contracts/fixtures/passkeys.candidate.json");
        }
        using var doc = JsonDocument.Parse(File.ReadAllText(fixturePath));
        var f = doc.RootElement;
        var issue = JsonSerializer.Deserialize<IssuePasskeyChallenge>(f.GetProperty("issue"), options)!;
        var assertion = JsonSerializer.Deserialize<SubmitPasskeyAssertion>(f.GetProperty("assertion"), options)!;
        var confirm = JsonSerializer.Deserialize<ConfirmPasskey>(f.GetProperty("confirm"), options)!;
        string Reply(string key) => "{\"success\":true,\"data\":" + f.GetProperty(key).GetRawText() + "}";
        await ResourceTests.Messaging("POST", "/messaging/desk%2F1/passkey/challenge", f.GetProperty("issue").GetRawText(), Reply("ticket"), async c => { var r = await c.Passkeys.IssueChallengeAsync("desk/1", issue); ResourceTests.Equal(r.Data.Data.ExpiresAt, "2026-10-23T16:00:00.123Z"); ResourceTests.Equal(r.Data.Data.TimeoutMs, 120000L); });
        await ResourceTests.Messaging("GET", "/messaging/desk%2F1/passkey/challenge/ticket%2F%3F", null, Reply("ticket"), async c => ResourceTests.Equal((await c.Passkeys.GetChallengeAsync("desk/1", "ticket/?")).Data.Data.Ticket, "ticket/?"));
        await ResourceTests.Messaging("POST", "/messaging/desk%2F1/passkey/assertion", f.GetProperty("assertion").GetRawText(), Reply("assertionResult"), async c => ResourceTests.True((await c.Passkeys.SubmitAssertionAsync("desk/1", assertion)).Data.Data.Ok));
        foreach (var status in f.GetProperty("statuses").EnumerateArray())
            await ResourceTests.Messaging("GET", "/messaging/desk/passkey/confirmation", null, "{\"success\":true,\"data\":{\"status\":\"" + status.GetString() + "\",\"skipHandoffUX\":false}}", async c => { var r = await c.Passkeys.GetConfirmationAsync("desk"); ResourceTests.Equal(r.Data.Data.Status, status.GetString()); ResourceTests.Equal(r.Data.Data.SkipHandoffUX, false); ResourceTests.Equal(r.Data.Data.Code, null); });
        await ResourceTests.Messaging("POST", "/messaging/desk%2F1/passkey/confirmation", f.GetProperty("confirm").GetRawText(), "{\"success\":true,\"data\":{\"status\":\"waiting_for_pairing\"}}", async c => ResourceTests.Equal((await c.Passkeys.ConfirmAsync("desk/1", confirm)).Data.Data.Status, "waiting_for_pairing"));
        for (var i = 0; i < 3; i++)
        {
            using var wire = new WireFixture { Authorization = "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k" };
            string[] suffix = ["challenge", "assertion", "confirmation"];
            string[] key = ["issue", "assertion", "confirm"];
            var serving = wire.ServeAsync("POST", "/messaging/desk/passkey/" + suffix[i], f.GetProperty(key[i]).GetRawText(), "{\"error\":{\"code\":\"future_passkey\",\"message\":\"refused\"}}", 503);
            using var c = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = wire.Url, MaxNetworkRetries = 3, Timeout = TimeSpan.FromSeconds(3) });
            var o = new RequestOptions { MaxNetworkRetries = 3, IdempotencyKey = "caller-key" };
            try { if (i == 0) await c.Passkeys.IssueChallengeAsync("desk", issue, o); else if (i == 1) await c.Passkeys.SubmitAssertionAsync("desk", assertion, o); else await c.Passkeys.ConfirmAsync("desk", confirm, o); throw new Exception("Expected server refusal."); }
            catch (PolymorfaServerException e) { ResourceTests.Equal(e.Code, "future_passkey"); ResourceTests.Equal(e.Metadata?.Attempts, 1); }
            await serving; ResourceTests.True(!wire.Pending);
        }
        foreach (var status in f.GetProperty("errors").EnumerateArray())
        {
            using var wire = new WireFixture { Authorization = "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k" };
            var serving = wire.ServeAsync("POST", "/messaging/desk/passkey/confirmation", f.GetProperty("confirm").GetRawText(), "{\"error\":{\"code\":\"future_passkey\",\"message\":\"refused\"}}", status.GetInt32());
            using var c = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = wire.Url, Timeout = TimeSpan.FromSeconds(3) });
            try { await c.Passkeys.ConfirmAsync("desk", confirm); throw new Exception("Expected refusal."); }
            catch (PolymorfaException e) { ResourceTests.Equal(e.Code, "future_passkey"); ResourceTests.Equal(e.Status, status.GetInt32()); }
            await serving;
        }
        foreach (var nonJson in new[] { false, true })
            for (var i = 0; i < 3; i++)
            {
                using var handler = new BrokenHandler(nonJson);
                using var c = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = new("https://api.example"), TransportHandler = handler });
                var o = new RequestOptions { MaxNetworkRetries = 3, IdempotencyKey = "caller" };
                try { if (i == 0) await c.Passkeys.IssueChallengeAsync("desk", issue, o); else if (i == 1) await c.Passkeys.SubmitAssertionAsync("desk", assertion, o); else await c.Passkeys.ConfirmAsync("desk", confirm, o); throw new Exception("Expected unknown outcome."); }
                catch (PolymorfaException) { ResourceTests.Equal(handler.Count, 1); }
            }
        using (var handler = new BrokenHandler(false))
        using (var c = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = new("https://api.example"), TransportHandler = handler }))
        {
            foreach (var bad in new[] { assertion with { Assertion = assertion.Assertion with { Id = new string('x', 1365) } }, assertion with { Assertion = assertion.Assertion with { Response = assertion.Assertion.Response with { UserHandleB64 = new string('x', 87) } } }, assertion with { Assertion = assertion.Assertion with { Response = assertion.Assertion.Response with { SignatureB64 = new string('x', 1048576) } } } })
            {
                try { await c.Passkeys.SubmitAssertionAsync("s", bad); throw new Exception("Expected local bound refusal."); }
                catch (PolymorfaValidationException) { ResourceTests.Equal(handler.Count, 0); }
            }
        }
        await ResourceTests.Messaging("POST", "/messaging/desk/passkey/challenge", "{}", Reply("ticket"), async c => { await c.Passkeys.IssueChallengeAsync("desk"); });
        await ResourceTests.Messaging("POST", "/messaging/desk/passkey/confirmation", "{\"ticketId\":\"ticket\"}", "{\"success\":true,\"data\":{\"status\":\"none\"}}", async c => { await c.Passkeys.ConfirmAsync("desk", new("ticket")); });
        var maximum = assertion with { Assertion = assertion.Assertion with { Id = new string('x', 1364), RawIdB64Url = new string('x', 1364), Response = assertion.Assertion.Response with { UserHandleB64 = new string('x', 86) } } };
        await ResourceTests.Messaging("POST", "/messaging/desk/passkey/assertion", JsonSerializer.Serialize(maximum, options), Reply("assertionResult"), async c => { await c.Passkeys.SubmitAssertionAsync("desk", maximum); });
        Console.WriteLine("PASS passkeys five wire operations, nine outcomes, three single-attempt writes");
    }
}
