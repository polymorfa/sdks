<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';
function webhookHttpCheck(bool $value, string $name): void
{
    if (!$value) {
        throw new RuntimeException($name);
    }
}
$root = getenv('POLYMORFA_TEST_WORK_DIR') ?: dirname(__DIR__, 4).'/.polymorfa-agent-work';
$state = $root.'/webhook-http-'.bin2hex(random_bytes(8));
if (!is_dir($state)) {
    mkdir($state, 0700, true);
}
$bound = stream_socket_server('tcp://127.0.0.1:0');
$address = stream_socket_get_name($bound, false);
fclose($bound);
$env = getenv();
$env['POLYMORFA_WEBHOOK_HTTP_STATE'] = $state;
$env['POLYMORFA_WEBHOOK_HTTP_LIMIT'] = '200';
$log = fopen($state.'/server.log', 'w');
$process = proc_open([PHP_BINARY,'-d','memory_limit=128M','-S',$address,__DIR__.'/fixtures/consumer-repairs/webhook-http.php'], [0 => ['pipe','r'],1 => $log,2 => $log], $pipes, null, $env);
webhookHttpCheck(is_resource($process), 'framework server starts');
$ingress = null;
$ingressPipes = [];
try {
    $url = 'http://'.$address;
    $http = new GuzzleHttp\Client(['http_errors' => false,'allow_redirects' => false,'timeout' => 2]);
    $ready = false;
    for ($i = 0;$i < 50;$i++) {
        try {
            $response = $http->get($url.'/state');
            if ($response->getStatusCode() === 200) {
                $ready = true;
                break;
            }
        } catch (GuzzleHttp\Exception\ConnectException) {
        }usleep(20000);
    }
    webhookHttpCheck($ready, 'framework readiness '.file_get_contents($state.'/server.log'));
    $ingress = proc_open(['node',__DIR__.'/fixtures/consumer-repairs/webhook-ingress.mjs',$url,'200'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $ingressPipes);
    webhookHttpCheck(is_resource($ingress), 'decoder-capable ingress starts');
    $proxy = json_decode(fgets($ingressPipes[1]), true, flags:JSON_THROW_ON_ERROR)['url'];
    $raw = '{ "id":"bounded","session":"synthetic","timestamp":"2026-10-17T00:00:00Z","event":"future.event","payload":{"x":1}}';
    $effects = 0;
    foreach (['symfony','laravel'] as $framework) {
        $endpoint = '/'.$framework;
        $body = $raw.str_repeat(' ', 200 - strlen($raw));
        $headers = ['content-type' => 'application/json','x-webhook-signature' => hash_hmac('sha256', $body, 'synthetic-webhook-secret')];
        $response = $http->post($url.$endpoint, ['headers' => $headers,'body' => $body]);
        webhookHttpCheck($response->getStatusCode() === 200, 'actual '.$framework.' verified success '.(string)$response->getBody());
        $effects++;
        foreach ([['POST',$body.' ', $headers,413],['POST',$body,['x-webhook-signature' => 'invalid'],400],['POST','{',['x-webhook-signature' => hash_hmac('sha256', '{', 'synthetic-webhook-secret')],400],['GET','',[],405]] as [$method,$payload,$requestHeaders,$status]) {
            $response = $http->request($method, $url.$endpoint, ['headers' => $requestHeaders,'body' => $payload]);
            webhookHttpCheck($response->getStatusCode() === $status, 'actual '.$framework.' HTTP'.$status.' '.(string)$response->getBody());
            if ($status === 405) {
                webhookHttpCheck(str_contains($response->getHeaderLine('Allow'), 'POST'), 'Allow POST');
            }
        }
        // Node's HTTP parser decodes legitimate chunked framing before forwarding.
        foreach ([$body,$body.' '] as $payload) {
            $length = strlen($payload);
            $wire = "POST $endpoint HTTP/1.1\r\nHost: fixture\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nX-Webhook-Signature: ".hash_hmac('sha256', $payload, 'synthetic-webhook-secret')."\r\nConnection: close\r\n\r\n".dechex($length)."\r\n".$payload."\r\n0\r\n\r\n";
            $parts = parse_url($proxy);
            $socket = stream_socket_client('tcp://'.$parts['host'].':'.$parts['port']);
            stream_set_timeout($socket, 2);
            fwrite($socket, $wire);
            $reply = stream_get_contents($socket);
            fclose($socket);
            webhookHttpCheck(str_starts_with($reply, 'HTTP/1.1 '.($length === 200 ? '200' : '413')), 'decoded chunked '.$framework.' '.substr($reply, 0, 120));
            if ($length === 200) {
                $effects++;
            }
        }
        $observed = json_decode((string)$http->get($url.'/state')->getBody(), true, flags:JSON_THROW_ON_ERROR);
        webhookHttpCheck($observed['effects'] === $effects, 'rejections precede application effects');
    }
    echo "Actual HttpKernel/Laravel routes: verified max body, 413/400/405 and chunk-decoding ingress; effects only after successful byte verification.\n";
} finally {
    if (is_resource($ingress)) {
        proc_terminate($ingress);
        foreach ($ingressPipes as $pipe) {
            fclose($pipe);
        }proc_close($ingress);
    }
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }proc_close($process);
    fclose($log);
}
