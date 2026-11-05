package polymorfa

import "encoding/json"

// AudienceProfileAttribute is one JSON scalar or null. A zero value is null.
// Non-null values use exactly one CampaignVariable scalar variant.
type AudienceProfileAttribute struct{ Value *CampaignVariable }

func (v AudienceProfileAttribute) MarshalJSON() ([]byte, error) {
	if v.Value == nil {
		return []byte("null"), nil
	}
	if err := validateCampaignScalar(*v.Value); err != nil {
		return nil, err
	}
	return json.Marshal(*v.Value)
}
func (v *AudienceProfileAttribute) UnmarshalJSON(data []byte) error {
	v.Value = nil
	if string(data) == "null" {
		return nil
	}
	var scalar CampaignVariable
	if err := json.Unmarshal(data, &scalar); err != nil {
		return err
	}
	v.Value = &scalar
	return nil
}

type AudienceProfileSource string

const (
	AudienceProfileAPI  AudienceProfileSource = "api"
	AudienceProfileCSV  AudienceProfileSource = "csv"
	AudienceProfileForm AudienceProfileSource = "form"
)

type AudienceProfileProvenance struct {
	Source    AudienceProfileSource `json:"source"`
	Reference string                `json:"reference"`
}
type AudienceProfileConsentInput struct {
	AudienceProfileProvenance
	Purpose    string `json:"purpose"`
	Allowed    bool   `json:"allowed"`
	AssertedAt int64  `json:"assertedAt"`
}
type AudienceProfile struct {
	ID         string                              `json:"id"`
	Phone      string                              `json:"phone"`
	Revision   int64                               `json:"revision"`
	Tags       []string                            `json:"tags"`
	Attributes map[string]AudienceProfileAttribute `json:"attributes"`
	Provenance *AudienceProfileProvenance          `json:"provenance"`
	CreatedAt  int64                               `json:"createdAt"`
	UpdatedAt  int64                               `json:"updatedAt"`
}
type PutAudienceProfileRequest struct {
	Tags             []string                            `json:"tags"`
	Attributes       map[string]AudienceProfileAttribute `json:"attributes"`
	ExpectedRevision *int64                              `json:"expectedRevision,omitempty"`
	Provenance       *AudienceProfileProvenance          `json:"provenance,omitempty"`
	Consent          *AudienceProfileConsentInput        `json:"consent,omitempty"`
}
type AudienceConsentAssertion struct {
	AudienceProfileConsentInput
	ID              string `json:"id"`
	ProfileRevision int64  `json:"profileRevision"`
	CreatedAt       int64  `json:"createdAt"`
}
type ListAudienceProfilesParams struct {
	Cursor *string
	Limit  *int
}
type DeleteAudienceProfileResult struct {
	Deleted  bool   `json:"deleted"`
	Phone    string `json:"phone"`
	Revision int64  `json:"revision"`
}
type AudienceProfileImportMapping struct {
	Phone               string  `json:"phone"`
	Tags                string  `json:"tags"`
	Attributes          string  `json:"attributes"`
	ExpectedRevision    *string `json:"expectedRevision,omitempty"`
	ProvenanceReference *string `json:"provenanceReference,omitempty"`
	ConsentAllowed      *string `json:"consentAllowed,omitempty"`
	ConsentAssertedAt   *string `json:"consentAssertedAt,omitempty"`
	ConsentReference    *string `json:"consentReference,omitempty"`
}
type CreateAudienceProfileImportRequest struct {
	ReplayKey string                        `json:"replayKey"`
	CSVBase64 string                        `json:"csvBase64"`
	Mapping   *AudienceProfileImportMapping `json:"mapping,omitempty"`
}
type AudienceProfileImportInvalidSample struct {
	Row    int64  `json:"row"`
	Reason string `json:"reason"`
}
type AudienceProfileImportConflictSample struct {
	Row    int64  `json:"row"`
	Reason string `json:"reason"`
}
type AudienceProfileImportJob struct {
	ID              string                                `json:"id"`
	State           string                                `json:"state"`
	TotalValid      int64                                 `json:"totalValid"`
	InvalidCount    int64                                 `json:"invalidCount"`
	InvalidSamples  []AudienceProfileImportInvalidSample  `json:"invalidSamples"`
	ConflictSamples []AudienceProfileImportConflictSample `json:"conflictSamples"`
	ProcessedValid  int64                                 `json:"processedValid"`
	CreatedCount    int64                                 `json:"createdCount"`
	UpdatedCount    int64                                 `json:"updatedCount"`
	ConflictCount   int64                                 `json:"conflictCount"`
	CreatedAt       int64                                 `json:"createdAt"`
	UpdatedAt       int64                                 `json:"updatedAt"`
	CompletedAt     *int64                                `json:"completedAt"`
}
