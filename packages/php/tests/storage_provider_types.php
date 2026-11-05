<?php

declare(strict_types=1);

use Polymorfa\Storage\{DynamodbAdapter,EloquentSchema,FirestoreAdapter,LibsqlDriver,MongodbAdapter,SqlAdapter,SupabaseSchema};

/** Public provider API examples; optional clients are checked against their official runtime classes. */
function storageProviderTypedUsage(PDO $pdo, object $mongo, object $database, object $aws, object $firestore, object $libsql, object $eloquent): void
{
    $sql = SqlAdapter::pdo($pdo, tablePrefix:'customer_');
    $sql->setup();
    $sql->get('messages', ['ksession:message']);
    $mongoAdapter = new MongodbAdapter($mongo, $database, 'customer');
    $mongoAdapter->setup();
    $dynamo = new DynamodbAdapter($aws, 'customer', 'customer_storage', createTable:false);
    $dynamo->setup();
    $firestoreAdapter = new FirestoreAdapter($firestore, 'customer', projectId:'customer-project');
    $firestoreAdapter->setup();
    (new SqlAdapter(new LibsqlDriver($libsql)))->setup();
    EloquentSchema::adapter($eloquent, createTables:false)->setup();
    EloquentSchema::models(namespace:'App\\Models\\Storage', tablePrefix:'customer_', connection:'customer');
    SupabaseSchema::sql(schema:'storage', tablePrefix:'customer_', serverRole:'storage_writer', readerRole:'authenticated');
}
