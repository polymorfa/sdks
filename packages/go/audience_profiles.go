package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

// AudienceProfiles stores customer-supplied campaign profiles, not synced contacts.
type AudienceProfiles struct{ t *transport }
type AudienceProfileImports struct{ t *transport }

func (c *OrganizationClient) AudienceProfiles() *AudienceProfiles { return &AudienceProfiles{c.t} }
func (r *AudienceProfiles) Imports() *AudienceProfileImports      { return &AudienceProfileImports{r.t} }
func audienceProfilePath(phone string) string {
	return "/platform/audience-profiles/" + strings.ReplaceAll(escaped(phone), "+", "%2B")
}
func validateProfilePhone(phone string) error {
	if !profilePhone.MatchString(phone) {
		return configuration("phone", "An E.164 phone is required.")
	}
	return nil
}
func (r *AudienceProfiles) List(ctx context.Context, p ListAudienceProfilesParams, o ...RequestOptions) (Response[CursorEnvelope[AudienceProfile]], error) {
	return profilePage[AudienceProfile](ctx, r.t, "/platform/audience-profiles", p, o)
}
func (r *AudienceProfiles) Retrieve(ctx context.Context, phone string, o ...RequestOptions) (Response[Envelope[AudienceProfile]], error) {
	return campaignDo[AudienceProfile](ctx, r.t, "GET", audienceProfilePath(phone), nil, nil, o, false, validateProfilePhone(phone))
}
func (r *AudienceProfiles) Put(ctx context.Context, phone string, b PutAudienceProfileRequest, o ...RequestOptions) (Response[Envelope[AudienceProfile]], error) {
	return campaignDo[AudienceProfile](ctx, r.t, "PUT", audienceProfilePath(phone), nil, b, o, false, validateProfilePhone(phone), validateProfilePut(b))
}
func (r *AudienceProfiles) Delete(ctx context.Context, phone string, revision int64, o ...RequestOptions) (Response[Envelope[DeleteAudienceProfileResult]], error) {
	return campaignDo[DeleteAudienceProfileResult](ctx, r.t, "DELETE", audienceProfilePath(phone), url.Values{"expectedRevision": {strconv.FormatInt(revision, 10)}}, nil, o, false, validateProfilePhone(phone), contractInt(revision, 1, campaignSafeInteger, "expectedRevision"))
}
func (r *AudienceProfiles) ListConsent(ctx context.Context, phone string, p ListAudienceProfilesParams, o ...RequestOptions) (Response[CursorEnvelope[AudienceConsentAssertion]], error) {
	if err := validateProfilePhone(phone); err != nil {
		return Response[CursorEnvelope[AudienceConsentAssertion]]{}, err
	}
	return profilePage[AudienceConsentAssertion](ctx, r.t, audienceProfilePath(phone)+"/consent", p, o)
}
func (r *AudienceProfileImports) Create(ctx context.Context, b CreateAudienceProfileImportRequest, o ...RequestOptions) (Response[Envelope[AudienceProfileImportJob]], error) {
	return campaignDo[AudienceProfileImportJob](ctx, r.t, "POST", "/platform/audience-profile-imports", nil, b, o, false, validateProfileImport(b))
}
func (r *AudienceProfileImports) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[AudienceProfileImportJob]], error) {
	return campaignDo[AudienceProfileImportJob](ctx, r.t, "GET", "/platform/audience-profile-imports/"+escaped(id), nil, nil, o, false, contractUUID(id, "jobId"))
}

// Cancel cancels the durable import. Cancelling an HTTP waiter does not cancel it.
func (r *AudienceProfileImports) Cancel(ctx context.Context, id string, o ...RequestOptions) (Response[Envelope[AudienceProfileImportJob]], error) {
	return campaignDo[AudienceProfileImportJob](ctx, r.t, "DELETE", "/platform/audience-profile-imports/"+escaped(id), nil, nil, o, false, contractUUID(id, "jobId"))
}
func profilePage[T any](ctx context.Context, t *transport, path string, p ListAudienceProfilesParams, opts []RequestOptions) (Response[CursorEnvelope[T]], error) {
	var result Response[CursorEnvelope[T]]
	q, err := profilePageQuery(p)
	if err != nil {
		return result, err
	}
	o, err := campaignOptions(options(opts), false, false)
	if err != nil {
		return result, err
	}
	raw, err := request[json.RawMessage](ctx, t, "GET", path, q, nil, o)
	result.Metadata = raw.Metadata
	if err != nil {
		return result, err
	}
	if raw.Metadata.Status != 200 || campaignDecode(raw.Data, &result.Data) != nil {
		return result, campaignResponseError(raw.Metadata)
	}
	for _, item := range result.Data.Data {
		if validateCampaignResponse(item) != nil {
			return result, campaignResponseError(raw.Metadata)
		}
	}
	if result.Data.Page.NextCursor != nil {
		if contractUUID(*result.Data.Page.NextCursor, "cursor") != nil {
			return result, campaignResponseError(raw.Metadata)
		}
	}
	if result.Data.Page.HasMore != (result.Data.Page.NextCursor != nil && *result.Data.Page.NextCursor != "") {
		return result, campaignResponseError(raw.Metadata)
	}
	return result, nil
}
