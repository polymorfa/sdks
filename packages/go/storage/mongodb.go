package storage

import (
	"context"
	"encoding/json"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"sync"
	"sync/atomic"
)

// MongoAdapter requires a replica set and snapshot/majority transactions.
type MongoAdapter struct {
	db       *mongo.Database
	options  ProviderOptions
	prefix   string
	verified atomic.Bool
	closed   atomic.Bool
	mu       sync.RWMutex
}

func NewMongoAdapter(ctx context.Context, db *mongo.Database, settings ProviderOptions) (*MongoAdapter, error) {
	if db == nil {
		return nil, invalid()
	}
	settings, err := providerOptions(settings)
	if err != nil {
		return nil, err
	}
	a := &MongoAdapter{db: db, options: settings, prefix: "polymorfa_" + settings.Namespace + "_"}
	var hello bson.M
	if db.RunCommand(ctx, bson.M{"hello": 1}).Decode(&hello) != nil {
		return nil, providerFailure(ctx)
	}
	if text(hello["setName"]) == "" || hello["logicalSessionTimeoutMinutes"] == nil {
		return nil, storageError("storage_mongodb_requires_replica_set")
	}
	if settings.Create {
		err = a.Setup(ctx)
	} else {
		err = a.verify(ctx)
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}
func (a *MongoAdapter) collection(entity string) *mongo.Collection {
	return a.db.Collection(a.prefix + entity)
}
func (a *MongoAdapter) verify(ctx context.Context) error {
	if a == nil || a.db == nil || a.closed.Load() {
		return storageError("storage_closed")
	}
	var meta struct {
		Version int `bson:"version"`
	}
	if a.collection("storage_schema").FindOne(ctx, bson.M{"_id": "storage"}).Decode(&meta) != nil {
		return providerFailure(ctx)
	}
	if meta.Version != SchemaVersion {
		return storageError("storage_schema_mismatch")
	}
	a.verified.Store(true)
	return nil
}
func (a *MongoAdapter) Setup(ctx context.Context) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if !a.options.Create {
		return a.verify(ctx)
	}
	meta := a.collection("storage_schema")
	var prior bson.M
	err := meta.FindOne(ctx, bson.M{"_id": "storage"}).Decode(&prior)
	if err == nil && prior["version"] != int32(SchemaVersion) && prior["version"] != int64(SchemaVersion) && prior["version"] != float64(SchemaVersion) {
		return storageError("storage_schema_mismatch")
	}
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return providerFailure(ctx)
	}
	if _, err = meta.UpdateOne(ctx, bson.M{"_id": "storage"}, bson.M{"$setOnInsert": bson.M{"version": SchemaVersion}}, options.UpdateOne().SetUpsert(true)); err != nil && !mongo.IsDuplicateKeyError(err) {
		return providerFailure(ctx)
	}
	for _, entity := range sqlEntities() {
		for _, idx := range schema[entity].Indexes {
			fields := append(append([]string{}, idx.Equals...), idx.Sort, "_id")
			keys := bson.D{}
			for _, field := range fields {
				keys = append(keys, bson.E{Key: field, Value: 1})
			}
			if _, err = a.collection(entity).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: keys, Options: options.Index().SetName(idx.Name)}); err != nil {
				return providerFailure(ctx)
			}
		}
	}
	return a.verify(ctx)
}
func (a *MongoAdapter) Capabilities() Capabilities {
	if a == nil || !a.verified.Load() || a.closed.Load() {
		return Capabilities{}
	}
	return Capabilities{true, 500}
}
func mongoValue(value any) (any, error) {
	switch v := value.(type) {
	case nil, bool, string, float64:
		return v, nil
	case int32:
		return float64(v), nil
	case int64:
		if v < -9007199254740991 || v > 9007199254740991 {
			return nil, invalid()
		}
		return float64(v), nil
	case bson.M:
		out := map[string]any{}
		for k, v := range v {
			item, err := mongoValue(v)
			if err != nil {
				return nil, err
			}
			out[k] = item
		}
		return out, nil
	case bson.D:
		out := map[string]any{}
		for _, e := range v {
			if _, exists := out[e.Key]; exists {
				return nil, invalid()
			}
			item, err := mongoValue(e.Value)
			if err != nil {
				return nil, err
			}
			out[e.Key] = item
		}
		return out, nil
	case bson.A:
		out := []any{}
		for _, v := range v {
			item, err := mongoValue(v)
			if err != nil {
				return nil, err
			}
			out = append(out, item)
		}
		return out, nil
	default:
		return nil, invalid()
	}
}
func decodeMongo(entity string, value bson.M) (Row, error) {
	v, err := mongoValue(value)
	if err != nil {
		return nil, err
	}
	return providerRow(entity, v)
}
func (a *MongoAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
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
	for start := 0; start < len(ids); start += 500 {
		end := min(start+500, len(ids))
		cursor, err := a.collection(entity).Find(ctx, bson.M{"_id": bson.M{"$in": ids[start:end]}})
		if err != nil {
			return nil, providerFailure(ctx)
		}
		allowed := map[string]bool{}
		for _, id := range ids[start:end] {
			allowed[id] = true
		}
		for cursor.Next(ctx) {
			var value bson.M
			if cursor.Decode(&value) != nil {
				cursor.Close(ctx)
				return nil, invalid()
			}
			row, err := decodeMongo(entity, value)
			if err != nil {
				cursor.Close(ctx)
				return nil, err
			}
			id := row["_id"].(string)
			if !allowed[id] {
				cursor.Close(ctx)
				return nil, invalid()
			}
			out[id] = row
		}
		err = cursor.Err()
		cursor.Close(ctx)
		if err != nil {
			return nil, providerFailure(ctx)
		}
	}
	return out, nil
}
func (a *MongoAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if _, err := validateQuery(entity, q, 10000); err != nil {
		return nil, err
	}
	if err := a.verify(ctx); err != nil {
		return nil, err
	}
	filter := bson.M{}
	for f, v := range q.Equals {
		filter[f] = v
	}
	cursor, err := a.collection(entity).Find(ctx, filter, options.Find().SetLimit(int64(a.options.MaxQueryRows+1)))
	if err != nil {
		return nil, providerFailure(ctx)
	}
	defer cursor.Close(ctx)
	rows := []Row{}
	for cursor.Next(ctx) {
		if len(rows) >= a.options.MaxQueryRows {
			return nil, storageError("storage_query_bound_exceeded")
		}
		var value bson.M
		if cursor.Decode(&value) != nil {
			return nil, invalid()
		}
		row, err := decodeMongo(entity, value)
		if err != nil {
			return nil, err
		}
		for f, v := range q.Equals {
			if row[f] != v {
				return nil, invalid()
			}
		}
		rows = append(rows, row)
	}
	if cursor.Err() != nil {
		return nil, providerFailure(ctx)
	}
	return filterProviderRows(entity, q, rows, a.options.MaxQueryRows)
}
func (a *MongoAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if err := ValidateWrites(writes, 500); err != nil {
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
	session, err := a.db.Client().StartSession()
	if err != nil {
		return CommitResult{}, providerFailure(ctx)
	}
	defer session.EndSession(context.Background())
	_, err = session.WithTransaction(ctx, func(txCtx context.Context) (any, error) {
		for _, w := range writes {
			id := writeID(w)
			var value bson.M
			err := a.collection(w.Entity).FindOne(txCtx, bson.M{"_id": id}).Decode(&value)
			var current Row
			if err == nil {
				current, err = decodeMongo(w.Entity, value)
			} else if errors.Is(err, mongo.ErrNoDocuments) {
				err = nil
			}
			if err != nil {
				return nil, err
			}
			if writeConflict(w, current) {
				return nil, &conditionalConflict{[]string{id}}
			}
			if w.Kind == "put" {
				if w.ExpectedRev == nil {
					_, err = a.collection(w.Entity).InsertOne(txCtx, map[string]any(w.Row))
				} else {
					var result *mongo.UpdateResult
					result, err = a.collection(w.Entity).ReplaceOne(txCtx, bson.M{"_id": id, "_rev": *w.ExpectedRev}, map[string]any(w.Row))
					if err == nil && result.MatchedCount != 1 {
						return nil, &conditionalConflict{[]string{id}}
					}
				}
			} else {
				filter := bson.M{"_id": id}
				if w.ExpectedRev != nil {
					filter["_rev"] = *w.ExpectedRev
				}
				_, err = a.collection(w.Entity).DeleteOne(txCtx, filter)
			}
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	}, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()))
	if err != nil {
		var conflict *conditionalConflict
		if errors.As(err, &conflict) {
			return CommitResult{Conflicts: conflict.ids}, nil
		}
		if mongo.IsDuplicateKeyError(err) {
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
func (a *MongoAdapter) Close(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.options.OwnsClient {
		a.closed.Store(true)
		if a.db.Client().Disconnect(ctx) != nil {
			return providerFailure(ctx)
		}
	}
	return nil
}
func (*MongoAdapter) String() string     { return "MongoAdapter[redacted]" }
func (a *MongoAdapter) GoString() string { return a.String() }
func (*MongoAdapter) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]bool{"redacted": true})
}

var _ Adapter = (*MongoAdapter)(nil)
