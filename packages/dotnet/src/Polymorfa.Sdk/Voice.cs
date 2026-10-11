using System.Diagnostics;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record VoiceAudioTts(string Provider, string VoiceId, string Model, string Text, long Characters, string KeySource, string? CredentialId);
public sealed record VoiceAudioAsset(string Id, string ProjectId, string Name, string Source, string Status, string? FailureReason, string? OriginalFormat, string? OriginalContentType, long? SizeBytes, long? DurationMs, string? ContentSha256, VoiceAudioTts? Tts, int? RetentionDays, string? ExpiresAt, long InUseCount, long Revision, string CreatedAt, string UpdatedAt, string? ReadyAt);
public sealed record VoiceAudioUpload(string Url, string Method, IReadOnlyDictionary<string, string> Headers, long MaxBytes, string ExpiresAt) { public override string ToString() => "VoiceAudioUpload(url=redacted, headers=redacted)"; }
public sealed record VoiceAudioUploadCreated(VoiceAudioAsset Asset, VoiceAudioUpload Upload);
public sealed record VoiceAudioPreview(string Url, string ContentType, string ExpiresAt) { public override string ToString() => "VoiceAudioPreview(url=redacted)"; }
public sealed record VoiceProviderCredential(string Id, string? ProjectId, string Provider, string Label, string KeyFingerprint, string Status, string? VerifiedAt, string? LastError, long Revision, string CreatedAt, string UpdatedAt);
public sealed record VoiceResourceDeleted(string Id, bool Deleted);
public sealed record ListVoiceAudioParameters(string? Status = null, string? Cursor = null, int? Limit = null);
public sealed record CreateVoiceAudioUploadInput(string Name, string ContentType, long SizeBytes, int? RetentionDays = null);
public sealed record SynthesizeVoiceAudioInput(string Name, string Text, string Provider, string VoiceId, string? Model = null, string? CredentialId = null, int? RetentionDays = null);
public sealed record UpdateVoiceAudioInput(long? ExpectedRevision = null, string? Name = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<int?> RetentionDays = default);
public sealed record CreateVoiceProviderCredentialInput(string Provider, string Label, string ApiKey, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> ProjectId = default) { public override string ToString() => $"CreateVoiceProviderCredentialInput(provider={Provider}, apiKey=redacted)"; }
public sealed record WaitForVoiceAudioOptions(TimeSpan? Timeout = null, TimeSpan? Interval = null, CancellationToken CancellationToken = default);
public sealed class Voice
{
    public VoiceAudio Audio { get; }
    public VoiceProviderCredentials ProviderCredentials { get; }
    internal Voice(HttpTransport http, string? projectId) { Audio = new(http, projectId); ProviderCredentials = new(http, projectId); }
}
public sealed class VoiceAudio : Resource
{
    private const string Path = "/platform/voice/audio";
    private readonly string? projectId;
    internal VoiceAudio(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    private string Project(string? requested) { if (projectId is not null) { if (requested is not null && !string.Equals(requested, projectId, StringComparison.OrdinalIgnoreCase)) throw new PolymorfaValidationException("This client uses its own project.", "invalid_parameter"); return projectId; } return !string.IsNullOrWhiteSpace(requested) ? requested : throw new PolymorfaConfigurationException("A projectId is required for an organization client."); }
    private static string AssetPath(string id) => Path + "/" + E(!string.IsNullOrWhiteSpace(id) ? id : throw new PolymorfaConfigurationException("An assetId is required."));
    private async Task<ApiResponse<T>> Request<T>(HttpMethod method, string path, object? body, RequestOptions? options) { var r = await Http.RequestAsync<DataEnvelope<T>>(method, path, body, options).ConfigureAwait(false); return new(r.Data.Data, r.Metadata); }
    public Task<CursorPage<VoiceAudioAsset>> ListAsync(string? projectId = null, ListVoiceAudioParameters? parameters = null, RequestOptions? options = null) => CursorPage<VoiceAudioAsset>.LoadAsync(Http, Path, Query(new { projectId = Project(projectId), parameters?.Status, parameters?.Cursor, parameters?.Limit }), options ?? new());
    public Task<ApiResponse<VoiceAudioUploadCreated>> CreateUploadAsync(CreateVoiceAudioUploadInput input, string? projectId = null, RequestOptions? options = null) => Request<VoiceAudioUploadCreated>(HttpMethod.Post, Path, new { input.Name, input.ContentType, input.SizeBytes, input.RetentionDays, projectId = Project(projectId) }, options);
    public Task<ApiResponse<VoiceAudioAsset>> SynthesizeAsync(SynthesizeVoiceAudioInput input, string? projectId = null, RequestOptions? options = null) => Request<VoiceAudioAsset>(HttpMethod.Post, Path + "/tts", new { input.Name, input.Text, input.Provider, input.VoiceId, input.Model, input.CredentialId, input.RetentionDays, projectId = Project(projectId) }, options);
    private Task<ApiResponse<VoiceAudioAsset>> Read(string id, RequestOptions? options) => Request<VoiceAudioAsset>(HttpMethod.Get, AssetPath(id), null, options);
    private void AssertProject(VoiceAudioAsset asset) { if (projectId is not null && !string.Equals(projectId, asset.ProjectId, StringComparison.OrdinalIgnoreCase)) throw new PolymorfaNotFoundException("Audio asset not found.", "resource_not_found"); }
    private async Task Confine(string id, RequestOptions? options) { if (projectId is null || Http.Credential.Kind == CredentialKind.ProjectToken) return; AssertProject((await Read(id, (options ?? new()) with { IdempotencyKey = null }).ConfigureAwait(false)).Data); }
    public async Task<ApiResponse<VoiceAudioAsset>> RetrieveAsync(string id, RequestOptions? options = null) { var r = await Read(id, options).ConfigureAwait(false); AssertProject(r.Data); return r; }
    public async Task<ApiResponse<VoiceAudioAsset>> CompleteAsync(string id, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceAudioAsset>(HttpMethod.Post, AssetPath(id) + "/complete", null, options).ConfigureAwait(false); }
    public async Task<ApiResponse<VoiceAudioAsset>> UpdateAsync(string id, UpdateVoiceAudioInput input, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceAudioAsset>(HttpMethod.Patch, AssetPath(id), input, options).ConfigureAwait(false); }
    public async Task<ApiResponse<VoiceResourceDeleted>> DeleteAsync(string id, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceResourceDeleted>(HttpMethod.Delete, AssetPath(id), null, options).ConfigureAwait(false); }
    public async Task<ApiResponse<VoiceAudioPreview>> PreviewUrlAsync(string id, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceAudioPreview>(HttpMethod.Get, AssetPath(id) + "/preview", null, options).ConfigureAwait(false); }
    public async Task<ApiResponse<VoiceAudioAsset>> WaitUntilReadyAsync(string id, WaitForVoiceAudioOptions? wait = null, RequestOptions? options = null)
    {
        wait ??= new(); options ??= new(); var timeout = wait.Timeout ?? TimeSpan.FromMinutes(2); var interval = wait.Interval ?? TimeSpan.FromSeconds(2);
        if (timeout < TimeSpan.Zero || interval < TimeSpan.Zero) throw new PolymorfaValidationException("Wait durations cannot be negative.", "invalid_parameter");
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, wait.CancellationToken); using var budget = CancellationTokenSource.CreateLinkedTokenSource(caller.Token); budget.CancelAfter(timeout); var started = Stopwatch.GetTimestamp();
        try { while (true) { if (Stopwatch.GetElapsedTime(started) >= timeout) throw new PolymorfaTimeoutException("The audio asset was not processed before the deadline."); var response = await RetrieveAsync(id, options with { CancellationToken = budget.Token }).ConfigureAwait(false); if (Stopwatch.GetElapsedTime(started) >= timeout) throw new PolymorfaTimeoutException("The audio asset was not processed before the deadline."); if (response.Data.Status is "ready" or "failed") return response; await Task.Delay(interval, budget.Token).ConfigureAwait(false); } }
        catch (Exception e) when (e is OperationCanceledException or PolymorfaCancelledException) { if (caller.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("The audio asset was not processed before the deadline."); }
    }
    public async Task<ApiResponse<VoiceAudioAsset>> UploadAsync(CreateVoiceAudioUploadInput input, Stream body, string? projectId = null, RequestOptions? options = null)
    {
        options ??= new();
        if (input.SizeBytes is < 1 or > 16777216) throw new PolymorfaValidationException("The upload size is out of range.", "invalid_parameter");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); deadline.CancelAfter(options.Timeout ?? Http.Options.Timeout);
        using var bytes = new MemoryStream(); var buffer = new byte[65536];
        try
        {
            while (true) { var count = await body.ReadAsync(buffer, deadline.Token).ConfigureAwait(false); if (count == 0) break; if (bytes.Length + count > input.SizeBytes) throw new PolymorfaValidationException("The upload size does not match the audio bytes.", "invalid_parameter"); await bytes.WriteAsync(buffer.AsMemory(0, count), deadline.Token).ConfigureAwait(false); }
        }
        catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Audio input timed out."); }
        return await UploadAsync(input, bytes.ToArray(), projectId, options).ConfigureAwait(false);
    }
    public async Task<ApiResponse<VoiceAudioAsset>> UploadAsync(CreateVoiceAudioUploadInput input, ReadOnlyMemory<byte> body, string? projectId = null, RequestOptions? options = null)
    {
        options ??= new(); if (input.SizeBytes != body.Length || body.Length is < 1 or > 16777216) throw new PolymorfaValidationException("The upload size does not match the audio bytes.", "invalid_parameter");
        if (input.ContentType is not ("audio/mpeg" or "audio/wav" or "audio/x-wav" or "audio/ogg" or "audio/mp4" or "audio/x-m4a")) throw new PolymorfaValidationException("Unsupported audio content type.", "invalid_parameter");
        var created = await CreateUploadAsync(input, projectId, options).ConfigureAwait(false); var upload = created.Data.Upload;
        if (!Uri.TryCreate(upload.Url, UriKind.Absolute, out var url) || url.UserInfo.Length != 0 || url.Scheme != "https" || upload.Method != "POST" || upload.MaxBytes < body.Length) throw new PolymorfaServerException("Invalid audio upload target.", "invalid_response", created.Metadata);
        using var storage = Http.CreateStorageClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = new ByteArrayContent(body.ToArray()) };
        foreach (var (name, value) in upload.Headers) { if (name.Equals("authorization", StringComparison.OrdinalIgnoreCase) || name.Equals("cookie", StringComparison.OrdinalIgnoreCase) || name.Equals("host", StringComparison.OrdinalIgnoreCase)) throw new PolymorfaServerException("Invalid audio upload header.", "invalid_response", created.Metadata); if (!request.Headers.TryAddWithoutValidation(name, value) && !request.Content.Headers.TryAddWithoutValidation(name, value)) throw new PolymorfaServerException("Invalid audio upload header.", "invalid_response", created.Metadata); }
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); linked.CancelAfter(options.Timeout ?? Http.Options.Timeout);
        try { using var response = await storage.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false); if (!response.IsSuccessStatusCode) throw new PolymorfaException("Audio storage rejected the upload.", "voice_upload_failed", created.Metadata); }
        catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Audio upload timed out."); }
        catch (HttpRequestException) { throw new PolymorfaConnectionException("Cannot reach audio storage."); }
        return await Request<VoiceAudioAsset>(HttpMethod.Post, AssetPath(created.Data.Asset.Id) + "/complete", null, options with { IdempotencyKey = null }).ConfigureAwait(false);
    }
}
public sealed class VoiceProviderCredentials : Resource
{
    private const string Path = "/platform/voice/provider-credentials";
    private readonly string? projectId;
    internal VoiceProviderCredentials(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    private static string CredentialPath(string id) => Path + "/" + E(!string.IsNullOrWhiteSpace(id) ? id : throw new PolymorfaConfigurationException("A credentialId is required."));
    private async Task<ApiResponse<T>> Request<T>(HttpMethod method, string path, object? body, RequestOptions? options, object? query = null) { var r = await Http.RequestAsync<DataEnvelope<T>>(method, path, body, options, Query(query)).ConfigureAwait(false); return new(r.Data.Data, r.Metadata); }
    public Task<ApiResponse<IReadOnlyList<VoiceProviderCredential>>> ListAsync(string? projectId = null, RequestOptions? options = null) => Request<IReadOnlyList<VoiceProviderCredential>>(HttpMethod.Get, Path, null, options, new { projectId = this.projectId ?? projectId });
    public Task<ApiResponse<VoiceProviderCredential>> CreateAsync(CreateVoiceProviderCredentialInput input, RequestOptions? options = null) { if (string.IsNullOrEmpty(input.ApiKey)) throw new PolymorfaConfigurationException("A provider apiKey is required."); return Request<VoiceProviderCredential>(HttpMethod.Post, Path, input with { ProjectId = projectId is null ? input.ProjectId : PatchValue<string>.Set(projectId) }, options); }
    private void AssertVisible(VoiceProviderCredential c) { if (projectId is not null && c.ProjectId is not null && !string.Equals(c.ProjectId, projectId, StringComparison.OrdinalIgnoreCase)) throw new PolymorfaNotFoundException("Provider credential not found.", "resource_not_found"); }
    public async Task<ApiResponse<VoiceProviderCredential>> RetrieveAsync(string id, RequestOptions? options = null) { var r = await Request<VoiceProviderCredential>(HttpMethod.Get, CredentialPath(id), null, options).ConfigureAwait(false); AssertVisible(r.Data); return r; }
    private async Task Confine(string id, RequestOptions? options) { if (projectId is null || Http.Credential.Kind == CredentialKind.ProjectToken) return; var c = (await RetrieveAsync(id, (options ?? new()) with { IdempotencyKey = null }).ConfigureAwait(false)).Data; if (c.ProjectId is null) throw new PolymorfaAuthorizationException("Manage team-wide credentials from the organization client.", "permission_denied"); }
    public async Task<ApiResponse<VoiceProviderCredential>> VerifyAsync(string id, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceProviderCredential>(HttpMethod.Post, CredentialPath(id) + "/verify", null, options).ConfigureAwait(false); }
    public async Task<ApiResponse<VoiceResourceDeleted>> DeleteAsync(string id, RequestOptions? options = null) { await Confine(id, options).ConfigureAwait(false); return await Request<VoiceResourceDeleted>(HttpMethod.Delete, CredentialPath(id), null, options).ConfigureAwait(false); }
}
