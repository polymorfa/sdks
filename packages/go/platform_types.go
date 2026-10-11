package polymorfa

import (
	"encoding/json"
	"net/url"
	"strconv"
)

func setString(q url.Values, k, v string) {
	if v != "" {
		q.Set(k, v)
	}
}
func setInt(q url.Values, k string, v int) {
	if v != 0 {
		q.Set(k, strconv.Itoa(v))
	}
}
func setBool(q url.Values, k string, v *bool) {
	if v != nil {
		q.Set(k, strconv.FormatBool(*v))
	}
}

type PlatformSession struct {
	ID           string  `json:"_id"`
	CreationTime int64   `json:"_creationTime"`
	ProjectID    string  `json:"projectId"`
	SessionID    string  `json:"sessionId"`
	Name         string  `json:"name"`
	Phone        *string `json:"phone"`
	Platform     *string `json:"platform"`
	IsBusiness   bool    `json:"isBusiness"`
	TestMode     bool    `json:"testMode"`
	TierOverride *string `json:"tierOverride"`
	Status       string  `json:"status"`
	MessageCount int64   `json:"messageCount"`
	LastActiveAt *int64  `json:"lastActiveAt"`
	PaidUntil    *int64  `json:"paidUntil"`
}
type ProjectIcon struct {
	Type      string `json:"type"`
	Value     string `json:"value"`
	Color     string `json:"color,omitempty"`
	StorageID string `json:"storageId,omitempty"`
}
type Project struct {
	ID          string      `json:"id"`
	OrgID       string      `json:"orgId"`
	Name        string      `json:"name"`
	Slug        string      `json:"slug"`
	Icon        ProjectIcon `json:"icon"`
	DefaultTier string      `json:"defaultTier"`
	IsActive    bool        `json:"isActive"`
	Stage       string      `json:"stage"`
}
type ProjectWithStats struct {
	ID             string      `json:"_id"`
	CreationTime   int64       `json:"_creationTime"`
	OrgID          string      `json:"orgId"`
	Name           string      `json:"name"`
	Slug           string      `json:"slug"`
	Icon           ProjectIcon `json:"icon"`
	DefaultTier    string      `json:"defaultTier"`
	IsActive       bool        `json:"isActive"`
	Stage          string      `json:"stage"`
	ActiveSessions int64       `json:"activeSessions"`
	TotalSessions  int64       `json:"totalSessions"`
	TotalMessages  int64       `json:"totalMessages"`
	LastActivity   *int64      `json:"lastActivity"`
	IconURL        *string     `json:"iconUrl"`
}
type CreateProjectRequest struct {
	Name        string       `json:"name"`
	Icon        *ProjectIcon `json:"icon,omitempty"`
	DefaultTier string       `json:"defaultTier,omitempty"`
}
type ProductionBusiness struct {
	Name         string `json:"name"`
	Website      string `json:"website"`
	SupportEmail string `json:"supportEmail"`
}
type ProductionEnrollmentRequest struct {
	Business ProductionBusiness `json:"business"`
}
type ProductionEnrollmentResult struct {
	ID               string `json:"id"`
	OrgID            string `json:"orgId"`
	Name             string `json:"name"`
	Slug             string `json:"slug"`
	Stage            string `json:"stage"`
	OperationID      string `json:"operationId"`
	EnrollmentStatus string `json:"enrollmentStatus"`
	BillingMode      string `json:"billingMode"`
}
type ProductionEnrollmentCommandResult struct {
	OperationID string `json:"operationId"`
	Action      string `json:"action"`
	Accepted    bool   `json:"accepted"`
}
type EncodedEventPayload struct {
	Encoding    string `json:"encoding"`
	ContentType string `json:"contentType"`
	Data        string `json:"data"`
}
type PlatformEvent struct {
	ID                  string               `json:"id"`
	OrganizationID      string               `json:"organizationId"`
	ProjectID           *string              `json:"projectId"`
	Type                string               `json:"type"`
	Source              string               `json:"source"`
	Environment         string               `json:"environment"`
	CreatedAt           string               `json:"createdAt"`
	PayloadAvailability string               `json:"payloadAvailability"`
	Payload             *EncodedEventPayload `json:"payload"`
	ReplayableUntil     *string              `json:"replayableUntil"`
	MetadataExpiresAt   string               `json:"metadataExpiresAt"`
}
type ListEventsParams struct {
	ListParams
	Type  string
	Since string
	Until string
}

func (p ListEventsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "type", p.Type)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return q
}

type IdempotencyReceipt struct {
	ID        string `json:"id"`
	Key       string `json:"key"`
	Replayed  bool   `json:"replayed"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
}
type EventReplayReceipt struct {
	EventID     string             `json:"eventId"`
	DeliveryID  string             `json:"deliveryId"`
	OperationID string             `json:"operationId"`
	Idempotency IdempotencyReceipt `json:"idempotency"`
}
type ReplayEventRequest struct {
	WebhookID string `json:"webhookId"`
}
type WebhookRetryPolicy struct {
	MaximumAttempts     int    `json:"maximumAttempts"`
	Backoff             string `json:"backoff"`
	InitialDelaySeconds int    `json:"initialDelaySeconds"`
}
type WebhookHeaderInput struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type WebhookHeaderMetadata struct {
	Name string `json:"name"`
}
type WebhookSecretMetadata struct {
	Version            int     `json:"version"`
	CreatedAt          string  `json:"createdAt"`
	PreviousValidUntil *string `json:"previousValidUntil"`
}
type PlatformWebhook struct {
	ID             string                  `json:"id"`
	OrganizationID string                  `json:"organizationId"`
	Owner          string                  `json:"owner"`
	ProjectID      *string                 `json:"projectId"`
	URL            string                  `json:"url"`
	EventTypes     []string                `json:"eventTypes"`
	Enabled        bool                    `json:"enabled"`
	Format         string                  `json:"format"`
	RetryPolicy    WebhookRetryPolicy      `json:"retryPolicy"`
	Headers        []WebhookHeaderMetadata `json:"headers"`
	Secret         WebhookSecretMetadata   `json:"secret"`
	CreatedAt      string                  `json:"createdAt"`
	UpdatedAt      string                  `json:"updatedAt"`
}
type CreateWebhookRequest struct {
	URL         string               `json:"url"`
	EventTypes  []string             `json:"eventTypes"`
	Enabled     *bool                `json:"enabled,omitempty"`
	Format      string               `json:"format,omitempty"`
	RetryPolicy *WebhookRetryPolicy  `json:"retryPolicy,omitempty"`
	Headers     []WebhookHeaderInput `json:"headers,omitempty"`
}
type UpdateWebhookRequest struct {
	URL         string                `json:"url,omitempty"`
	EventTypes  *[]string             `json:"eventTypes,omitempty"`
	Enabled     *bool                 `json:"enabled,omitempty"`
	Format      string                `json:"format,omitempty"`
	RetryPolicy *WebhookRetryPolicy   `json:"retryPolicy,omitempty"`
	Headers     *[]WebhookHeaderInput `json:"headers,omitempty"`
}
type ListWebhooksParams struct {
	ListParams
	EventType string
	Enabled   *bool
}

func (p ListWebhooksParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "eventType", p.EventType)
	setBool(q, "enabled", p.Enabled)
	return q
}

type WebhookCreationReceipt struct {
	Webhook         PlatformWebhook    `json:"webhook"`
	OperationID     *string            `json:"operationId"`
	Idempotency     IdempotencyReceipt `json:"idempotency"`
	Secret          *string            `json:"secret"`
	SecretAvailable bool               `json:"secretAvailable"`
}
type WebhookMutationReceipt struct {
	Webhook     PlatformWebhook    `json:"webhook"`
	OperationID *string            `json:"operationId"`
	Idempotency IdempotencyReceipt `json:"idempotency"`
}
type WebhookDeletionReceipt struct {
	WebhookID   string             `json:"webhookId"`
	Deleted     bool               `json:"deleted"`
	OperationID *string            `json:"operationId"`
	Idempotency IdempotencyReceipt `json:"idempotency"`
}
type RotateWebhookSecretRequest struct {
	OverlapSeconds *int `json:"overlapSeconds,omitempty"`
}
type WebhookRotationReceipt struct {
	WebhookID       string                `json:"webhookId"`
	OperationID     *string               `json:"operationId"`
	Secret          *string               `json:"secret"`
	SecretAvailable bool                  `json:"secretAvailable"`
	SecretMetadata  WebhookSecretMetadata `json:"secretMetadata"`
	Idempotency     IdempotencyReceipt    `json:"idempotency"`
}
type TestWebhookRequest struct {
	EventType string               `json:"eventType,omitempty"`
	Body      *EncodedEventPayload `json:"body,omitempty"`
	SessionID string               `json:"sessionId,omitempty"`
}
type WebhookDelivery struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	EventID        string  `json:"eventId"`
	WebhookID      string  `json:"webhookId"`
	Status         string  `json:"status"`
	AttemptCount   int     `json:"attemptCount"`
	Capabilities   struct {
		Retryable bool `json:"retryable"`
	} `json:"capabilities"`
	PayloadAvailability string  `json:"payloadAvailability"`
	ReplayableUntil     *string `json:"replayableUntil"`
	MetadataExpiresAt   string  `json:"metadataExpiresAt"`
	NextAttemptAt       *string `json:"nextAttemptAt"`
	LastAttemptAt       *string `json:"lastAttemptAt"`
	CompletedAt         *string `json:"completedAt"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
	LastOutcome         *struct {
		StatusCode *int    `json:"statusCode"`
		ErrorCode  *string `json:"errorCode"`
	} `json:"lastOutcome"`
}
type ListWebhookDeliveriesParams struct {
	ListParams
	WebhookID string
	EventID   string
	Status    string
	Since     string
	Until     string
}

func (p ListWebhookDeliveriesParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "webhookId", p.WebhookID)
	setString(q, "eventId", p.EventID)
	setString(q, "status", p.Status)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return q
}

type WebhookDeliveryAttempt struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	DeliveryID     string  `json:"deliveryId"`
	Number         int     `json:"number"`
	Status         string  `json:"status"`
	StartedAt      *string `json:"startedAt"`
	CompletedAt    *string `json:"completedAt"`
	NextRetryAt    *string `json:"nextRetryAt"`
	DurationMS     *int    `json:"durationMs"`
	StatusCode     *int    `json:"statusCode"`
	ErrorCode      *string `json:"errorCode"`
	Response       *struct {
		ContentType string `json:"contentType"`
		Excerpt     string `json:"excerpt"`
		Truncated   bool   `json:"truncated"`
	} `json:"response"`
	MetadataExpiresAt string `json:"metadataExpiresAt"`
}
type WebhookDeliveryRetryReceipt struct {
	DeliveryID  string             `json:"deliveryId"`
	AttemptID   string             `json:"attemptId"`
	OperationID string             `json:"operationId"`
	Idempotency IdempotencyReceipt `json:"idempotency"`
}
type OperationProgress struct {
	Code    string `json:"code"`
	Current *int64 `json:"current"`
	Total   *int64 `json:"total"`
}
type OperationError struct {
	Code      string          `json:"code"`
	Retryable bool            `json:"retryable"`
	Details   json.RawMessage `json:"details"`
}
type OperationActionRequired struct {
	Code    string          `json:"code"`
	Details json.RawMessage `json:"details"`
}
type Operation struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	Kind           string  `json:"kind"`
	Resource       struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"resource"`
	Status       string `json:"status"`
	Sequence     int64  `json:"sequence"`
	Capabilities struct {
		Cancellable bool `json:"cancellable"`
		Watchable   bool `json:"watchable"`
	} `json:"capabilities"`
	Progress       *OperationProgress       `json:"progress"`
	Result         json.RawMessage          `json:"result"`
	Error          *OperationError          `json:"error"`
	ActionRequired *OperationActionRequired `json:"actionRequired"`
	CreatedAt      string                   `json:"createdAt"`
	UpdatedAt      string                   `json:"updatedAt"`
	CompletedAt    *string                  `json:"completedAt"`
}
type ListOperationsParams struct {
	ListParams
	Status       string
	Kind         string
	ResourceType string
	ResourceID   string
	ProjectID    string
	Since        string
	Until        string
}

func (p ListOperationsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "status", p.Status)
	setString(q, "kind", p.Kind)
	setString(q, "resourceType", p.ResourceType)
	setString(q, "resourceId", p.ResourceID)
	setString(q, "projectId", p.ProjectID)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return q
}

type RetrieveOperationParams struct {
	Wait          int
	AfterSequence *int64
	ProjectID     string
}
type OperationTransition struct {
	OperationID string  `json:"operationId"`
	Sequence    int64   `json:"sequence"`
	FromStatus  *string `json:"fromStatus"`
	ToStatus    string  `json:"toStatus"`
	ReasonCode  *string `json:"reasonCode"`
	OccurredAt  string  `json:"occurredAt"`
	Snapshot    struct {
		Progress       *OperationProgress       `json:"progress"`
		Error          *OperationError          `json:"error"`
		ActionRequired *OperationActionRequired `json:"actionRequired"`
	} `json:"snapshot"`
}
type OperationCancellationReceipt struct {
	Operation   Operation          `json:"operation"`
	OperationID string             `json:"operationId"`
	Idempotency IdempotencyReceipt `json:"idempotency"`
}
