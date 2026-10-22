package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"regexp"
	"sync"
	"sync/atomic"
	"time"
)

type DynamoOptions struct {
	ProviderOptions
	TableName string
}
type DynamoAdapter struct {
	client           *dynamodb.Client
	options          DynamoOptions
	verified, closed atomic.Bool
	mu               sync.RWMutex
}

var dynamoTablePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,255}$`)

func NewDynamoAdapter(ctx context.Context, client *dynamodb.Client, settings DynamoOptions) (*DynamoAdapter, error) {
	if client == nil || !dynamoTablePattern.MatchString(settings.TableName) {
		return nil, invalid()
	}
	var err error
	settings.ProviderOptions, err = providerOptions(settings.ProviderOptions)
	if err != nil {
		return nil, err
	}
	a := &DynamoAdapter{client: client, options: settings}
	if err = a.Setup(ctx); err != nil {
		return nil, err
	}
	return a, nil
}
func (a *DynamoAdapter) partition(entity string) string { return a.options.Namespace + ":" + entity }
func (a *DynamoAdapter) key(entity, id string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"pk": &types.AttributeValueMemberS{Value: a.partition(entity)}, "sk": &types.AttributeValueMemberS{Value: id}}
}
func (a *DynamoAdapter) verify(ctx context.Context) error {
	if a == nil || a.client == nil || a.closed.Load() {
		return storageError("storage_closed")
	}
	result, err := a.client.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(a.options.TableName), Key: a.key("storage_schema", "storage"), ConsistentRead: aws.Bool(true)})
	if err != nil {
		return providerFailure(ctx)
	}
	version, ok := result.Item["version"].(*types.AttributeValueMemberN)
	if !ok || version.Value != "2" {
		return storageError("storage_schema_mismatch")
	}
	a.verified.Store(true)
	return nil
}
func (a *DynamoAdapter) Setup(ctx context.Context) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.closed.Load() {
		return storageError("storage_closed")
	}
	result, err := a.client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(a.options.TableName)})
	if err != nil {
		var missing *types.ResourceNotFoundException
		if !errors.As(err, &missing) || !a.options.Create {
			return providerFailure(ctx)
		}
		_, err = a.client.CreateTable(ctx, &dynamodb.CreateTableInput{TableName: aws.String(a.options.TableName), KeySchema: []types.KeySchemaElement{{AttributeName: aws.String("pk"), KeyType: types.KeyTypeHash}, {AttributeName: aws.String("sk"), KeyType: types.KeyTypeRange}}, AttributeDefinitions: []types.AttributeDefinition{{AttributeName: aws.String("pk"), AttributeType: types.ScalarAttributeTypeS}, {AttributeName: aws.String("sk"), AttributeType: types.ScalarAttributeTypeS}}, BillingMode: types.BillingModePayPerRequest})
		if err != nil {
			var exists *types.ResourceInUseException
			if !errors.As(err, &exists) {
				return providerFailure(ctx)
			}
		}
		if dynamodb.NewTableExistsWaiter(a.client).Wait(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(a.options.TableName)}, time.Minute) != nil {
			return providerFailure(ctx)
		}
		result, err = a.client.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(a.options.TableName)})
		if err != nil {
			return providerFailure(ctx)
		}
	}
	if result.Table == nil || result.Table.TableStatus != types.TableStatusActive || len(result.Table.KeySchema) != 2 {
		return storageError("storage_dynamodb_key_schema")
	}
	keys := map[string]types.KeyType{}
	kinds := map[string]types.ScalarAttributeType{}
	for _, key := range result.Table.KeySchema {
		keys[aws.ToString(key.AttributeName)] = key.KeyType
	}
	for _, kind := range result.Table.AttributeDefinitions {
		kinds[aws.ToString(kind.AttributeName)] = kind.AttributeType
	}
	if keys["pk"] != types.KeyTypeHash || keys["sk"] != types.KeyTypeRange || kinds["pk"] != types.ScalarAttributeTypeS || kinds["sk"] != types.ScalarAttributeTypeS {
		return storageError("storage_dynamodb_key_schema")
	}
	if a.options.Create {
		item := a.key("storage_schema", "storage")
		item["version"] = &types.AttributeValueMemberN{Value: "2"}
		_, err = a.client.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(a.options.TableName), Item: item, ConditionExpression: aws.String("attribute_not_exists(pk)")})
		if err != nil {
			var conflict *types.ConditionalCheckFailedException
			if !errors.As(err, &conflict) {
				return providerFailure(ctx)
			}
		}
	}
	return a.verify(ctx)
}
func (a *DynamoAdapter) Capabilities() Capabilities {
	if a == nil || !a.verified.Load() || a.closed.Load() {
		return Capabilities{}
	}
	return Capabilities{true, 100}
}
func (a *DynamoAdapter) decode(entity string, item map[string]types.AttributeValue) (Row, error) {
	var data map[string]any
	if attributevalue.UnmarshalMap(item, &data) != nil {
		return nil, invalid()
	}
	row, err := providerRow(entity, data["row"])
	if err != nil {
		return nil, err
	}
	if data["pk"] != a.partition(entity) || data["sk"] != row["_id"] {
		return nil, invalid()
	}
	return row, nil
}
func (a *DynamoAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
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
	for start := 0; start < len(ids); start += 100 {
		end := min(start+100, len(ids))
		keys := []map[string]types.AttributeValue{}
		allowed := map[string]bool{}
		for _, id := range ids[start:end] {
			if !allowed[id] {
				keys = append(keys, a.key(entity, id))
				allowed[id] = true
			}
		}
		pending := map[string]types.KeysAndAttributes{a.options.TableName: {Keys: keys, ConsistentRead: aws.Bool(true)}}
		for attempt := 0; len(pending) > 0; attempt++ {
			if attempt >= 8 {
				return nil, storageError("storage_dynamodb_unprocessed_reads")
			}
			response, err := a.client.BatchGetItem(ctx, &dynamodb.BatchGetItemInput{RequestItems: pending})
			if err != nil {
				return nil, providerFailure(ctx)
			}
			for table, items := range response.Responses {
				if table != a.options.TableName {
					return nil, invalid()
				}
				for _, item := range items {
					row, err := a.decode(entity, item)
					if err != nil {
						return nil, err
					}
					id := row["_id"].(string)
					if !allowed[id] {
						return nil, invalid()
					}
					out[id] = row
				}
			}
			pending = response.UnprocessedKeys
			for table, unprocessed := range pending {
				if table != a.options.TableName {
					return nil, invalid()
				}
				for _, key := range unprocessed.Keys {
					pk, pok := key["pk"].(*types.AttributeValueMemberS)
					sk, sok := key["sk"].(*types.AttributeValueMemberS)
					if !pok || !sok || pk.Value != a.partition(entity) || !allowed[sk.Value] {
						return nil, invalid()
					}
				}
			}
			if len(pending) > 0 {
				if err := pause(ctx, time.Duration(min(500, 10*(1<<attempt)))*time.Millisecond); err != nil {
					return nil, err
				}
			}
		}
	}
	return out, nil
}
func (a *DynamoAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if _, err := validateQuery(entity, q, 10000); err != nil {
		return nil, err
	}
	if err := a.verify(ctx); err != nil {
		return nil, err
	}
	rows := []Row{}
	var cursor map[string]types.AttributeValue
	seen := map[string]bool{}
	for {
		response, err := a.client.Query(ctx, &dynamodb.QueryInput{TableName: aws.String(a.options.TableName), KeyConditionExpression: aws.String("pk = :pk"), ExpressionAttributeValues: map[string]types.AttributeValue{":pk": &types.AttributeValueMemberS{Value: a.partition(entity)}}, ConsistentRead: aws.Bool(true), ExclusiveStartKey: cursor, Limit: aws.Int32(int32(min(1000, a.options.MaxQueryRows-len(rows)+1)))})
		if err != nil {
			return nil, providerFailure(ctx)
		}
		for _, item := range response.Items {
			if len(rows) >= a.options.MaxQueryRows {
				return nil, storageError("storage_query_bound_exceeded")
			}
			row, err := a.decode(entity, item)
			if err != nil {
				return nil, err
			}
			rows = append(rows, row)
		}
		cursor = response.LastEvaluatedKey
		if len(cursor) == 0 {
			break
		}
		pk, pok := cursor["pk"].(*types.AttributeValueMemberS)
		sk, sok := cursor["sk"].(*types.AttributeValueMemberS)
		if !pok || !sok || pk.Value != a.partition(entity) || sk.Value == "" || seen[sk.Value] {
			return nil, invalid()
		}
		seen[sk.Value] = true
	}
	return filterProviderRows(entity, q, rows, a.options.MaxQueryRows)
}
func (a *DynamoAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
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
	if len(writes) == 0 {
		return CommitResult{OK: true}, nil
	}
	items := []types.TransactWriteItem{}
	for _, w := range writes {
		id := writeID(w)
		var condition *string
		names := map[string]string{}
		values := map[string]types.AttributeValue{}
		if w.Kind == "put" && w.ExpectedRev == nil {
			condition = aws.String("attribute_not_exists(pk)")
		} else if w.ExpectedRev != nil {
			condition = aws.String("#row.#rev = :rev")
			names = map[string]string{"#row": "row", "#rev": "_rev"}
			value, err := attributevalue.Marshal(*w.ExpectedRev)
			if err != nil {
				return CommitResult{}, invalid()
			}
			values[":rev"] = value
		}
		if len(names) == 0 {
			names = nil
		}
		if len(values) == 0 {
			values = nil
		}
		if w.Kind == "put" {
			body, err := attributevalue.MarshalMap(map[string]any{"pk": a.partition(w.Entity), "sk": id, "row": map[string]any(w.Row)})
			if err != nil {
				return CommitResult{}, invalid()
			}
			items = append(items, types.TransactWriteItem{Put: &types.Put{TableName: aws.String(a.options.TableName), Item: body, ConditionExpression: condition, ExpressionAttributeNames: names, ExpressionAttributeValues: values}})
		} else {
			items = append(items, types.TransactWriteItem{Delete: &types.Delete{TableName: aws.String(a.options.TableName), Key: a.key(w.Entity, id), ConditionExpression: condition, ExpressionAttributeNames: names, ExpressionAttributeValues: values}})
		}
	}
	token := make([]byte, 16)
	if _, err := rand.Read(token); err != nil {
		return CommitResult{}, storageError("storage_entropy_unavailable")
	}
	_, err := a.client.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: items, ClientRequestToken: aws.String(hex.EncodeToString(token))})
	if err != nil {
		var cancelled *types.TransactionCanceledException
		if errors.As(err, &cancelled) {
			for _, reason := range cancelled.CancellationReasons {
				code := aws.ToString(reason.Code)
				if code == "ConditionalCheckFailed" || code == "TransactionConflict" {
					ids := []string{}
					for _, w := range writes {
						ids = append(ids, writeID(w))
					}
					return CommitResult{Conflicts: ids}, nil
				}
			}
		}
		return CommitResult{}, providerFailure(ctx)
	}
	return CommitResult{OK: true}, nil
}
func (a *DynamoAdapter) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.options.OwnsClient {
		a.closed.Store(true)
		if closer, ok := a.client.Options().HTTPClient.(interface{ CloseIdleConnections() }); ok {
			closer.CloseIdleConnections()
		}
	}
	return nil
}
func (*DynamoAdapter) String() string     { return "DynamoAdapter[redacted]" }
func (a *DynamoAdapter) GoString() string { return a.String() }
func (*DynamoAdapter) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]bool{"redacted": true})
}

var _ Adapter = (*DynamoAdapter)(nil)
