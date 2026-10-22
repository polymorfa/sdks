package storage

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// CosmosAdapter borrows a caller-configured container. Every transaction uses
// one customer namespace partition; logical deletes retain conditional ETags.
type CosmosAdapter struct {
	container        *azcosmos.ContainerClient
	options          ProviderOptions
	partition        azcosmos.PartitionKey
	verified, closed atomic.Bool
	mu               sync.RWMutex
}

type cosmosDocument struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	Entity    string `json:"entity"`
	Row       Row    `json:"row"`
	Deleted   bool   `json:"deleted"`
	Version   int    `json:"version,omitempty"`
	ETag      string `json:"_etag,omitempty"`
}

func NewCosmosAdapter(ctx context.Context, container *azcosmos.ContainerClient, options ProviderOptions) (*CosmosAdapter, error) {
	if container == nil || options.OwnsClient {
		return nil, invalid()
	}
	options, err := providerOptions(options)
	if err != nil {
		return nil, err
	}
	a := &CosmosAdapter{container: container, options: options, partition: azcosmos.NewPartitionKeyString(options.Namespace)}
	if err = a.Setup(ctx); err != nil {
		return nil, err
	}
	return a, nil
}
func cosmosStatus(err error, code int) bool {
	var response *azcore.ResponseError
	return errors.As(err, &response) && response.StatusCode == code
}
func cosmosID(entity, key string) (string, error) {
	id := entity + ":" + key
	if len(id) > 1023 || strings.ContainsAny(id, "/\\?#") {
		return "", invalid()
	}
	return id, nil
}
func (a *CosmosAdapter) read(ctx context.Context, entity, key string) (*cosmosDocument, error) {
	id, err := cosmosID(entity, key)
	if err != nil {
		return nil, err
	}
	response, err := a.container.ReadItem(ctx, a.partition, id, nil)
	if cosmosStatus(err, 404) {
		return nil, nil
	}
	if err != nil {
		return nil, providerFailure(ctx)
	}
	var doc cosmosDocument
	if json.Unmarshal(response.Value, &doc) != nil || doc.ID != id || doc.Namespace != a.options.Namespace || doc.Entity != entity {
		return nil, invalid()
	}
	if doc.ETag == "" {
		doc.ETag = string(response.ETag)
	}
	if doc.ETag == "" {
		return nil, invalid()
	}
	if entity == "storage_schema" {
		if doc.Deleted || doc.Row != nil || doc.Version != SchemaVersion {
			return nil, storageError("storage_schema_mismatch")
		}
	} else if doc.Deleted {
		if doc.Row != nil {
			return nil, invalid()
		}
	} else if ValidateRow(entity, doc.Row) != nil || doc.Row["_id"] != key {
		return nil, invalid()
	}
	return &doc, nil
}
func (a *CosmosAdapter) verify(ctx context.Context) error {
	if a.closed.Load() {
		return storageError("storage_closed")
	}
	doc, err := a.read(ctx, "storage_schema", "storage")
	if err != nil {
		return err
	}
	if doc == nil {
		return storageError("storage_schema_mismatch")
	}
	return nil
}
func (a *CosmosAdapter) Setup(ctx context.Context) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.closed.Load() {
		return storageError("storage_closed")
	}
	response, err := a.container.Read(ctx, nil)
	if err != nil {
		return providerFailure(ctx)
	}
	if response.ContainerProperties == nil {
		return invalid()
	}
	paths := response.ContainerProperties.PartitionKeyDefinition.Paths
	if len(paths) != 1 || paths[0] != "/namespace" {
		return storageError("storage_partition_mismatch")
	}
	if a.options.Create {
		raw, _ := json.Marshal(cosmosDocument{ID: "storage_schema:storage", Namespace: a.options.Namespace, Entity: "storage_schema", Version: SchemaVersion})
		_, err = a.container.CreateItem(ctx, a.partition, raw, nil)
		if err != nil && !cosmosStatus(err, 409) {
			return providerFailure(ctx)
		}
	}
	if err = a.verify(ctx); err != nil {
		return err
	}
	a.verified.Store(true)
	return nil
}
func (a *CosmosAdapter) Capabilities() Capabilities {
	if a == nil || !a.verified.Load() || a.closed.Load() {
		return Capabilities{}
	}
	return Capabilities{true, 100}
}
func (a *CosmosAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if _, err := DefinitionOf(entity); err != nil {
		return nil, err
	}
	if err := providerIDs(ids); err != nil {
		return nil, err
	}
	if err := a.verify(ctx); err != nil {
		return nil, err
	}
	out := map[string]Row{}
	for _, id := range ids {
		doc, err := a.read(ctx, entity, id)
		if err != nil {
			return nil, err
		}
		if doc != nil && !doc.Deleted {
			out[id] = cloneRow(doc.Row)
		}
	}
	return out, nil
}
func (a *CosmosAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if _, err := validateQuery(entity, q, 10000); err != nil {
		return nil, err
	}
	if err := a.verify(ctx); err != nil {
		return nil, err
	}
	noCross := false
	pager := a.container.NewQueryItemsPager("SELECT * FROM c WHERE c.namespace = @namespace AND c.entity = @entity AND c.deleted = false", a.partition, &azcosmos.QueryOptions{PageSizeHint: 100, EnableCrossPartitionQuery: &noCross, QueryParameters: []azcosmos.QueryParameter{{Name: "@namespace", Value: a.options.Namespace}, {Name: "@entity", Value: entity}}})
	rows := []Row{}
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, providerFailure(ctx)
		}
		for _, raw := range page.Items {
			if len(rows) >= a.options.MaxQueryRows {
				return nil, storageError("storage_query_bound_exceeded")
			}
			var doc cosmosDocument
			if json.Unmarshal(raw, &doc) != nil || doc.Namespace != a.options.Namespace || doc.Entity != entity || doc.Deleted || ValidateRow(entity, doc.Row) != nil {
				return nil, invalid()
			}
			id, err := cosmosID(entity, doc.Row["_id"].(string))
			if err != nil || doc.ID != id {
				return nil, invalid()
			}
			rows = append(rows, doc.Row)
		}
	}
	return filterProviderRows(entity, q, rows, a.options.MaxQueryRows)
}
func (a *CosmosAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if err := ValidateWrites(writes, 100); err != nil {
		return CommitResult{}, err
	}
	if err := validateFencedDeletes(writes); err != nil {
		return CommitResult{}, err
	}
	if err := a.verify(ctx); err != nil {
		return CommitResult{}, err
	}
	batch := a.container.NewTransactionalBatch(a.partition)
	ids := []string{}
	for _, w := range writes {
		key := writeID(w)
		current, err := a.read(ctx, w.Entity, key)
		if err != nil {
			return CommitResult{}, err
		}
		var row Row
		if current != nil && !current.Deleted {
			row = current.Row
		}
		if writeConflict(w, row) {
			return CommitResult{Conflicts: []string{key}}, nil
		}
		if current == nil && w.Kind == "delete" {
			continue
		}
		id, err := cosmosID(w.Entity, key)
		if err != nil {
			return CommitResult{}, err
		}
		doc := cosmosDocument{ID: id, Namespace: a.options.Namespace, Entity: w.Entity, Deleted: w.Kind == "delete"}
		if w.Kind == "put" {
			doc.Row = w.Row
		}
		raw, err := json.Marshal(doc)
		if err != nil {
			return CommitResult{}, invalid()
		}
		if current != nil {
			etag := azcore.ETag(current.ETag)
			batch.ReplaceItem(id, raw, &azcosmos.TransactionalBatchItemOptions{IfMatchETag: &etag})
		} else {
			batch.CreateItem(raw, nil)
		}
		ids = append(ids, key)
	}
	if len(ids) == 0 {
		return CommitResult{OK: true}, nil
	}
	response, err := a.container.ExecuteTransactionalBatch(ctx, batch, nil)
	if err != nil {
		return CommitResult{}, providerFailure(ctx)
	}
	if len(response.OperationResults) != len(ids) {
		return CommitResult{}, providerFailure(ctx)
	}
	success, conditional := true, false
	for _, operation := range response.OperationResults {
		code := operation.StatusCode
		if code >= 200 && code < 300 {
			continue
		}
		success = false
		if code == 404 || code == 409 || code == 412 || code == 449 {
			conditional = true
			continue
		}
		if code != 424 {
			return CommitResult{}, providerFailure(ctx)
		}
	}
	if success && response.Success {
		return CommitResult{OK: true}, nil
	}
	if conditional {
		return CommitResult{Conflicts: ids}, nil
	}
	return CommitResult{}, providerFailure(ctx)
}

// Close disables only this adapter. Cosmos ContainerClient has no owned close
// boundary, so NewCosmosAdapter rejects OwnsClient rather than changing transport.
func (a *CosmosAdapter) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.closed.Store(true)
	return nil
}
