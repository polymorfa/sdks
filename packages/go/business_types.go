package polymorfa

// BusinessProfileDay represents one schedule entry. OpenTime and CloseTime are
// minutes after midnight and are present only for specific_hours.
type BusinessProfileDay struct {
	DayOfWeek string `json:"dayOfWeek"`
	Mode      string `json:"mode"`
	OpenTime  *int   `json:"openTime,omitempty"`
	CloseTime *int   `json:"closeTime,omitempty"`
}
type BusinessProfileHoursUpdate struct {
	TimeZone string               `json:"timeZone"`
	Days     []BusinessProfileDay `json:"days"`
}
type BusinessProfileUpdateRequest struct {
	Address     *string                     `json:"address,omitempty"`
	Email       *string                     `json:"email,omitempty"`
	Description *string                     `json:"description,omitempty"`
	Websites    *[]string                   `json:"websites,omitempty"`
	Hours       *BusinessProfileHoursUpdate `json:"hours,omitempty"`
}
type BusinessProfileStatus struct {
	Status string `json:"status"`
}
type BusinessCoverPhotoResult struct {
	CoverPhotoID string `json:"coverPhotoId"`
}
type BusinessActionSuccess struct {
	Success bool `json:"success"`
}
type BusinessCatalogParams struct {
	ID, After            string
	Limit, Width, Height int
}
type BusinessCollectionParams = BusinessCatalogParams
type BusinessCollectionsParams struct {
	ID, After                                 string
	CollectionLimit, ItemLimit, Width, Height int
}
type BusinessProductImageSource struct {
	URL      string `json:"url,omitempty"`
	Base64   string `json:"base64,omitempty"`
	MediaURL string `json:"mediaUrl,omitempty"`
}
type BusinessImporterAddress struct {
	Street1     string `json:"street1,omitempty"`
	Street2     string `json:"street2,omitempty"`
	City        string `json:"city,omitempty"`
	Region      string `json:"region,omitempty"`
	PostalCode  string `json:"postalCode,omitempty"`
	CountryCode string `json:"countryCode,omitempty"`
}
type BusinessProductCompliance struct {
	CountryCodeOrigin string                   `json:"countryCodeOrigin,omitempty"`
	ImporterName      string                   `json:"importerName,omitempty"`
	ImporterAddress   *BusinessImporterAddress `json:"importerAddress,omitempty"`
}
type BusinessProductMutationRequest struct {
	Name               string                       `json:"name"`
	Description        *string                      `json:"description,omitempty"`
	Currency           string                       `json:"currency,omitempty"`
	Price              string                       `json:"price,omitempty"`
	SalePrice          string                       `json:"salePrice,omitempty"`
	URL                string                       `json:"url,omitempty"`
	RetailerID         *string                      `json:"retailerId,omitempty"`
	Hidden             *bool                        `json:"hidden,omitempty"`
	Images             []BusinessProductImageSource `json:"images"`
	VideoURLs          []string                     `json:"videoUrls,omitempty"`
	ComplianceCategory string                       `json:"complianceCategory,omitempty"`
	Compliance         *BusinessProductCompliance   `json:"compliance,omitempty"`
	Width              int                          `json:"width,omitempty"`
	Height             int                          `json:"height,omitempty"`
}
type BusinessProductImage struct {
	ID          string `json:"id"`
	OriginalURL string `json:"originalUrl,omitempty"`
	RequestURL  string `json:"requestUrl,omitempty"`
}
type BusinessProductVideo struct {
	ID           string `json:"id"`
	OriginalURL  string `json:"originalUrl,omitempty"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
}
type BusinessProductMedia struct {
	Images []BusinessProductImage `json:"images"`
	Videos []BusinessProductVideo `json:"videos"`
}
type BusinessSalePrice struct {
	Price     string `json:"price"`
	StartDate string `json:"startDate,omitempty"`
	EndDate   string `json:"endDate,omitempty"`
}
type BusinessProductStatus struct {
	Status    string `json:"status,omitempty"`
	CanAppeal bool   `json:"canAppeal"`
}
type BusinessDimensions struct {
	Width  *int `json:"width,omitempty"`
	Height *int `json:"height,omitempty"`
}
type BusinessVariantThumbnail struct {
	ID                 string             `json:"id,omitempty"`
	OriginalURL        string             `json:"originalUrl,omitempty"`
	RequestURL         string             `json:"requestUrl,omitempty"`
	OriginalDimensions BusinessDimensions `json:"originalDimensions"`
}
type BusinessVariantProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type BusinessVariantAvailabilityItem struct {
	ProductID string                    `json:"productId,omitempty"`
	Available bool                      `json:"available"`
	Options   []BusinessVariantProperty `json:"options"`
}
type BusinessVariantAvailability struct {
	Listings []BusinessVariantAvailabilityItem `json:"listings"`
}
type BusinessVariantListing struct {
	Description string `json:"description,omitempty"`
	LowestPrice string `json:"lowestPrice,omitempty"`
	MultiPrice  string `json:"multiPrice,omitempty"`
}
type BusinessVariantOption struct {
	Value     string                    `json:"value"`
	Thumbnail *BusinessVariantThumbnail `json:"thumbnail,omitempty"`
}
type BusinessVariantType struct {
	Name    string                  `json:"name"`
	Options []BusinessVariantOption `json:"options"`
}
type BusinessProductVariant struct {
	Availability   BusinessVariantAvailability `json:"availability"`
	ListingDetails BusinessVariantListing      `json:"listingDetails"`
	Types          []BusinessVariantType       `json:"types"`
	Properties     []BusinessVariantProperty   `json:"properties"`
}
type BusinessProduct struct {
	ID                 string                     `json:"id"`
	Name               string                     `json:"name"`
	Price              string                     `json:"price"`
	Currency           string                     `json:"currency"`
	Hidden             bool                       `json:"hidden"`
	Sanctioned         bool                       `json:"sanctioned"`
	Media              BusinessProductMedia       `json:"media"`
	Status             BusinessProductStatus      `json:"status"`
	RetailerID         string                     `json:"retailerId,omitempty"`
	BelongsTo          string                     `json:"belongsTo,omitempty"`
	Description        string                     `json:"description,omitempty"`
	URL                string                     `json:"url,omitempty"`
	ShimmedURL         string                     `json:"shimmedUrl,omitempty"`
	MaxAvailable       *float64                   `json:"maxAvailable,omitempty"`
	Availability       string                     `json:"availability,omitempty"`
	ComplianceCategory string                     `json:"complianceCategory,omitempty"`
	Compliance         *BusinessProductCompliance `json:"compliance,omitempty"`
	SalePrice          *BusinessSalePrice         `json:"salePrice,omitempty"`
	Variant            *BusinessProductVariant    `json:"variant,omitempty"`
}
type BusinessCatalogPage struct {
	Next     string            `json:"next,omitempty"`
	Previous string            `json:"previous,omitempty"`
	Products []BusinessProduct `json:"products"`
}
type BusinessProductDeleteResult struct {
	DeletedCount int `json:"deletedCount"`
}
type BusinessCollectionStatus struct {
	Status       string `json:"status,omitempty"`
	CanAppeal    bool   `json:"canAppeal"`
	CommerceURL  string `json:"commerceUrl,omitempty"`
	RejectReason string `json:"rejectReason,omitempty"`
}
type BusinessCollection struct {
	ID       string                   `json:"id"`
	Name     string                   `json:"name"`
	Products []BusinessProduct        `json:"products"`
	Status   BusinessCollectionStatus `json:"status"`
}
type BusinessCollectionPage struct {
	Next        string               `json:"next,omitempty"`
	Collections []BusinessCollection `json:"collections"`
}
type BusinessCollectionCreateRequest struct {
	Name       string   `json:"name"`
	ProductIDs []string `json:"productIds"`
}
type BusinessCollectionUpdateRequest struct {
	Name             *string   `json:"name,omitempty"`
	AddProductIDs    *[]string `json:"addProductIds,omitempty"`
	RemoveProductIDs *[]string `json:"removeProductIds,omitempty"`
}
type BusinessCollectionMutationResult struct {
	ID           string `json:"id"`
	ReviewStatus string `json:"reviewStatus"`
}
type BusinessCollectionMove struct {
	CollectionID string `json:"collectionId"`
	FromIndex    int    `json:"fromIndex"`
	ToIndex      int    `json:"toIndex"`
}
type BusinessCollectionReorderRequest struct {
	Moves []BusinessCollectionMove `json:"moves"`
}
type BusinessCatalogAppealRequest struct {
	Reason string `json:"reason"`
}
type BusinessOrderLookupRequest struct {
	Token string `json:"token"`
}

func (BusinessOrderLookupRequest) String() string {
	return "BusinessOrderLookupRequest{Token:[redacted]}"
}
func (b BusinessOrderLookupRequest) GoString() string { return b.String() }

type BusinessOrderPrice struct {
	Subtotal    string `json:"subtotal"`
	Total       string `json:"total"`
	Currency    string `json:"currency"`
	PriceStatus string `json:"priceStatus,omitempty"`
}
type BusinessOrderProduct struct {
	ID                string  `json:"id"`
	Price             string  `json:"price"`
	Currency          string  `json:"currency"`
	Name              string  `json:"name"`
	Quantity          float64 `json:"quantity"`
	ImageID           string  `json:"imageId,omitempty"`
	ImageURL          string  `json:"imageUrl,omitempty"`
	VariantProperties string  `json:"variantProperties,omitempty"`
}
type BusinessOrder struct {
	ID        string                 `json:"id"`
	CreatedAt float64                `json:"createdAt"`
	CatalogID string                 `json:"catalogId,omitempty"`
	Price     BusinessOrderPrice     `json:"price"`
	Products  []BusinessOrderProduct `json:"products"`
}
type BusinessMerchantContact struct {
	Email          string `json:"email"`
	LandlineNumber string `json:"landlineNumber"`
	MobileNumber   string `json:"mobileNumber"`
}
type BusinessGrievanceOfficer struct {
	BusinessMerchantContact
	Name string `json:"name"`
}
type BusinessMerchantCompliance struct {
	EntityName       string                   `json:"entityName"`
	EntityType       string                   `json:"entityType"`
	IsRegistered     bool                     `json:"isRegistered"`
	EntityTypeCustom string                   `json:"entityTypeCustom"`
	CustomerCare     BusinessMerchantContact  `json:"customerCare"`
	GrievanceOfficer BusinessGrievanceOfficer `json:"grievanceOfficer"`
}
type BusinessAdStatus struct {
	HasActiveCTWAAd bool `json:"hasActiveCTWAAd"`
	HasCreatedAd    bool `json:"hasCreatedAd"`
}
type BusinessFacebookPage struct {
	BusinessAdStatus
	ID                   string `json:"id"`
	DisplayName          string `json:"displayName"`
	ProfileSync          string `json:"profileSync,omitempty"`
	ProfilePictureURL    string `json:"profilePictureUrl"`
	ShowOnProfile        bool   `json:"showOnProfile"`
	WhatsAppAsPageButton bool   `json:"whatsAppAsPageButton"`
}
type BusinessFacebookBusiness struct {
	ID           string `json:"id"`
	DisplayName  string `json:"displayName"`
	CatalogID    string `json:"catalogId,omitempty"`
	CatalogState string `json:"catalogState,omitempty"`
}
type BusinessInstagramProfessional struct {
	Handle            string `json:"handle"`
	DisplayName       string `json:"displayName"`
	ProfilePictureURL string `json:"profilePictureUrl"`
	ShowOnProfile     bool   `json:"showOnProfile"`
}
type BusinessWhatsAppAdIdentity struct {
	BusinessAdStatus
	ID string `json:"id"`
}
type BusinessLinkedAccounts struct {
	FacebookPage          *BusinessFacebookPage          `json:"facebookPage,omitempty"`
	FacebookBusiness      *BusinessFacebookBusiness      `json:"facebookBusiness,omitempty"`
	InstagramProfessional *BusinessInstagramProfessional `json:"instagramProfessional,omitempty"`
	WhatsAppAdIdentity    *BusinessWhatsAppAdIdentity    `json:"whatsAppAdIdentity,omitempty"`
}
type BusinessFeatureEligibility struct {
	Feature                           string   `json:"feature"`
	Status                            string   `json:"status"`
	Expiration                        *float64 `json:"expiration,omitempty"`
	AdditionalParams                  string   `json:"additionalParams,omitempty"`
	ShowPrivacyInterstitialToNewUsers *bool    `json:"showPrivacyInterstitialToNewUsers,omitempty"`
	V1Enabled                         *bool    `json:"v1Enabled,omitempty"`
}
type BusinessEligibility struct {
	Features []BusinessFeatureEligibility `json:"features"`
}
