<?php

declare(strict_types=1);
require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{DocumentRows,DynamodbAdapter,Rows,Schema};

$autoload = getenv('POLYMORFA_STORAGE_PROVIDER_AUTOLOAD');
if ($autoload !== false && $autoload !== '') {
    require_once $autoload;
}
if (!class_exists(Aws\DynamoDb\DynamoDbClient::class)) {
    echo "PHP DynamoDB official HTTP decoder negative proofs skipped: optional client not installed.\n";
    return;
}

/** @param list<array{int,array<string,mixed>}> $responses */
function dynamoNegative(array $responses, Closure $operation, string $error, int $expectedRequests): void
{
    $table = 'php_native_negative';
    $requests = [];
    $setup = [[200,['Table' => ['TableStatus' => 'ACTIVE','KeySchema' => [['AttributeName' => 'pk','KeyType' => 'HASH'],['AttributeName' => 'sk','KeyType' => 'RANGE']],'AttributeDefinitions' => [['AttributeName' => 'pk','AttributeType' => 'S'],['AttributeName' => 'sk','AttributeType' => 'S']]]]],[200,['Item' => ['pk' => ['S' => 'negative:storage_schema'],'sk' => ['S' => 'storage'],'version' => ['N' => '2']]]]];
    $queue = [...$setup,...$responses];
    $client = new Aws\DynamoDb\DynamoDbClient(['version' => 'latest','region' => 'us-east-1','endpoint' => 'http://dynamodb-native.invalid','credentials' => ['key' => 'synthetic','secret' => 'synthetic'],'retries' => 0,'http_handler' => static function ($request) use (&$queue, &$requests) {
        $requests[] = json_decode((string)$request->getBody(), true, flags:JSON_THROW_ON_ERROR);
        storageCheck($queue !== [], 'no unexpected extra native HTTP request');
        [$status,$data] = array_shift($queue);
        $response = new GuzzleHttp\Psr7\Response($status, ['Content-Type' => 'application/x-amz-json-1.0'], json_encode($data, JSON_THROW_ON_ERROR));
        return $status < 400 ? GuzzleHttp\Promise\Create::promiseFor($response) : GuzzleHttp\Promise\Create::rejectionFor(['exception' => new RuntimeException('Synthetic HTTP error'),'response' => $response]);
    }]);
    $adapter = new DynamodbAdapter($client, 'negative', $table);
    $adapter->setup();
    if ($error === 'conflict') {
        storageCheck($operation($adapter)['ok'] === false, 'conditional cancellation is a conflict');
    } else {
        storageRaises(fn () => $operation($adapter), $error);
    }
    storageCheck(count($requests) === 2 + $expectedRequests, 'native malformed response stops at expected request');
    foreach (array_slice($requests, 2) as $request) {
        if (isset($request['RequestItems'])) {
            storageCheck($request['RequestItems'][$table]['ConsistentRead'] === true, 'native batch reads stay consistent');
        } if (isset($request['KeyConditionExpression'])) {
            storageCheck($request['ConsistentRead'] === true, 'native query reads stay consistent');
        }
    }
}
$table = 'php_native_negative';
$row = Rows::empty('messages', ['sessionId' => 'session','messageId' => 'one']);
$row['_rev'] = 1;
$id = $row['_id'];
$key = ['pk' => ['S' => 'negative:messages'],'sk' => ['S' => $id]];
$marshaler = new Aws\DynamoDb\Marshaler();
$item = $marshaler->marshalItem(['pk' => 'negative:messages','sk' => $id,'row' => DocumentRows::encode('messages', $row)]);
$get = fn ($adapter) => $adapter->get('messages', [$id]);
$foreign = $item;
$foreign['pk']['S'] = 'foreign';
$badRev = $item;
$badRev['row']['M']['_id']['S'] = 'bad-id';
$unrequested = Rows::empty('messages', ['sessionId' => 'session','messageId' => 'other']);
$unrequested['_rev'] = 1;
$otherItem = $marshaler->marshalItem(['pk' => 'negative:messages','sk' => $unrequested['_id'],'row' => DocumentRows::encode('messages', $unrequested)]);
foreach ([$foreign,$badRev,$otherItem] as $bad) {
    dynamoNegative([[200,['Responses' => [$table => [$bad]]]]], $get, 'invalid_storage_data', 1);
}
dynamoNegative([[200,['Responses' => [$table => [$item,$item]]]]], $get, 'invalid_storage_data', 1);
dynamoNegative([[200,['Responses' => ['foreign' => [$item]]]]], $get, 'invalid_storage_data', 1);
dynamoNegative([[200,['UnprocessedKeys' => ['foreign' => ['Keys' => [$key]]]]]], $get, 'invalid_storage_data', 1);
dynamoNegative([[200,['UnprocessedKeys' => [$table => ['Keys' => [['pk' => ['S' => 'foreign'],'sk' => ['S' => $id]]]]]]]], $get, 'invalid_storage_data', 1);
dynamoNegative([[200,['Responses' => [$table => [$item]],'UnprocessedKeys' => [$table => ['Keys' => [$key]]]]]], $get, 'invalid_storage_data', 1);
dynamoNegative(array_fill(0, 8, [200,['UnprocessedKeys' => [$table => ['Keys' => [$key]]]]]), $get, 'storage_unprocessed_reads', 8);
$query = fn ($adapter) => $adapter->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'session','chatId' => 'chat'],'limit' => 1000]);
dynamoNegative([[200,['Items' => [],'LastEvaluatedKey' => $key]]], $query, 'invalid_storage_data', 1);
$foreignKey = $key;
$foreignKey['pk']['S'] = 'foreign';
dynamoNegative([[200,['Items' => [$item],'LastEvaluatedKey' => $foreignKey]]], $query, 'invalid_storage_data', 1);
dynamoNegative([[200,['Items' => [$item],'LastEvaluatedKey' => $key]],[200,['Items' => [$item],'LastEvaluatedKey' => $key]]], $query, 'invalid_storage_data', 2);
$write = [['kind' => 'put','entity' => 'messages','row' => $row,'expectedRev' => null]];
foreach (['ConditionalCheckFailed' => 'conflict','ValidationError' => 'storage_dynamodb_failed','AccessDenied' => 'storage_dynamodb_failed'] as $code => $expected) {
    dynamoNegative([[400,['__type' => 'com.amazonaws.dynamodb.v20120810#TransactionCanceledException','message' => 'synthetic private diagnostic','CancellationReasons' => [['Code' => $code]]]]],fn ($adapter) => $adapter->commit($write),$expected,1);
}
echo "PHP official AWS HTTP decoder: foreign/duplicate/unrequested/malformed rows,unprocessed keys,bounded retries,consistent reads,nonprogress cursors and cancellation classification passed.\n";
