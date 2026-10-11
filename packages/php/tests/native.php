<?php

declare(strict_types=1);

/** Runs public typed methods through a native HTTP socket and verifies route, JSON, auth, version and response. */
function nativeCases(array $cases, callable $makeClient): void
{
    $scratch = getenv('HOME').'/.polymorfa-agent-work/multi-language-sdks-20261011/php-native';
    if (!is_dir($scratch)) {
        mkdir($scratch, 0700, true);
    }
    $state = $scratch.'/case-'.getmypid().'.json';
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $server = proc_open([PHP_BINARY,'-S',$address,__DIR__.'/native-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes, null, ['POLYMORFA_PHP_WIRE_STATE' => $state] + getenv());
    if (!is_resource($server)) {
        throw new RuntimeException('Cannot start native PHP fixture server.');
    }
    $url = 'http://'.$address;
    $http = new GuzzleHttp\Client(['timeout' => 3,'http_errors' => false]);
    try {
        for ($i = 0;$i < 100;$i++) {
            try {
                $http->post($url.'/__case', ['json' => []]);
                break;
            } catch (GuzzleHttp\Exception\ConnectException) {
                usleep(10000);
            }
        }
        $credential = Polymorfa\Credential::organizationApiKey('pmfa_'.str_repeat('a', 72));
        foreach ($cases as $case) {
            [$method,$path,$body,$response,$invoke] = $case;
            $http->post($url.'/__case', ['json' => ['method' => $method,'path' => $path,'body' => $body,'response' => $response,'authorization' => $credential->authorization()]]);
            $client = $makeClient($credential, $url);
            $result = $invoke($client);
            check($result->data === ($case[5] ?? $response), 'Native typed response '.$method.' '.$path);
            check($result->metadata->requestId === 'native_request', 'Native metadata '.$path);
        }
    } finally {
        proc_terminate($server);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }proc_close($server);
        if (file_exists($state)) {
            unlink($state);
        }
    }
    echo count($cases)." native typed request/response fixtures passed.\n";
}
