<?php

declare(strict_types=1);

// This file also runs independently against a physically installed package.
if (!function_exists('check')) {
    require dirname(__DIR__).'/vendor/autoload.php';
    function check(bool $value, string $message): void
    {
        if (!$value) {
            throw new RuntimeException($message);
        }
    }
}
$process = proc_open([PHP_BINARY, __DIR__.'/unledgered-server.php'], [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes);
check(is_resource($process), 'Unledgered fixture starts');
try {
    $url = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR)['url'];
    $control = new GuzzleHttp\Client(['base_uri' => $url, 'timeout' => 3]);
    $credential = Polymorfa\Credential::organizationApiKey('pmfa_'.str_repeat('a', 72));
    $client = new Polymorfa\MessagingClient($credential, baseUrl:$url, maxNetworkRetries:1);
    foreach (['grant','relay','retry','delete'] as $operation) {
        foreach (['drop','429','503'] as $outcome) {
            foreach (['keyed','unkeyed','default'] as $policy) {
                $control->get('/__reset');
                $options = new Polymorfa\RequestOptions(maxNetworkRetries:$policy === 'default' ? null : 1, idempotencyKey:$policy === 'keyed' ? 'caller-key' : null, headers:['x-caller' => 'retained', 'x-outcome' => $outcome]);
                $error = null;
                $opens = 0;
                $streams = [];
                try {
                    match ($operation) {
                        'grant' => $client->whatsappMedia->createUploadGrant('s', 'image', str_repeat("\0", 32), $options),
                        'relay' => $client->whatsappMedia->relayUpload('s', new Polymorfa\EncryptedMediaInfo('image', str_repeat("\0", 32), str_repeat("\0", 32), str_repeat("\0", 32), 0, 26), function () use (&$opens, &$streams) {
                            $opens++;
                            $streams[] = $stream = GuzzleHttp\Psr7\Utils::streamFor(str_repeat("\0", 26));
                            return $stream;
                        }, $options),
                        'retry' => $client->historySync->requestChunkRetry('s', ['syncType' => 'RECENT', 'chunkOrder' => 1], $options),
                        'delete' => $client->historySync->deleteChunk('s', '/chunk', str_repeat("\0", 32), options:$options),
                    };
                } catch (Polymorfa\PolymorfaException $failure) {
                    $error = $failure;
                }
                $records = json_decode($control->get('/__state')->getBody()->getContents(), true, flags:JSON_THROW_ON_ERROR);
                check($error !== null, "$operation/$outcome/$policy surfaces failure");
                check(count($records) === 1, "$operation/$outcome/$policy submits once; got ".count($records));
                $headers = $records[0]['headers'];
                check($headers['authorization'] === $credential->authorization() && $headers['x-caller'] === 'retained' && $headers['polymorfa-version'] === '2026-10-14', 'Caller headers retained');
                check(($headers['idempotency-key'] ?? null) === ($policy === 'keyed' ? 'caller-key' : null), 'Caller key retained');
                if ($operation === 'relay') {
                    check($records[0]['length'] === 26 && $opens === 1 && !$streams[0]->isReadable(), 'Relay ciphertext opened and closed once');
                }
                if ($outcome === 'drop') {
                    check($error instanceof Polymorfa\ConnectionException, 'Uncertain connection surfaced');
                } else {
                    check($error->status === (int)$outcome && $error->errorCode === 'fixture_failure' && $error->requestId === 'unledgered' && $error->metadata->attempts === 1, 'Failure metadata retained');
                }
            }
        }
    }
    foreach (['send','get'] as $operation) {
        $control->get('/__reset');
        $options = new Polymorfa\RequestOptions(maxNetworkRetries:1, idempotencyKey:'send-key', headers:['x-outcome' => '503', 'x-control' => 'yes']);
        if ($operation === 'send') {
            $client->messages->send('s', ['conversation' => ['phoneNumber' => '+15550001111'], 'content' => ['text' => 'fixture']], $options);
        } else {
            $client->profile->get('s', $options);
        }
        $records = json_decode($control->get('/__state')->getBody()->getContents(), true, flags:JSON_THROW_ON_ERROR);
        check(count($records) === 2, 'Established '.$operation.' retry retained');
    }
    echo "PASS 36 unledgered submissions and established send/GET retry controls\n";
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    proc_close($process);
}
