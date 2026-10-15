<?php

declare(strict_types=1);
require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,EloquentSchema,Engine,FieldWrite,SqlSchema,Upsert};

$sources = EloquentSchema::models();
storageCheck(count($sources) === count(SqlSchema::ENTITIES), 'all17 Eloquent models exported');
foreach ($sources as $source) {
    storageCheck(token_get_all($source, TOKEN_PARSE) !== [], 'Eloquent source parses');
}
storageRaises(fn () => EloquentSchema::models('invalid; namespace'), 'invalid_storage_model_namespace');
storageRaises(fn () => EloquentSchema::models(tablePrefix:'unsafe; DROP'), 'invalid_storage_sql_name');
$autoload = getenv('POLYMORFA_STORAGE_PROVIDER_AUTOLOAD');
if ($autoload !== false && $autoload !== '') {
    require_once $autoload;
}
$models = getenv('POLYMORFA_ELOQUENT_NATIVE_MODELS');
if ($models !== false && $models !== '' && class_exists(Illuminate\Database\Capsule\Manager::class)) {
    $capsule = new Illuminate\Database\Capsule\Manager();
    $capsule->addConnection(['driver' => 'sqlite','database' => ':memory:','prefix' => ''], 'storage_fixture');
    $capsule->setAsGlobal();
    $capsule->bootEloquent();
    $connection = $capsule->getConnection('storage_fixture');
    $directory = $models.'/run_'.bin2hex(random_bytes(5));
    mkdir($directory, 0700, true);
    $namespace = 'StorageFixture\\Run'.bin2hex(random_bytes(5));
    try {
        $adapter = EloquentSchema::adapter($connection);
        $adapter->setup();
        $engine = new Engine($adapter);
        $engine->apply(new Batch('eloquent', [new Upsert('messages', ['sessionId' => 'eloquent','messageId' => 'one'], ['text' => new FieldWrite('query model', 0),'extra' => new FieldWrite((object)['nested' => [0,false,null]], 0)])]));
        $classes = [];
        foreach (EloquentSchema::models($namespace, connection:'storage_fixture') as $entity => $source) {
            $path = $directory.'/'.$entity.'.php';
            file_put_contents($path, $source);
            require $path;
            $classes[$entity] = $namespace.'\\Stored'.str_replace(' ', '', ucwords(str_replace('_', ' ', $entity)));
        }
        $class = $classes['messages'];
        $row = $class::query()->where('session_id', 'eloquent')->first();
        storageCheck($row !== null && $row->text === 'query model' && $row->extra === ['nested' => [0,false,null]] && is_array($row->_v), 'actual Eloquent query casts exact nested scalars');
        foreach (['save','delete'] as $method) {
            $raised = false;
            try {
                $row->$method();
            } catch (LogicException) {
                $raised = true;
            } storageCheck($raised, 'query models refuse instance '.$method);
        }
        $connection->beginTransaction();
        storageRaises(fn () => EloquentSchema::adapter($connection), 'storage_borrowed_transaction_active');
        storageCheck($connection->transactionLevel() === 1, 'Eloquent borrower transaction unchanged');
        $connection->rollBack();
        $adapter->close();
        storageCheck($class::query()->count() === 1, 'Eloquent borrowed connection usable after close');
        echo "PHP official illuminate/database: all17 generated query models,actual SQLite casts,instance write refusal and borrowed transaction/connection proof passed.\n";
    } finally {
        foreach (glob($directory.'/*.php') ?: [] as $path) {
            unlink($path);
        } rmdir($directory);
        $capsule->getDatabaseManager()->disconnect('storage_fixture');
    }
} else {
    echo "PHP native Eloquent proof skipped: optional client/models directory not configured.\n";
}
