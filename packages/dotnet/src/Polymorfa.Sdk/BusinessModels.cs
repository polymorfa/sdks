using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record BusinessProfileDay(string DayOfWeek, string Mode, int? OpenTime = null, int? CloseTime = null);
public sealed record BusinessProfileHoursUpdate(string TimeZone, IReadOnlyList<BusinessProfileDay> Days);
public sealed record BusinessProfileUpdateRequest(string? Address = null, string? Email = null, string? Description = null, IReadOnlyList<string>? Websites = null, BusinessProfileHoursUpdate? Hours = null);
public sealed record BusinessProfileStatus(string Status);
public sealed record BusinessCoverPhotoResult(string CoverPhotoId);
public sealed record BusinessActionSuccess(bool Success);
public sealed record BusinessCatalogParameters(string Id, string? After = null, int? Limit = null, int? Width = null, int? Height = null);
public sealed record BusinessCollectionsParameters(string Id, string? After = null, int? CollectionLimit = null, int? ItemLimit = null, int? Width = null, int? Height = null);
public sealed record BusinessProductImageSource(string? Url = null, string? Base64 = null, string? MediaUrl = null);
public sealed record BusinessImporterAddress(string? Street1 = null, string? Street2 = null, string? City = null, string? Region = null, string? PostalCode = null, string? CountryCode = null);
public sealed record BusinessProductCompliance(string? CountryCodeOrigin = null, string? ImporterName = null, BusinessImporterAddress? ImporterAddress = null);
public sealed record BusinessProductMutationRequest(string Name, IReadOnlyList<BusinessProductImageSource> Images, string? Description = null, string? Currency = null, string? Price = null, string? SalePrice = null, string? Url = null, string? RetailerId = null, bool? Hidden = null, IReadOnlyList<string>? VideoUrls = null, string? ComplianceCategory = null, BusinessProductCompliance? Compliance = null, int? Width = null, int? Height = null);
public sealed record BusinessProductImage(string Id, string? OriginalUrl = null, string? RequestUrl = null);
public sealed record BusinessProductVideo(string Id, string? OriginalUrl = null, string? ThumbnailUrl = null);
public sealed record BusinessProductMedia(IReadOnlyList<BusinessProductImage> Images, IReadOnlyList<BusinessProductVideo> Videos);
public sealed record BusinessSalePrice(string Price, string? StartDate = null, string? EndDate = null);
public sealed record BusinessProductStatus(bool CanAppeal, string? Status = null);
public sealed record BusinessDimensions(int? Width = null, int? Height = null);
public sealed record BusinessVariantThumbnail(BusinessDimensions OriginalDimensions, string? Id = null, string? OriginalUrl = null, string? RequestUrl = null);
public sealed record BusinessVariantProperty(string Name, string Value);
public sealed record BusinessVariantAvailabilityItem(bool Available, IReadOnlyList<BusinessVariantProperty> Options, string? ProductId = null);
public sealed record BusinessVariantAvailability(IReadOnlyList<BusinessVariantAvailabilityItem> Listings);
public sealed record BusinessVariantListing(string? Description = null, string? LowestPrice = null, string? MultiPrice = null);
public sealed record BusinessVariantOption(string Value, BusinessVariantThumbnail? Thumbnail = null);
public sealed record BusinessVariantType(string Name, IReadOnlyList<BusinessVariantOption> Options);
public sealed record BusinessProductVariant(BusinessVariantAvailability Availability, BusinessVariantListing ListingDetails, IReadOnlyList<BusinessVariantType> Types, IReadOnlyList<BusinessVariantProperty> Properties);
public sealed record BusinessProduct(string Id, string Name, string Price, string Currency, bool Hidden, bool Sanctioned, BusinessProductMedia Media, BusinessProductStatus Status, string? RetailerId = null, string? BelongsTo = null, string? Description = null, string? Url = null, string? ShimmedUrl = null, decimal? MaxAvailable = null, string? Availability = null, string? ComplianceCategory = null, BusinessProductCompliance? Compliance = null, BusinessSalePrice? SalePrice = null, BusinessProductVariant? Variant = null);
public sealed record BusinessCatalogPage(IReadOnlyList<BusinessProduct> Products, string? Next = null, string? Previous = null);
public sealed record BusinessProductDeleteResult(int DeletedCount);
public sealed record BusinessCollectionStatus(bool CanAppeal, string? Status = null, string? CommerceUrl = null, string? RejectReason = null);
public sealed record BusinessCollection(string Id, string Name, IReadOnlyList<BusinessProduct> Products, BusinessCollectionStatus Status);
public sealed record BusinessCollectionPage(IReadOnlyList<BusinessCollection> Collections, string? Next = null);
public sealed record BusinessCollectionCreateRequest(string Name, IReadOnlyList<string> ProductIds);
public sealed record BusinessCollectionUpdateRequest(string? Name = null, IReadOnlyList<string>? AddProductIds = null, IReadOnlyList<string>? RemoveProductIds = null);
public sealed record BusinessCollectionMutationResult(string Id, string ReviewStatus);
public sealed record BusinessCollectionMove(string CollectionId, int FromIndex, int ToIndex);
public sealed record BusinessCollectionReorderRequest(IReadOnlyList<BusinessCollectionMove> Moves);
public sealed record BusinessCatalogAppealRequest(string Reason);
public sealed record BusinessOrderLookupRequest(string Token)
{
    public override string ToString() => "BusinessOrderLookupRequest { Token = [REDACTED] }";
}
public sealed record BusinessOrderPrice(string Subtotal, string Total, string Currency, string? PriceStatus = null);
public sealed record BusinessOrderProduct(string Id, string Price, string Currency, string Name, decimal Quantity, string? ImageId = null, string? ImageUrl = null, string? VariantProperties = null);
public sealed record BusinessOrder(string Id, long CreatedAt, BusinessOrderPrice Price, IReadOnlyList<BusinessOrderProduct> Products, string? CatalogId = null);
public sealed record BusinessMerchantContact(string Email, string LandlineNumber, string MobileNumber);
public sealed record BusinessMerchantOfficer(string Name, string Email, string LandlineNumber, string MobileNumber);
public sealed record BusinessMerchantCompliance(string EntityName, string EntityType, bool IsRegistered, string EntityTypeCustom, BusinessMerchantContact CustomerCare, BusinessMerchantOfficer GrievanceOfficer);
public sealed record BusinessFacebookPage(string Id, string DisplayName, string ProfilePictureUrl, bool ShowOnProfile, bool WhatsAppAsPageButton, [property: JsonPropertyName("hasActiveCTWAAd")] bool HasActiveCtwaAd, bool HasCreatedAd, string? ProfileSync = null);
public sealed record BusinessFacebookBusiness(string Id, string DisplayName, string? CatalogId = null, string? CatalogState = null);
public sealed record BusinessInstagramProfessional(string Handle, string DisplayName, string ProfilePictureUrl, bool ShowOnProfile);
public sealed record BusinessWhatsAppAdIdentity(string Id, [property: JsonPropertyName("hasActiveCTWAAd")] bool HasActiveCtwaAd, bool HasCreatedAd);
public sealed record BusinessLinkedAccounts(BusinessFacebookPage? FacebookPage = null, BusinessFacebookBusiness? FacebookBusiness = null, BusinessInstagramProfessional? InstagramProfessional = null, BusinessWhatsAppAdIdentity? WhatsAppAdIdentity = null);
public sealed record BusinessFeatureEligibility(string Feature, string Status, long? Expiration = null, string? AdditionalParams = null, bool? ShowPrivacyInterstitialToNewUsers = null, bool? V1Enabled = null);
public sealed record BusinessEligibility(IReadOnlyList<BusinessFeatureEligibility> Features);
