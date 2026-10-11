package polymorfa

import (
	"context"
	"net/url"
	"regexp"
	"strings"
)

type CloudProductCatalog struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}
type CloudCatalogProduct struct {
	ID           string `json:"id"`
	RetailerID   string `json:"retailer_id,omitempty"`
	Name         string `json:"name,omitempty"`
	Availability string `json:"availability,omitempty"`
}
type CloudGraphCursors struct {
	Before string `json:"before,omitempty"`
	After  string `json:"after,omitempty"`
}
type CloudGraphPaging struct {
	Cursors CloudGraphCursors `json:"cursors"`
}
type CloudCatalogList struct {
	Data   []CloudProductCatalog `json:"data"`
	Paging *CloudGraphPaging     `json:"paging,omitempty"`
}
type CloudCatalogProductList struct {
	Data   []CloudCatalogProduct `json:"data"`
	Paging *CloudGraphPaging     `json:"paging,omitempty"`
}
type ListCloudCatalogsParams struct {
	Version string
	Limit   int
	After   string
}
type ListCloudCatalogProductsParams = ListCloudCatalogsParams
type CloudMarketingStatus struct {
	ID                                string `json:"id"`
	MarketingMessagesLiteAPIStatus    string `json:"marketing_messages_lite_api_status,omitempty"`
	MarketingMessagesOnboardingStatus string `json:"marketing_messages_onboarding_status,omitempty"`
}
type CloudGraphVersion struct{ Version string }
type FlowEncryptionKey struct {
	BusinessPublicKey                string `json:"business_public_key"`
	BusinessPublicKeySignatureStatus string `json:"business_public_key_signature_status"`
}
type FlowEncryptionKeyList struct {
	Data []FlowEncryptionKey `json:"data"`
}
type RegisterFlowEncryptionKeyRequest struct{ BusinessPublicKey string }
type CloudCatalogs struct{ t *transport }
type CloudMarketing struct{ t *transport }
type FlowEncryption struct{ t *transport }

func (c *MessagingClient) CloudCatalogs() *CloudCatalogs   { return &CloudCatalogs{c.t} }
func (c *MessagingClient) CloudMarketing() *CloudMarketing { return &CloudMarketing{c.t} }
func (c *MessagingClient) FlowEncryption() *FlowEncryption { return &FlowEncryption{c.t} }
func cloudGraphPath(t *transport, id, version string) (string, error) {
	if err := serverOnly(t); err != nil {
		return "", err
	}
	if strings.TrimSpace(id) == "" || strings.TrimSpace(version) == "" {
		return "", configuration("params", "Provide an identifier and Graph version.")
	}
	return "/graph/whatsapp/" + escaped(version) + "/" + escaped(id), nil
}
func (p ListCloudCatalogsParams) query() url.Values {
	q := url.Values{}
	setInt(q, "limit", p.Limit)
	setString(q, "after", p.After)
	return q
}
func (r *CloudCatalogs) List(ctx context.Context, waba string, p ListCloudCatalogsParams, o ...RequestOptions) (Response[CloudCatalogList], error) {
	path, err := cloudGraphPath(r.t, waba, p.Version)
	if err != nil {
		return Response[CloudCatalogList]{}, err
	}
	return request[CloudCatalogList](ctx, r.t, "GET", path+"/product_catalogs", p.query(), nil, options(o))
}
func (r *CloudCatalogs) ListProducts(ctx context.Context, waba, catalog string, p ListCloudCatalogProductsParams, o ...RequestOptions) (Response[CloudCatalogProductList], error) {
	path, err := cloudGraphPath(r.t, waba, p.Version)
	if err != nil {
		return Response[CloudCatalogProductList]{}, err
	}
	if !regexp.MustCompile(`^[0-9]+$`).MatchString(catalog) {
		return Response[CloudCatalogProductList]{}, configuration("catalogId", "Provide a numeric catalog ID.")
	}
	return request[CloudCatalogProductList](ctx, r.t, "GET", path+"/product_catalogs/"+escaped(catalog)+"/products", p.query(), nil, options(o))
}
func (r *CloudMarketing) Status(ctx context.Context, waba string, p CloudGraphVersion, o ...RequestOptions) (Response[CloudMarketingStatus], error) {
	path, err := cloudGraphPath(r.t, waba, p.Version)
	if err != nil {
		return Response[CloudMarketingStatus]{}, err
	}
	return request[CloudMarketingStatus](ctx, r.t, "GET", path+"/marketing_messages/status", nil, nil, options(o))
}
func (r *FlowEncryption) Retrieve(ctx context.Context, phone string, p CloudGraphVersion, o ...RequestOptions) (Response[FlowEncryptionKeyList], error) {
	path, err := cloudGraphPath(r.t, phone, p.Version)
	if err != nil {
		return Response[FlowEncryptionKeyList]{}, err
	}
	return request[FlowEncryptionKeyList](ctx, r.t, "GET", path+"/whatsapp_business_encryption", nil, nil, options(o))
}
func (r *FlowEncryption) Register(ctx context.Context, phone string, b RegisterFlowEncryptionKeyRequest, p CloudGraphVersion, o ...RequestOptions) (Response[Success], error) {
	path, err := cloudGraphPath(r.t, phone, p.Version)
	if err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "POST", path+"/whatsapp_business_encryption", nil, struct {
		BusinessPublicKey string `json:"business_public_key"`
	}{b.BusinessPublicKey}, noRetry(options(o)))
}
