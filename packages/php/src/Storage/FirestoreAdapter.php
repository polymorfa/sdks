<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\CancellationToken;

/** Borrowed official Google Firestore V1 generated client; explicit public atomic RPCs.
 * Protobuf Values preserve JSON map/list identity (including numeric map keys).
 * The high-level1.55 snapshot mapper and greedy legacy BulkWriter are not used.
 */
final class FirestoreAdapter implements Adapter
{
    private bool $ready = false;
    private readonly string $prefix;
    private readonly string $database;
    public function __construct(private ?object $client, string $namespace, string $projectId, string $databaseId = '(default)', private readonly int $maxQueryRows = 100000)
    {
        if ($client === null || !is_a($client, 'Google\\Cloud\\Firestore\\V1\\Client\\FirestoreClient') || preg_match('/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/D', $projectId) !== 1 || preg_match('/^(?:\(default\)|[A-Za-z0-9][A-Za-z0-9_-]{0,62})$/D', $databaseId) !== 1 || $maxQueryRows < 1 || $maxQueryRows > 100000) {
            throw new StorageException('invalid_storage_firestore_client');
        }
        $this->prefix = DocumentRows::namespace($namespace);
        $this->database = 'projects/'.$projectId.'/databases/'.$databaseId;
    }
    /** @param array<string,mixed> $fields */
    private static function proto(string $type, array $fields = []): object
    {
        return DocumentRows::construct('Google\\Cloud\\Firestore\\V1\\'.$type, [$fields]);
    }
    /** @param array<string,mixed> $fields */
    private function request(string $method, string $type, array $fields): mixed
    {
        if ($this->client === null) {
            throw new StorageException('storage_closed');
        } return DocumentRows::call($this->client, $method, [self::proto($type, $fields),['retrySettings' => ['retriesEnabled' => false]]]);
    }
    /** @return array{atomicCommit:bool,maxCommitSize:int} */ public function capabilities(): array
    {
        return ['atomicCommit' => $this->ready,'maxCommitSize' => 250];
    }
    private function check(): void
    {
        if (!$this->ready) {
            throw new StorageException('storage_not_initialized');
        }
    }
    private function collection(string $entity): string
    {
        if ($entity !== 'storage_schema') {
            Schema::definition($entity);
        } return $this->prefix.$entity;
    }
    private function name(string $entity, string $id): string
    {
        return $this->database.'/documents/'.$this->collection($entity).'/'.$id;
    }
    private function begin(): string
    {
        $response = DocumentRows::object($this->request('beginTransaction', 'BeginTransactionRequest', ['database' => $this->database]));
        $id = DocumentRows::call($response, 'getTransaction');
        if (!is_string($id) || $id === '') {
            Schema::invalid();
        } return $id;
    }
    private function rollback(string $transaction): void
    {
        $this->request('rollback', 'RollbackRequest', ['database' => $this->database,'transaction' => $transaction]);
    }
    private function metadata(): ?object
    {
        try {
            return DocumentRows::object($this->request('getDocument', 'GetDocumentRequest', ['name' => $this->name('storage_schema', 'storage')]));
        } catch (\Throwable $error) {
            if ($error->getCode() === 5) {
                return null;
            } throw $error;
        }
    }
    public function setup(): void
    {
        $this->ready = false;
        try {
            $document = $this->metadata();
            if ($document === null) {
                $doc = self::proto('Document', ['name' => $this->name('storage_schema', 'storage'),'fields' => ['version' => self::value(Schema::VERSION)]]);
                try {
                    $this->request('commit', 'CommitRequest', ['database' => $this->database,'writes' => [self::proto('Write', ['update' => $doc,'current_document' => self::proto('Precondition', ['exists' => false])])]]);
                } catch (\Throwable $error) {
                    if (!in_array($error->getCode(), [6,9], true)) {
                        throw $error;
                    }
                }
                $document = $this->metadata();
            }
            if ($document === null || DocumentRows::call($document, 'getName') !== $this->name('storage_schema', 'storage') || (self::fields($document)['version'] ?? null) !== Schema::VERSION) {
                throw new StorageException('storage_schema_mismatch');
            }
            $transaction = $this->begin();
            $this->rollback($transaction);
            $this->ready = true;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'firestore');
        }
    }
    private static function value(mixed $value): object
    {
        if ($value === null) {
            return self::proto('Value', ['null_value' => 0]);
        }
        if (is_bool($value)) {
            return self::proto('Value', ['boolean_value' => $value]);
        }
        if (is_int($value)) {
            return self::proto('Value', ['integer_value' => $value]);
        }
        if (is_float($value)) {
            return self::proto('Value', ['double_value' => $value]);
        }
        if (is_string($value)) {
            return self::proto('Value', ['string_value' => $value]);
        }
        if (is_array($value) && array_is_list($value)) {
            return self::proto('Value', ['array_value' => self::proto('ArrayValue', ['values' => array_map(self::value(...), $value)])]);
        }
        if ($value instanceof \stdClass || is_array($value)) {
            $fields = [];
            foreach ((array)$value as $key => $item) {
                $fields[$key] = self::value($item);
            } return self::proto('Value', ['map_value' => self::proto('MapValue', ['fields' => $fields])]);
        }
        Schema::invalid();
    }
    private static function decoded(object $value): mixed
    {
        $kind = DocumentRows::call($value, 'getValueType');
        return match($kind) {
            'null_value' => null,'boolean_value' => DocumentRows::call($value, 'getBooleanValue'),'string_value' => DocumentRows::call($value, 'getStringValue'),'double_value' => DocumentRows::call($value, 'getDoubleValue'),
            'integer_value' => self::integer(DocumentRows::call($value, 'getIntegerValue')),
            'array_value' => self::arrayValue(DocumentRows::object(DocumentRows::call($value, 'getArrayValue'))),
            'map_value' => (object)self::fields(DocumentRows::object(DocumentRows::call($value, 'getMapValue'))),default => Schema::invalid(),
        };
    }
    private static function integer(mixed $value): int
    {
        if (is_string($value) && preg_match('/^-?(?:0|[1-9][0-9]*)$/D', $value) === 1 && (string)(int)$value === $value) {
            $value = (int)$value;
        }
        if (!is_int($value) || abs($value) > 9007199254740991) {
            Schema::invalid();
        } return $value;
    }
    /** @return list<mixed> */ private static function arrayValue(object $array): array
    {
        $values = DocumentRows::call($array, 'getValues');
        if (!is_iterable($values)) {
            Schema::invalid();
        } $out = [];
        foreach ($values as $value) {
            $out[] = self::decoded(DocumentRows::object($value));
        } return $out;
    }
    /** @return array<string,mixed> */ private static function fields(object $document): array
    {
        $fields = DocumentRows::call($document, 'getFields');
        if (!is_iterable($fields)) {
            Schema::invalid();
        } $out = [];
        foreach ($fields as $key => $value) {
            $out[$key] = self::decoded(DocumentRows::object($value));
        } return $out;
    }
    /** @return array<string,mixed> */ private function decode(string $entity, object $document): array
    {
        $row = DocumentRows::decode($entity, self::fields($document));
        if (DocumentRows::call($document, 'getName') !== $this->name($entity, $row['_id'])) {
            Schema::invalid();
        } return $row;
    }
    /** @param list<string> $names
     * @return array<string,object|null> */ private function documents(array $names, ?string $transaction = null): array
    {
        $fields = ['database' => $this->database,'documents' => $names];
        if ($transaction !== null) {
            $fields['transaction'] = $transaction;
        }
        $stream = DocumentRows::object($this->request('batchGetDocuments', 'BatchGetDocumentsRequest', $fields));
        $responses = DocumentRows::call($stream, 'readAll');
        if (!is_iterable($responses)) {
            Schema::invalid();
        } $out = [];
        foreach ($responses as $response) {
            $response = DocumentRows::object($response);
            $found = DocumentRows::call($response, 'getFound');
            $name = $found === null ? DocumentRows::call($response, 'getMissing') : DocumentRows::call(DocumentRows::object($found), 'getName');
            if (!is_string($name) || !in_array($name, $names, true) || array_key_exists($name, $out)) {
                Schema::invalid();
            } $out[$name] = $found;
        }
        if (count($out) !== count($names)) {
            Schema::invalid();
        } return $out;
    }
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>> */ public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::definition($entity);
        DocumentRows::ids($ids);
        $out = [];
        try {
            foreach (array_chunk(array_values(array_unique($ids)), 250) as $chunk) {
                $cancellation?->throwIfCancelled();
                $names = array_map(fn (string $id): string => $this->name($entity, $id), $chunk);
                foreach ($this->documents($names) as $doc) {
                    if ($doc !== null) {
                        $row = $this->decode($entity, $doc);
                        $out[$row['_id']] = $row;
                    }
                }
            } return $out;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'firestore');
        }
    }
    /** @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */ public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateWrites($writes, 250);
        WriteFence::validate($writes);
        if ($writes === []) {
            return ['ok' => true];
        } $transaction = null;
        try {
            $cancellation?->throwIfCancelled();
            $transaction = $this->begin();
            $names = array_map(fn (array $w): string => $this->name($w['entity'], $w['kind'] === 'put' ? $w['row']['_id'] : $w['id']), $writes);
            $documents = $this->documents($names, $transaction);
            foreach ($writes as $i => $write) {
                $cancellation?->throwIfCancelled();
                $doc = $documents[$names[$i]];
                $current = $doc === null ? null : $this->decode($write['entity'], $doc);
                $expected = $write['expectedRev'] ?? null;
                if (($write['kind'] === 'put' && $expected === null && $current !== null) || ($expected !== null && ($current === null || $current['_rev'] !== $expected))) {
                    throw new SqlConflict($write['kind'] === 'put' ? $write['row']['_id'] : $write['id']);
                }
            }
            $operations = [];
            foreach ($writes as $i => $write) {
                if ($write['kind'] === 'delete') {
                    $operations[] = self::proto('Write', ['delete' => $names[$i]]);
                    continue;
                }
                $fields = [];
                foreach (DocumentRows::encode($write['entity'], $write['row']) as $key => $value) {
                    $fields[$key] = self::value($value);
                }
                $operations[] = self::proto('Write', ['update' => self::proto('Document', ['name' => $names[$i],'fields' => $fields]),'current_document' => self::proto('Precondition', ['exists' => $write['expectedRev'] !== null])]);
            }
            $cancellation?->throwIfCancelled();
            $this->request('commit', 'CommitRequest', ['database' => $this->database,'transaction' => $transaction,'writes' => $operations]);
            $transaction = null;
            return ['ok' => true];
        } catch (SqlConflict $error) {
            return ['ok' => false,'conflicts' => [$error->identity]];
        } catch (\Throwable $error) {
            if (in_array($error->getCode(), [6,10], true)) {
                return ['ok' => false,'conflicts' => []];
            } DocumentRows::safe($error, 'firestore');
        } finally {
            if ($transaction !== null) {
                try {
                    $this->rollback($transaction);
                } catch (\Throwable) {
                }
            }
        }
    }
    /** @param array<string,mixed> $query
     * @return list<array<string,mixed>> */ public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateQuery($entity, $query, 100000);
        try {
            $filters = [];
            foreach ($query['equals'] as $field => $value) {
                $filters[] = self::proto('StructuredQuery\\Filter', ['field_filter' => self::proto('StructuredQuery\\FieldFilter', ['field' => self::proto('StructuredQuery\\FieldReference', ['field_path' => $field]),'op' => 5,'value' => self::value($value)])]);
            }
            $structured = self::proto('StructuredQuery', ['from' => [self::proto('StructuredQuery\\CollectionSelector', ['collection_id' => $this->collection($entity)])],'where' => self::proto('StructuredQuery\\Filter', ['composite_filter' => self::proto('StructuredQuery\\CompositeFilter', ['op' => 1,'filters' => $filters])]),'limit' => DocumentRows::construct('Google\\Protobuf\\Int32Value', [['value' => $this->maxQueryRows + 1]])]);
            $cancellation?->throwIfCancelled();
            $stream = DocumentRows::object($this->request('runQuery', 'RunQueryRequest', ['parent' => $this->database.'/documents','structured_query' => $structured]));
            $responses = DocumentRows::call($stream, 'readAll');
            if (!is_iterable($responses)) {
                Schema::invalid();
            } $rows = [];
            foreach ($responses as $response) {
                $cancellation?->throwIfCancelled();
                $doc = DocumentRows::call(DocumentRows::object($response), 'getDocument');
                if ($doc === null) {
                    continue;
                } if (count($rows) === $this->maxQueryRows) {
                    throw new StorageException('storage_query_bound_exceeded');
                } $row = $this->decode($entity, DocumentRows::object($doc));
                foreach ($query['equals'] as $key => $value) {
                    if (($row[$key] ?? null) !== $value) {
                        Schema::invalid();
                    }
                } $rows[] = $row;
            }
            return DocumentRows::filter($entity,$rows,$query);
        } catch (\Throwable $error) {
            DocumentRows::safe($error,'firestore');
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
