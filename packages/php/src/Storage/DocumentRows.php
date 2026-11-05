<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Bounded, verified document encoding shared by customer-owned native clients. */
final class DocumentRows
{
    public static function namespace(string $namespace): string
    {
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D', $namespace) !== 1) {
            throw new StorageException('invalid_storage_namespace');
        }
        return 'polymorfa_'.$namespace.'_';
    }
    /** @param string $class
     * @param list<mixed> $arguments */
    public static function construct(string $class, array $arguments = []): object
    {
        if (!class_exists($class)) {
            throw new StorageException('storage_optional_driver_missing');
        } return new $class(...$arguments);
    }
    /** @param list<mixed> $arguments */
    public static function call(object $object, string $method, array $arguments = []): mixed
    {
        if (!is_callable([$object,$method])) {
            throw new StorageException('invalid_storage_client');
        }
        return (\Closure::fromCallable([$object,$method]))(...$arguments);
    }
    public static function object(mixed $value): object
    {
        if (!is_object($value)) {
            throw new StorageException('invalid_storage_provider_response');
        } return $value;
    }
    /** @return array<string,mixed> */
    public static function map(mixed $value): array
    {
        if ($value instanceof \stdClass) {
            $value = (array)$value;
        }
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new StorageException('invalid_storage_provider_response');
        }
        foreach (array_keys($value) as $key) {
            if (!is_string($key)) {
                throw new StorageException('invalid_storage_provider_response');
            }
        }
        return $value;
    }
    /** @param array<array-key,string> $ids */
    public static function ids(array $ids): void
    {
        if (!array_is_list($ids)) {
            Schema::invalid();
        }
        foreach ($ids as $id) {
            if ($id === '' || strlen($id) > 4096) {
                Schema::invalid();
            }
        }
    }
    /** @param array<string,mixed> $row
     * @return array<string,mixed> */
    public static function encode(string $entity, array $row): array
    {
        Schema::validateRow($entity, $row);
        $row['_v'] = (object)$row['_v'];
        return $row;
    }
    /** @return array<string,mixed> */
    public static function decode(string $entity, mixed $document): array
    {
        $row = self::map($document);
        if (isset($row['_v']) && $row['_v'] instanceof \stdClass) {
            $row['_v'] = (array)$row['_v'];
        }
        Schema::validateRow($entity, $row);
        return $row;
    }
    /** @param list<array<string,mixed>> $rows
     * @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public static function filter(string $entity, array $rows, array $query): array
    {
        $index = Schema::validateQuery($entity, $query, 100000);
        $result = [];
        $seen = [];
        foreach ($rows as $row) {
            Schema::validateRow($entity, $row);
            if (isset($seen[$row['_id']])) {
                throw new StorageException('invalid_storage_provider_response');
            } $seen[$row['_id']] = true;
            foreach ($query['equals'] as $key => $value) {
                if (($row[$key] ?? null) !== $value) {
                    continue 2;
                }
            }
            $sort = $row[$index['sort']] ?? null;
            foreach ($query['range'] ?? [] as $op => $value) {
                $c = Rows::compare($sort, $value);
                if (!match($op) {
                    'gt' => $c > 0,'gte' => $c >= 0,'lt' => $c < 0,'lte' => $c <= 0,default => Schema::invalid()
                }) {
                    continue 2;
                }
            }
            if (isset($query['after'])) {
                $c = Rows::compare($sort, $query['after']['sort']) ?: Rows::compare($row['_id'], $query['after']['id']);
                if (($query['order'] ?? 'asc') === 'desc' ? $c >= 0 : $c <= 0) {
                    continue;
                }
            }
            $result[] = $row;
        }
        usort($result, static fn (array $a, array $b): int => (Rows::compare($a[$index['sort']] ?? null, $b[$index['sort']] ?? null) ?: Rows::compare($a['_id'], $b['_id'])) * (($query['order'] ?? 'asc') === 'desc' ? -1 : 1));
        return array_slice($result, 0, $query['limit']);
    }
    public static function safe(\Throwable $error, string $provider): never
    {
        if ($error instanceof StorageException || $error instanceof \Polymorfa\CancelledException) {
            throw $error;
        } throw new StorageException('storage_'.$provider.'_failed');
    }
}
