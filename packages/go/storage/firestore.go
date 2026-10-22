package storage

import (
	"cloud.google.com/go/firestore"
	"context"
	"encoding/json"
	"errors"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"sync"
	"sync/atomic"
)

type FirestoreAdapter struct {
	client           *firestore.Client
	options          ProviderOptions
	prefix           string
	verified, closed atomic.Bool
	mu               sync.RWMutex
}

func NewFirestoreAdapter(ctx context.Context, client *firestore.Client, settings ProviderOptions) (*FirestoreAdapter, error) {
	if client == nil {
		return nil, invalid()
	}
	settings, err := providerOptions(settings)
	if err != nil {
		return nil, err
	}
	a := &FirestoreAdapter{client: client, options: settings, prefix: "polymorfa_" + settings.Namespace + "_"}
	if err = a.Setup(ctx); err != nil {
		return nil, err
	}
	return a, nil
}
func (a *FirestoreAdapter) collection(entity string) *firestore.CollectionRef {
	return a.client.Collection(a.prefix + entity)
}
func (a *FirestoreAdapter) meta() *firestore.DocumentRef {
	return a.collection("storage_schema").Doc("storage")
}
func firestoreVersion(snapshot *firestore.DocumentSnapshot) bool {
	if snapshot == nil || !snapshot.Exists() {
		return false
	}
	n, ok := number(snapshot.Data()["version"])
	return ok && n == SchemaVersion
}
func (a *FirestoreAdapter) verify(ctx context.Context) error {
	if a == nil || a.client == nil || a.closed.Load() {
		return storageError("storage_closed")
	}
	snapshot, err := a.meta().Get(ctx)
	if err != nil {
		return providerFailure(ctx)
	}
	if !firestoreVersion(snapshot) {
		return storageError("storage_schema_mismatch")
	}
	a.verified.Store(true)
	return nil
}
func (a *FirestoreAdapter) Setup(ctx context.Context) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.closed.Load() {
		return storageError("storage_closed")
	}
	if a.options.Create {
		err := a.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			snapshot, err := tx.Get(a.meta())
			if err != nil {
				if status.Code(err) != codes.NotFound {
					return err
				}
				return tx.Create(a.meta(), map[string]any{"version": SchemaVersion})
			}
			if !firestoreVersion(snapshot) {
				return storageError("storage_schema_mismatch")
			}
			return nil
		})
		if err != nil {
			var typed *Error
			if errors.As(err, &typed) {
				return typed
			}
			return providerFailure(ctx)
		}
	}
	return a.verify(ctx)
}
func (a *FirestoreAdapter) Capabilities() Capabilities {
	if a == nil || !a.verified.Load() || a.closed.Load() {
		return Capabilities{}
	}
	return Capabilities{true, 250}
}
func firestoreRow(entity string, snapshot *firestore.DocumentSnapshot) (Row, error) {
	if snapshot == nil || !snapshot.Exists() {
		return nil, invalid()
	}
	row, err := providerRow(entity, snapshot.Data())
	if err != nil {
		return nil, err
	}
	if snapshot.Ref.ID != row["_id"] {
		return nil, invalid()
	}
	return row, nil
}
func (a *FirestoreAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
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
	for start := 0; start < len(ids); start += 250 {
		end := min(start+250, len(ids))
		refs := []*firestore.DocumentRef{}
		allowed := map[string]bool{}
		for _, id := range ids[start:end] {
			if !allowed[id] {
				refs = append(refs, a.collection(entity).Doc(id))
				allowed[id] = true
			}
		}
		snapshots, err := a.client.GetAll(ctx, refs)
		if err != nil {
			return nil, providerFailure(ctx)
		}
		for _, snapshot := range snapshots {
			if snapshot == nil || !allowed[snapshot.Ref.ID] || snapshot.Ref.Parent.ID != a.prefix+entity {
				return nil, invalid()
			}
			if !snapshot.Exists() {
				continue
			}
			row, err := firestoreRow(entity, snapshot)
			if err != nil {
				return nil, err
			}
			out[snapshot.Ref.ID] = row
		}
	}
	return out, nil
}
func (a *FirestoreAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	idx, err := validateQuery(entity, q, 10000)
	if err != nil {
		return nil, err
	}
	if err = a.verify(ctx); err != nil {
		return nil, err
	}
	selected := a.collection(entity).Query
	for _, field := range idx.Equals {
		selected = selected.Where(field, "==", q.Equals[field])
	}
	documents := selected.Limit(a.options.MaxQueryRows + 1).Documents(ctx)
	defer documents.Stop()
	rows := []Row{}
	for {
		snapshot, err := documents.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, providerFailure(ctx)
		}
		if len(rows) >= a.options.MaxQueryRows {
			return nil, storageError("storage_query_bound_exceeded")
		}
		if snapshot.Ref.Parent.ID != a.prefix+entity {
			return nil, invalid()
		}
		row, err := firestoreRow(entity, snapshot)
		if err != nil {
			return nil, err
		}
		for field, value := range q.Equals {
			if row[field] != value {
				return nil, invalid()
			}
		}
		rows = append(rows, row)
	}
	return filterProviderRows(entity, q, rows, a.options.MaxQueryRows)
}
func (a *FirestoreAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if err := ValidateWrites(writes, 250); err != nil {
		return CommitResult{}, err
	}
	if err := validateFencedDeletes(writes); err != nil {
		return CommitResult{}, err
	}
	if err := a.verify(ctx); err != nil {
		return CommitResult{}, err
	}
	if len(writes) == 0 {
		return CommitResult{OK: true}, nil
	}
	refs := []*firestore.DocumentRef{}
	for _, w := range writes {
		refs = append(refs, a.collection(w.Entity).Doc(writeID(w)))
	}
	err := a.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		meta, err := tx.Get(a.meta())
		if err != nil {
			return err
		}
		if !firestoreVersion(meta) {
			return storageError("storage_schema_mismatch")
		}
		snapshots, err := tx.GetAll(refs)
		if err != nil {
			return err
		}
		if len(snapshots) != len(writes) {
			return invalid()
		}
		for i, w := range writes {
			snapshot := snapshots[i]
			if snapshot == nil || snapshot.Ref.Path != refs[i].Path {
				return invalid()
			}
			var current Row
			if snapshot.Exists() {
				current, err = firestoreRow(w.Entity, snapshot)
				if err != nil {
					return err
				}
			}
			if writeConflict(w, current) {
				return &conditionalConflict{[]string{writeID(w)}}
			}
		}
		// Firestore requires every transaction read before its first write.
		for i, w := range writes {
			var err error
			if w.Kind == "delete" {
				err = tx.Delete(refs[i])
			} else if w.ExpectedRev == nil {
				err = tx.Create(refs[i], map[string]any(w.Row))
			} else {
				err = tx.Set(refs[i], map[string]any(w.Row))
			}
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		var conflict *conditionalConflict
		if errors.As(err, &conflict) {
			return CommitResult{Conflicts: conflict.ids}, nil
		}
		var typed *Error
		if errors.As(err, &typed) {
			return CommitResult{}, typed
		}
		if status.Code(err) == codes.Aborted || status.Code(err) == codes.AlreadyExists {
			ids := []string{}
			for _, w := range writes {
				ids = append(ids, writeID(w))
			}
			return CommitResult{Conflicts: ids}, nil
		}
		return CommitResult{}, providerFailure(ctx)
	}
	return CommitResult{OK: true}, nil
}
func (a *FirestoreAdapter) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.options.OwnsClient {
		a.closed.Store(true)
		if a.client.Close() != nil {
			return storageError("storage_provider_close_failed")
		}
	}
	return nil
}
func (*FirestoreAdapter) String() string     { return "FirestoreAdapter[redacted]" }
func (a *FirestoreAdapter) GoString() string { return a.String() }
func (*FirestoreAdapter) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]bool{"redacted": true})
}

var _ Adapter = (*FirestoreAdapter)(nil)
