<?php

declare(strict_types=1);

use Polymorfa\{WebhookRequest,Webhooks,WebhookSignatureException,MediaSocket,VideoFrame,AudioFrame,CallSocket,Credential,ConfigurationException};

$raw = '{ "id":"event_1","session":"support","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"x":1}}';
$signature = hash_hmac('sha256', $raw, 'secret');
$symfony = Symfony\Component\HttpFoundation\Request::create('/webhook', 'POST', server:['HTTP_X_WEBHOOK_SIGNATURE' => $signature], content:$raw);
$laravel = Illuminate\Http\Request::createFromBase($symfony);
$psr = new GuzzleHttp\Psr7\ServerRequest('POST', 'https://example.test/webhook', ['x-webhook-signature' => $signature], $raw);
foreach ([fn () => WebhookRequest::fromSymfony($symfony, 'secret'),fn () => WebhookRequest::fromLaravel($laravel, 'secret'),fn () => WebhookRequest::fromPsr($psr, 'secret')] as $verify) {
    $event = $verify();
    check($event->id === 'event_1' && !$event->known, 'Native framework verified event');
}
$changed = Symfony\Component\HttpFoundation\Request::create('/webhook', 'POST', server:['HTTP_X_WEBHOOK_SIGNATURE' => $signature], content:$raw.' ');
raises(fn () => WebhookRequest::fromSymfony($changed, 'secret'), WebhookSignatureException::class);
check(bin2hex(MediaSocket::encodeAudio([1,-32768,32767])) === '0101000080ff7f', 'Exact PCM frame');
check(MediaSocket::decodeFrame(hex2bin('0101000080ff7f'))->samples === [1,-32768,32767], 'Decoded PCM');
$video = new VideoFrame(hex2bin('0000000165'), 123456, true, 42);
check(bin2hex(MediaSocket::encodeVideo($video)) === '0201010000002a000000000001e2400000000165', 'Exact video frame');
check(MediaSocket::decodeFrame(MediaSocket::encodeVideo($video)) == $video, 'Decoded video');
check(MediaSocket::decodeFrame("\x01\x00") === null, 'Reject malformed PCM');
$wire = new class () implements CallSocket {
    public array $sent = [];
    public array $messages = [['data' => '{"type":"ready","sampleRate":16000,"video":true}','binary' => false],['data' => "\x01\x02\x00\xfe\xff",'binary' => true]];
    public bool $closed = false;
    public function send(string $data, bool $binary = false): void
    {
        $this->sent[] = ['data' => $data,'binary' => $binary];
    }
    public function receive(): array
    {
        return array_shift($this->messages);
    }
    public function close(): void
    {
        $this->closed = true;
    }
};
$socket = new MediaSocket(Credential::clientToken('pmfa_ct_local'), 'call_1', 'connection_1', connector:function ($url, $protocol, $timeout) use ($wire) {
    check($url === 'wss://api.polymorfa.com/voip/calls/call_1/media' && $protocol === 'pmfa.calls.v2', 'Native transport URI has no credentials');
    return $wire;
});
$socket->connect();
check($socket->sampleRate === 16000 && $socket->video, 'Media ready');
check(json_decode($wire->sent[0]['data'], true) === ['type' => 'auth','token' => 'pmfa_ct_local','connectionId' => 'connection_1'], 'First frame authentication');
$socket->sendAudio([1,-1]);
check($wire->sent[1] === ['data' => "\x01\x01\x00\xff\xff",'binary' => true], 'Sent native PCM');
check($socket->receive() == new AudioFrame([2,-2]), 'Received native PCM');
$socket->leave();
check($wire->closed && !$socket->connected, 'Call leave closes');
raises(fn () => new MediaSocket(Credential::clientToken('pmfa_ct_local'), 'call_1', 'connection_1', participant:'server'), ConfigurationException::class);
echo "Native Symfony/Laravel/PSR webhook and Calls media protocol checks passed.\n";

$process = proc_open([PHP_BINARY,__DIR__.'/calls-server.php'], [['pipe','r'],['pipe','w'],['pipe','w']], $pipes);
if (!is_resource($process)) {
    throw new RuntimeException('Could not start Calls native fixture.');
}
try {
    $ready = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $native = new MediaSocket(Credential::clientToken('pmfa_ct_fixture'), 'call_fixture', 'connection_fixture', baseUrl:$ready['url']);
    $native->connect();
    check($native->sampleRate === 16000 && $native->video, 'Native phrity media readiness');
    $native->sendAudio([1,-1]);
    check($native->receive() == new AudioFrame([2,-2]), 'Native phrity PCM wire');
    $native->leave();
    check(trim(fgets($pipes[1])) === 'verified', 'Native server verified URL isolation/auth/protocol/PCM/leave');
    echo "Actual phrity WebSocket Calls handshake and binary media passed.\n";
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }proc_close($process);
}
