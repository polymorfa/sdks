using System.Net;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public enum CredentialKind { OrganizationApiKey, ProjectToken, ClientToken }

/// <summary>A validated principal. Its string representation never contains the secret.</summary>
public sealed class Credential
{
    internal string Value { get; }
    public CredentialKind Kind { get; }
    private Credential(CredentialKind kind, string value) { Kind = kind; Value = value; }
    public static Credential OrganizationApiKey(string value) => Create(CredentialKind.OrganizationApiKey, value, "pmfa_");
    public static Credential ProjectToken(string value) => Create(CredentialKind.ProjectToken, value, "pmfa_pt_");
    public static Credential ClientToken(string value) => Create(CredentialKind.ClientToken, value, "^pmfa_ct_[^\\r\\n]+$");
    private static Credential Create(CredentialKind kind, string value, string pattern)
    {
        if (value is null || !(kind == CredentialKind.ClientToken ? ClientShape(value) : OpaqueShape(value, pattern)))
            throw new PolymorfaConfigurationException("Invalid credential.");
        if (kind == CredentialKind.OrganizationApiKey && new[] { "pmfa_pt_", "pmfa_ct_", "pmfa_ls_", "pmfa_at_", "pmfa_wst_", "pmfa_sd_" }.Any(prefix => value.StartsWith(prefix, StringComparison.Ordinal)))
            throw new PolymorfaConfigurationException("Special-purpose credentials cannot be used as organization API keys.");
        if (kind != CredentialKind.ClientToken && OperatingSystem.IsBrowser())
            throw new PolymorfaConfigurationException("Server credentials cannot be used in browser/WASM applications.");
        return new Credential(kind, value);
    }
    private static bool ClientShape(string value)
    {
        if (!value.StartsWith("pmfa_ct_", StringComparison.Ordinal)) return false;
        var body = value[8..];
        if (!Regex.IsMatch(body, "^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant)) return false;
        try {
            var raw = Convert.FromBase64String(body.Replace('-', '+').Replace('_', '/') + new string('=', (4-body.Length%4)%4));
            return Convert.ToBase64String(raw).TrimEnd('=').Replace('+','-').Replace('/','_') == body;
        } catch (FormatException) { return false; }
    }
    // Shape validation only; the API authenticates signatures and records.
    private static bool OpaqueShape(string value, string prefix)
    {
        if (!value.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var body = value[prefix.Length..];
        if (!Regex.IsMatch(body, "^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant)) return false;
        try
        {
            var raw = Convert.FromBase64String(body.Replace('-', '+').Replace('_', '/') + new string('=', (4 - body.Length % 4) % 4));
            if (raw.Length < 24 || Convert.ToBase64String(raw).TrimEnd('=').Replace('+', '-').Replace('/', '_') != body) return false;
            uint crc = 0xffffffff;
            foreach (var b in raw.AsSpan(0, raw.Length-4)) { crc ^= b; for(int i=0;i<8;i++) crc=(crc>>1)^((crc&1)!=0?0xedb88320u:0u); }
            return (crc ^ 0xffffffff) == System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(raw.AsSpan(raw.Length-4));
        }
        catch (FormatException) { return false; }
    }
    internal void RequireServer()
    {
        if (Kind == CredentialKind.ClientToken) throw new PolymorfaConfigurationException("This operation requires a server credential.");
        if (OperatingSystem.IsBrowser()) throw new PolymorfaConfigurationException("Server credentials cannot be used in browser/WASM applications.");
    }
    public override string ToString() => $"Credential({Kind}, redacted)";
}

public sealed record ClientOptions
{
    public Uri BaseUrl { get; init; } = new("https://api.polymorfa.com");
    public string ApiVersion { get; init; } = SdkVersion.NativeApiVersion;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    public int MaxNetworkRetries { get; init; } = 2;
    public IWebProxy? Proxy { get; init; }
    /// <summary>An application-owned transport handler. Standard HTTP handlers must disable redirects; custom handlers must honor that policy.</summary>
    public HttpMessageHandler? TransportHandler { get; init; }
    /// <summary>Creates an independent credential-free storage handler. Standard handlers must disable redirects and cookies. The SDK disposes each returned handler.</summary>
    public Func<HttpMessageHandler>? StorageTransportHandlerFactory { get; init; }
}
public sealed record RequestOptions
{
    public string? ApiVersion { get; init; }
    public IReadOnlyDictionary<string, string>? Headers { get; init; }
    public string? IdempotencyKey { get; init; }
    public int? MaxNetworkRetries { get; init; }
    public TimeSpan? Timeout { get; init; }
    public CancellationToken CancellationToken { get; init; }
    internal RequestOptions WithIdempotency() => IdempotencyHeaders.Prepare(this, generate: true);
}
public static class SdkVersion
{
    public const string Version = "0.1.0-dev.0";
    public const string NativeApiVersion = "2026-09-22";
}
