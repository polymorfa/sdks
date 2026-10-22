<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';

use Polymorfa\{Client,Credential,MessagingClient,RequestOptions,ServerException};

function jsonStatusCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function jsonStatusRefusal(callable $run, int $status): ServerException
{
    try {
        $run();
    } catch (ServerException $e) {
        jsonStatusCheck($e->errorCode === 'invalid_response' && $e->status === $status, 'status preserved');
        jsonStatusCheck($e->requestId === 'status-'.$status && $e->metadata->status === $status && $e->metadata->attempts === 1, 'metadata preserved');
        jsonStatusCheck(!str_contains($e->getMessage().json_encode($e->metadata), 'must-not-leak'), 'safe status error');
        return $e;
    } throw new RuntimeException('Unexpected redirect success '.$status);
}
$process = proc_open(['node',__DIR__.'/fixtures/consumer-repairs/json-status-server.mjs'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
jsonStatusCheck(is_resource($process), 'native status fixture');
try {
    $base = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR)['url'];
    $key = Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k');
    $client = new Client($key, baseUrl:$base, maxNetworkRetries:2);
    $messaging = new MessagingClient($key, baseUrl:$base, maxNetworkRetries:2);
    for ($status = 300; $status < 400; $status++) {
        jsonStatusRefusal(fn () => $client->events->retrieve('case-'.$status), $status);
        jsonStatusRefusal(fn () => $client->raw->request('GET', '/status/'.$status), $status);
        jsonStatusRefusal(fn () => $client->raw->request('POST', '/status/'.$status, body:['synthetic' => true], options:new RequestOptions(idempotencyKey:'status-key')), $status);
        jsonStatusRefusal(fn () => $messaging->quickLinks->retrieve('case-'.$status), $status);
    }
    foreach ([301,302,303,307,308] as $status) {
        foreach (['bad','empty','list'] as $shape) {
            jsonStatusRefusal(fn () => $client->raw->request('GET', '/status/'.$status, ['shape' => $shape]), $status);
        }
    }
    foreach ([200,201,202] as $status) {
        jsonStatusCheck($client->events->retrieve('case-'.$status)->metadata->status === $status, 'typed 2xx');
        foreach (['scalar' => 7,'list' => [1,2],'null' => null,'empty' => null] as $shape => $value) {
            jsonStatusCheck($client->raw->request('GET', '/status/'.$status, ['shape' => $shape])->data === $value, 'raw 2xx shape');
        }
    }
    jsonStatusCheck($client->raw->request('GET', '/status/204', ['shape' => 'empty'])->data === null, '204');
    $state = json_decode(file_get_contents($base.'/state'), true, flags:JSON_THROW_ON_ERROR);
    jsonStatusCheck($state['requests'] === 431 && $state['followed'] === 0 && $state['valid'], 'no retry, follow or credential replay');
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }proc_close($process);
}

final class JsonStatusBody implements Psr\Http\Message\StreamInterface
{
    use GuzzleHttp\Psr7\StreamDecoratorTrait;
    private Psr\Http\Message\StreamInterface $stream;
    public int $reads = 0;
    public int $closes = 0;
    public function __construct()
    {
        $this->stream = GuzzleHttp\Psr7\Utils::streamFor('malformed must-not-leak');
    }
    public function getContents(): string
    {
        $this->reads++;
        throw new RuntimeException('must-not-leak');
    }
    public function close(): void
    {
        $this->closes++;
        $this->stream->close();
    }
}
foreach ([100,103,199,300,304,399] as $status) {
    $body = new JsonStatusBody();
    $mock = new GuzzleHttp\Handler\MockHandler([new GuzzleHttp\Psr7\Response($status, ['Content-Type' => 'application/json','X-Request-Id' => 'status-'.$status,'Location' => 'https://invalid.example/must-not-leak'], $body)]);
    $http = new GuzzleHttp\Client(['handler' => GuzzleHttp\HandlerStack::create($mock)]);
    $client = new Client($key, http:$http);
    jsonStatusRefusal(fn () => $client->raw->request('GET', '/synthetic'), $status);
    jsonStatusCheck($body->reads === 0 && $body->closes === 1, 'status rejection precedes read failure and closes body');
}
echo "Ordinary JSON: 415 native redirect refusals, 16 valid 2xx controls; final 1xx/read-failure cleanup controls passed.\n";
