package polymorfa

import (
	"context"
	"encoding/json"
)

type TemplateVariable struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Example string `json:"example"`
}
type TemplateLocationExample struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Name      string  `json:"name,omitempty"`
	Address   string  `json:"address,omitempty"`
}
type TemplateHeaderExample struct {
	Media    *string
	Location *TemplateLocationExample
}

func (v TemplateHeaderExample) MarshalJSON() ([]byte, error) {
	if v.Media != nil && v.Location == nil {
		return json.Marshal(*v.Media)
	}
	if v.Location != nil && v.Media == nil {
		return json.Marshal(v.Location)
	}
	return nil, validation("Header example must be one media reference or location.")
}
func (v *TemplateHeaderExample) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		var text string
		if err := json.Unmarshal(b, &text); err != nil {
			return err
		}
		v.Media = &text
		return nil
	}
	var location TemplateLocationExample
	if err := json.Unmarshal(b, &location); err != nil {
		return err
	}
	v.Location = &location
	return nil
}

type TemplateHeader struct {
	Format   string                 `json:"format"`
	Text     string                 `json:"text,omitempty"`
	Example  *TemplateHeaderExample `json:"example,omitempty"`
	Filename string                 `json:"filename,omitempty"`
}
type TemplateButton struct {
	Type    string `json:"type"`
	Text    string `json:"text,omitempty"`
	URL     string `json:"url,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Example string `json:"example,omitempty"`
}
type TemplateCarouselCard struct {
	Header  TemplateHeader   `json:"header"`
	Body    string           `json:"body"`
	Buttons []TemplateButton `json:"buttons,omitempty"`
}
type TemplateCarousel struct {
	Cards []TemplateCarouselCard `json:"cards"`
}
type TemplateAuthentication struct {
	OTPType                   string `json:"otpType"`
	CodeExample               string `json:"codeExample,omitempty"`
	AddSecurityRecommendation *bool  `json:"addSecurityRecommendation,omitempty"`
	CodeExpirationMinutes     *int   `json:"codeExpirationMinutes,omitempty"`
}
type TemplateLimitedTimeOffer struct {
	Text          string `json:"text"`
	HasExpiration bool   `json:"hasExpiration"`
}
type TemplateDefinition struct {
	Version          int                       `json:"version"`
	Kind             string                    `json:"kind"`
	Category         string                    `json:"category"`
	Language         string                    `json:"language"`
	Header           *TemplateHeader           `json:"header,omitempty"`
	Body             string                    `json:"body"`
	Footer           string                    `json:"footer,omitempty"`
	Buttons          []TemplateButton          `json:"buttons,omitempty"`
	Carousel         *TemplateCarousel         `json:"carousel,omitempty"`
	Authentication   *TemplateAuthentication   `json:"authentication,omitempty"`
	LimitedTimeOffer *TemplateLimitedTimeOffer `json:"limitedTimeOffer,omitempty"`
	Variables        []TemplateVariable        `json:"variables"`
}
type ProjectTemplate struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Category     string              `json:"category"`
	Language     string              `json:"language"`
	Status       string              `json:"status"`
	Kind         string              `json:"kind"`
	Definition   *TemplateDefinition `json:"definition,omitempty"`
	SampleValues map[string]string   `json:"sampleValues,omitempty"`
	CloudLinks   []json.RawMessage   `json:"cloudLinks"`
	CreatedAt    int64               `json:"createdAt"`
	UpdatedAt    int64               `json:"updatedAt"`
}
type CreateProjectTemplateRequest struct {
	Name         string             `json:"name"`
	Definition   TemplateDefinition `json:"definition"`
	SampleValues map[string]string  `json:"sampleValues,omitempty"`
}
type UpdateProjectTemplateRequest struct {
	Name         *string             `json:"name,omitempty"`
	Status       string              `json:"status,omitempty"`
	Definition   *TemplateDefinition `json:"definition,omitempty"`
	SampleValues *map[string]string  `json:"sampleValues,omitempty"`
}
type PreviewProjectTemplateRequest struct {
	Values  map[string]string `json:"values,omitempty"`
	Surface string            `json:"surface,omitempty"`
}
type SubmitProjectTemplateRequest struct {
	Session string `json:"session"`
}
type Templates struct{ t *transport }

func (c *MessagingClient) Templates() *Templates { return &Templates{c.t} }
func templatesPath(project string) string        { return messagingProjectPath(project) + "/templates" }
func templatePath(project, id string) string     { return templatesPath(project) + "/" + escaped(id) }
func (r *Templates) List(ctx context.Context, project string, o ...RequestOptions) (Response[Envelope[[]ProjectTemplate]], error) {
	return request[Envelope[[]ProjectTemplate]](ctx, r.t, "GET", templatesPath(project), nil, nil, options(o))
}
func (r *Templates) Create(ctx context.Context, project string, b CreateProjectTemplateRequest, o ...RequestOptions) (Response[Envelope[ProjectTemplate]], error) {
	return request[Envelope[ProjectTemplate]](ctx, r.t, "POST", templatesPath(project), nil, b, options(o))
}
func (r *Templates) Retrieve(ctx context.Context, project, id string, o ...RequestOptions) (Response[Envelope[ProjectTemplate]], error) {
	return request[Envelope[ProjectTemplate]](ctx, r.t, "GET", templatePath(project, id), nil, nil, options(o))
}
func (r *Templates) Update(ctx context.Context, project, id string, b UpdateProjectTemplateRequest, o ...RequestOptions) (Response[Envelope[ProjectTemplate]], error) {
	return request[Envelope[ProjectTemplate]](ctx, r.t, "PATCH", templatePath(project, id), nil, b, options(o))
}
func (r *Templates) Delete(ctx context.Context, project, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", templatePath(project, id), nil, nil, options(o))
}
func (r *Templates) Preview(ctx context.Context, project, id string, b PreviewProjectTemplateRequest, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", templatePath(project, id)+"/preview", nil, b, options(o))
}
func (r *Templates) Submit(ctx context.Context, project, id string, b SubmitProjectTemplateRequest, o ...RequestOptions) (Response[Envelope[PlatformPayload]], error) {
	return request[Envelope[PlatformPayload]](ctx, r.t, "POST", templatePath(project, id)+"/submit", nil, b, noRetry(options(o)))
}
