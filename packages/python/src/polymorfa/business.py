"""Business profile, compliance and linked-account observations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, cast

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import AsyncAccepted, BusinessProfile, Envelope, PictureSource
from .transport import ApiResponse, QueryValue, RequestOptions

Day = Literal["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


class SpecificHours(TypedDict):
    dayOfWeek: Day
    mode: Literal["specific_hours"]
    openTime: int
    closeTime: int


class GeneralHours(TypedDict):
    dayOfWeek: Day
    mode: Literal["open_24h", "appointment_only"]


class HoursUpdate(TypedDict):
    timeZone: str
    days: list[SpecificHours | GeneralHours]


class ProfileUpdate(TypedDict, total=False):
    address: str
    email: str
    description: str
    websites: list[str]
    hours: HoursUpdate


class ProfileStatus(TypedDict):
    status: str


class CoverPhotoResult(TypedDict):
    coverPhotoId: str


class MerchantContact(TypedDict):
    email: str
    landlineNumber: str
    mobileNumber: str


class MerchantOfficer(MerchantContact):
    name: str


class MerchantCompliance(TypedDict):
    entityName: str
    entityType: Literal[
        "SOLE_PROPRIETORSHIP",
        "PARTNERSHIP",
        "PRIVATE_COMPANY",
        "PUBLIC_COMPANY",
        "LIMITED_LIABILITY_PARTNERSHIP",
        "OTHER",
    ]
    isRegistered: bool
    entityTypeCustom: str
    customerCare: MerchantContact
    grievanceOfficer: MerchantOfficer


class AdStatus(TypedDict):
    hasActiveCTWAAd: bool
    hasCreatedAd: bool


class FacebookPage(AdStatus):
    id: str
    displayName: str
    profileSync: NotRequired[Literal["disable", "import"]]
    profilePictureUrl: str
    showOnProfile: bool
    whatsAppAsPageButton: bool


class FacebookBusiness(TypedDict):
    id: str
    displayName: str
    catalogId: NotRequired[str]
    catalogState: NotRequired[Literal["disable", "import"]]


class InstagramProfessional(TypedDict):
    handle: str
    displayName: str
    profilePictureUrl: str
    showOnProfile: bool


class WhatsAppAdIdentity(AdStatus):
    id: str


class LinkedAccounts(TypedDict, total=False):
    facebookPage: FacebookPage
    facebookBusiness: FacebookBusiness
    instagramProfessional: InstagramProfessional
    whatsAppAdIdentity: WhatsAppAdIdentity


class FeatureEligibility(TypedDict):
    feature: Literal[
        "meta_verified", "marketing_messages", "genai", "genai_image", "meta_one", "bb_pro"
    ]
    status: str
    expiration: NotRequired[int]
    additionalParams: NotRequired[str]
    showPrivacyInterstitialToNewUsers: NotRequired[bool]
    v1Enabled: NotRequired[bool]


class BusinessEligibility(TypedDict):
    features: list[FeatureEligibility]


class Business(Resource):
    async def get_profile(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[BusinessProfile]]:
        return await self._request("GET", self._path(session) + "/profile", options=options)

    async def update_profile(
        self, session: str, body: ProfileUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProfileStatus] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PATCH", self._path(session) + "/profile", body=body, options=options
        )

    async def set_cover_photo(
        self, session: str, body: PictureSource, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CoverPhotoResult] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PUT", self._path(session) + "/profile/cover-photo", body=body, options=options
        )

    async def delete_cover_photo(
        self, session: str, cover_photo_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProfileStatus] | Envelope[AsyncAccepted]]:
        return await self._request(
            "DELETE",
            self._path(session) + "/profile/cover-photo/" + segment(cover_photo_id),
            options=options,
        )

    async def get_merchant_compliance(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[MerchantCompliance]]:
        return await self._request("GET", self._path(session) + "/compliance", options=options)

    async def set_merchant_compliance(
        self, session: str, body: MerchantCompliance, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[MerchantCompliance] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PUT", self._path(session) + "/compliance", body=body, options=options
        )

    async def get_linked_accounts(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[LinkedAccounts]]:
        return await self._request("GET", self._path(session) + "/linked-accounts", options=options)

    async def get_eligibility(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[BusinessEligibility]]:
        return await self._request("GET", self._path(session) + "/eligibility", options=options)

    async def get_catalog(
        self, session: str, params: CatalogParams, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CatalogPage]]:
        return await self._request(
            "GET",
            self._path(session) + "/catalog",
            query=cast(Mapping[str, QueryValue], params),
            options=options,
        )

    async def create_catalog(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request("POST", self._path(session) + "/catalog", options=options)

    async def set_cart_enabled(
        self, session: str, body: CartSetting, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PATCH", self._path(session) + "/catalog/cart", body=body, options=options
        )

    async def get_product(
        self, session: str, product_id: str, params: ProductParams, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Product]]:
        return await self._request(
            "GET",
            self._path(session) + "/products/" + segment(product_id),
            query=cast(Mapping[str, QueryValue], params),
            options=options,
        )

    async def create_product(
        self, session: str, body: ProductMutation, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Product] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST", self._path(session) + "/products", body=body, options=options
        )

    async def update_product(
        self, session: str, product_id: str, body: ProductMutation, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Product] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PUT",
            self._path(session) + "/products/" + segment(product_id),
            body=body,
            options=options,
        )

    async def delete_product(
        self, session: str, product_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[DeleteProductResult] | Envelope[AsyncAccepted]]:
        return await self._request(
            "DELETE", self._path(session) + "/products/" + segment(product_id), options=options
        )

    async def set_product_visibility(
        self, session: str, product_id: str, body: ProductVisibility, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PATCH",
            self._path(session) + "/products/" + segment(product_id) + "/visibility",
            body=body,
            options=options,
        )

    async def appeal_product(
        self, session: str, product_id: str, body: Appeal, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            self._path(session) + "/products/" + segment(product_id) + "/appeal",
            body=body,
            options=options,
        )

    async def list_collections(
        self, session: str, params: CollectionsParams, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CollectionPage]]:
        return await self._request(
            "GET",
            self._path(session) + "/collections",
            query=cast(Mapping[str, QueryValue], params),
            options=options,
        )

    async def get_collection(
        self,
        session: str,
        collection_id: str,
        params: CatalogParams,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[Collection]]:
        return await self._request(
            "GET",
            self._path(session) + "/collections/" + segment(collection_id),
            query=cast(Mapping[str, QueryValue], params),
            options=options,
        )

    async def create_collection(
        self, session: str, body: CollectionCreate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CollectionResult] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST", self._path(session) + "/collections", body=body, options=options
        )

    async def update_collection(
        self,
        session: str,
        collection_id: str,
        body: CollectionUpdate,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[CollectionResult] | Envelope[AsyncAccepted]]:
        return await self._request(
            "PATCH",
            self._path(session) + "/collections/" + segment(collection_id),
            body=body,
            options=options,
        )

    async def delete_collection(
        self, session: str, collection_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "DELETE",
            self._path(session) + "/collections/" + segment(collection_id),
            options=options,
        )

    async def reorder_collections(
        self, session: str, body: CollectionReorder, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST", self._path(session) + "/collections/reorder", body=body, options=options
        )

    async def appeal_collection(
        self, session: str, collection_id: str, body: Appeal, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionSuccess] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            self._path(session) + "/collections/" + segment(collection_id) + "/appeal",
            body=body,
            options=options,
        )

    async def get_order(
        self, session: str, order_id: str, body: OrderLookup, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Order] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            self._path(session) + "/orders/" + segment(order_id) + "/lookup",
            body=body,
            options=options,
        )

    @staticmethod
    def _path(session: str) -> str:
        return f"/messaging/{segment(session)}/business"


class CatalogParams(TypedDict):
    id: str
    after: NotRequired[str]
    limit: NotRequired[int]
    width: NotRequired[int]
    height: NotRequired[int]


class ProductParams(TypedDict):
    id: str


class CollectionsParams(TypedDict):
    id: str
    after: NotRequired[str]
    collectionLimit: NotRequired[int]
    itemLimit: NotRequired[int]
    width: NotRequired[int]
    height: NotRequired[int]


class ExistingImage(TypedDict):
    mediaUrl: str


class Address(TypedDict, total=False):
    street1: str
    street2: str
    city: str
    region: str
    postalCode: str
    countryCode: str


class ProductCompliance(TypedDict, total=False):
    countryCodeOrigin: str
    importerName: str
    importerAddress: Address


class ProductMutation(TypedDict):
    name: str
    images: list[PictureSource | ExistingImage]
    description: NotRequired[str]
    currency: NotRequired[str]
    price: NotRequired[str]
    salePrice: NotRequired[str]
    url: NotRequired[str]
    retailerId: NotRequired[str]
    hidden: NotRequired[bool]
    videoUrls: NotRequired[list[str]]
    complianceCategory: NotRequired[str]
    compliance: NotRequired[ProductCompliance]
    width: NotRequired[int]
    height: NotRequired[int]


class ProductImage(TypedDict):
    id: str
    originalUrl: NotRequired[str]
    requestUrl: NotRequired[str]


class ProductVideo(TypedDict):
    id: str
    originalUrl: NotRequired[str]
    thumbnailUrl: NotRequired[str]


class ProductMedia(TypedDict):
    images: list[ProductImage]
    videos: list[ProductVideo]


class SalePrice(TypedDict):
    price: str
    startDate: NotRequired[str]
    endDate: NotRequired[str]


class ProductStatus(TypedDict):
    status: NotRequired[str]
    canAppeal: bool


class Dimensions(TypedDict, total=False):
    width: int
    height: int


class VariantThumbnail(TypedDict):
    originalDimensions: Dimensions
    id: NotRequired[str]
    originalUrl: NotRequired[str]
    requestUrl: NotRequired[str]


class VariantProperty(TypedDict):
    name: str
    value: str


class VariantAvailabilityItem(TypedDict):
    productId: NotRequired[str]
    available: bool
    options: list[VariantProperty]


class VariantAvailability(TypedDict):
    listings: list[VariantAvailabilityItem]


class VariantListing(TypedDict, total=False):
    description: str
    lowestPrice: str
    multiPrice: str


class VariantOption(TypedDict):
    value: str
    thumbnail: NotRequired[VariantThumbnail]


class VariantType(TypedDict):
    name: str
    options: list[VariantOption]


class ProductVariant(TypedDict):
    availability: VariantAvailability
    listingDetails: VariantListing
    types: list[VariantType]
    properties: list[VariantProperty]


class Product(TypedDict):
    id: str
    name: str
    price: str
    currency: str
    hidden: bool
    sanctioned: bool
    media: ProductMedia
    status: ProductStatus
    retailerId: NotRequired[str]
    belongsTo: NotRequired[str]
    description: NotRequired[str]
    url: NotRequired[str]
    shimmedUrl: NotRequired[str]
    maxAvailable: NotRequired[int]
    availability: NotRequired[str]
    complianceCategory: NotRequired[str]
    compliance: NotRequired[ProductCompliance]
    salePrice: NotRequired[SalePrice]
    variant: NotRequired[ProductVariant]


class CatalogPage(TypedDict):
    products: list[Product]
    next: NotRequired[str]
    previous: NotRequired[str]


class ActionSuccess(TypedDict):
    success: Literal[True]


class DeleteProductResult(TypedDict):
    deletedCount: int


class CartSetting(TypedDict):
    enabled: bool


class ProductVisibility(TypedDict):
    hidden: bool


class Appeal(TypedDict):
    reason: str


class CollectionStatus(ProductStatus):
    commerceUrl: NotRequired[str]
    rejectReason: NotRequired[str]


class Collection(TypedDict):
    id: str
    name: str
    products: list[Product]
    status: CollectionStatus


class CollectionPage(TypedDict):
    collections: list[Collection]
    next: NotRequired[str]


class CollectionCreate(TypedDict):
    name: str
    productIds: list[str]


class CollectionUpdate(TypedDict, total=False):
    name: str
    addProductIds: list[str]
    removeProductIds: list[str]


class CollectionResult(TypedDict):
    id: str
    reviewStatus: str


class CollectionMove(TypedDict):
    collectionId: str
    fromIndex: int
    toIndex: int


class CollectionReorder(TypedDict):
    moves: list[CollectionMove]


class OrderLookup(TypedDict):
    token: str


class OrderPrice(TypedDict):
    subtotal: str
    total: str
    currency: str
    priceStatus: NotRequired[str]


class OrderProduct(TypedDict):
    id: str
    price: str
    currency: str
    name: str
    quantity: int
    imageId: NotRequired[str]
    imageUrl: NotRequired[str]
    variantProperties: NotRequired[str]


class Order(TypedDict):
    id: str
    createdAt: int
    catalogId: NotRequired[str]
    price: OrderPrice
    products: list[OrderProduct]
