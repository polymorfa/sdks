package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type FunctionDefinition struct {
	ID                 string  `json:"id"`
	ProjectID          string  `json:"projectId"`
	Name               string  `json:"name"`
	Enabled            bool    `json:"enabled"`
	Revision           int64   `json:"revision"`
	ActiveDeploymentID *string `json:"activeDeploymentId"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
}
type FunctionPage[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"nextCursor"`
}
type ListFunctionsParams struct {
	Limit  int
	Before string
}
type CreateFunctionRequest struct {
	FunctionID string `json:"functionId,omitempty"`
	Name       string `json:"name"`
}
type UpdateFunctionRequest struct {
	ExpectedRevision int64   `json:"expectedRevision"`
	Name             *string `json:"name,omitempty"`
	Enabled          *bool   `json:"enabled,omitempty"`
}
type CreateFunctionDeploymentRequest struct {
	DeploymentID      string   `json:"deploymentId"`
	Source            string   `json:"source"`
	Language          string   `json:"language"`
	Region            string   `json:"region"`
	CompatibilityDate string   `json:"compatibilityDate"`
	SecretVersionIDs  []string `json:"secretVersionIds,omitempty"`
	EgressOrigins     []string `json:"egressOrigins,omitempty"`
}
type FunctionDeploymentSummary struct {
	ID                string   `json:"id"`
	FunctionID        string   `json:"functionId"`
	Language          string   `json:"language"`
	Region            string   `json:"region"`
	CompatibilityDate string   `json:"compatibilityDate"`
	SHA256            string   `json:"sha256"`
	SecretVersionIDs  []string `json:"secretVersionIds"`
	EgressOrigins     []string `json:"egressOrigins"`
	CreatedAt         string   `json:"createdAt"`
}
type FunctionDeployment struct {
	FunctionDeploymentSummary
	Source string `json:"source"`
}
type PromoteFunctionDeploymentRequest struct {
	DeploymentID     string `json:"deploymentId"`
	ExpectedRevision int64  `json:"expectedRevision"`
}
type FunctionSecretVersion struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	CreatedAt string  `json:"createdAt"`
	RevokedAt *string `json:"revokedAt"`
}
type CreateFunctionSecretRequest struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func (r CreateFunctionSecretRequest) String() string   { return "CreateFunctionSecretRequest[redacted]" }
func (r CreateFunctionSecretRequest) GoString() string { return r.String() }

type FunctionRequest struct {
	Method     string            `json:"method"`
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	BodyBase64 string            `json:"bodyBase64"`
}
type FunctionResponse struct {
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers"`
	BodyBase64 string            `json:"bodyBase64"`
}
type FunctionInvocation struct {
	ID            string  `json:"id"`
	FunctionID    string  `json:"functionId"`
	DeploymentID  string  `json:"deploymentId"`
	Outcome       string  `json:"outcome"`
	Trigger       string  `json:"trigger"`
	ErrorCode     *string `json:"errorCode"`
	DurationMs    *int64  `json:"durationMs"`
	ResponseBytes *int64  `json:"responseBytes"`
	Attempt       int     `json:"attempt"`
	CreatedAt     string  `json:"createdAt"`
	CompletedAt   *string `json:"completedAt"`
}
type CreateFunctionInvocationRequest struct {
	DeploymentID string          `json:"deploymentId,omitempty"`
	Request      FunctionRequest `json:"request"`
	Trigger      string          `json:"trigger,omitempty"`
}
type FunctionInvocationResult struct {
	Receipt          FunctionInvocation `json:"receipt"`
	Replayed         bool               `json:"replayed"`
	Response         *FunctionResponse  `json:"response,omitempty"`
	ResponseRetained bool               `json:"responseRetained"`
	Retryable        bool               `json:"retryable"`
}
type FunctionMutationResult struct {
	OK bool `json:"ok"`
}
type Functions struct {
	t         *transport
	projectID string
}
type FunctionDeployments struct{ api *Functions }
type FunctionSecrets struct{ api *Functions }
type FunctionInvocations struct{ api *Functions }

func (c *ProjectClient) Functions() *Functions         { return &Functions{c.t, c.projectID} }
func (r *Functions) Deployments() *FunctionDeployments { return &FunctionDeployments{r} }
func (r *Functions) Secrets() *FunctionSecrets         { return &FunctionSecrets{r} }
func (r *Functions) Invocations() *FunctionInvocations { return &FunctionInvocations{r} }

var functionUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var functionKey = regexp.MustCompile(`^[\x21-\x7e]{1,128}$`)

func functionInvalid(message string) error {
	return &Error{Kind: ValidationError, Code: "invalid_function_input", Message: message}
}
func functionPath(ids ...string) (string, error) {
	path := ""
	for _, id := range ids {
		if !functionUUID.MatchString(id) {
			return "", functionInvalid("A canonical Functions UUID is required.")
		}
		path += "/" + id
	}
	return path, nil
}
func functionRevision(v int64) error {
	if v < 1 || v > 9007199254740991 {
		return functionInvalid("A positive Function revision is required.")
	}
	return nil
}
func functionCall[T any](ctx context.Context, r *Functions, method, suffix string, q url.Values, b any, o RequestOptions) (Response[T], error) {
	if !functionUUID.MatchString(r.projectID) {
		return Response[T]{}, functionInvalid("A canonical Functions project UUID is required.")
	}
	if method == "GET" || method == "DELETE" {
		q = cloneQuery(q)
		q.Set("projectId", r.projectID)
	} else {
		var object map[string]json.RawMessage
		if b != nil {
			encoded, err := json.Marshal(b)
			if err != nil {
				return Response[T]{}, functionInvalid("Function body must be JSON serializable.")
			}
			if err = json.Unmarshal(encoded, &object); err != nil {
				return Response[T]{}, functionInvalid("Function body must be an object.")
			}
		}
		if object == nil {
			object = map[string]json.RawMessage{}
		}
		if _, ok := object["projectId"]; ok {
			return Response[T]{}, functionInvalid("Function input cannot override its project.")
		}
		if _, ok := object["functionId"]; ok && suffix != "" {
			return Response[T]{}, functionInvalid("Function input cannot override its path identity.")
		}
		value, _ := json.Marshal(r.projectID)
		object["projectId"] = value
		b = object
	}
	if method != "GET" {
		o = noRetry(o)
	}
	return unwrapped[T](ctx, r.t, method, "/platform/functions"+suffix, q, b, o)
}
func functionListQuery(p ListFunctionsParams) url.Values {
	q := url.Values{}
	setInt(q, "limit", p.Limit)
	setString(q, "before", p.Before)
	return q
}
func (r *Functions) List(ctx context.Context, p ListFunctionsParams, o ...RequestOptions) (Response[FunctionPage[FunctionDefinition]], error) {
	return functionCall[FunctionPage[FunctionDefinition]](ctx, r, "GET", "", functionListQuery(p), nil, options(o))
}
func (r *Functions) Create(ctx context.Context, b CreateFunctionRequest, o ...RequestOptions) (Response[FunctionDefinition], error) {
	if b.FunctionID != "" && !functionUUID.MatchString(b.FunctionID) {
		return Response[FunctionDefinition]{}, functionInvalid("A canonical Function UUID is required.")
	}
	return functionCall[FunctionDefinition](ctx, r, "POST", "", nil, b, options(o))
}
func (r *Functions) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[FunctionDefinition], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionDefinition]{}, err
	}
	return functionCall[FunctionDefinition](ctx, r, "GET", path, nil, nil, options(o))
}
func (r *Functions) Update(ctx context.Context, id string, b UpdateFunctionRequest, o ...RequestOptions) (Response[FunctionDefinition], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionDefinition]{}, err
	}
	if err = functionRevision(b.ExpectedRevision); err != nil {
		return Response[FunctionDefinition]{}, err
	}
	return functionCall[FunctionDefinition](ctx, r, "PATCH", path, nil, b, options(o))
}
func (r *Functions) Delete(ctx context.Context, id string, expectedRevision int64, o ...RequestOptions) (Response[FunctionMutationResult], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionMutationResult]{}, err
	}
	if err = functionRevision(expectedRevision); err != nil {
		return Response[FunctionMutationResult]{}, err
	}
	return functionCall[FunctionMutationResult](ctx, r, "DELETE", path, url.Values{"expectedRevision": {strconv.FormatInt(expectedRevision, 10)}}, nil, options(o))
}
func (r *FunctionDeployments) List(ctx context.Context, id string, p ListFunctionsParams, o ...RequestOptions) (Response[FunctionPage[FunctionDeploymentSummary]], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionPage[FunctionDeploymentSummary]]{}, err
	}
	return functionCall[FunctionPage[FunctionDeploymentSummary]](ctx, r.api, "GET", path+"/deployments", functionListQuery(p), nil, options(o))
}
func (r *FunctionDeployments) Create(ctx context.Context, id string, b CreateFunctionDeploymentRequest, o ...RequestOptions) (Response[FunctionDeployment], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionDeployment]{}, err
	}
	if !functionUUID.MatchString(b.DeploymentID) {
		return Response[FunctionDeployment]{}, functionInvalid("A canonical deployment UUID is required.")
	}
	return functionCall[FunctionDeployment](ctx, r.api, "POST", path+"/deployments", nil, b, options(o))
}
func (r *FunctionDeployments) Retrieve(ctx context.Context, id, deploymentID string, o ...RequestOptions) (Response[FunctionDeployment], error) {
	path, err := functionPath(id, deploymentID)
	if err != nil {
		return Response[FunctionDeployment]{}, err
	}
	parts := strings.Split(path, "/")
	return functionCall[FunctionDeployment](ctx, r.api, "GET", "/"+parts[1]+"/deployments/"+parts[2], nil, nil, options(o))
}
func (r *FunctionDeployments) Promote(ctx context.Context, id string, b PromoteFunctionDeploymentRequest, o ...RequestOptions) (Response[FunctionDefinition], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionDefinition]{}, err
	}
	if !functionUUID.MatchString(b.DeploymentID) {
		return Response[FunctionDefinition]{}, functionInvalid("A canonical deployment UUID is required.")
	}
	if err = functionRevision(b.ExpectedRevision); err != nil {
		return Response[FunctionDefinition]{}, err
	}
	return functionCall[FunctionDefinition](ctx, r.api, "PUT", path+"/promotion", nil, b, options(o))
}
func (r *FunctionSecrets) List(ctx context.Context, id string, p ListFunctionsParams, o ...RequestOptions) (Response[FunctionPage[FunctionSecretVersion]], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionPage[FunctionSecretVersion]]{}, err
	}
	return functionCall[FunctionPage[FunctionSecretVersion]](ctx, r.api, "GET", path+"/secrets", functionListQuery(p), nil, options(o))
}
func (r *FunctionSecrets) Create(ctx context.Context, id string, b CreateFunctionSecretRequest, o ...RequestOptions) (Response[FunctionSecretVersion], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionSecretVersion]{}, err
	}
	return functionCall[FunctionSecretVersion](ctx, r.api, "POST", path+"/secrets", nil, b, options(o))
}
func (r *FunctionSecrets) Revoke(ctx context.Context, id, versionID string, o ...RequestOptions) (Response[FunctionMutationResult], error) {
	path, err := functionPath(id, versionID)
	if err != nil {
		return Response[FunctionMutationResult]{}, err
	}
	parts := strings.Split(path, "/")
	return functionCall[FunctionMutationResult](ctx, r.api, "DELETE", "/"+parts[1]+"/secrets/"+parts[2], nil, nil, options(o))
}
func (r *FunctionInvocations) List(ctx context.Context, id string, p ListFunctionsParams, o ...RequestOptions) (Response[FunctionPage[FunctionInvocation]], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionPage[FunctionInvocation]]{}, err
	}
	return functionCall[FunctionPage[FunctionInvocation]](ctx, r.api, "GET", path+"/invocations", functionListQuery(p), nil, options(o))
}
func (r *FunctionInvocations) Retrieve(ctx context.Context, id, invocationID string, o ...RequestOptions) (Response[FunctionInvocation], error) {
	path, err := functionPath(id, invocationID)
	if err != nil {
		return Response[FunctionInvocation]{}, err
	}
	parts := strings.Split(path, "/")
	return functionCall[FunctionInvocation](ctx, r.api, "GET", "/"+parts[1]+"/invocations/"+parts[2], nil, nil, options(o))
}
func (r *FunctionInvocations) Create(ctx context.Context, id string, b CreateFunctionInvocationRequest, o RequestOptions) (Response[FunctionInvocationResult], error) {
	path, err := functionPath(id)
	if err != nil {
		return Response[FunctionInvocationResult]{}, err
	}
	if !functionKey.MatchString(o.IdempotencyKey) {
		return Response[FunctionInvocationResult]{}, functionInvalid("A valid invocation idempotency key is required.")
	}
	if b.DeploymentID != "" && !functionUUID.MatchString(b.DeploymentID) {
		return Response[FunctionInvocationResult]{}, functionInvalid("A canonical deployment UUID is required.")
	}
	return functionCall[FunctionInvocationResult](ctx, r.api, "POST", path+"/invocations", nil, b, o)
}
