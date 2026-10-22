<?php

require dirname(__DIR__).'/vendor/autoload.php';
use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
$root = dirname(__DIR__);
$state = getenv('EXAMPLE_STATE_DIR');
check(is_string($state) && str_starts_with($state, '/') && !str_starts_with($state, '/tmp/'), 'persistent test state directory');
foreach (['laravel','symfony'] as $framework) {
    $env = getenv();
    $env = array_replace($env, ['EXAMPLE_APP_USERNAME' => 'example-user','EXAMPLE_APP_PASSWORD' => 'test-only-password','POLYMORFA_PROJECT_TOKEN' => 'pmfa_pt_'.str_repeat('a', 93).'A','POLYMORFA_SESSION' => 'authorized-support','POLYMORFA_RECIPIENT' => '+15550001234','POLYMORFA_WEBHOOK_SECRET' => 'local-test-signing-key']);
    $env['EXAMPLE_STATE_DIR'] = $state.'/'.$framework;
    $env['EXAMPLE_FRAMEWORK'] = $framework;
    $env['EXAMPLE_APP_ORIGIN'] = 'http://127.0.0.1:31306';
    $env['POLYMORFA_API_BASE_URL'] = 'http://127.0.0.1:31305';
    if (!is_dir($env['EXAMPLE_STATE_DIR'])) {
        mkdir($env['EXAMPLE_STATE_DIR'], 0700, true);
    }
    $counter = $env['EXAMPLE_STATE_DIR'].'/native-mints';
    @unlink($env['EXAMPLE_STATE_DIR'].'/conversation.json');
    @unlink($env['EXAMPLE_STATE_DIR'].'/native-sends');
    $linkCounter = $env['EXAMPLE_STATE_DIR'].'/native-links';
    if (is_file($linkCounter)) { unlink($linkCounter); }
    if (is_file($counter)) {
        unlink($counter);
    }
    $log = fopen($env['EXAMPLE_STATE_DIR'].'/server.log', 'ab');
    $servers = [
        proc_open([PHP_BINARY,'-S','127.0.0.1:31305',$root.'/tests/upstream.php'], [STDIN,$log,$log], $pipes, $root, $env),
        proc_open([PHP_BINARY,'-S','127.0.0.1:31306','-t',$root.'/public',$root.'/public/router.php'], [STDIN,$log,$log], $pipes, $root, $env),
    ];
    try {
        $client = new Client(['base_uri' => $env['EXAMPLE_APP_ORIGIN'],'cookies' => new CookieJar(),'http_errors' => false,'allow_redirects' => false,'timeout' => 10]);
        $ready = false;
        for ($attempt = 0;$attempt < 100;$attempt++) {
            try {
                $response = $client->get('/');
                $ready = true;
                break;
            } catch (Throwable) {
                usleep(50000);
            }
        }
        check($ready, 'server starts');
        check($response->getStatusCode() === 200 && str_contains((string)$response->getBody(), 'type="password"'), $framework.' initial template status '.$response->getStatusCode());
        $send = fn (string $method, string $path, string $origin, array $fields = []) => $client->request($method, $path, ['headers' => ['Origin' => $origin,'HX-Request' => 'true'],'form_params' => $fields]);
        $origin = $env['EXAMPLE_APP_ORIGIN'];
        check($send('POST', '/api/polymorfa/token', $origin)->getStatusCode() === 401, 'anonymous');
        check($send('POST', '/api/polymorfa/connect', $origin)->getStatusCode() === 401, 'anonymous connect');
        check($send('GET', '/api/login', $origin)->getStatusCode() === 405, 'GET login');
        check($send('POST', '/api/login', 'https://foreign.invalid', ['username' => 'example-user','password' => 'test-only-password'])->getStatusCode() === 403, 'foreign origin');
        check($send('POST', '/api/login', $origin, ['username' => 'example-user','password' => 'wrong'])->getStatusCode() === 401, 'invalid password');
        $response = $send('POST', '/api/login', $origin, ['username' => 'example-user','password' => 'test-only-password']);
        check($response->getStatusCode() === 200 && str_contains((string)$response->getBody(), 'pmfa-inbox'), 'authenticated template');
        check(str_contains($response->getHeaderLine('Set-Cookie'), 'httponly') && str_contains($response->getHeaderLine('Set-Cookie'), 'samesite=strict'), 'opaque private cookie');
        $response = $send('POST', '/api/polymorfa/token', $origin, ['session' => 'attacker','ephemeralId' => 'attacker']);
        $token = json_decode((string)$response->getBody(), true);
        check($response->getStatusCode() === 200 && ($token['value'] ?? null) === 'pmfa_ct_browser_fixture' && ($token['audience'] ?? null) === 'browser' && ($token['expiresAt'] ?? 0) > time() * 1000 && str_contains($response->getHeaderLine('Cache-Control'), 'no-store'), 'native SDK token mint');
        check((int)file_get_contents($counter) === 1, 'one real upstream request');
        $response = $send('POST', '/api/polymorfa/connect', $origin, ['session' => 'attacker','purpose' => 'initial']);
        $raw = (string)$response->getBody(); $link = json_decode($raw, true);
        check($response->getStatusCode() === 200 && ($link['data']['url'] ?? null) === 'https://quick.example.test/link' && !str_contains($raw, 'pmfa_pt_'), 'assigned supplementary QuickLink');
        check((int)file_get_contents($linkCounter) === 1, 'one QuickLink upstream request');
        check($send('POST', '/api/polymorfa/connect', 'https://foreign.invalid')->getStatusCode() === 403, 'QuickLink origin guard');
        check($send('POST', '/api/polymorfa/token', 'https://foreign.invalid')->getStatusCode() === 403, 'mint origin guard');
        $key = 'ad87d91a-32fc-48ab-aa00-5973d1e9f98d';
        $message = fn(array $body) => $client->post('/api/polymorfa/send', ['headers'=>['Origin'=>$origin,'Idempotency-Key'=>$key],'json'=>$body]);
        check($message(['text'=>'Native send','recipient'=>'foreign'])->getStatusCode() === 400, 'fixed target');
        $sent = $message(['text'=>'Native send']);
        check($sent->getStatusCode() === 200 && json_decode((string)$sent->getBody(),true)['id'] === 'message-out', 'native send');
        check($message(['text'=>'Native send'])->getStatusCode() === 200, 'same key replay');
        check($message(['text'=>'Changed'])->getStatusCode() === 409, 'changed text rejected');
        check((int)file_get_contents($env['EXAMPLE_STATE_DIR'].'/native-sends') === 1, 'no duplicate upstream send');
        $envelope = ['id'=>'event-1','timestamp'=>'2026-10-18T10:00:01Z','session'=>'authorized-support','event'=>'message.received','payload'=>[
            'id'=>'message-in','conversation'=>['id'=>'canonical-peer'],'fromMe'=>false,'isGroup'=>false,'timestamp'=>1792317601,'text'=>'Independent reply','type'=>'text','pushName'=>'Test peer','whatsapp_ids'=>['linked_devices'=>'wire-in']
        ]];
        $body = json_encode($envelope,JSON_THROW_ON_ERROR);
        $webhook = fn(string $signature) => $client->post('/webhooks/polymorfa',['headers'=>['x-webhook-signature'=>$signature],'body'=>$body]);
        check($webhook('bad')->getStatusCode() === 400, 'invalid webhook signature');
        for ($i=0;$i<2;$i++) { check($webhook(hash_hmac('sha256',$body,'local-test-signing-key'))->getStatusCode() === 200, 'signed receiver'); }
        $snapshot = json_decode((string)$client->get('/api/polymorfa/conversation')->getBody(),true);
        check(array_column($snapshot['messages'],'text') === ['Native send','Independent reply'] && $snapshot['receivedEvents'] === 1, 'signed reply deduplicated');
        $client->get('/');
        check(json_decode((string)$client->get('/api/polymorfa/conversation')->getBody(),true) === $snapshot, 'reload preserves conversation');
        check($send('POST', '/api/logout', $origin)->getStatusCode() === 200, 'logout');
        check($client->get('/api/polymorfa/conversation')->getStatusCode() === 401 && $message(['text'=>'Native send'])->getStatusCode() === 401,'logout revokes conversation and send');
        check($send('POST', '/api/polymorfa/token', $origin)->getStatusCode() === 401, 'revoked application session');
        check((int)file_get_contents($counter) === 1, 'no unauthorized upstream requests');
        check($send('POST', '/api/polymorfa/connect', $origin)->getStatusCode() === 401 && (int)file_get_contents($linkCounter) === 1, 'revoked QuickLink access');
        echo $framework." real HTTP/auth/token boundary passed\n";
    } finally {
        foreach ($servers as $server) {
            if (is_resource($server)) {
                proc_terminate($server);
                proc_close($server);
            }
        }
        fclose($log);
    }
}
