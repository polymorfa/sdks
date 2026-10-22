namespace Polymorfa.Sdk;

/// <summary>Ciphertext-only upload capability. No plaintext, media key or API credential is exposed.</summary>
public sealed class WhatsAppEncryptedUploadBody
{
    internal PreparedWhatsAppUpload Prepared { get; }
    private readonly byte[] hash;
    private readonly CancellationToken cancellation;
    public WhatsAppUploadMediaType MediaType { get; }
    public byte[] FileEncSha256 => hash.ToArray();
    public long EncryptedLength { get; }
    internal WhatsAppEncryptedUploadBody(PreparedWhatsAppUpload prepared, CancellationToken cancellation)
    {
        Prepared = prepared;
        MediaType = prepared.Info.MediaType;
        hash = prepared.Info.FileEncSha256.ToArray();
        EncryptedLength = prepared.Info.EncryptedLength;
        this.cancellation = cancellation;
    }
    /// <summary>Opens verified ciphertext from an offset. The transport owns and closes the returned stream.</summary>
    public Task<Stream> OpenAsync(long offset = 0)
    {
        if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException();
        return Prepared.OpenAsync(offset, cancellation);
    }
    public override string ToString() => "WhatsAppEncryptedUploadBody(redacted)";
}

public interface IWhatsAppMediaUploadTransport
{
    string Name { get; }
    Task<WhatsAppUploadLocation> UploadAsync(string session, WhatsAppEncryptedUploadBody body, CancellationToken cancellation = default);
}

public sealed partial class WhatsAppMediaResource
{
    /// <summary>Invokes a custom ciphertext-only transport. Its own errors remain unchanged.</summary>
    public async Task<WhatsAppMediaUploadResult> UploadAsync(string session, PreparedWhatsAppUpload prepared, IWhatsAppMediaUploadTransport transport, CancellationToken cancellation = default)
    {
        if (string.IsNullOrEmpty(session) || transport is null || string.IsNullOrEmpty(transport.Name)) throw new PolymorfaConfigurationException("A session and named upload transport are required.");
        if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException();
        var egress = transport.Name;
        var info = prepared.Info with { MediaKey = prepared.Info.MediaKey.ToArray(), FileSha256 = prepared.Info.FileSha256.ToArray(), FileEncSha256 = prepared.Info.FileEncSha256.ToArray() };
        var body = new WhatsAppEncryptedUploadBody(prepared, cancellation);
        try
        {
            var location = await transport.UploadAsync(session, body, cancellation).WaitAsync(cancellation).ConfigureAwait(false);
            if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException();
            return new(info, location, egress);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw new PolymorfaCancelledException(); }
    }
    public IWhatsAppMediaUploadTransport RelayTransport(RequestOptions? request = null) => new BuiltinUploadTransport(this, null, request);
    public IWhatsAppMediaUploadTransport DirectTransport(WhatsAppDirectUploadOptions? direct = null, RequestOptions? request = null)
    {
        http.Credential.RequireServer();
        direct ??= new();
        if (direct.MaxAttempts < 1 || direct.DocumentPartSize < 1 || direct.Timeout <= TimeSpan.Zero) throw new PolymorfaConfigurationException("Invalid direct upload options.");
        return new BuiltinUploadTransport(this, direct, request);
    }
    private sealed class BuiltinUploadTransport(WhatsAppMediaResource resource, WhatsAppDirectUploadOptions? direct, RequestOptions? request) : IWhatsAppMediaUploadTransport
    {
        public string Name => direct is null ? "relay" : "direct";
        public async Task<WhatsAppUploadLocation> UploadAsync(string session, WhatsAppEncryptedUploadBody body, CancellationToken cancellation = default)
        {
            using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellation, request?.CancellationToken ?? default, direct?.CancellationToken ?? default);
            if (stop.IsCancellationRequested) throw new PolymorfaCancelledException();
            var options = (request ?? new()) with { CancellationToken = stop.Token };
            try
            {
                var work = direct is null
                    ? resource.UploadRelayAsync(session, body.Prepared, options)
                    : resource.UploadDirectAsync(session, body.Prepared, direct with { CancellationToken = stop.Token }, options);
                return (await work.WaitAsync(stop.Token).ConfigureAwait(false)).Location;
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { throw new PolymorfaCancelledException(); }
        }
    }
}
