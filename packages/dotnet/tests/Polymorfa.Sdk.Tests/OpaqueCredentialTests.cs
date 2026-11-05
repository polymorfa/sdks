using System.Text.Json;
using Polymorfa.Sdk;
internal static class OpaqueCredentialTests
{
    internal static void Run()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "machine-credentials.v1.json")));
        foreach (var v in fixture.RootElement.GetProperty("opaque").EnumerateArray())
        {
            var token = v.GetProperty("token").GetString()!;
            Func<string, Credential> factory = v.GetProperty("kind").GetString() == "key" ? Credential.OrganizationApiKey : Credential.ProjectToken;
            _ = factory(token);
            foreach (var bad in new[] { token.Replace("_A", "_B"), token + "=", token + "\n", token + "!" })
            {
                try { _ = factory(bad); } catch (PolymorfaConfigurationException) { continue; }
                throw new Exception("Malformed credential accepted");
            }
        }
        foreach (var v in fixture.RootElement.GetProperty("client").GetProperty("cases").EnumerateArray().Concat(fixture.RootElement.GetProperty("client").GetProperty("rejections").EnumerateArray())) _ = Credential.ClientToken(v.GetProperty("token").GetString()!);
        foreach (var size in new[] { 400, 13000 })
        {
            var raw = new byte[size + 4]; uint crc = 0xffffffff;
            for (var i = 0; i < size; i++) { crc ^= raw[i]; for (var b = 0; b < 8; b++) crc = (crc >> 1) ^ ((crc & 1) != 0 ? 0xedb88320u : 0); }
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(raw.AsSpan(size), crc ^ 0xffffffff);
            var body = Encode(raw);
            foreach (var c in new[] { Credential.OrganizationApiKey("pmfa_" + body), Credential.ProjectToken("pmfa_pt_" + body), Credential.ClientToken("pmfa_ct_" + Encode(raw[..size])) })
                if (c.ToString().Contains(body)) throw new Exception("Credential leaked");
        }
        var secret = "pmfa_ct_" + new string('A', 17000);
        var error = new PolymorfaException(secret, "unauthorized", error: JsonSerializer.SerializeToElement(new { details = new { apiKey = "synthetic", projectToken = secret, nested = new[] { secret } } }));
        if (error.Message.Contains(secret) || error.Details.ToString()!.Contains(secret) || error.Details.ToString()!.Contains("synthetic") || error.Code != "unauthorized") throw new Exception("Error credential leaked");
        var tokenValue = fixture.RootElement.GetProperty("client").GetProperty("cases")[0].GetProperty("token").GetString()!;
        var encoded = tokenValue[8..]; var signed = Convert.FromBase64String(encoded.Replace('-', '+').Replace('_', '/') + new string('=', (4 - encoded.Length % 4) % 4)); signed[^1] ^= 1;
        _ = Credential.ClientToken("pmfa_ct_" + Encode(signed));
    }
    internal static async Task WireAsync()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "machine-credentials.v1.json")));
        var credentials = fixture.RootElement.GetProperty("opaque").EnumerateArray().Select(v => (Value: v.GetProperty("token").GetString()!, Kind: v.GetProperty("kind").GetString()!)).Concat(fixture.RootElement.GetProperty("client").GetProperty("cases").EnumerateArray().Select(v => (Value: v.GetProperty("token").GetString()!, Kind: "client"))).Append((Value: "pmfa_ct_" + Encode(new byte[600]), Kind: "client"));
        foreach (var (token, kind) in credentials)
        {
            using var wire = new WireFixture { Authorization = "Bearer " + token };
            var serve = wire.ServeAsync("GET", "/messaging/s/profile", null, JsonSerializer.Serialize(new { error = new { code = "unauthorized", message = token, details = new { apiKey = "synthetic", projectToken = token } } }), status: 401);
            using var sdk = new MessagingClient(kind == "key" ? Credential.OrganizationApiKey(token) : kind == "project" ? Credential.ProjectToken(token) : Credential.ClientToken(token), new() { BaseUrl = wire.Url, MaxNetworkRetries = 0 });
            try { await sdk.Profile.GetAsync("s"); throw new Exception("Missing server rejection"); }
            catch (PolymorfaAuthenticationException error) { if (error.Code != "unauthorized" || error.Message.Contains(token) || error.Details.ToString()!.Contains(token) || error.Details.ToString()!.Contains("synthetic")) throw new Exception("Error credential leaked"); }
            await serve;
        }
    }
    private static string Encode(byte[] raw) => Convert.ToBase64String(raw).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
