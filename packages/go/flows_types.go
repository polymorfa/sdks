package polymorfa

import "encoding/json"

type FlowValidationPointer struct {
	Path        string `json:"path,omitempty"`
	LineStart   *int   `json:"lineStart,omitempty"`
	LineEnd     *int   `json:"lineEnd,omitempty"`
	ColumnStart *int   `json:"columnStart,omitempty"`
	ColumnEnd   *int   `json:"columnEnd,omitempty"`
}
type FlowValidationIssue struct {
	LineStart   *int                    `json:"lineStart,omitempty"`
	LineEnd     *int                    `json:"lineEnd,omitempty"`
	ColumnStart *int                    `json:"columnStart,omitempty"`
	ColumnEnd   *int                    `json:"columnEnd,omitempty"`
	Error       string                  `json:"error,omitempty"`
	ErrorType   string                  `json:"errorType,omitempty"`
	Message     string                  `json:"message,omitempty"`
	Pointers    []FlowValidationPointer `json:"pointers,omitempty"`
}
type FlowNumberLink struct {
	Session          string                `json:"session"`
	SessionID        string                `json:"sessionId,omitempty"`
	WABAID           string                `json:"wabaId"`
	MetaFlowID       string                `json:"metaFlowId"`
	Status           string                `json:"status"`
	Categories       []string              `json:"categories"`
	ValidationErrors []FlowValidationIssue `json:"validationErrors"`
	UploadState      string                `json:"uploadState"`
	PreviewURL       string                `json:"previewUrl,omitempty"`
	PreviewExpiresAt *int64                `json:"previewExpiresAt,omitempty"`
	LastSyncedAt     int64                 `json:"lastSyncedAt"`
	DefinitionDigest string                `json:"definitionDigest,omitempty"`
	Simulated        *bool                 `json:"simulated,omitempty"`
}
type FlowSummary struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Status      string           `json:"status"`
	Version     string           `json:"version"`
	ScreenCount int              `json:"screenCount"`
	MetaLinks   []FlowNumberLink `json:"metaLinks"`
	CreatedAt   int64            `json:"createdAt"`
	UpdatedAt   int64            `json:"updatedAt"`
}
type FlowDraft struct {
	FlowSummary
	Definition map[string]json.RawMessage `json:"definition"`
}
type CreateFlowRequest struct {
	DraftID    string                     `json:"draftId,omitempty"`
	Name       string                     `json:"name"`
	Definition map[string]json.RawMessage `json:"definition"`
}
type UpdateFlowRequest struct {
	ExpectedUpdatedAt int64                      `json:"expectedUpdatedAt"`
	Name              *string                    `json:"name,omitempty"`
	Status            string                     `json:"status,omitempty"`
	Definition        map[string]json.RawMessage `json:"definition,omitempty"`
}
type FlowProviderRequest struct {
	SessionID  string   `json:"sessionId"`
	Categories []string `json:"categories,omitempty"`
	RequestID  string   `json:"requestId,omitempty"`
}
type FlowProviderOperation struct {
	ID               string  `json:"id"`
	RequestID        *string `json:"requestId"`
	FlowID           string  `json:"flowId"`
	FlowName         string  `json:"flowName"`
	SessionID        string  `json:"sessionId"`
	Session          string  `json:"session"`
	Action           string  `json:"action"`
	State            string  `json:"state"`
	Resolution       *string `json:"resolution"`
	WABAID           *string `json:"wabaId"`
	MetaFlowID       *string `json:"metaFlowId"`
	DefinitionDigest *string `json:"definitionDigest"`
	ProviderStatus   *string `json:"providerStatus"`
	ErrorCode        *string `json:"errorCode"`
	ProviderCode     *int    `json:"providerCode"`
	ProviderSubcode  *int    `json:"providerSubcode"`
	CreatedAt        int64   `json:"createdAt"`
	UpdatedAt        int64   `json:"updatedAt"`
	CompletedAt      *int64  `json:"completedAt"`
}
type FlowProviderResult struct {
	Operation *FlowProviderOperation `json:"operation"`
	Flow      FlowDraft              `json:"flow"`
}
type FlowEndpoint struct {
	ID           string  `json:"id"`
	OrgID        string  `json:"orgId"`
	ProjectID    string  `json:"projectId"`
	FlowID       string  `json:"flowId"`
	SessionID    string  `json:"sessionId"`
	Mode         string  `json:"mode"`
	URL          *string `json:"url"`
	FunctionID   *string `json:"functionId"`
	DeploymentID *string `json:"deploymentId"`
	Enabled      bool    `json:"enabled"`
	Revision     int64   `json:"revision"`
	EndpointURI  string  `json:"endpointUri"`
	CreatedAt    int64   `json:"createdAt"`
	UpdatedAt    int64   `json:"updatedAt"`
}
type ManagedFlowEncryptionKey struct {
	ID          string  `json:"id"`
	State       string  `json:"state"`
	Fingerprint string  `json:"fingerprint"`
	PublicKey   string  `json:"publicKey"`
	ErrorCode   *string `json:"errorCode"`
	CreatedAt   int64   `json:"createdAt"`
	ActivatedAt *int64  `json:"activatedAt"`
	RetireAfter *int64  `json:"retireAfter"`
}
type FlowEncryptionCustody struct {
	Custody     string                     `json:"custody"`
	ActiveKeyID *string                    `json:"activeKeyId"`
	Keys        []ManagedFlowEncryptionKey `json:"keys"`
}
type FlowEncryptionKeyRotation struct {
	FlowEncryptionCustody
	Key ManagedFlowEncryptionKey `json:"key"`
}
type FlowEndpointState struct {
	Endpoint   *FlowEndpoint         `json:"endpoint"`
	Encryption FlowEncryptionCustody `json:"encryption"`
}
type FlowEndpointSetResult struct {
	Endpoint      FlowEndpoint          `json:"endpoint"`
	SigningSecret string                `json:"signingSecret,omitempty"`
	Encryption    FlowEncryptionCustody `json:"encryption"`
}

func (FlowEndpointSetResult) String() string     { return "FlowEndpointSetResult{[redacted]}" }
func (v FlowEndpointSetResult) GoString() string { return v.String() }

type SetFlowEndpointRequest struct {
	SessionID           string            `json:"sessionId"`
	Enabled             *bool             `json:"enabled,omitempty"`
	ExpectedRevision    *int64            `json:"expectedRevision,omitempty"`
	Mode                string            `json:"mode"`
	URL                 string            `json:"url,omitempty"`
	RotateSigningSecret *bool             `json:"rotateSigningSecret,omitempty"`
	FunctionID          string            `json:"functionId,omitempty"`
	DeploymentID        *Nullable[string] `json:"deploymentId,omitempty"`
}
type FlowNumberRequest struct {
	SessionID string `json:"sessionId"`
}
type ListFlowEndpointReceiptsParams struct {
	SessionID string
	Limit     int
}
type FlowEndpointReceipt struct {
	ID                   string   `json:"id"`
	FlowID               string   `json:"flowId"`
	EndpointID           string   `json:"endpointId"`
	SessionID            string   `json:"sessionId"`
	Mode                 string   `json:"mode"`
	Action               *string  `json:"action"`
	Outcome              string   `json:"outcome"`
	HTTPStatus           *int     `json:"httpStatus"`
	ErrorCode            *string  `json:"errorCode"`
	KeyID                *string  `json:"keyId"`
	FunctionInvocationID *string  `json:"functionInvocationId"`
	DurationMS           *float64 `json:"durationMs"`
	CreatedAt            int64    `json:"createdAt"`
	CompletedAt          *int64   `json:"completedAt"`
}
type FlowOK struct {
	OK bool `json:"ok"`
}
