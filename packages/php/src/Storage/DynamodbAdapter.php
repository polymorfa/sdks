<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\CancellationToken;

/** Official aws/aws-sdk-php low-level client, consistent reads and conditional native transactions. */
final class DynamodbAdapter implements Adapter
{
    private bool $ready = false;
    private readonly string $owner;
    private readonly object $marshaler;
    public function __construct(private ?object $client, string $namespace, private readonly string $table, private readonly bool $createTable = false, private readonly int $maxQueryRows = 100000)
    {
        if ($client === null || !is_a($client, 'Aws\\DynamoDb\\DynamoDbClient') || preg_match('/^[A-Za-z0-9_.-]{3,255}$/D', $table) !== 1 || $maxQueryRows < 1 || $maxQueryRows > 100000) {
            throw new StorageException('invalid_storage_dynamodb_client');
        }
        DocumentRows::namespace($namespace);
        $this->owner = $namespace;
        $this->marshaler = DocumentRows::construct('Aws\\DynamoDb\\Marshaler');
    }
    /** @param array<string,mixed> $parameters
     * @return array<string,mixed> */
    private function request(string $method, array $parameters): array
    {
        if ($this->client === null) {
            throw new StorageException('storage_closed');
        }
        $result = DocumentRows::object(DocumentRows::call($this->client, $method, [$parameters]));
        return DocumentRows::map(DocumentRows::call($result, 'toArray'));
    }
    /** @return array{atomicCommit:bool,maxCommitSize:int} */ public function capabilities(): array
    {
        return ['atomicCommit' => $this->ready,'maxCommitSize' => 100];
    }
    private function check(): void
    {
        if (!$this->ready) {
            throw new StorageException('storage_not_initialized');
        }
    }
    private function partition(string $entity): string
    {
        if ($entity !== 'storage_schema') {
            Schema::definition($entity);
        } return $this->owner.':'.$entity;
    }
    /** @return array{pk:array{S:string},sk:array{S:string}} */ private function key(string $entity, string $id): array
    {
        return ['pk' => ['S' => $this->partition($entity)],'sk' => ['S' => $id]];
    }
    private static function code(\Throwable $error): ?string
    {
        return is_callable([$error,'getAwsErrorCode']) ? DocumentRows::call($error, 'getAwsErrorCode') : null;
    }
    public function setup(): void
    {
        $this->ready = false;
        try {
            try {
                $response = $this->request('describeTable', ['TableName' => $this->table]);
            } catch (\Throwable $error) {
                if (self::code($error) !== 'ResourceNotFoundException' || !$this->createTable) {
                    throw $error;
                }
                $this->request('createTable', ['TableName' => $this->table,'KeySchema' => [['AttributeName' => 'pk','KeyType' => 'HASH'],['AttributeName' => 'sk','KeyType' => 'RANGE']],'AttributeDefinitions' => [['AttributeName' => 'pk','AttributeType' => 'S'],['AttributeName' => 'sk','AttributeType' => 'S']],'BillingMode' => 'PAY_PER_REQUEST']);
                if ($this->client === null) {
                    throw new StorageException('storage_closed');
                } DocumentRows::call($this->client, 'waitUntil', ['TableExists',['TableName' => $this->table]]);
                $response = $this->request('describeTable', ['TableName' => $this->table]);
            }
            $table = DocumentRows::map($response['Table'] ?? null);
            $keys = [];
            foreach ($table['KeySchema'] ?? [] as $item) {
                $keys[$item['AttributeName']] = $item['KeyType'];
            } ksort($keys);
            $kinds = [];
            foreach ($table['AttributeDefinitions'] ?? [] as $item) {
                $kinds[$item['AttributeName']] = $item['AttributeType'];
            }
            if ($keys !== ['pk' => 'HASH','sk' => 'RANGE'] || ($kinds['pk'] ?? null) !== 'S' || ($kinds['sk'] ?? null) !== 'S' || ($table['TableStatus'] ?? null) !== 'ACTIVE') {
                throw new StorageException('storage_schema_mismatch');
            }
            $key = $this->key('storage_schema', 'storage');
            $row = $this->request('getItem', ['TableName' => $this->table,'Key' => $key,'ConsistentRead' => true])['Item'] ?? null;
            if ($row === null) {
                try {
                    $this->request('putItem', ['TableName' => $this->table,'Item' => [...$key,'version' => ['N' => (string)Schema::VERSION]],'ConditionExpression' => 'attribute_not_exists(pk)']);
                } catch (\Throwable $error) {
                    if (self::code($error) !== 'ConditionalCheckFailedException') {
                        throw $error;
                    }
                }
                $row = $this->request('getItem', ['TableName' => $this->table,'Key' => $key,'ConsistentRead' => true])['Item'] ?? null;
            }
            if (!is_array($row) || ($row['version']['N'] ?? null) !== (string)Schema::VERSION || ($row['pk'] ?? null) !== $key['pk'] || ($row['sk'] ?? null) !== $key['sk']) {
                throw new StorageException('storage_schema_mismatch');
            }
            $this->ready = true;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'dynamodb');
        }
    }
    /** @param array<string,mixed> $row
     * @return array<string,mixed> */ private function item(string $entity, array $row): array
    {
        Schema::validateRow($entity, $row);
        return DocumentRows::map(DocumentRows::call($this->marshaler, 'marshalItem', [self::numbers(['pk' => $this->partition($entity),'sk' => $row['_id'],'row' => DocumentRows::encode($entity, $row)])]));
    }
    private static function numbers(mixed $value): mixed
    {
        if (is_float($value)) {
            return DocumentRows::construct('Aws\\DynamoDb\\NumberValue', [Rows::canonical($value)]);
        }
        if (is_array($value)) {
            return array_map(self::numbers(...), $value);
        }
        if ($value instanceof \stdClass) {
            $result = new \stdClass();
            foreach ((array)$value as $key => $item) {
                $result->{(string)$key} = self::numbers($item);
            } return $result;
        }
        return $value;
    }
    /** @return array<string,mixed> */
    private function decode(string $entity, mixed $item): array
    {
        $item = DocumentRows::map($item);
        $decoded = DocumentRows::map(DocumentRows::call($this->marshaler, 'unmarshalItem', [$item,true]));
        $row = DocumentRows::decode($entity, $decoded['row'] ?? null);
        if (($decoded['pk'] ?? null) !== $this->partition($entity) || ($decoded['sk'] ?? null) !== $row['_id']) {
            Schema::invalid();
        } return $row;
    }
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::definition($entity);
        DocumentRows::ids($ids);
        $out = [];
        try {
            foreach (array_chunk(array_values(array_unique($ids)), 100) as $chunk) {
                $keys = array_map(fn (string $id): array => $this->key($entity, $id), $chunk);
                $pending = [$this->table => ['Keys' => $keys,'ConsistentRead' => true]];
                $allowed = array_fill_keys($chunk, true);
                for ($attempt = 0;$pending !== [] && $attempt < 8;$attempt++) {
                    $cancellation?->throwIfCancelled();
                    $allowed = [];
                    foreach ($pending[$this->table]['Keys'] as $key) {
                        $allowed[$key['sk']['S']] = true;
                    }
                    $response = $this->request('batchGetItem', ['RequestItems' => $pending]);
                    $responses = DocumentRows::map($response['Responses'] ?? []);
                    if (array_diff(array_keys($responses), [$this->table]) !== []) {
                        Schema::invalid();
                    } $raw = $responses[$this->table] ?? [];
                    if (!is_array($raw) || !array_is_list($raw)) {
                        Schema::invalid();
                    }
                    foreach ($raw as $item) {
                        $row = $this->decode($entity, $item);
                        $id = $row['_id'];
                        if (!isset($allowed[$id]) || isset($out[$id])) {
                            Schema::invalid();
                        } $out[$id] = $row;
                    }
                    $unprocessed = DocumentRows::map($response['UnprocessedKeys'] ?? []);
                    if (array_diff(array_keys($unprocessed), [$this->table]) !== []) {
                        Schema::invalid();
                    }
                    $nextKeys = $unprocessed[$this->table]['Keys'] ?? [];
                    if (!is_array($nextKeys) || !array_is_list($nextKeys)) {
                        Schema::invalid();
                    } $seen = [];
                    foreach ($nextKeys as $key) {
                        $id = $key['sk']['S'] ?? null;
                        if (!is_string($id) || !isset($allowed[$id]) || isset($out[$id]) || isset($seen[$id]) || Rows::canonical($key) !== Rows::canonical($this->key($entity, $id))) {
                            Schema::invalid();
                        } $seen[$id] = true;
                    }
                    $pending = $nextKeys === [] ? [] : [$this->table => ['Keys' => $nextKeys,'ConsistentRead' => true]];
                    if ($pending !== []) {
                        usleep(min(100000, 1000 * (2 ** $attempt)));
                    }
                }
                if ($pending !== []) {
                    throw new StorageException('storage_unprocessed_reads');
                }
            } return $out;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'dynamodb');
        }
    }
    /** @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateWrites($writes, 100);
        WriteFence::validate($writes);
        if ($writes === []) {
            return ['ok' => true];
        } $operations = [];
        foreach ($writes as $write) {
            $body = ['TableName' => $this->table];
            if ($write['kind'] === 'put' && $write['expectedRev'] === null) {
                $body['ConditionExpression'] = 'attribute_not_exists(pk)';
            } elseif (isset($write['expectedRev'])) {
                $body += ['ConditionExpression' => '#row.#rev = :rev','ExpressionAttributeNames' => ['#row' => 'row','#rev' => '_rev'],'ExpressionAttributeValues' => [':rev' => ['N' => (string)$write['expectedRev']]]];
            }
            if ($write['kind'] === 'put') {
                $body['Item'] = $this->item($write['entity'], $write['row']);
                $operations[] = ['Put' => $body];
            } else {
                $body['Key'] = $this->key($write['entity'], $write['id']);
                $operations[] = ['Delete' => $body];
            }
        }
        try {
            $cancellation?->throwIfCancelled();
            $this->request('transactWriteItems', ['TransactItems' => $operations]);
            return ['ok' => true];
        } catch (\Throwable $error) {
            if (self::code($error) === 'TransactionCanceledException' && is_callable([$error,'get'])) {
                $reasons = DocumentRows::call($error, 'get', ['CancellationReasons']);
                $conflict = false;
                if (is_array($reasons) && count($reasons) === count($writes)) {
                    foreach ($reasons as $reason) {
                        $code = $reason['Code'] ?? null;
                        if (!in_array($code, ['None','ConditionalCheckFailed','TransactionConflict'], true)) {
                            DocumentRows::safe($error, 'dynamodb');
                        } if ($code !== 'None') {
                            $conflict = true;
                        }
                    }
                    if ($conflict) {
                        return ['ok' => false,'conflicts' => []];
                    }
                }
            }
            DocumentRows::safe($error, 'dynamodb');
        }
    }
    /** @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateQuery($entity, $query, 100000);
        $rows = [];
        $cursor = null;
        $seen = [];
        try {
            do {
                $cancellation?->throwIfCancelled();
                $options = ['TableName' => $this->table,'KeyConditionExpression' => 'pk = :pk','ExpressionAttributeValues' => [':pk' => ['S' => $this->partition($entity)]],'ConsistentRead' => true,'Limit' => min(1000, $this->maxQueryRows + 1 - count($rows))];
                if ($cursor !== null) {
                    $options['ExclusiveStartKey'] = $cursor;
                }
                $response = $this->request('query', $options);
                $items = $response['Items'] ?? [];
                if (!is_array($items) || !array_is_list($items)) {
                    Schema::invalid();
                }
                foreach ($items as $item) {
                    if (count($rows) === $this->maxQueryRows) {
                        throw new StorageException('storage_query_bound_exceeded');
                    } $row = $this->decode($entity, $item);
                    if (isset($seen[$row['_id']])) {
                        Schema::invalid();
                    } $seen[$row['_id']] = true;
                    $rows[] = $row;
                }
                $next = $response['LastEvaluatedKey'] ?? null;
                if ($next === []) {
                    $next = null;
                }
                if ($next !== null) {
                    if ($items === [] || !is_array($next) || !is_string($next['sk']['S'] ?? null) || $next['sk']['S'] !== $rows[count($rows) - 1]['_id'] || Rows::canonical($next) !== Rows::canonical($this->key($entity, $next['sk']['S'])) || ($cursor !== null && strcmp($next['sk']['S'], $cursor['sk']['S']) <= 0)) {
                        Schema::invalid();
                    }
                } $cursor = $next;
            } while ($cursor !== null);
            return DocumentRows::filter($entity, $rows, $query);
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'dynamodb');
        }
    }
    public function close(): void
    {
        $this->ready = false;
        $this->client = null;
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
