<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/vendor/autoload.php';
$GLOBALS['ecAssertions'] = 0;
function ecCheck(bool $condition, string $message): void
{
    ++$GLOBALS['ecAssertions'];
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function ecRaises(callable $invoke, string $type): Throwable
{
    try {
        $invoke();
    } catch (Throwable $e) {
        ecCheck($e instanceof $type, $type.' expected, got '.$e::class);
        return $e;
    } throw new RuntimeException('Expected '.$type);
}
$ecRoot = getenv('POLYMORFA_PHP_CONTRACT_SCRATCH') ?: getenv('HOME').'/.polymorfa-agent-work/php41';
if (!is_dir($ecRoot)) {
    mkdir($ecRoot, 0700, true);
}
$ecState = $ecRoot.'/existing-'.getmypid().'.json';
$ecSocket = stream_socket_server('tcp://127.0.0.1:0', $ecErr, $ecMsg);
$ecAddress = stream_socket_get_name($ecSocket, false);
fclose($ecSocket);
$ecServer = proc_open([PHP_BINARY,'-d','display_errors=0','-S',$ecAddress,__DIR__.'/campaign_contract_server.php'], [0 => ['pipe','r'],1 => ['file',$ecRoot.'/existing-server.log','a'],2 => ['file',$ecRoot.'/existing-server.log','a']], $ecPipes, null, ['POLYMORFA_PHP_CONTRACT_STATE' => $ecState] + getenv());
$ecHttp = new GuzzleHttp\Client(['timeout' => 3,'http_errors' => false]);
$ecUrl = 'http://'.$ecAddress;
try {
    for ($i = 0;$i < 100;$i++) {
        try {
            $ecHttp->post($ecUrl.'/__case', ['json' => []]);
            break;
        } catch (GuzzleHttp\Exception\ConnectException) {
            usleep(10000);
        }
    }
    $ecCredential = Polymorfa\Credential::organizationApiKey('pmfa_'.str_repeat('a', 72));
    $ecOrg = new Polymorfa\Client($ecCredential, baseUrl:$ecUrl);
    $ecMessaging = new Polymorfa\MessagingClient($ecCredential, baseUrl:$ecUrl);
    $ecProject = '11111111-1111-4111-8111-111111111111';
    $ecId = '33333333-3333-4333-8333-333333333333';
    // Independent producer-shaped JSON, including required nullable fields.
    $ecCampaign = ['id' => $ecId,'name' => 'Campaign','status' => 'draft','templateId' => null,'recipientListId' => null,'recipientCount' => 0,'sentCount' => 0,'deliveredCount' => 0,'readCount' => 0,'failedCount' => 0,'skippedCount' => 0,'scheduledAt' => null,'launchedAt' => null,'completedAt' => null,'createdAt' => 0,'updatedAt' => 0,'sendWindow' => null,'trackedLinks' => [],'experimentOutcome' => null,'followUp' => null,'future' => ['flag' => false,'count' => 0,'unknown' => null]];
    $ecCount = 0;
    $ecRun = static function (string $method, string $path, mixed $body, mixed $result, callable $invoke, array $extra = []) use ($ecHttp, $ecUrl, $ecCredential, &$ecCount): mixed {
        $ecHttp->post($ecUrl.'/__case', ['json' => $extra + ['method' => $method,'path' => $path,'body' => $body,'authorization' => $ecCredential->authorization(),'version' => '2026-09-22','response' => json_encode($result, JSON_THROW_ON_ERROR)]]);
        $r = $invoke();
        ++$ecCount;
        ecCheck($r->metadata->requestId === 'campaign_contract_request', 'Native HTTP response');
        return $r;
    };
    $ecInput = ['name' => 'Campaign','variableMapping' => ['0' => [],'__proto__' => ['fallback' => 'zero']],'trackedLinks' => []];
    $ecWire = ['name' => 'Campaign','variableMapping' => (object)['0' => (object)[],'__proto__' => (object)['fallback' => 'zero']],'trackedLinks' => []];
    $ecRun('POST', '/messaging/projects/slug/campaigns', $ecWire, ['success' => true,'data' => $ecCampaign], fn () => $ecMessaging->campaigns->create('slug', $ecInput));
    ecRaises(fn () => $ecOrg->project($ecProject)->sessionConfiguration->update(['configuration' => ['set' => ['historySync' => ['delivery' => 'archive']]],'revision' => 0]), Polymorfa\ConfigurationException::class);
    ecRaises(fn () => $ecRun('POST', '/messaging/s/history/chunks/retry', ['syncType' => 'FULL','chunkOrder' => 0], ['success' => false,'data' => ['requestId' => 'request','status' => 'requested']], fn () => $ecMessaging->historySync->requestChunkRetry('s', ['syncType' => 'FULL','chunkOrder' => 0]), ['version' => '2026-10-14']), Polymorfa\ServerException::class);
    require __DIR__.'/existing_contract_cases.php';
    require __DIR__.'/existing_contract_nine.php';
    require __DIR__.'/existing_contract_edges.php';
    echo $ecCount." PHP41 independent public HTTP checks and ".$GLOBALS['ecAssertions']." assertions passed.\n";
} finally {
    proc_terminate($ecServer);
    foreach ($ecPipes as $pipe) {
        fclose($pipe);
    } proc_close($ecServer);
    if (is_file($ecState)) {
        unlink($ecState);
    }
}
