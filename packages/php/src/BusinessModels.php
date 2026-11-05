<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type BusinessProfile from Models as Profile
 * @phpstan-type SpecificHours array{dayOfWeek:'sun'|'mon'|'tue'|'wed'|'thu'|'fri'|'sat',mode:'specific_hours',openTime:int,closeTime:int}
 * @phpstan-type GeneralHours array{dayOfWeek:'sun'|'mon'|'tue'|'wed'|'thu'|'fri'|'sat',mode:'open_24h'|'appointment_only'}
 * @phpstan-type ProfileUpdate array{address?:string,email?:string,description?:string,websites?:list<string>,hours?:array{timeZone:string,days:list<SpecificHours|GeneralHours>}}
 * @phpstan-type CoverPhoto array{url:string}|array{base64:string}
 * @phpstan-type ProfileStatus array{status:string}
 * @phpstan-type CoverPhotoResult array{coverPhotoId:string}
 * @phpstan-type Accepted array{requestId:string}
 * @phpstan-type MerchantContact array{email:string,landlineNumber:string,mobileNumber:string}
 * @phpstan-type MerchantOfficer array{name:string,email:string,landlineNumber:string,mobileNumber:string}
 * @phpstan-type MerchantCompliance array{entityName:string,entityType:'SOLE_PROPRIETORSHIP'|'PARTNERSHIP'|'PRIVATE_COMPANY'|'PUBLIC_COMPANY'|'LIMITED_LIABILITY_PARTNERSHIP'|'OTHER',isRegistered:bool,entityTypeCustom:string,customerCare:MerchantContact,grievanceOfficer:MerchantOfficer}
 * @phpstan-type FacebookPage array{hasActiveCTWAAd:bool,hasCreatedAd:bool,id:string,displayName:string,profileSync?:'disable'|'import',profilePictureUrl:string,showOnProfile:bool,whatsAppAsPageButton:bool}
 * @phpstan-type FacebookBusiness array{id:string,displayName:string,catalogId?:string,catalogState?:'disable'|'import'}
 * @phpstan-type InstagramProfessional array{handle:string,displayName:string,profilePictureUrl:string,showOnProfile:bool}
 * @phpstan-type WhatsAppAdIdentity array{hasActiveCTWAAd:bool,hasCreatedAd:bool,id:string}
 * @phpstan-type LinkedAccounts array{facebookPage?:FacebookPage,facebookBusiness?:FacebookBusiness,instagramProfessional?:InstagramProfessional,whatsAppAdIdentity?:WhatsAppAdIdentity}
 * @phpstan-type FeatureEligibility array{feature:'meta_verified'|'marketing_messages'|'genai'|'genai_image'|'meta_one'|'bb_pro',status:string,expiration?:int,additionalParams?:string,showPrivacyInterstitialToNewUsers?:bool,v1Enabled?:bool}
 * @phpstan-type Eligibility array{features:list<FeatureEligibility>}
 * @phpstan-type CatalogParams array{id:string,after?:string,limit?:int,width?:int,height?:int}
 * @phpstan-type ProductParams array{id:string}
 * @phpstan-type CollectionsParams array{id:string,after?:string,collectionLimit?:int,itemLimit?:int,width?:int,height?:int}
 * @phpstan-type ProductImageSource array{url:string}|array{base64:string}|array{mediaUrl:string}
 * @phpstan-type Address array{street1?:string,street2?:string,city?:string,region?:string,postalCode?:string,countryCode?:string}
 * @phpstan-type ProductCompliance array{countryCodeOrigin?:string,importerName?:string,importerAddress?:Address}
 * @phpstan-type ProductMutation array{name:string,images:list<ProductImageSource>,description?:string,currency?:string,price?:string,salePrice?:string,url?:string,retailerId?:string,hidden?:bool,videoUrls?:list<string>,complianceCategory?:string,compliance?:ProductCompliance,width?:int,height?:int}
 * @phpstan-type ProductImage array{id:string,originalUrl?:string,requestUrl?:string}
 * @phpstan-type ProductVideo array{id:string,originalUrl?:string,thumbnailUrl?:string}
 * @phpstan-type ProductMedia array{images:list<ProductImage>,videos:list<ProductVideo>}
 * @phpstan-type SalePrice array{price:string,startDate?:string,endDate?:string}
 * @phpstan-type ProductStatus array{status?:string,canAppeal:bool}
 * @phpstan-type Dimensions array{width?:int,height?:int}
 * @phpstan-type VariantThumbnail array{originalDimensions:Dimensions,id?:string,originalUrl?:string,requestUrl?:string}
 * @phpstan-type VariantProperty array{name:string,value:string}
 * @phpstan-type VariantAvailabilityItem array{productId?:string,available:bool,options:list<VariantProperty>}
 * @phpstan-type VariantAvailability array{listings:list<VariantAvailabilityItem>}
 * @phpstan-type VariantListing array{description?:string,lowestPrice?:string,multiPrice?:string}
 * @phpstan-type VariantOption array{value:string,thumbnail?:VariantThumbnail}
 * @phpstan-type VariantType array{name:string,options:list<VariantOption>}
 * @phpstan-type ProductVariant array{availability:VariantAvailability,listingDetails:VariantListing,types:list<VariantType>,properties:list<VariantProperty>}
 * @phpstan-type Product array{id:string,name:string,price:string,currency:string,hidden:bool,sanctioned:bool,media:ProductMedia,status:ProductStatus,retailerId?:string,belongsTo?:string,description?:string,url?:string,shimmedUrl?:string,maxAvailable?:int,availability?:string,complianceCategory?:string,compliance?:ProductCompliance,salePrice?:SalePrice,variant?:ProductVariant}
 * @phpstan-type CatalogPage array{products:list<Product>,next?:string,previous?:string}
 * @phpstan-type ActionSuccess array{success:true}
 * @phpstan-type DeleteProductResult array{deletedCount:int}
 * @phpstan-type CartSetting array{enabled:bool}
 * @phpstan-type ProductVisibility array{hidden:bool}
 * @phpstan-type Appeal array{reason:string}
 * @phpstan-type CollectionStatus array{status?:string,canAppeal:bool,commerceUrl?:string,rejectReason?:string}
 * @phpstan-type Collection array{id:string,name:string,products:list<Product>,status:CollectionStatus}
 * @phpstan-type CollectionPage array{collections:list<Collection>,next?:string}
 * @phpstan-type CollectionCreate array{name:string,productIds:list<string>}
 * @phpstan-type CollectionUpdate array{name?:string,addProductIds?:list<string>,removeProductIds?:list<string>}
 * @phpstan-type CollectionResult array{id:string,reviewStatus:string}
 * @phpstan-type CollectionMove array{collectionId:string,fromIndex:int,toIndex:int}
 * @phpstan-type CollectionReorder array{moves:list<CollectionMove>}
 * @phpstan-type OrderLookup array{token:string}
 * @phpstan-type OrderPrice array{subtotal:string,total:string,currency:string,priceStatus?:string}
 * @phpstan-type OrderProduct array{id:string,price:string,currency:string,name:string,quantity:int,imageId?:string,imageUrl?:string,variantProperties?:string}
 * @phpstan-type Order array{id:string,createdAt:int,catalogId?:string,price:OrderPrice,products:list<OrderProduct>}

 */
final class BusinessModels
{
    private function __construct()
    {
    }
}
