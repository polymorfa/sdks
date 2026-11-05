<?php

declare(strict_types=1);
require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Adapter,Batch,Checkpoint,Engine,EventReducer,FieldWrite,HistoryReducer,MongodbAdapter,Rows,Schema,Upsert};

function storageDocumentProof(Adapter $adapter, string $name): void
{
    global $fixture,$large;
    storageCheck(!$adapter->capabilities()['atomicCommit'], $name.' setup required');
    $adapter->setup();
    $engine = new Engine($adapter);
    foreach ($fixture['events'] as $row) {
        $batch = EventReducer::reduce(storageEvent($row));
        storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, $name.' event replay');
    }
    storageExpected($engine, $fixture['eventRows']);
    $batch = HistoryReducer::reduce('portable-fixture', $fixture['history'], chunkId:'portable');
    storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, $name.' history replay');
    storageExpected($engine, $fixture['historyRows']);
    foreach ([null,false,0,0.0,1.2345678901234567,1e-30,'','0',[],new stdClass(),(object)['0' => 'only'],(object)['0' => 'first','1' => 'second'],(object)['$oid' => 'literal','$date' => 'literal','0' => 'zero','a.b' => 'dot'],(object)['nested' => [false,0,null,(object)['empty' => []],new stdClass()]]] as $i => $value) {
        $engine->apply(new Batch('json', [new Upsert('messages', ['sessionId' => 'json','messageId' => (string)$i], ['extra' => new FieldWrite($value, 0)])]));
        $id = Schema::encodeKey('messages', ['sessionId' => 'json','messageId' => (string)$i]);
        storageCheck(Rows::canonical($adapter->get('messages', [$id])[$id]['extra']) === Rows::canonical($value), $name.' exact JSON scalar/object/list '.$i);
    }
    $engine->apply(HistoryReducer::reduce('large', $large, chunkId:'large'));
    $count = 0;
    foreach ($large['conversations'] as $conversation) {
        $count += count($engine->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$conversation['id']],'limit' => 1000])['rows']);
    } storageCheck($count === 2000, $name.' full2000');
    $scope = ['sessionId' => 'large','chatId' => 'wa:'.$large['conversations'][0]['id']];
    $first = $adapter->query('messages', ['index' => 'by_chat','equals' => $scope,'order' => 'desc','limit' => 25]);
    storageCheck(count($first) === 25, $name.' descending page');
    $last = $first[count($first) - 1];
    $second = $adapter->query('messages', ['index' => 'by_chat','equals' => $scope,'order' => 'desc','limit' => 25,'after' => ['sort' => $last['timestamp'],'id' => $last['_id']]]);
    storageCheck(count($second) === 25 && count(array_unique(array_column([...$first,...$second], '_id'))) === 50, $name.' stable nonduplicated cursor page');
    foreach ($second as $row) {
        storageCheck((Rows::compare($row['timestamp'], $last['timestamp']) ?: Rows::compare($row['_id'], $last['_id'])) < 0, $name.' descending cursor order');
    }

    $engine->apply(new Batch('cas', [new Upsert('messages', ['sessionId' => 'cas','messageId' => 'one'], ['text' => new FieldWrite('original', 0)])]));
    $id = Schema::encodeKey('messages', ['sessionId' => 'cas','messageId' => 'one']);
    $before = $adapter->get('messages', [$id])[$id];
    $two = Rows::empty('messages', ['sessionId' => 'cas','messageId' => 'two']);
    $two['_rev'] = 1;
    $changed = $before;
    $changed['_rev']++;
    storageCheck(!$adapter->commit([['kind' => 'put','entity' => 'messages','row' => $two,'expectedRev' => null],['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => $before['_rev'] + 100]])['ok'], $name.' actual conditional reject');
    storageCheck($adapter->get('messages', [$two['_id']]) === [] && $adapter->get('messages', [$id])[$id] === $before, $name.' whole transaction rollback');
    $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'one', expectedCursor:null)]));
    storageRaises(fn () => $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'two', expectedCursor:null)])), 'storage_checkpoint_conflict');
    storageCheck($engine->getCheckpoint('cas', 'events')['cursor'] === 'one', $name.' stale checkpoint refused');
    storageRaises(fn () => $adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $id]]), 'storage_delete_revision_required');
    $leaseId = Schema::encodeKey('leases', ['sessionId' => 'cas']);
    $lease = $adapter->get('leases', [$leaseId])[$leaseId];
    $next = $lease;
    $next['_rev']++;
    storageCheck($adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $id],['kind' => 'put','entity' => 'leases','row' => $next,'expectedRev' => $lease['_rev']]])['ok'] && $adapter->get('messages', [$id]) === [], $name.' same session lease fenced delete');
    storageCheck($adapter->commit([['kind' => 'put','entity' => 'messages','row' => $two,'expectedRev' => null]])['ok'], $name.' child before stale writer');
    $stale = $next;
    $stale['_rev']++;
    $fresh = $next;
    $fresh['_rev']++;
    storageCheck($adapter->commit([['kind' => 'put','entity' => 'leases','row' => $fresh,'expectedRev' => $next['_rev']]])['ok'], $name.' replacement lease');
    storageCheck(!$adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $two['_id']],['kind' => 'put','entity' => 'leases','row' => $stale,'expectedRev' => $next['_rev']]])['ok'], $name.' expired paused writer cannot delete');
    storageCheck(isset($adapter->get('messages', [$two['_id']])[$two['_id']]), $name.' stale writer whole batch rolled back');
    $adapter->close();
    storageCheck(!$adapter->capabilities()['atomicCommit'], $name.' close drops capability');
    echo 'PHP official '.$name.": full native entities,2000 history,replay,rollback,checkpoint and expired lease fence passed.\n";
}

$autoload = getenv('POLYMORFA_STORAGE_PROVIDER_AUTOLOAD');
if ($autoload !== false && $autoload !== '') {
    require_once $autoload;
}
$metadata = getenv('POLYMORFA_MONGODB_NATIVE_FIXTURE');
if ($metadata !== false && $metadata !== '' && class_exists(MongoDB\Client::class)) {
    $native = json_decode(file_get_contents($metadata), true, flags:JSON_THROW_ON_ERROR);
    $client = new MongoDB\Client($native['dockerUri'] ?? $native['uri']);
    $database = $client->selectDatabase('php_native_'.bin2hex(random_bytes(5)));
    $namespace = 'portable';
    try {
        $adapter = new MongodbAdapter($client, $database, $namespace);
        storageDocumentProof($adapter, 'mongodb');
        $bounded = new MongodbAdapter($client, $database, $namespace, maxQueryRows:1);
        $bounded->setup();
        storageRaises(fn () => $bounded->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$large['conversations'][0]['id']],'limit' => 1]), 'storage_query_bound_exceeded');
        storageCheck($database->command(['ping' => 1])->toArray() !== [], 'Mongo borrower remains usable');
        $physical = $database->selectCollection('polymorfa_'.$namespace.'_messages')->findOne(['sessionId' => 'json']);
        storageCheck(isset($physical['_id'],$physical['_rev'],$physical['_v']) && !isset($physical['data']), 'Mongo exact raw producer layout');
        $meta = $database->selectCollection('polymorfa_'.$namespace.'_storage_schema');
        $meta->updateOne(['_id' => 'storage'], ['$set' => ['version' => 1]]);
        storageRaises(fn () => (new MongodbAdapter($client, $database, $namespace))->setup(), 'storage_schema_mismatch');
        storageCheck($meta->findOne(['_id' => 'storage'])['version'] === 1, 'Mongo does not overwrite old schema');
    } finally {
        $database->drop();
    }
} else {
    echo "PHP native MongoDB proof skipped: optional official driver/fixture not configured.\n";
}

$metadata = getenv('POLYMORFA_DYNAMODB_NATIVE_FIXTURE');
if ($metadata !== false && $metadata !== '' && class_exists(Aws\DynamoDb\DynamoDbClient::class)) {
    $native = json_decode(file_get_contents($metadata), true, flags:JSON_THROW_ON_ERROR);
    $client = new Aws\DynamoDb\DynamoDbClient(['version' => 'latest','region' => $native['region'],'endpoint' => $native['dockerEndpoint'] ?? $native['endpoint'],'credentials' => ['key' => $native['accessKeyId'],'secret' => $native['secretAccessKey']]]);
    $table = 'php_native_'.bin2hex(random_bytes(5));
    try {
        $adapter = new Polymorfa\Storage\DynamodbAdapter($client, 'portable', $table, true);
        storageDocumentProof($adapter, 'dynamodb');
        $bounded = new Polymorfa\Storage\DynamodbAdapter($client, 'portable', $table, maxQueryRows:1);
        $bounded->setup();
        storageRaises(fn () => $bounded->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$large['conversations'][0]['id']],'limit' => 1]), 'storage_query_bound_exceeded');
        storageCheck($client->describeTable(['TableName' => $table])['Table']['TableStatus'] === 'ACTIVE', 'Dynamo borrower usable');
        $physical = $client->getItem(['TableName' => $table,'Key' => ['pk' => ['S' => 'portable:messages'],'sk' => ['S' => 'kjson:0']],'ConsistentRead' => true])['Item'];
        storageCheck(isset($physical['row']['M']['_id'],$physical['row']['M']['_rev'],$physical['row']['M']['_v']) && !isset($physical['data']), 'Dynamo exact raw producer layout');
        $client->putItem(['TableName' => $table,'Item' => ['pk' => ['S' => 'portable:storage_schema'],'sk' => ['S' => 'storage'],'version' => ['N' => '1']]]);
        storageRaises(fn () => (new Polymorfa\Storage\DynamodbAdapter($client, 'portable', $table))->setup(), 'storage_schema_mismatch');
    } finally {
        $client->deleteTable(['TableName' => $table]);
    }
} else {
    echo "PHP native DynamoDB proof skipped: optional official driver/fixture not configured.\n";
}

$endpoint = getenv('POLYMORFA_FIRESTORE_NATIVE_ENDPOINT');
if ($endpoint !== false && $endpoint !== '' && class_exists(Google\Cloud\Firestore\V1\Client\FirestoreClient::class)) {
    $rpc = new Google\Cloud\Firestore\V1\Client\FirestoreClient(['apiEndpoint' => $endpoint,'credentials' => new Google\Cloud\Core\InsecureCredentialsWrapper(),'transport' => 'grpc','transportConfig' => ['grpc' => ['stubOpts' => ['credentials' => Grpc\ChannelCredentials::createInsecure()]]]]);
    $namespace = 'php_'.bin2hex(random_bytes(5));
    try {
        $adapter = new Polymorfa\Storage\FirestoreAdapter($rpc, $namespace, 'sdk-fixture-go');
        storageDocumentProof($adapter, 'firestore');
        $bounded = new Polymorfa\Storage\FirestoreAdapter($rpc, $namespace, 'sdk-fixture-go', maxQueryRows:1);
        $bounded->setup();
        storageRaises(fn () => $bounded->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$large['conversations'][0]['id']],'limit' => 1]), 'storage_query_bound_exceeded');
        $unsupported = new Engine($bounded);
        storageRaises(fn () => $unsupported->apply(new Batch('unsupported', [new Upsert('messages', ['sessionId' => 'unsupported','messageId' => 'nested'], ['extra' => new FieldWrite([[1]], 0)])], 'unsupported-event', 'message.received')), 'storage_firestore_failed');
        storageCheck($bounded->get('events', [Schema::encodeKey('events', ['sessionId' => 'unsupported','eventId' => 'unsupported-event'])]) === [], 'Firestore unsupported native value never marks event completed');
        // Explicit typed RPCs retain atomicity beyond the high-level driver's20-write flush.
        $atomic = new Polymorfa\Storage\FirestoreAdapter($rpc, $namespace, 'sdk-fixture-go');
        $atomic->setup();
        storageCheck($atomic->capabilities()['maxCommitSize'] === 250, 'Firestore verified native write limit');
        $existing = Rows::empty('messages', ['sessionId' => 'threshold','messageId' => 'existing']);
        $existing['_rev'] = 1;
        storageCheck($atomic->commit([['kind' => 'put','entity' => 'messages','row' => $existing,'expectedRev' => null]])['ok'], 'Firestore threshold existing');
        $writes = [];
        for ($i = 0;$i < 249;$i++) {
            $row = Rows::empty('messages', ['sessionId' => 'threshold','messageId' => (string)$i]);
            $row['_rev'] = 1;
            $writes[] = ['kind' => 'put','entity' => 'messages','row' => $row,'expectedRev' => null];
        }
        $changed = $existing;
        $changed['_rev']++;
        storageCheck(!$atomic->commit([...$writes,['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => 99]])['ok'], 'Firestore actual250 write conflict');
        storageCheck($atomic->get('messages', array_column(array_column($writes, 'row'), '_id')) === [], 'Firestore250 writes never leaked before conflict');
        storageCheck($atomic->commit([...$writes,['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => 1]])['ok'], 'Firestore actual250 write atomic success');
        storageCheck(count($atomic->get('messages', array_column(array_column($writes, 'row'), '_id'))) === 249, 'Firestore all250 committed');
        $oversized = [];
        for ($i = 0;$i < 251;$i++) {
            $row = Rows::empty('messages', ['sessionId' => 'overlimit','messageId' => (string)$i]);
            $row['_rev'] = 1;
            $oversized[] = ['kind' => 'put','entity' => 'messages','row' => $row,'expectedRev' => null];
        }
        storageRaises(fn () => $atomic->commit($oversized), 'invalid_storage_data');
        storageCheck($atomic->get('messages', array_column(array_column($oversized, 'row'), '_id')) === [], 'Firestore251 rejected before any write');
        $databaseName = 'projects/sdk-fixture-go/databases/(default)';
        $metaName = $databaseName.'/documents/polymorfa_'.$namespace.'_storage_schema/storage';
        $rpc->commit(new Google\Cloud\Firestore\V1\CommitRequest(['database' => $databaseName,'writes' => [new Google\Cloud\Firestore\V1\Write(['update' => new Google\Cloud\Firestore\V1\Document(['name' => $metaName,'fields' => ['version' => new Google\Cloud\Firestore\V1\Value(['integer_value' => 1])]])])]]));
        storageRaises(fn () => (new Polymorfa\Storage\FirestoreAdapter($rpc, $namespace, 'sdk-fixture-go'))->setup(), 'storage_schema_mismatch');
        storageCheck($rpc->getDocument(new Google\Cloud\Firestore\V1\GetDocumentRequest(['name' => $metaName]))->getFields()['version']->getIntegerValue() === 1, 'Firestore native borrower usable and metadata never overwritten');
        echo "PHP Firestore V1 RPCs: numeric-key JSON maps,250-write success/rollback,251 predispatch rejection,provider error checkpoint refusal and schema/client ownership checks passed.\n";
    } finally {
        $databaseName = 'projects/sdk-fixture-go/databases/(default)';
        $deletes = [];
        foreach ([...Polymorfa\Storage\SqlSchema::ENTITIES,'storage_schema'] as $entity) {
            foreach ($rpc->listDocuments(new Google\Cloud\Firestore\V1\ListDocumentsRequest(['parent' => $databaseName.'/documents','collection_id' => 'polymorfa_'.$namespace.'_'.$entity]))->iterateAllElements() as $document) {
                $deletes[] = new Google\Cloud\Firestore\V1\Write(['delete' => $document->getName()]);
            }
        }
        foreach (array_chunk($deletes, 250) as $chunk) {
            $rpc->commit(new Google\Cloud\Firestore\V1\CommitRequest(['database' => $databaseName,'writes' => $chunk]));
        }
        $rpc->close();
    }
} else {
    echo "PHP native Firestore proof skipped: optional official driver/fixture not configured.\n";
}

$standalone = getenv('POLYMORFA_MONGODB_STANDALONE_URI');
if ($standalone !== false && $standalone !== '' && class_exists(MongoDB\Client::class)) {
    $client = new MongoDB\Client($standalone);
    $database = $client->selectDatabase('php_standalone_'.bin2hex(random_bytes(5)));
    try {
        $adapter = new MongodbAdapter($client, $database, 'standalone');
        storageRaises(fn () => $adapter->setup(), 'storage_mongodb_failed');
        storageCheck(!$adapter->capabilities()['atomicCommit'], 'standalone Mongo never advertises atomic transactions');
    } finally {
        $database->drop();
    }
    echo "PHP actual MongoDB standalone: native transaction refusal leaves atomic capability disabled.\n";
}
