using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record CloudProductCatalog(string Id, string? Name = null);
public sealed record CloudCatalogProduct(string Id, [property: JsonPropertyName("retailer_id")] string? RetailerId = null, string? Name = null, string? Availability = null);
public sealed record CloudGraphCursors(string? Before = null, string? After = null);
public sealed record CloudGraphPaging(CloudGraphCursors Cursors);
public sealed record CloudCatalogList(IReadOnlyList<CloudProductCatalog> Data, CloudGraphPaging? Paging = null);
public sealed record CloudCatalogProductList(IReadOnlyList<CloudCatalogProduct> Data, CloudGraphPaging? Paging = null);
public sealed record CloudMarketingStatus(string Id, [property: JsonPropertyName("marketing_messages_lite_api_status")] string? MarketingMessagesLiteApiStatus = null, [property: JsonPropertyName("marketing_messages_onboarding_status")] string? MarketingMessagesOnboardingStatus = null);
public sealed record FlowEncryptionKey([property: JsonPropertyName("business_public_key")] string BusinessPublicKey, [property: JsonPropertyName("business_public_key_signature_status")] string BusinessPublicKeySignatureStatus);
public sealed record FlowEncryptionKeyList(IReadOnlyList<FlowEncryptionKey> Data);
public sealed record RegisterFlowEncryptionKeyRequest([property: JsonPropertyName("business_public_key")] string BusinessPublicKey);
public sealed record CloudCatalogParameters(string Version, int? Limit = null, string? After = null);
public sealed class CloudGraph : Resource
{
    internal CloudGraph(HttpTransport http) : base(http) { }
    private string Path(string id, string version) { Http.Credential.RequireServer(); if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(version)) throw new PolymorfaConfigurationException("Provide an identifier and Graph version."); return "/graph/whatsapp/" + E(version) + "/" + E(id); }
    public Task<ApiResponse<CloudCatalogList>> ListCatalogsAsync(string waba, CloudCatalogParameters parameters, RequestOptions? options = null) => Get<CloudCatalogList>(Path(waba, parameters.Version) + "/product_catalogs", options, new { parameters.Limit, parameters.After });
    public Task<ApiResponse<CloudCatalogProductList>> ListProductsAsync(string waba, string catalog, CloudCatalogParameters parameters, RequestOptions? options = null) { if (!System.Text.RegularExpressions.Regex.IsMatch(catalog, "^[0-9]+$")) throw new PolymorfaConfigurationException("Provide a numeric catalog ID."); return Get<CloudCatalogProductList>(Path(waba, parameters.Version) + "/product_catalogs/" + E(catalog) + "/products", options, new { parameters.Limit, parameters.After }); }
    public Task<ApiResponse<CloudMarketingStatus>> MarketingStatusAsync(string waba, string version, RequestOptions? options = null) => Get<CloudMarketingStatus>(Path(waba, version) + "/marketing_messages/status", options);
    public Task<ApiResponse<FlowEncryptionKeyList>> RetrieveEncryptionKeyAsync(string phone, string version, RequestOptions? options = null) => Get<FlowEncryptionKeyList>(Path(phone, version) + "/whatsapp_business_encryption", options);
    public Task<ApiResponse<SuccessResponse>> RegisterEncryptionKeyAsync(string phone, RegisterFlowEncryptionKeyRequest body, string version, RequestOptions? options = null) => Post<SuccessResponse>(Path(phone, version) + "/whatsapp_business_encryption", body, (options ?? new()) with { MaxNetworkRetries = 0 });
}
