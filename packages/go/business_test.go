package polymorfa

import "context"

var businessFixtures = []operationFixture{
	{"MessagingClient.Business.GetProfile", "GET", "/messaging/s/business/profile", "", "", `{"data":{"id":"business","address":"Main Street","hours":[],"categories":[],"websites":[],"options":{}}}`, "data.address", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetProfile(ctx, "s"))
	}},
	{"MessagingClient.Business.UpdateProfile", "PATCH", "/messaging/s/business/profile", "", `{"description":"","websites":[],"hours":{"timeZone":"UTC","days":[{"dayOfWeek":"mon","mode":"specific_hours","openTime":0,"closeTime":60}]}}`, `{"data":{"status":"OK"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := ""
		a, b := 0, 60
		web := []string{}
		return wireData(m.Business().UpdateProfile(ctx, "s", BusinessProfileUpdateRequest{Description: &v, Websites: &web, Hours: &BusinessProfileHoursUpdate{TimeZone: "UTC", Days: []BusinessProfileDay{{DayOfWeek: "mon", Mode: "specific_hours", OpenTime: &a, CloseTime: &b}}}}))
	}},
	{"MessagingClient.Business.SetCoverPhoto", "PUT", "/messaging/s/business/profile/cover-photo", "", `{"base64":"AQID"}`, `{"data":{"coverPhotoId":"photo"}}`, "data.coverPhotoId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().SetCoverPhoto(ctx, "s", PictureRequest{Base64: "AQID"}))
	}},
	{"MessagingClient.Business.DeleteCoverPhoto", "DELETE", "/messaging/s/business/profile/cover-photo/photo", "", "", `{"data":{"requestId":"accepted"}}`, "data.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().DeleteCoverPhoto(ctx, "s", "photo"))
	}},
	{"MessagingClient.Business.GetCatalog", "GET", "/messaging/s/business/catalog", "after=cursor&height=20&id=business&limit=5&width=10", "", `{"data":{"next":"next","products":[{"id":"item","name":"Item","price":"1000","currency":"USD","hidden":false,"sanctioned":false,"media":{"images":[],"videos":[]},"status":{"canAppeal":false},"variant":{"availability":{"listings":[]},"listingDetails":{"multiPrice":"1000"},"types":[],"properties":[]}}]}}`, "data.products.0.variant.listingDetails.multiPrice", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetCatalog(ctx, "s", BusinessCatalogParams{ID: "business", After: "cursor", Limit: 5, Width: 10, Height: 20}))
	}},
	{"MessagingClient.Business.CreateCatalog", "POST", "/messaging/s/business/catalog", "", "", `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().CreateCatalog(ctx, "s"))
	}},
	{"MessagingClient.Business.SetCartEnabled", "PATCH", "/messaging/s/business/catalog/cart", "", `{"enabled":false}`, `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().SetCartEnabled(ctx, "s", false))
	}},
	{"MessagingClient.Business.GetProduct", "GET", "/messaging/s/business/products/item", "id=business", "", `{"data":{"id":"item","name":"Item","price":"1000","currency":"USD","hidden":false,"sanctioned":false,"media":{"images":[{"id":"photo","originalUrl":"https://example.com"}],"videos":[]},"status":{"canAppeal":true}}}`, "data.media.images.0.originalUrl", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetProduct(ctx, "s", "item", "business"))
	}},
	{"MessagingClient.Business.CreateProduct", "POST", "/messaging/s/business/products", "", `{"name":"Item","price":"1000","hidden":false,"images":[{"mediaUrl":"https://mmg.whatsapp.net/photo"}]}`, `{"data":{"id":"item","name":"Item","price":"1000","currency":"USD","hidden":false,"sanctioned":false,"media":{"images":[],"videos":[]},"status":{"canAppeal":false}}}`, "data.price", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.Business().CreateProduct(ctx, "s", BusinessProductMutationRequest{Name: "Item", Price: "1000", Hidden: &v, Images: []BusinessProductImageSource{{MediaURL: "https://mmg.whatsapp.net/photo"}}}))
	}},
	{"MessagingClient.Business.UpdateProduct", "PUT", "/messaging/s/business/products/item", "", `{"name":"Replacement","images":[]}`, `{"data":{"requestId":"accepted"}}`, "data.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().UpdateProduct(ctx, "s", "item", BusinessProductMutationRequest{Name: "Replacement", Images: []BusinessProductImageSource{}}))
	}},
	{"MessagingClient.Business.DeleteProduct", "DELETE", "/messaging/s/business/products/item", "", "", `{"data":{"deletedCount":1}}`, "data.deletedCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().DeleteProduct(ctx, "s", "item"))
	}},
	{"MessagingClient.Business.SetProductVisibility", "PATCH", "/messaging/s/business/products/item/visibility", "", `{"hidden":false}`, `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().SetProductVisibility(ctx, "s", "item", false))
	}},
	{"MessagingClient.Business.AppealProduct", "POST", "/messaging/s/business/products/item/appeal", "", `{"reason":"Reviewed"}`, `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().AppealProduct(ctx, "s", "item", BusinessCatalogAppealRequest{Reason: "Reviewed"}))
	}},
	{"MessagingClient.Business.ListCollections", "GET", "/messaging/s/business/collections", "after=cursor&collectionLimit=2&height=20&id=business&itemLimit=4&width=10", "", `{"data":{"next":"next","collections":[{"id":"collection","name":"Collection","products":[],"status":{"canAppeal":true,"rejectReason":"review"}}]}}`, "data.collections.0.status.rejectReason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().ListCollections(ctx, "s", BusinessCollectionsParams{ID: "business", After: "cursor", CollectionLimit: 2, ItemLimit: 4, Width: 10, Height: 20}))
	}},
	{"MessagingClient.Business.GetCollection", "GET", "/messaging/s/business/collections/collection", "after=cursor&height=20&id=business&limit=5&width=10", "", `{"data":{"id":"collection","name":"Collection","products":[],"status":{"canAppeal":false}}}`, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetCollection(ctx, "s", "collection", BusinessCollectionParams{ID: "business", After: "cursor", Limit: 5, Width: 10, Height: 20}))
	}},
	{"MessagingClient.Business.CreateCollection", "POST", "/messaging/s/business/collections", "", `{"name":"Collection","productIds":["item"]}`, `{"data":{"id":"collection","reviewStatus":"pending"}}`, "data.reviewStatus", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().CreateCollection(ctx, "s", BusinessCollectionCreateRequest{Name: "Collection", ProductIDs: []string{"item"}}))
	}},
	{"MessagingClient.Business.UpdateCollection", "PATCH", "/messaging/s/business/collections/collection", "", `{"removeProductIds":[]}`, `{"data":{"id":"collection","reviewStatus":"approved"}}`, "data.reviewStatus", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := []string{}
		return wireData(m.Business().UpdateCollection(ctx, "s", "collection", BusinessCollectionUpdateRequest{RemoveProductIDs: &v}))
	}},
	{"MessagingClient.Business.DeleteCollection", "DELETE", "/messaging/s/business/collections/collection", "", "", `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().DeleteCollection(ctx, "s", "collection"))
	}},
	{"MessagingClient.Business.ReorderCollections", "POST", "/messaging/s/business/collections/reorder", "", `{"moves":[{"collectionId":"collection","fromIndex":0,"toIndex":1}]}`, `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().ReorderCollections(ctx, "s", BusinessCollectionReorderRequest{Moves: []BusinessCollectionMove{{CollectionID: "collection", FromIndex: 0, ToIndex: 1}}}))
	}},
	{"MessagingClient.Business.AppealCollection", "POST", "/messaging/s/business/collections/collection/appeal", "", `{"reason":"Reviewed"}`, `{"data":{"success":true}}`, "data.success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().AppealCollection(ctx, "s", "collection", BusinessCatalogAppealRequest{Reason: "Reviewed"}))
	}},
	{"MessagingClient.Business.GetOrder", "POST", "/messaging/s/business/orders/order/lookup", "", `{"token":"fixture-token"}`, `{"data":{"id":"order","createdAt":123,"price":{"subtotal":"1000","total":"1000","currency":"USD"},"products":[{"id":"item","price":"1000","currency":"USD","name":"Item","quantity":1,"variantProperties":"size=M"}]}}`, "data.products.0.variantProperties", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetOrder(ctx, "s", "order", BusinessOrderLookupRequest{Token: "fixture-token"}))
	}},
	{"MessagingClient.Business.GetMerchantCompliance", "GET", "/messaging/s/business/compliance", "", "", `{"data":{"entityName":"Merchant","entityType":"OTHER","entityTypeCustom":"shop","isRegistered":false,"customerCare":{"email":"care@example.com","landlineNumber":"","mobileNumber":""},"grievanceOfficer":{"name":"Support","email":"support@example.com","landlineNumber":"","mobileNumber":""}}}`, "data.grievanceOfficer.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetMerchantCompliance(ctx, "s"))
	}},
	{"MessagingClient.Business.SetMerchantCompliance", "PUT", "/messaging/s/business/compliance", "", `{"entityName":"Merchant","entityType":"OTHER","isRegistered":false,"entityTypeCustom":"shop","customerCare":{"email":"care@example.com","landlineNumber":"","mobileNumber":""},"grievanceOfficer":{"email":"support@example.com","landlineNumber":"","mobileNumber":"","name":"Support"}}`, `{"data":{"requestId":"accepted"}}`, "data.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().SetMerchantCompliance(ctx, "s", BusinessMerchantCompliance{EntityName: "Merchant", EntityType: "OTHER", EntityTypeCustom: "shop", CustomerCare: BusinessMerchantContact{Email: "care@example.com"}, GrievanceOfficer: BusinessGrievanceOfficer{Name: "Support", BusinessMerchantContact: BusinessMerchantContact{Email: "support@example.com"}}}))
	}},
	{"MessagingClient.Business.GetLinkedAccounts", "GET", "/messaging/s/business/linked-accounts", "", "", `{"data":{"facebookPage":{"id":"page","displayName":"Page","hasActiveCTWAAd":true,"hasCreatedAd":false,"profilePictureUrl":"https://example.com","showOnProfile":true,"whatsAppAsPageButton":false}}}`, "data.facebookPage.hasActiveCTWAAd", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetLinkedAccounts(ctx, "s"))
	}},
	{"MessagingClient.Business.GetEligibility", "GET", "/messaging/s/business/eligibility", "", "", `{"data":{"features":[{"feature":"meta_verified","status":"eligible","showPrivacyInterstitialToNewUsers":false}]}}`, "data.features.0.showPrivacyInterstitialToNewUsers", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Business().GetEligibility(ctx, "s"))
	}},
}
