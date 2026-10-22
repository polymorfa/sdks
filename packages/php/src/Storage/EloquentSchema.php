<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Customer application query-model exports. Adapter schema DDL remains authoritative. */
final class EloquentSchema
{
    public static function adapter(object $connection, string $tablePrefix = 'polymorfa_', ?string $schema = null, bool $createTables = true): SqlAdapter
    {
        if (!is_a($connection, 'Illuminate\\Database\\Connection')) {
            throw new StorageException('invalid_storage_eloquent_connection');
        }
        if (DocumentRows::call($connection, 'transactionLevel') !== 0) {
            throw new StorageException('storage_borrowed_transaction_active');
        }
        $pdo = DocumentRows::call($connection, 'getPdo');
        if (!$pdo instanceof \PDO) {
            throw new StorageException('invalid_storage_eloquent_connection');
        }
        return SqlAdapter::pdo($pdo, $tablePrefix, $schema, $createTables);
    }
    /** Export application-owned Eloquent query models for all schema2 entities.
     * Generated source imports Illuminate only in the consuming application.
     * Instance save/delete guards do not authorize or constrain query-builder SQL;
     * use a customer-owned read-only database role for these models.
     * @return array<string,string> Entity => complete PHP source */
    public static function models(string $namespace = 'App\\Models\\Polymorfa', string $tablePrefix = 'polymorfa_', ?string $connection = null): array
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*(?:\\\\[A-Za-z_][A-Za-z0-9_]*)*$/D', $namespace) !== 1) {
            throw new StorageException('invalid_storage_model_namespace');
        }
        SqlSchema::statements('sqlite', $tablePrefix);
        $sources = [];
        foreach (SqlSchema::ENTITIES as $entity) {
            $class = 'Stored'.str_replace(' ', '', ucwords(str_replace('_', ' ', $entity)));
            $casts = ['_rev' => 'integer','_v' => 'json'];
            foreach (Schema::definition($entity)['fields'] as $field => $type) {
                $casts[SqlSchema::column($field)] = match($type) {
                    'json' => 'json','boolean' => 'boolean','number' => 'float',default => 'string'
                };
            }
            $sources[$entity] = "<?php\n\ndeclare(strict_types=1);\nnamespace ".$namespace.";\n\n/** Schema2 query model; use a read-only database role and write through Polymorfa\\Storage\\Engine. */\nfinal class ".$class." extends \\Illuminate\\Database\\Eloquent\\Model\n{\n    protected \$table = ".var_export($tablePrefix.$entity, true).";\n    protected \$primaryKey = '_id';\n    protected \$keyType = 'string';\n    public \$incrementing = false;\n    public \$timestamps = false;\n    protected \$guarded = ['*'];\n    protected \$connection = ".var_export($connection, true).";\n    protected function casts(): array { return ".var_export($casts, true)."; }\n    public function save(array \$options = []) { throw new \\LogicException('Write through the storage engine.'); }\n    public function delete() { throw new \\LogicException('Write through the storage engine.'); }\n}\n";
        }
        return $sources;
    }
}
