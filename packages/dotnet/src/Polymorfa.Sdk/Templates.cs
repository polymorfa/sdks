using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record TemplateVariable(string Name, string Type, string Example);
[JsonConverter(typeof(TemplateHeaderConverter))]
public abstract record TemplateHeader;
public sealed record TemplateNoneHeader : TemplateHeader;
public sealed record TemplateTextHeader(string Text) : TemplateHeader;
public sealed record TemplateImageHeader(string? Example = null, string? Filename = null) : TemplateHeader;
public sealed record TemplateVideoHeader(string? Example = null, string? Filename = null) : TemplateHeader;
public sealed record TemplateDocumentHeader(string? Example = null, string? Filename = null) : TemplateHeader;
public sealed record TemplateLocationExample(double Latitude, double Longitude, string? Name = null, string? Address = null);
public sealed record TemplateLocationHeader(TemplateLocationExample? Example = null) : TemplateHeader;
[JsonConverter(typeof(TemplateButtonConverter))]
public abstract record TemplateButton;
public sealed record TemplateQuickReplyButton(string Text) : TemplateButton;
public sealed record TemplateUrlButton(string Text, string Url) : TemplateButton;
public sealed record TemplatePhoneButton(string Text, string Phone) : TemplateButton;
public sealed record TemplateCopyCodeButton(string? Text = null, string? Example = null) : TemplateButton;
public sealed record TemplateCarouselCard(TemplateHeader Header, string Body, IReadOnlyList<TemplateButton>? Buttons = null);
public sealed record TemplateCarousel(IReadOnlyList<TemplateCarouselCard> Cards);
public sealed record TemplateAuthentication(string OtpType, string? CodeExample = null, bool? AddSecurityRecommendation = null, int? CodeExpirationMinutes = null);
public sealed record TemplateLimitedTimeOffer(string Text, bool HasExpiration);
public sealed record TemplateDefinition(int Version, string Kind, string Category, string Language, string Body, IReadOnlyList<TemplateVariable> Variables, TemplateHeader? Header = null, string? Footer = null, IReadOnlyList<TemplateButton>? Buttons = null, TemplateCarousel? Carousel = null, TemplateAuthentication? Authentication = null, TemplateLimitedTimeOffer? LimitedTimeOffer = null);
public sealed record ProjectTemplate(string Id, string Name, string Category, string Language, string Status, string Kind, IReadOnlyList<JsonElement> CloudLinks, long CreatedAt, long UpdatedAt, TemplateDefinition? Definition = null, IReadOnlyDictionary<string, string>? SampleValues = null);
public sealed record CreateProjectTemplateRequest(string Name, TemplateDefinition Definition, IReadOnlyDictionary<string, string>? SampleValues = null);
public sealed record UpdateProjectTemplateRequest(string? Name = null, string? Status = null, TemplateDefinition? Definition = null, IReadOnlyDictionary<string, string>? SampleValues = null);
public sealed record PreviewProjectTemplateRequest(IReadOnlyDictionary<string, string>? Values = null, string? Surface = null);
public sealed record SubmitProjectTemplateRequest(string Session);
public sealed class Templates : Resource
{
    internal Templates(HttpTransport http) : base(http) { }
    private static string Path(string slug) => "/messaging/projects/" + E(slug) + "/templates";
    private static string Path(string slug, string id) => Path(slug) + "/" + E(id);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<ProjectTemplate>>>> ListAsync(string slug, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<ProjectTemplate>>>(Path(slug), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectTemplate>>> CreateAsync(string slug, CreateProjectTemplateRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<ProjectTemplate>>(Path(slug), body, options);
    public Task<ApiResponse<SuccessEnvelope<ProjectTemplate>>> RetrieveAsync(string slug, string id, RequestOptions? options = null) => Get<SuccessEnvelope<ProjectTemplate>>(Path(slug, id), options);
    public Task<ApiResponse<SuccessEnvelope<ProjectTemplate>>> UpdateAsync(string slug, string id, UpdateProjectTemplateRequest body, RequestOptions? options = null) => Patch<SuccessEnvelope<ProjectTemplate>>(Path(slug, id), body, options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string slug, string id, RequestOptions? options = null) => Delete<SuccessResponse>(Path(slug, id), options);
    public Task<ApiResponse<SuccessEnvelope<JsonElement>>> PreviewAsync(string slug, string id, PreviewProjectTemplateRequest? body = null, RequestOptions? options = null) => Post<SuccessEnvelope<JsonElement>>(Path(slug, id) + "/preview", body ?? new(), options);
    public Task<ApiResponse<SuccessEnvelope<JsonElement>>> SubmitAsync(string slug, string id, SubmitProjectTemplateRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<JsonElement>>(Path(slug, id) + "/submit", body, (options ?? new()) with { MaxNetworkRetries = 0 });
}
public sealed record CloudTemplate(string Id, string TenantId, string Session, string WabaId, string Name, string Language, string Category, string Status, IReadOnlyList<JsonElement> Components, string CreatedAt, string UpdatedAt, string? MetaTemplateId = null, string? RejectionReason = null, string? QualityScore = null);
public sealed record CreateCloudTemplateRequest(string Name, string Language, string Category, IReadOnlyList<JsonElement> Components);
public sealed record EditCloudTemplateRequest(IReadOnlyList<JsonElement> Components);
public sealed record EditCloudTemplateResult(bool Accepted, string Name, string Language);
public sealed class CloudTemplates : Resource
{
    internal CloudTemplates(HttpTransport http) : base(http) { }
    private static string Path(string session) => "/messaging/" + E(session) + "/templates";
    private static string Path(string session, string name) => Path(session) + "/" + E(name);
    private Task<ApiResponse<T>> Request<T>(HttpMethod method, string path, object? body, string? language, RequestOptions? options) { Http.Credential.RequireServer(); options ??= new(); if (method != HttpMethod.Get) options = options with { MaxNetworkRetries = 0 }; return Http.RequestAsync<T>(method, path, body, options, Query(new { language })); }
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<CloudTemplate>>>> ListAsync(string session, RequestOptions? options = null) => Request<SuccessEnvelope<IReadOnlyList<CloudTemplate>>>(HttpMethod.Get, Path(session), null, null, options);
    public Task<ApiResponse<SuccessEnvelope<CloudTemplate>>> RetrieveAsync(string session, string name, string? language = null, RequestOptions? options = null) => Request<SuccessEnvelope<CloudTemplate>>(HttpMethod.Get, Path(session, name), null, language, options);
    public Task<ApiResponse<SuccessEnvelope<CloudTemplate>>> CreateAsync(string session, CreateCloudTemplateRequest body, RequestOptions? options = null) => Request<SuccessEnvelope<CloudTemplate>>(HttpMethod.Post, Path(session), body, null, options);
    public Task<ApiResponse<SuccessEnvelope<EditCloudTemplateResult>>> UpdateAsync(string session, string name, EditCloudTemplateRequest body, string? language = null, RequestOptions? options = null) => Request<SuccessEnvelope<EditCloudTemplateResult>>(HttpMethod.Patch, Path(session, name), body, language, options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string session, string name, RequestOptions? options = null) => Request<SuccessResponse>(HttpMethod.Delete, Path(session, name), null, null, options);
}

internal sealed class TemplateHeaderConverter : JsonConverter<TemplateHeader>
{
    public override TemplateHeader Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader); var json = doc.RootElement;
        return json.GetProperty("format").GetString() switch { "none" => new TemplateNoneHeader(), "text" => json.Deserialize<TemplateTextHeader>(options)!, "image" => json.Deserialize<TemplateImageHeader>(options)!, "video" => json.Deserialize<TemplateVideoHeader>(options)!, "document" => json.Deserialize<TemplateDocumentHeader>(options)!, "location" => json.Deserialize<TemplateLocationHeader>(options)!, _ => throw new JsonException("Invalid template header format.") };
    }
    public override void Write(Utf8JsonWriter writer, TemplateHeader value, JsonSerializerOptions options)
    {
        var format = value switch { TemplateNoneHeader => "none", TemplateTextHeader => "text", TemplateImageHeader => "image", TemplateVideoHeader => "video", TemplateDocumentHeader => "document", TemplateLocationHeader => "location", _ => throw new JsonException("Invalid template header.") };
        TemplateButtonConverter.WriteUnion(writer, "format", format, value, options);
    }
}
internal sealed class TemplateButtonConverter : JsonConverter<TemplateButton>
{
    public override TemplateButton Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader); var json = doc.RootElement;
        return json.GetProperty("type").GetString() switch { "quick_reply" => json.Deserialize<TemplateQuickReplyButton>(options)!, "url" => json.Deserialize<TemplateUrlButton>(options)!, "phone" => json.Deserialize<TemplatePhoneButton>(options)!, "copy_code" => json.Deserialize<TemplateCopyCodeButton>(options)!, _ => throw new JsonException("Invalid template button type.") };
    }
    public override void Write(Utf8JsonWriter writer, TemplateButton value, JsonSerializerOptions options)
    {
        var type = value switch { TemplateQuickReplyButton => "quick_reply", TemplateUrlButton => "url", TemplatePhoneButton => "phone", TemplateCopyCodeButton => "copy_code", _ => throw new JsonException("Invalid template button.") };
        WriteUnion(writer, "type", type, value, options);
    }
    internal static void WriteUnion(Utf8JsonWriter writer, string discriminator, string tag, object value, JsonSerializerOptions options)
    {
        writer.WriteStartObject(); writer.WriteString(discriminator, tag);
        foreach (var property in JsonSerializer.SerializeToElement(value, value.GetType(), options).EnumerateObject()) property.WriteTo(writer);
        writer.WriteEndObject();
    }
}
