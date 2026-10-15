<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Same schema2 tables, columns and indexes as the owning TypeScript SQL adapters. */
final class SqlSchema
{
    public const ENTITIES = ['sessions','chats','messages','reactions','receipts','poll_votes','contacts','groups','group_participants','media','labels','label_associations','history_chunks','history_progress','checkpoints','events','leases'];
    public static function column(string $field): string
    {
        return preg_replace_callback('/[A-Z]/', static fn (array $m): string => '_'.strtolower($m[0]), $field) ?? throw new StorageException('invalid_storage_sql_name');
    }
    public static function quote(string $dialect, string $name): string
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,62}$/D', $name) !== 1) {
            throw new StorageException('invalid_storage_sql_name');
        } return $dialect === 'mysql' ? '`'.$name.'`' : '"'.$name.'"';
    }
    public static function table(string $dialect, string $entity, string $prefix = 'polymorfa_', ?string $schema = null): string
    {
        if ($schema !== null && $dialect !== 'postgres') {
            Schema::invalid();
        } return ($schema === null ? '' : self::quote($dialect, $schema).'.').self::quote($dialect, $prefix.$entity);
    }
    private static function type(string $dialect, string $kind): string
    {
        return match($dialect) {
            'postgres' => ['key' => 'text','id' => 'text COLLATE "C"','string' => 'text','number' => 'double precision','boolean' => 'boolean','json' => 'jsonb'][$kind],
            'mysql' => ['key' => 'varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin','id' => 'varchar(1024) CHARACTER SET ascii COLLATE ascii_bin','string' => 'mediumtext','number' => 'double','boolean' => 'tinyint(1)','json' => 'json'][$kind],
            'sqlite' => ['key' => 'text','id' => 'text','string' => 'text','number' => 'real','boolean' => 'integer','json' => 'text'][$kind],
            default => throw new StorageException('unsupported_storage_sql_driver'),
        };
    }
    /** DDL only: setup verifies/initializes the version and never overwrites it.
     *
     * @return list<string> */
    public static function statements(string $dialect, string $prefix = 'polymorfa_', ?string $schema = null): array
    {
        if (!in_array($dialect, ['postgres','mysql','sqlite'], true) || ($schema !== null && $dialect !== 'postgres')) {
            Schema::invalid();
        }
        $q = static fn (string $field): string => self::quote($dialect, self::column($field));
        $out = [];
        if ($schema !== null) {
            $out[] = 'CREATE SCHEMA IF NOT EXISTS '.self::quote($dialect, $schema);
        }
        foreach (self::ENTITIES as $entity) {
            $d = Schema::definition($entity);
            $columns = [$q('_id').' '.self::type($dialect, 'id').' NOT NULL PRIMARY KEY'];
            foreach ($d['key'] as $key) {
                $columns[] = $q($key).' '.self::type($dialect, 'key').' NOT NULL';
            }
            foreach ($d['fields'] as $field => $type) {
                $indexed = false;
                foreach ($d['indexes'] as $index) {
                    if (in_array($field, $index['equals'], true)) {
                        $indexed = true;
                    }
                } $columns[] = $q($field).' '.self::type($dialect, $dialect === 'mysql' && $type === 'string' && $indexed ? 'key' : $type);
            }
            $columns[] = $q('_rev').' bigint NOT NULL';
            $columns[] = $q('_v').' '.self::type($dialect, 'json').' NOT NULL';
            $indexes = [];
            foreach ($d['indexes'] as $index) {
                $name = self::quote($dialect, $prefix.$entity.'_'.$index['name']);
                $fields = implode(',', array_map($q, [...$index['equals'],$index['sort'],'_id']));
                if ($dialect === 'mysql') {
                    $columns[] = 'KEY '.$name.' ('.$fields.')';
                } else {
                    $indexes[] = 'CREATE INDEX IF NOT EXISTS '.$name.' ON '.self::table($dialect, $entity, $prefix, $schema).' ('.$fields.')';
                }
            }
            if ($dialect === 'mysql') {
                $columns[] = 'UNIQUE KEY '.self::quote($dialect, $prefix.$entity.'_key').' ('.implode(',', array_map($q, $d['key'])).')';
            }
            $out[] = 'CREATE TABLE IF NOT EXISTS '.self::table($dialect, $entity, $prefix, $schema).' ('.implode(',', $columns).')'.($dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '');
            array_push($out, ...$indexes);
        }
        $out[] = 'CREATE TABLE IF NOT EXISTS '.self::table($dialect, 'storage_schema', $prefix, $schema).' ('.$q('id').' '.self::type($dialect, 'key').' PRIMARY KEY,'.$q('version').' integer NOT NULL)'.($dialect === 'mysql' ? ' ENGINE=InnoDB' : '');
        return $out;
    }
}
