package polymorfa

import (
	"context"
	"net/url"
)

type Business struct{ t *transport }

func (c *MessagingClient) Business() *Business { return &Business{c.t} }
func businessPath(s string) string             { return messagingPath(s) + "/business" }
func businessProfilePath(s string) string      { return businessPath(s) + "/profile" }
func businessProductPath(s, id string) string  { return businessPath(s) + "/products/" + escaped(id) }
func businessCollectionPath(s, id string) string {
	return businessPath(s) + "/collections/" + escaped(id)
}
func businessCatalogQuery(p BusinessCatalogParams) url.Values {
	q := url.Values{"id": {p.ID}}
	setString(q, "after", p.After)
	setInt(q, "limit", p.Limit)
	setInt(q, "width", p.Width)
	setInt(q, "height", p.Height)
	return q
}
func (r *Business) GetProfile(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[BusinessProfile]], error) {
	return request[Envelope[BusinessProfile]](ctx, r.t, "GET", businessProfilePath(s), nil, nil, options(o))
}
func (r *Business) UpdateProfile(ctx context.Context, s string, b BusinessProfileUpdateRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessProfileStatus]]], error) {
	return request[Envelope[AsyncResult[BusinessProfileStatus]]](ctx, r.t, "PATCH", businessProfilePath(s), nil, b, options(o))
}
func (r *Business) SetCoverPhoto(ctx context.Context, s string, b PictureRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessCoverPhotoResult]]], error) {
	return request[Envelope[AsyncResult[BusinessCoverPhotoResult]]](ctx, r.t, "PUT", businessProfilePath(s)+"/cover-photo", nil, b, options(o))
}
func (r *Business) DeleteCoverPhoto(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessProfileStatus]]], error) {
	return request[Envelope[AsyncResult[BusinessProfileStatus]]](ctx, r.t, "DELETE", businessProfilePath(s)+"/cover-photo/"+escaped(id), nil, nil, options(o))
}
func (r *Business) GetCatalog(ctx context.Context, s string, p BusinessCatalogParams, o ...RequestOptions) (Response[Envelope[BusinessCatalogPage]], error) {
	return request[Envelope[BusinessCatalogPage]](ctx, r.t, "GET", businessPath(s)+"/catalog", businessCatalogQuery(p), nil, options(o))
}
func (r *Business) CreateCatalog(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "POST", businessPath(s)+"/catalog", nil, nil, options(o))
}
func (r *Business) SetCartEnabled(ctx context.Context, s string, enabled bool, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "PATCH", businessPath(s)+"/catalog/cart", nil, struct {
		Enabled bool `json:"enabled"`
	}{enabled}, options(o))
}
func (r *Business) GetProduct(ctx context.Context, s, id, businessID string, o ...RequestOptions) (Response[Envelope[BusinessProduct]], error) {
	return request[Envelope[BusinessProduct]](ctx, r.t, "GET", businessProductPath(s, id), url.Values{"id": {businessID}}, nil, options(o))
}
func (r *Business) CreateProduct(ctx context.Context, s string, b BusinessProductMutationRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessProduct]]], error) {
	return request[Envelope[AsyncResult[BusinessProduct]]](ctx, r.t, "POST", businessPath(s)+"/products", nil, b, options(o))
}
func (r *Business) UpdateProduct(ctx context.Context, s, id string, b BusinessProductMutationRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessProduct]]], error) {
	return request[Envelope[AsyncResult[BusinessProduct]]](ctx, r.t, "PUT", businessProductPath(s, id), nil, b, options(o))
}
func (r *Business) DeleteProduct(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessProductDeleteResult]]], error) {
	return request[Envelope[AsyncResult[BusinessProductDeleteResult]]](ctx, r.t, "DELETE", businessProductPath(s, id), nil, nil, options(o))
}
func (r *Business) SetProductVisibility(ctx context.Context, s, id string, hidden bool, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "PATCH", businessProductPath(s, id)+"/visibility", nil, struct {
		Hidden bool `json:"hidden"`
	}{hidden}, options(o))
}
func (r *Business) AppealProduct(ctx context.Context, s, id string, b BusinessCatalogAppealRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "POST", businessProductPath(s, id)+"/appeal", nil, b, options(o))
}
func (r *Business) ListCollections(ctx context.Context, s string, p BusinessCollectionsParams, o ...RequestOptions) (Response[Envelope[BusinessCollectionPage]], error) {
	q := url.Values{"id": {p.ID}}
	setString(q, "after", p.After)
	setInt(q, "collectionLimit", p.CollectionLimit)
	setInt(q, "itemLimit", p.ItemLimit)
	setInt(q, "width", p.Width)
	setInt(q, "height", p.Height)
	return request[Envelope[BusinessCollectionPage]](ctx, r.t, "GET", businessPath(s)+"/collections", q, nil, options(o))
}
func (r *Business) GetCollection(ctx context.Context, s, id string, p BusinessCollectionParams, o ...RequestOptions) (Response[Envelope[BusinessCollection]], error) {
	return request[Envelope[BusinessCollection]](ctx, r.t, "GET", businessCollectionPath(s, id), businessCatalogQuery(p), nil, options(o))
}
func (r *Business) CreateCollection(ctx context.Context, s string, b BusinessCollectionCreateRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessCollectionMutationResult]]], error) {
	return request[Envelope[AsyncResult[BusinessCollectionMutationResult]]](ctx, r.t, "POST", businessPath(s)+"/collections", nil, b, options(o))
}
func (r *Business) UpdateCollection(ctx context.Context, s, id string, b BusinessCollectionUpdateRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessCollectionMutationResult]]], error) {
	return request[Envelope[AsyncResult[BusinessCollectionMutationResult]]](ctx, r.t, "PATCH", businessCollectionPath(s, id), nil, b, options(o))
}
func (r *Business) DeleteCollection(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "DELETE", businessCollectionPath(s, id), nil, nil, options(o))
}
func (r *Business) ReorderCollections(ctx context.Context, s string, b BusinessCollectionReorderRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "POST", businessPath(s)+"/collections/reorder", nil, b, options(o))
}
func (r *Business) AppealCollection(ctx context.Context, s, id string, b BusinessCatalogAppealRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessActionSuccess]]], error) {
	return request[Envelope[AsyncResult[BusinessActionSuccess]]](ctx, r.t, "POST", businessCollectionPath(s, id)+"/appeal", nil, b, options(o))
}
func (r *Business) GetOrder(ctx context.Context, s, id string, b BusinessOrderLookupRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessOrder]]], error) {
	return request[Envelope[AsyncResult[BusinessOrder]]](ctx, r.t, "POST", businessPath(s)+"/orders/"+escaped(id)+"/lookup", nil, b, options(o))
}
func (r *Business) GetMerchantCompliance(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[BusinessMerchantCompliance]], error) {
	return request[Envelope[BusinessMerchantCompliance]](ctx, r.t, "GET", businessPath(s)+"/compliance", nil, nil, options(o))
}
func (r *Business) SetMerchantCompliance(ctx context.Context, s string, b BusinessMerchantCompliance, o ...RequestOptions) (Response[Envelope[AsyncResult[BusinessMerchantCompliance]]], error) {
	return request[Envelope[AsyncResult[BusinessMerchantCompliance]]](ctx, r.t, "PUT", businessPath(s)+"/compliance", nil, b, options(o))
}
func (r *Business) GetLinkedAccounts(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[BusinessLinkedAccounts]], error) {
	return request[Envelope[BusinessLinkedAccounts]](ctx, r.t, "GET", businessPath(s)+"/linked-accounts", nil, nil, options(o))
}
func (r *Business) GetEligibility(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[BusinessEligibility]], error) {
	return request[Envelope[BusinessEligibility]](ctx, r.t, "GET", businessPath(s)+"/eligibility", nil, nil, options(o))
}
