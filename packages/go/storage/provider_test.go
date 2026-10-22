package storage

import (
	"cloud.google.com/go/firestore"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"google.golang.org/api/option"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func exerciseNativeProvider(t *testing.T, adapter Adapter) {
	t.Helper()
	ctx := context.Background()
	if !adapter.Capabilities().AtomicCommit {
		t.Fatal("provider exposed no verified transactions")
	}
	e := engineFor(t, adapter, EngineOptions{})
	events, eventRows, history, historyRows := portable(t)
	for _, event := range events {
		batch, err := ReduceEvent(event)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = e.Apply(ctx, batch); err != nil {
			t.Fatal("portable event", event.Event, err)
		}
	}
	assertFixtureRows(t, e, eventRows)
	batch, err := ReduceHistoryChunk(HistoryInput{SessionID: "provider-history", Chunk: history, ChunkID: str("golden")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.Apply(ctx, batch); err != nil {
		t.Fatal("portable history", err)
	}
	replay, err := e.Apply(ctx, batch)
	if err != nil || replay.Applied {
		t.Fatal("history replay", err)
	}
	for _, rows := range historyRows {
		for _, row := range rows {
			row["sessionId"] = "provider-history"
		}
	}
	assertFixtureRows(t, e, historyRows)
	exerciseEngineRows(t, adapter, fmt.Sprint("provider-scale-", time.Now().UnixNano()))
	first := newFixtureRow(t, "messages", "rollback", map[string]any{"messageId": "a", "timestamp": 1})
	second := newFixtureRow(t, "messages", "rollback", map[string]any{"messageId": "b", "timestamp": 1})
	result, err := adapter.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: first}})
	if err != nil || !result.OK {
		t.Fatal("seed rollback", err)
	}
	wrong := int64(99)
	result, err = adapter.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: second}, {Kind: "delete", Entity: "messages", ID: first["_id"].(string), ExpectedRev: &wrong}})
	if err != nil || result.OK {
		t.Fatal("native transaction conflict", err)
	}
	rows, err := adapter.Get(ctx, "messages", []string{second["_id"].(string)})
	if err != nil || len(rows) != 0 {
		t.Fatal("partial provider commit", err)
	}
	if _, err := adapter.Commit(ctx, []Write{{Kind: "delete", Entity: "messages", ID: first["_id"].(string)}}); err == nil {
		t.Fatal("unfenced provider delete")
	}
	session := "clear-provider"
	up := []Operation{upsert("chats", session, map[string]any{"chatId": "chat"}, map[string]any{"clearedAt": 1}, 1), upsert("messages", session, map[string]any{"messageId": "m"}, map[string]any{"chatId": "chat", "timestamp": 100}, 0), upsert("media", session, map[string]any{"messageId": "m"}, map[string]any{"chatId": "chat", "mediaKey": "secret"}, 0)}
	for _, child := range []struct{ entity, key string }{{"reactions", "senderId"}, {"receipts", "recipientId"}, {"poll_votes", "voterId"}} {
		up = append(up, upsert(child.entity, session, map[string]any{"messageId": "m", child.key: "peer"}, map[string]any{"chatId": "chat", "timestamp": 100}, 0))
	}
	if _, err = e.Apply(ctx, Batch{SessionID: session, Operations: up}); err != nil {
		t.Fatal(err)
	}
	clear := []Operation{upsert("chats", session, map[string]any{"chatId": "chat"}, map[string]any{"clearedAt": 100}, 100), {Kind: "clearChat", SessionID: session, ChatID: "chat", UpTo: 100}}
	if _, err = e.Apply(ctx, Batch{SessionID: session, Operations: clear}); err != nil {
		t.Fatal("native clear", err)
	}
	for i := 1; i < len(up); i++ {
		up[i].Guard = &Watermark{session, "chat", 100}
	}
	if _, err = e.Apply(ctx, Batch{SessionID: session, EventID: str("late"), Operations: up[1:]}); err != nil {
		t.Fatal(err)
	}
	row, err := e.Get(ctx, "messages", map[string]any{"sessionId": session, "messageId": "m"})
	if err != nil || row != nil {
		t.Fatal("provider late resurrection", err)
	}
	for _, child := range []struct{ entity, key string }{{"reactions", "senderId"}, {"receipts", "recipientId"}, {"poll_votes", "voterId"}} {
		row, err := e.Get(ctx, child.entity, map[string]any{"sessionId": session, "messageId": "m", child.key: "peer"})
		if err != nil || row != nil {
			t.Fatal("provider clear child", child.entity, err)
		}
	}
	checkpoint := Operation{Kind: "checkpoint", SessionID: session, Stream: "events", Cursor: "c1", ExpectedCursor: &ExpectedCursor{}}
	if _, err = e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{checkpoint}}); err != nil {
		t.Fatal(err)
	}
	if _, err = e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{checkpoint}}); err == nil {
		t.Fatal("provider explicit-null cursor overwritten")
	}

	for i, value := range []any{nil, false, float64(0), float64(1.2345678901234567), 1e-30, "", "0", []any{}, map[string]any{}, map[string]any{"nested": []any{nil, false, float64(0), map[string]any{"empty": []any{}}, map[string]any{}}}} {
		id := fmt.Sprint(i)
		if _, err = e.Apply(ctx, Batch{SessionID: "json-values", Operations: []Operation{upsert("messages", "json-values", map[string]any{"messageId": id}, map[string]any{"extra": value}, 0)}}); err != nil {
			t.Fatal("provider JSON write", i, err)
		}
		row, err := e.Get(ctx, "messages", map[string]any{"sessionId": "json-values", "messageId": id})
		if err != nil {
			t.Fatal("provider JSON read", i, err)
		}
		actual, _ := CanonicalJSON(row["extra"])
		expected, _ := CanonicalJSON(value)
		if actual != expected {
			t.Fatalf("provider JSON scalar/object/list %d: got %s want %s", i, actual, expected)
		}
	}
	if _, err = e.Apply(ctx, Batch{SessionID: "query-bound", Operations: []Operation{
		upsert("messages", "query-bound", map[string]any{"messageId": "a"}, map[string]any{"chatId": "bound", "timestamp": 1}, 0),
		upsert("messages", "query-bound", map[string]any{"messageId": "b"}, map[string]any{"chatId": "bound", "timestamp": 2}, 0),
	}}); err != nil {
		t.Fatal("query bound seed", err)
	}
}
func TestMongoReplicaSetNativeConformance(t *testing.T) {
	endpoint := os.Getenv("POLYMORFA_MONGO_FIXTURE_URI")
	if endpoint == "" {
		t.Skip("Requires task-owned MongoDB replica-set fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(endpoint).SetServerSelectionTimeout(5 * time.Second))
	if err != nil {
		t.Fatal("Mongo connection")
	}
	defer client.Disconnect(context.Background())
	db := client.Database("sdk_fixture_go")
	namespace := fmt.Sprint("go_", time.Now().UnixNano())
	a, err := NewMongoAdapter(ctx, db, ProviderOptions{Namespace: namespace, Create: true})
	if err != nil {
		t.Fatal(err)
	}
	exerciseNativeProvider(t, a)
	limited, err := NewMongoAdapter(ctx, db, ProviderOptions{Namespace: namespace, MaxQueryRows: 1})
	if err != nil {
		t.Fatal(err)
	}
	assertProviderBound(t, limited)
	foreign, err := NewMongoAdapter(ctx, db, ProviderOptions{Namespace: namespace + "_foreign", Create: true})
	if err != nil {
		t.Fatal(err)
	}
	id, _ := EncodeKey("messages", map[string]any{"sessionId": "rollback", "messageId": "a"})
	rows, err := foreign.Get(ctx, "messages", []string{id})
	if err != nil || len(rows) != 0 {
		t.Fatal("Mongo namespace leaked", err)
	}
	if err = a.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err = client.Ping(ctx, nil); err != nil {
		t.Fatal("borrowed Mongo client closed")
	}
	if _, err = db.Collection(a.prefix+"storage_schema").UpdateOne(ctx, bson.M{"_id": "storage"}, bson.M{"$set": bson.M{"version": 3}}); err != nil {
		t.Fatal("mutate owned metadata")
	}
	if _, err = NewMongoAdapter(ctx, db, ProviderOptions{Namespace: namespace, Create: true}); err == nil {
		t.Fatal("Mongo setup repinned schema")
	}
}
func TestDynamoNativeConformance(t *testing.T) {
	path := os.Getenv("POLYMORFA_DYNAMO_FIXTURE_METADATA")
	if path == "" {
		t.Skip("Requires task-owned DynamoDB Local metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var meta struct {
		SyntheticOnly bool   `json:"syntheticOnly"`
		Endpoint      string `json:"endpoint"`
		Region        string `json:"region"`
		AccessKeyID   string `json:"accessKeyId"`
		Secret        string `json:"secretAccessKey"`
	}
	if json.Unmarshal(raw, &meta) != nil || !meta.SyntheticOnly {
		t.Fatal("synthetic Dynamo fixture metadata required")
	}
	credentials := aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
		return aws.Credentials{AccessKeyID: meta.AccessKeyID, SecretAccessKey: meta.Secret}, nil
	})
	client := dynamodb.New(dynamodb.Options{Region: meta.Region, BaseEndpoint: aws.String(meta.Endpoint), Credentials: credentials, HTTPClient: &http.Client{Timeout: 10 * time.Second}, RetryMaxAttempts: 1})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	namespace := fmt.Sprint("go_", time.Now().UnixNano())
	table := strings.ReplaceAll(namespace, "_", "-")
	a, err := NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: ProviderOptions{Namespace: namespace, Create: true}, TableName: table})
	if err != nil {
		t.Fatal(err)
	}
	exerciseNativeProvider(t, a)
	limited, err := NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: ProviderOptions{Namespace: namespace, MaxQueryRows: 1}, TableName: table})
	if err != nil {
		t.Fatal(err)
	}
	assertProviderBound(t, limited)
	foreign, err := NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: ProviderOptions{Namespace: namespace + "_foreign", Create: true}, TableName: table})
	if err != nil {
		t.Fatal(err)
	}
	id, _ := EncodeKey("messages", map[string]any{"sessionId": "rollback", "messageId": "a"})
	rows, err := foreign.Get(ctx, "messages", []string{id})
	if err != nil || len(rows) != 0 {
		t.Fatal("Dynamo namespace leaked", err)
	}
	if err = a.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(table)}); err != nil {
		t.Fatal("borrowed Dynamo client closed")
	}
	item := a.key("storage_schema", "storage")
	item["version"] = &types.AttributeValueMemberN{Value: "3"}
	if _, err = client.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		t.Fatal("Dynamo version fixture")
	}
	if _, err = NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: ProviderOptions{Namespace: namespace, Create: true}, TableName: table}); err == nil {
		t.Fatal("Dynamo setup repinned schema")
	}
	wrongTable := table + "-wrong"
	if _, err = client.CreateTable(ctx, &dynamodb.CreateTableInput{TableName: aws.String(wrongTable), KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("wrong"), KeyType: types.KeyTypeHash}}, AttributeDefinitions: []types.AttributeDefinition{{AttributeName: aws.String("wrong"), AttributeType: types.ScalarAttributeTypeS}}, BillingMode: types.BillingModePayPerRequest}); err != nil {
		t.Fatal("Dynamo wrong key fixture")
	}
	if _, err = NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: ProviderOptions{Namespace: namespace, Create: true}, TableName: wrongTable}); err == nil {
		t.Fatal("Dynamo wrong key schema accepted")
	}
}
func TestFirestoreNativeConformance(t *testing.T) {
	host := os.Getenv("POLYMORFA_FIRESTORE_FIXTURE_HOST")
	if host == "" {
		t.Skip("Requires task-owned Firestore emulator")
	}
	t.Setenv("FIRESTORE_EMULATOR_HOST", host)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	client, err := firestore.NewClient(ctx, "sdk-fixture-go", option.WithoutAuthentication())
	if err != nil {
		t.Fatal("Firestore connection")
	}
	defer client.Close()
	namespace := fmt.Sprint("go_", time.Now().UnixNano())
	a, err := NewFirestoreAdapter(ctx, client, ProviderOptions{Namespace: namespace, Create: true})
	if err != nil {
		t.Fatal(err)
	}
	exerciseNativeProvider(t, a)
	limited, err := NewFirestoreAdapter(ctx, client, ProviderOptions{Namespace: namespace, MaxQueryRows: 1})
	if err != nil {
		t.Fatal(err)
	}
	assertProviderBound(t, limited)
	foreign, err := NewFirestoreAdapter(ctx, client, ProviderOptions{Namespace: namespace + "_foreign", Create: true})
	if err != nil {
		t.Fatal(err)
	}
	id, _ := EncodeKey("messages", map[string]any{"sessionId": "rollback", "messageId": "a"})
	rows, err := foreign.Get(ctx, "messages", []string{id})
	if err != nil || len(rows) != 0 {
		t.Fatal("Firestore namespace leaked", err)
	}
	if err = a.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Doc("borrowed/probe").Set(ctx, map[string]bool{"ok": true}); err != nil {
		t.Fatal("borrowed Firestore closed")
	}
	if _, err = a.meta().Set(ctx, map[string]int{"version": 3}); err != nil {
		t.Fatal("mutate owned metadata")
	}
	if _, err = NewFirestoreAdapter(ctx, client, ProviderOptions{Namespace: namespace, Create: true}); err == nil {
		t.Fatal("Firestore setup repinned schema")
	}
}

func assertProviderBound(t *testing.T, a Adapter) {
	t.Helper()
	_, err := a.Query(context.Background(), "messages", Query{Index: "by_chat", Equals: map[string]string{"sessionId": "query-bound", "chatId": "bound"}, Limit: 10})
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "storage_query_bound_exceeded" {
		t.Fatal("provider did not enforce query bound", err)
	}
}
