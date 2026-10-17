<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/vendor/autoload.php';

function ccCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$ccRoot = (string) (getenv('POLYMORFA_PHP_CONTRACT_SCRATCH') ?: getenv('HOME').'/.polymorfa-agent-work/php-campaign-contracts');
if (!is_dir($ccRoot)) {
    mkdir($ccRoot, 0700, true);
}
$ccState = $ccRoot.'/case-'.getmypid().'.json';
$ccSocket = stream_socket_server('tcp://127.0.0.1:0', $ccErrno, $ccError);
ccCheck(is_resource($ccSocket), 'Contract fixture socket opens');
$ccAddress = stream_socket_get_name($ccSocket, false);
fclose($ccSocket);
$ccServer = proc_open([PHP_BINARY, '-d', 'post_max_size=32M', '-d', 'display_errors=0', '-S', $ccAddress, __DIR__.'/campaign_contract_server.php'], [0 => ['pipe', 'r'], 1 => ['file', $ccRoot.'/server-'.getmypid().'.log', 'a'], 2 => ['file', $ccRoot.'/server-'.getmypid().'.log', 'a']], $ccPipes, null, ['POLYMORFA_PHP_CONTRACT_STATE' => $ccState] + getenv());
ccCheck(is_resource($ccServer), 'Contract fixture starts');
$ccHttp = new GuzzleHttp\Client(['timeout' => 3, 'http_errors' => false]);
$ccUrl = 'http://'.$ccAddress;
try {
    $ccReady = false;
    for ($ccAttempt = 0; $ccAttempt < 100; ++$ccAttempt) {
        try {
            $ccHttp->post($ccUrl.'/__case', ['json' => []]);
            $ccReady = true;
            break;
        } catch (GuzzleHttp\Exception\ConnectException) {
            usleep(10000);
        }
    }
    ccCheck($ccReady, 'Contract fixture becomes ready');
    $ccCredential = Polymorfa\Credential::organizationApiKey('pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    $ccProject = '11111111-1111-4111-8111-111111111111';
    $ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'GET', 'path' => '/platform/projects/'.$ccProject.'/signal-custody', 'body' => null, 'authorization' => $ccCredential->authorization(), 'response' => '{"data":{"signalModeDefault":null,"effectiveSignalMode":"standard","revision":0}}']]);
    $ccClient = new Polymorfa\Client($ccCredential, baseUrl: $ccUrl);
    $ccResult = $ccClient->projects->getSignalCustody($ccProject);
    ccCheck($ccResult->data['data']['signalModeDefault'] === null && $ccResult->data['data']['revision'] === 0, 'Custody preserves null and zero');

    // Next vertical slice: public creation preserves empty dictionaries on wire.
    $ccSendBody = ['sessionId' => '55555555-5555-4555-8555-555555555555', 'to' => '+15555555555', 'variables' => []];
    $ccSendWire = $ccSendBody;
    $ccSendWire['variables'] = new stdClass();
    $ccSendData = ['id' => '77777777-7777-4777-8777-777777777777', 'campaignId' => '33333333-3333-4333-8333-333333333333', 'status' => 'sent', 'from' => ['sessionId' => $ccSendBody['sessionId'], 'phone' => '+15555555556'], 'to' => $ccSendBody['to'], 'messageId' => null, 'variables' => new stdClass(), 'createdAt' => 0];
    $ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'POST', 'path' => '/messaging/projects/slug/campaigns/33333333-3333-4333-8333-333333333333/test-send', 'body' => $ccSendWire, 'authorization' => $ccCredential->authorization(), 'response' => json_encode(['success' => true, 'data' => $ccSendData], JSON_THROW_ON_ERROR)]]);
    $ccMessaging = new Polymorfa\MessagingClient($ccCredential, baseUrl: $ccUrl);
    $ccSend = $ccMessaging->campaigns->testSend('slug', '33333333-3333-4333-8333-333333333333', $ccSendBody);
    ccCheck($ccSend->data['data']['variables'] === [] && $ccSend->data['data']['messageId'] === null, 'Test-send preserves empty dictionary and required null');

    // The body-size cap applies to the bytes admitted by HTTP, not an imagined encoding.
    $ccCsv = str_repeat("\xEF\xBF\xBF", 3495253);
    $ccBase64 = base64_encode($ccCsv);
    unset($ccCsv);
    $ccExpectedWire = '{"replayKey":"quota","csvBase64":"'.$ccBase64.'"}';
    $ccJob = ['id' => '66666666-6666-4666-8666-666666666666', 'state' => 'queued', 'totalValid' => 0, 'invalidCount' => 0, 'invalidSamples' => [], 'conflictSamples' => [], 'processedValid' => 0, 'createdCount' => 0, 'updatedCount' => 0, 'conflictCount' => 0, 'createdAt' => 0, 'updatedAt' => 0, 'completedAt' => null];
    $ccExpectedHash = hash('sha256', $ccExpectedWire);
    $ccExpectedLength = strlen($ccExpectedWire);
    unset($ccExpectedWire);
    $ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'POST', 'path' => '/platform/audience-profile-imports', 'body' => null, 'authorization' => $ccCredential->authorization(), 'bodySha256' => $ccExpectedHash, 'maxBodyBytes' => 14 * 1024 * 1024, 'response' => json_encode(['data' => $ccJob], JSON_THROW_ON_ERROR)]]);
    $ccImported = $ccClient->audienceProfiles->imports->create(['replayKey' => 'quota', 'csvBase64' => $ccBase64]);
    ccCheck($ccImported->data['data']['completedAt'] === null && $ccExpectedLength === 13981048, 'Near10MiB CSV has exact compact wire bytes under14MiB');
    unset($ccBase64);
    require __DIR__.'/campaign_contract_cases.php';
    require __DIR__.'/campaign_contract_edges.php';
    require __DIR__.'/campaign_contract_validation.php';
} finally {
    proc_terminate($ccServer);
    foreach ($ccPipes as $ccPipe) {
        fclose($ccPipe);
    }
    proc_close($ccServer);
    if (is_file($ccState)) {
        unlink($ccState);
    }
}
echo "PHP30 campaign contracts passed.\n";
