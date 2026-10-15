<?php

declare(strict_types=1);

use Polymorfa\Storage\{DynamodbAdapter,EloquentSchema,SqlAdapter};

function storageProviderInvalidUsage(PDO $pdo, object $aws): void
{
    SqlAdapter::pdo('invalid');
    SqlAdapter::pdo($pdo, tablePrefix:[]);
    new DynamodbAdapter($aws, 'customer', 123);
    EloquentSchema::models(namespace:[]);
}
