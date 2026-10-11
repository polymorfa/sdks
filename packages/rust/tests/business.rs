#[allow(dead_code)]
mod support;
use polymorfa_sdk::{business::*, RequestOptions};
use serde_json::json;
fn ok() -> serde_json::Value {
    json!({"success":true,"data":{"success":true}})
}
fn product() -> serde_json::Value {
    json!({"id":"product","retailerId":"sku","belongsTo":"business","name":"Product","description":"Description","price":"125000","currency":"USD","url":"https://example.com/product","shimmedUrl":"https://example.com/shim","hidden":false,"sanctioned":false,"maxAvailable":10,"availability":"in stock","complianceCategory":"goods","compliance":{"countryCodeOrigin":"US","importerName":"Importer","importerAddress":{"street1":"Street","postalCode":"12345","countryCode":"US"}},"media":{"images":[{"id":"image","originalUrl":"https://example.com/image","requestUrl":"https://example.com/request"}],"videos":[{"id":"video","originalUrl":"https://example.com/video","thumbnailUrl":"https://example.com/thumb"}]},"salePrice":{"price":"100000","startDate":"2026-10-11","endDate":"2026-10-12"},"status":{"status":"approved","canAppeal":false},"variant":{"availability":{"listings":[{"productId":"product","available":true,"options":[{"name":"color","value":"blue"}]}]},"listingDetails":{"description":"Description","lowestPrice":"100000","multiPrice":"125000"},"types":[{"name":"color","options":[{"value":"blue","thumbnail":{"id":"thumb","originalUrl":"https://example.com/thumb","requestUrl":"https://example.com/request","originalDimensions":{"width":100,"height":100}}}]}],"properties":[{"name":"color","value":"blue"}]}})
}
fn mutation() -> BusinessProductMutationRequest {
    BusinessProductMutationRequest {
        name: "Product".into(),
        description: Some("Description".into()),
        currency: Some("USD".into()),
        price: Some("125000".into()),
        sale_price: Some("100000".into()),
        url: Some("https://example.com/product".into()),
        retailer_id: Some("sku".into()),
        hidden: Some(false),
        images: vec![
            BusinessProductImageSource::Url {
                url: "https://example.com/image".into(),
            },
            BusinessProductImageSource::Base64 {
                base64: "aW1hZ2U=".into(),
            },
            BusinessProductImageSource::MediaUrl {
                media_url: "https://mmg.whatsapp.net/image".into(),
            },
        ],
        video_urls: Some(vec!["https://mmg.whatsapp.net/video".into()]),
        compliance_category: Some("goods".into()),
        compliance: Some(BusinessComplianceInfo {
            country_code_origin: Some("US".into()),
            importer_name: Some("Importer".into()),
            importer_address: None,
        }),
        width: Some(100),
        height: Some(100),
    }
}
fn mutation_json() -> serde_json::Value {
    json!({"name":"Product","description":"Description","currency":"USD","price":"125000","salePrice":"100000","url":"https://example.com/product","retailerId":"sku","hidden":false,"images":[{"url":"https://example.com/image"},{"base64":"aW1hZ2U="},{"mediaUrl":"https://mmg.whatsapp.net/image"}],"videoUrls":["https://mmg.whatsapp.net/video"],"complianceCategory":"goods","compliance":{"countryCodeOrigin":"US","importerName":"Importer"},"width":100,"height":100})
}
fn collection() -> serde_json::Value {
    json!({"id":"collection","name":"Collection","products":[product()],"status":{"status":"approved","canAppeal":false,"commerceUrl":"https://example.com/catalog","rejectReason":"none"}})
}
fn compliance() -> serde_json::Value {
    json!({"entityName":"Merchant","entityType":"PRIVATE_COMPANY","isRegistered":true,"entityTypeCustom":"","customerCare":{"email":"care@example.com","landlineNumber":"+15551234567","mobileNumber":"+15551234568"},"grievanceOfficer":{"name":"Officer","email":"officer@example.com","landlineNumber":"+15551234567","mobileNumber":"+15551234568"}})
}
#[tokio::test]
async fn business_profile_hours_and_cover_photos_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/business/profile",
        None,
        json!({"success":true,"data":{"id":"business","phoneNumber":"+15551234567","address":"Street","email":"business@example.com","description":"Description","websites":["https://example.com"],"coverPhotoId":"cover","categories":[{"id":"category","name":"Goods"}],"options":{"key":"value"},"hoursTimeZone":"UTC","hours":[{"dayOfWeek":"mon","mode":"specific_hours","openTime":"09:00","closeTime":"18:00"}]}}),
        client
            .business()
            .get_profile("support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/business/profile",
        Some(
            json!({"address":"Street","hours":{"timeZone":"UTC","days":[{"dayOfWeek":"mon","mode":"specific_hours","openTime":540,"closeTime":1080},{"dayOfWeek":"tue","mode":"open_24h"},{"dayOfWeek":"wed","mode":"appointment_only"}]}})
        ),
        json!({"success":true,"data":{"status":"updated"}}),
        client.business().update_profile(
            "support",
            &BusinessProfileUpdateRequest {
                address: Some("Street".into()),
                hours: Some(BusinessProfileHoursUpdate {
                    time_zone: "UTC".into(),
                    days: vec![
                        BusinessProfileDay::SpecificHours {
                            day_of_week: BusinessWeekday::Mon,
                            open_time: 540,
                            close_time: 1080
                        },
                        BusinessProfileDay::Open24h {
                            day_of_week: BusinessWeekday::Tue
                        },
                        BusinessProfileDay::AppointmentOnly {
                            day_of_week: BusinessWeekday::Wed
                        }
                    ]
                }),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/support/business/profile/cover-photo",
        Some(json!({"url":"https://example.com/cover"})),
        json!({"success":true,"data":{"coverPhotoId":"cover"}}),
        client.business().set_cover_photo(
            "support",
            &BusinessCoverPhotoRequest::Url {
                url: "https://example.com/cover".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/support/business/profile/cover-photo/cover",
        None,
        json!({"success":true,"data":{"status":"deleted"}}),
        client
            .business()
            .delete_cover_photo("support", "cover", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/support/business/profile/cover-photo",
        Some(json!({"base64":"aW1hZ2U="})),
        json!({"success":true,"data":{"requestId":"accepted"}}),
        client.business().set_cover_photo(
            "support",
            &BusinessCoverPhotoRequest::Base64 {
                base64: "aW1hZ2U=".into()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn business_catalog_products_and_decimal_string_prices_native_wire() {
    let params = BusinessCatalogParameters {
        id: "business".into(),
        after: Some("cursor".into()),
        limit: Some(25),
        width: Some(100),
        height: Some(100),
    };
    wire_messaging!(client,"GET","/messaging/support/business/catalog?id=business&after=cursor&limit=25&width=100&height=100",None,json!({"success":true,"data":{"next":"next","previous":"prev","products":[product()]}}),client.business().get_catalog("support",&params,RequestOptions::default()));
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/catalog",
        None,
        ok(),
        client
            .business()
            .create_catalog("support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/business/catalog/cart",
        Some(json!({"enabled":true})),
        ok(),
        client.business().set_cart_enabled(
            "support",
            &BusinessCartSettingRequest { enabled: true },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/business/products/product?id=business",
        None,
        json!({"success":true,"data":product()}),
        client
            .business()
            .get_product("support", "product", "business", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/products",
        Some(mutation_json()),
        json!({"success":true,"data":product()}),
        client
            .business()
            .create_product("support", &mutation(), RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/support/business/products/product",
        Some(mutation_json()),
        json!({"success":true,"data":product()}),
        client.business().update_product(
            "support",
            "product",
            &mutation(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/support/business/products/product",
        None,
        json!({"success":true,"data":{"deletedCount":1}}),
        client
            .business()
            .delete_product("support", "product", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/business/products/product/visibility",
        Some(json!({"hidden":true})),
        ok(),
        client.business().set_product_visibility(
            "support",
            "product",
            &BusinessProductVisibilityRequest { hidden: true },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/products/product/appeal",
        Some(json!({"reason":"Evidence"})),
        ok(),
        client.business().appeal_product(
            "support",
            "product",
            &BusinessCatalogAppealRequest {
                reason: "Evidence".into()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn business_collections_membership_reorder_and_appeal_native_wire() {
    wire_messaging!(client,"GET","/messaging/support/business/collections?id=business&after=cursor&collectionLimit=10&itemLimit=25&width=100&height=100",None,json!({"success":true,"data":{"next":"next","collections":[collection()]}}),client.business().list_collections("support",&BusinessCollectionsParameters{id:"business".into(),after:Some("cursor".into()),collection_limit:Some(10),item_limit:Some(25),width:Some(100),height:Some(100)},RequestOptions::default()));
    wire_messaging!(client,"GET","/messaging/support/business/collections/collection?id=business&after=cursor&limit=25&width=100&height=100",None,json!({"success":true,"data":collection()}),client.business().get_collection("support","collection",&BusinessCollectionParameters{id:"business".into(),after:Some("cursor".into()),limit:Some(25),width:Some(100),height:Some(100)},RequestOptions::default()));
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/collections",
        Some(json!({"name":"Collection","productIds":["product"]})),
        json!({"success":true,"data":{"id":"collection","reviewStatus":"approved"}}),
        client.business().create_collection(
            "support",
            &BusinessCollectionCreateRequest {
                name: "Collection".into(),
                product_ids: vec!["product".into()]
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/business/collections/collection",
        Some(json!({"name":"Updated","addProductIds":["product"],"removeProductIds":[]})),
        json!({"success":true,"data":{"id":"collection","reviewStatus":"approved"}}),
        client.business().update_collection(
            "support",
            "collection",
            &BusinessCollectionUpdateRequest {
                name: Some("Updated".into()),
                add_product_ids: Some(vec!["product".into()]),
                remove_product_ids: Some(vec![])
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/support/business/collections/collection",
        None,
        ok(),
        client
            .business()
            .delete_collection("support", "collection", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/collections/reorder",
        Some(json!({"moves":[{"collectionId":"collection","fromIndex":1,"toIndex":0}]})),
        ok(),
        client.business().reorder_collections(
            "support",
            &BusinessCollectionReorderRequest {
                moves: vec![BusinessCollectionMove {
                    collection_id: "collection".into(),
                    from_index: 1,
                    to_index: 0
                }]
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/collections/collection/appeal",
        Some(json!({"reason":"Evidence"})),
        ok(),
        client.business().appeal_collection(
            "support",
            "collection",
            &BusinessCatalogAppealRequest {
                reason: "Evidence".into()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn business_orders_merchant_compliance_accounts_and_eligibility_native_wire() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/business/orders/order/lookup",
        Some(json!({"token":"order-token"})),
        json!({"success":true,"data":{"id":"order","createdAt":1000,"catalogId":"catalog","price":{"subtotal":"100000","total":"125000","currency":"USD","priceStatus":"confirmed"},"products":[{"id":"product","imageId":"image","imageUrl":"https://example.com/image","price":"125000","currency":"USD","name":"Product","quantity":1,"variantProperties":"blue"}]}}),
        client.business().get_order(
            "support",
            "order",
            &BusinessOrderLookupRequest {
                token: "order-token".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/business/compliance",
        None,
        json!({"success":true,"data":compliance()}),
        client
            .business()
            .get_merchant_compliance("support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/support/business/compliance",
        Some(compliance()),
        json!({"success":true,"data":compliance()}),
        client.business().set_merchant_compliance(
            "support",
            &serde_json::from_value::<BusinessMerchantCompliance>(compliance()).unwrap(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/business/linked-accounts",
        None,
        json!({"success":true,"data":{"facebookPage":{"id":"page","displayName":"Page","hasActiveCTWAAd":true,"hasCreatedAd":true,"profileSync":"import","profilePictureUrl":"https://example.com/avatar","showOnProfile":true,"whatsAppAsPageButton":true},"facebookBusiness":{"id":"business","displayName":"Business","catalogId":"catalog","catalogState":"import"},"instagramProfessional":{"handle":"handle","displayName":"Instagram","profilePictureUrl":"https://example.com/avatar","showOnProfile":true},"whatsAppAdIdentity":{"id":"identity","hasActiveCTWAAd":true,"hasCreatedAd":true}}}),
        client
            .business()
            .get_linked_accounts("support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/business/eligibility",
        None,
        json!({"success":true,"data":{"features":[{"feature":"meta_verified","status":"eligible","expiration":2000,"additionalParams":"info","showPrivacyInterstitialToNewUsers":true,"v1Enabled":false}]}}),
        client
            .business()
            .get_eligibility("support", RequestOptions::default())
    );
}
