<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final class Schema
{
    public const VERSION = 2;
    public const SOURCE_SDK_COMMIT = '3bacf46f9c4213426314001586f5bae43aaa77de';
    /** @return array{name:string,key:list<string>,fields:array<string,string>,indexes:list<array{name:string,equals:list<string>,sort:string}>} */
    public static function definition(string $entity): array
    {
        static $schema = null;
        if ($schema === null) {
            $raw = file_get_contents(__DIR__.'/schema2.json');
            if ($raw === false) {
                self::invalid();
            }
            $schema = json_decode($raw, true, flags:JSON_THROW_ON_ERROR);
        }
        if (!isset($schema[$entity])) {
            self::invalid();
        }
        return $schema[$entity];
    }
    /** @param array<string,mixed> $key */
    public static function encodeKey(string $entity, array $key): string
    {
        $parts = [];
        foreach (self::definition($entity)['key'] as $name) {
            $value = $key[$name] ?? null;
            if (!is_string($value) || $value === '' || strlen($value) > 4096 || preg_match('//u', $value) !== 1) {
                self::invalid();
            }
            $parts[] = str_replace(['.','%21','%27','%28','%29','%2A'], ['%2E','!',"'",'(',')','*'], rawurlencode($value));
        }
        return 'k'.implode(':', $parts);
    }
    public static function invalid(): never
    {
        throw new StorageException('invalid_storage_data');
    }
    public static function revision(mixed $value): bool
    {
        return (is_int($value) || is_float($value)) && is_finite((float)$value) && $value >= 1 && $value <= 9007199254740991 && floor($value) === $value * 1.0;
    }
    /** @param array<string,mixed> $row */
    public static function validateRow(string $entity, array $row): void
    {
        $definition = self::definition($entity);
        if (($row['_id'] ?? null) !== self::encodeKey($entity, $row) || !self::revision($row['_rev'] ?? null) || !isset($row['_v']) || (!is_array($row['_v']) && !$row['_v'] instanceof \stdClass)) {
            self::invalid();
        }
        foreach ($row as $field => $value) {
            if (in_array($field, ['_id','_rev','_v'], true) || in_array($field, $definition['key'], true)) {
                continue;
            }
            if (!isset($definition['fields'][$field])) {
                self::invalid();
            }
            if ($value === null) {
                continue;
            }
            if (!match($definition['fields'][$field]) {
                'string' => is_string($value),'boolean' => is_bool($value),'number' => (is_int($value) || is_float($value)) && is_finite((float)$value),'json' => true,default => false
            }) {
                self::invalid();
            }
        }
        foreach ((array)$row['_v'] as $field => $version) {
            if (!isset($definition['fields'][$field]) || (!is_int($version) && !is_float($version)) || !is_finite((float)$version)) {
                self::invalid();
            }
        }
        self::validateJson($row);
    }
    public static function validateJson(mixed $value): void
    {
        $count = 0;
        $visit = static function (mixed $node, int $depth) use (&$count, &$visit): void {
            if (++$count > 200000 || $depth > 64 || (is_float($node) && !is_finite($node)) || (is_string($node) && preg_match('//u', $node) !== 1)) {
                self::invalid();
            }
            if (is_array($node) || $node instanceof \stdClass) {
                foreach ((array)$node as $key => $item) {
                    if (is_string($key) && preg_match('//u', $key) !== 1) {
                        self::invalid();
                    }$visit($item, $depth + 1);
                }
            } elseif ($node !== null && !is_scalar($node)) {
                self::invalid();
            }
        };
        $visit($value, 0);
    }
    /** @param array<array-key,array<string,mixed>> $writes */
    public static function validateWrites(array $writes, int $max): void
    {
        if (count($writes) > $max || !array_is_list($writes)) {
            self::invalid();
        }
        $seen = [];
        foreach ($writes as $write) {
            if (!isset($write['entity']) || !is_string($write['entity'])) {
                self::invalid();
            }
            self::definition($write['entity']);
            if (($write['kind'] ?? null) === 'put') {
                if (!isset($write['row']) || !is_array($write['row']) || !array_key_exists('expectedRev', $write)) {
                    self::invalid();
                }
                self::validateRow($write['entity'], $write['row']);
                $id = $write['row']['_id'];
                $allowed = ['kind','entity','row','expectedRev'];
            } elseif ($write['kind'] === 'delete') {
                $id = $write['id'] ?? null;
                $allowed = ['kind','entity','id','expectedRev'];
                if (!is_string($id) || $id === '' || strlen($id) > 4096) {
                    self::invalid();
                }
            } else {
                self::invalid();
            }
            if (array_diff(array_keys($write), $allowed) !== [] || (isset($write['expectedRev']) && !self::revision($write['expectedRev'])) || ($write['kind'] === 'delete' && array_key_exists('expectedRev', $write) && $write['expectedRev'] === null)) {
                self::invalid();
            }
            $slot = $write['entity'].':'.$id;
            if (isset($seen[$slot])) {
                self::invalid();
            }$seen[$slot] = true;
        }
    }
    /** @param array<string,mixed> $query
     * @return array{name:string,equals:list<string>,sort:string} */
    public static function validateQuery(string $entity, array $query, int $max): array
    {
        $index = null;
        foreach (self::definition($entity)['indexes'] as $candidate) {
            if ($candidate['name'] === ($query['index'] ?? null)) {
                $index = $candidate;
            }
        }
        if ($index === null || !isset($query['equals']) || !is_array($query['equals']) || array_diff(array_keys($query), ['index','equals','range','order','limit','after']) !== [] || !isset($query['limit']) || !is_int($query['limit']) || $query['limit'] < 0 || $query['limit'] > $max || (array_key_exists('order', $query) && !in_array($query['order'], ['asc','desc'], true))) {
            self::invalid();
        }
        if (count($query['equals']) !== count($index['equals'])) {
            self::invalid();
        }
        foreach ($index['equals'] as $field) {
            if (!isset($query['equals'][$field]) || !is_string($query['equals'][$field]) || $query['equals'][$field] === '') {
                self::invalid();
            }
        }
        foreach (['range','after'] as $part) {
            if (array_key_exists($part, $query) && !is_array($query[$part])) {
                self::invalid();
            }
        }
        if (isset($query['range'])) {
            foreach ($query['range'] as $key => $value) {
                if (!in_array($key, ['gt','gte','lt','lte'], true) || (!is_int($value) && !is_float($value)) || !is_finite((float)$value)) {
                    self::invalid();
                }
            }
        }
        if (isset($query['after']) && (!isset($query['after']['sort'],$query['after']['id']) || (!is_int($query['after']['sort']) && !is_float($query['after']['sort'])) || !is_finite((float)$query['after']['sort']) || !is_string($query['after']['id']) || $query['after']['id'] === '' || array_diff(array_keys($query['after']), ['sort','id']) !== [])) {
            self::invalid();
        }
        return $index;
    }
}
