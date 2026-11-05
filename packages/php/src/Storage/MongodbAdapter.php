<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\CancellationToken;

/** Borrowed official mongodb/mongodb Client and Database; replica-set transactions required. */
final class MongodbAdapter implements Adapter
{
    private bool $ready = false;
    private readonly string $prefix;
    public function __construct(private ?object $client, private ?object $database, string $namespace, private readonly int $maxQueryRows = 100000, private readonly bool $createIndexes = true)
    {
        if ($client === null || !is_a($client, 'MongoDB\\Client') || $database === null || !is_a($database, 'MongoDB\\Database') || $maxQueryRows < 1 || $maxQueryRows > 100000) {
            throw new StorageException('invalid_storage_mongodb_client');
        }
        $this->prefix = DocumentRows::namespace($namespace);
    }
    /** @return array{atomicCommit:bool,maxCommitSize:int} */
    public function capabilities(): array
    {
        return ['atomicCommit' => $this->ready,'maxCommitSize' => 500];
    }
    private function collection(string $entity): object
    {
        if ($this->database === null) {
            throw new StorageException('storage_closed');
        }
        if ($entity !== 'storage_schema') {
            Schema::definition($entity);
        }
        return DocumentRows::object(DocumentRows::call($this->database, 'selectCollection', [$this->prefix.$entity]));
    }
    private function check(): void
    {
        if (!$this->ready) {
            throw new StorageException('storage_not_initialized');
        }
    }
    /** @param \Closure(object):void $body */
    private function transaction(\Closure $body): void
    {
        if ($this->client === null) {
            throw new StorageException('storage_closed');
        }
        $session = DocumentRows::object(DocumentRows::call($this->client, 'startSession'));
        try {
            DocumentRows::call($session, 'startTransaction', [['readConcern' => DocumentRows::construct('MongoDB\\Driver\\ReadConcern', ['snapshot']),'writeConcern' => DocumentRows::construct('MongoDB\\Driver\\WriteConcern', ['majority'])]]);
            $body($session);
            DocumentRows::call($session, 'commitTransaction');
        } catch (\Throwable $error) {
            try {
                if (DocumentRows::call($session, 'isInTransaction')) {
                    DocumentRows::call($session, 'abortTransaction');
                }
            } catch (\Throwable) {
            } throw $error;
        } finally {
            DocumentRows::call($session, 'endSession');
        }
    }
    public function setup(): void
    {
        $this->ready = false;
        try {
            // Create metadata outside the transaction; old versions are never overwritten.
            $meta = $this->collection('storage_schema');
            $this->transaction(function (object $session) use ($meta): void {
                $row = DocumentRows::call($meta, 'findOne', [['_id' => 'storage'],['session' => $session,'typeMap' => ['root' => 'array','document' => 'stdClass','array' => 'array']]]);
                if ($row === null) {
                    DocumentRows::call($meta, 'insertOne', [['_id' => 'storage','version' => Schema::VERSION],['session' => $session]]);
                } elseif ((DocumentRows::map($row)['version'] ?? null) !== Schema::VERSION) {
                    throw new StorageException('storage_schema_mismatch');
                }
            });
            if ($this->createIndexes) {
                foreach (SqlSchema::ENTITIES as $entity) {
                    foreach (Schema::definition($entity)['indexes'] as $index) {
                        $keys = [];
                        foreach ([...$index['equals'],$index['sort'],'_id'] as $field) {
                            $keys[$field] = 1;
                        } DocumentRows::call($this->collection($entity), 'createIndex', [$keys,['name' => $index['name']]]);
                    }
                }
            }
            $this->ready = true;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'mongodb');
        }
    }
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        DocumentRows::ids($ids);
        $out = [];
        try {
            foreach (array_chunk(array_values(array_unique($ids)), 1000) as $chunk) {
                $cancellation?->throwIfCancelled();
                $cursor = DocumentRows::call($this->collection($entity), 'find', [['_id' => ['$in' => $chunk]],['typeMap' => ['root' => 'array','document' => 'stdClass','array' => 'array']]]);
                if (!is_iterable($cursor)) {
                    Schema::invalid();
                }
                foreach ($cursor as $doc) {
                    $row = DocumentRows::decode($entity, $doc);
                    $id = $row['_id'];
                    if (!in_array($id, $chunk, true) || isset($out[$id])) {
                        Schema::invalid();
                    } $out[$id] = $row;
                }
            } return $out;
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'mongodb');
        }
    }
    /** @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateWrites($writes, 500);
        WriteFence::validate($writes);
        if ($writes === []) {
            return ['ok' => true];
        }
        try {
            $this->transaction(function (object $session) use ($writes, $cancellation): void {
                foreach ($writes as $write) {
                    $cancellation?->throwIfCancelled();
                    $collection = $this->collection($write['entity']);
                    $id = $write['kind'] === 'put' ? $write['row']['_id'] : $write['id'];
                    $options = ['session' => $session];
                    if ($write['kind'] === 'put' && $write['expectedRev'] === null) {
                        DocumentRows::call($collection, 'insertOne', [DocumentRows::encode($write['entity'], $write['row']),$options]);
                        continue;
                    }
                    $where = ['_id' => $id];
                    if (isset($write['expectedRev'])) {
                        $where['_rev'] = $write['expectedRev'];
                    }
                    $result = DocumentRows::object($write['kind'] === 'put' ? DocumentRows::call($collection, 'replaceOne', [$where,DocumentRows::encode($write['entity'], $write['row']),$options]) : DocumentRows::call($collection, 'deleteOne', [$where,$options]));
                    if (isset($write['expectedRev']) && DocumentRows::call($result, $write['kind'] === 'put' ? 'getMatchedCount' : 'getDeletedCount') !== 1) {
                        throw new SqlConflict($id);
                    }
                }
                $cancellation?->throwIfCancelled();
            });
            return ['ok' => true];
        } catch (SqlConflict $error) {
            return ['ok' => false,'conflicts' => [$error->identity]];
        } catch (\Throwable $error) {
            if ($error->getCode() === 11000 || $error->getCode() === 112) {
                return ['ok' => false,'conflicts' => []];
            } DocumentRows::safe($error, 'mongodb');
        }
    }
    /** @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateQuery($entity, $query, 100000);
        $where = $query['equals'];
        try {
            $cancellation?->throwIfCancelled();
            $cursor = DocumentRows::call($this->collection($entity), 'find', [$where,['limit' => $this->maxQueryRows + 1,'typeMap' => ['root' => 'array','document' => 'stdClass','array' => 'array']]]);
            if (!is_iterable($cursor)) {
                Schema::invalid();
            } $rows = [];
            foreach ($cursor as $doc) {
                $cancellation?->throwIfCancelled();
                if (count($rows) === $this->maxQueryRows) {
                    throw new StorageException('storage_query_bound_exceeded');
                } $row = DocumentRows::decode($entity, $doc);
                if ($row['sessionId'] !== $query['equals']['sessionId']) {
                    Schema::invalid();
                } $rows[] = $row;
            }
            return DocumentRows::filter($entity, $rows, $query);
        } catch (\Throwable $error) {
            DocumentRows::safe($error, 'mongodb');
        }
    }
    public function close(): void
    {
        $this->ready = false;
        $this->client = null;
        $this->database = null;
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
