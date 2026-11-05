<?php

declare(strict_types=1);
use Polymorfa\{CancellationToken,CancelledException,ConfigurationException,MediaDescriptor,MediaIntegrityException,MessagingClient,RequestOptions,ServerException,TimeoutException,UploadWhatsAppMediaOptions,WhatsAppMedia};
use GuzzleHttp\Psr7\Utils;

$cases = [];
foreach (['relay','direct'] as $egress) {
    foreach (['image','video','audio','ptt','document','sticker'] as $kind) {
        $cases[] = [$egress,$kind];
    }
}
foreach ([401,408,500,507,413,415] as $status) {
    $cases[] = ['status'.$status,'image'];
}
foreach (['document','changed','redirect','stall','invalid-grant'] as $mode) {
    $cases[] = [$mode, in_array($mode, ['document','changed'], true) ? 'document' : 'image'];
}
foreach ($cases as [$mode,$kind]) {
    $process = proc_open([PHP_BINARY,__DIR__.'/media-upload-server.php',$mode,$kind], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native TLS media upload fixture starts');
    try {
        $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        [$address,$port] = explode(':', $fixture['address']);
        $native = GuzzleHttp\HandlerStack::create();
        $handler = static function ($request, $options) use ($address, $port, $native) {
            check(in_array($request->getUri()->getHost(), ['api.fixture.invalid','cdn.whatsapp.net'], true), 'Only approved API/CDN authorities reach fixture');
            return $native($request->withUri($request->getUri()->withHost($address)->withPort((int) $port), true), $options);
        };
        $api = new GuzzleHttp\Client(['handler' => $handler,'verify' => $fixture['ca'],'proxy' => '']);
        $cdn = new GuzzleHttp\Client(['handler' => $handler,'verify' => $fixture['ca'],'proxy' => '','headers' => ['Authorization' => 'must-not-forward','Cookie' => 'must-not-forward','X-Caller-Private' => 'must-not-forward'],'auth' => ['must-not-forward','must-not-forward']]);
        $client = new MessagingClient($credential, baseUrl:'https://api.fixture.invalid', http:$api);
        $plain = str_repeat(chr(56), in_array($mode, ['document','changed'], true) ? 257 : 70003);
        $options = new UploadWhatsAppMediaOptions($kind, 'fixture/binary', str_repeat(chr(31), 32), egress:$mode === 'relay' ? 'relay' : 'direct', requestOptions:new RequestOptions(timeout:$mode === 'stall' ? 0.08 : 5, headers:$mode === 'relay' ? ['X-Caller-Private' => 'api-only','content-type' => 'must-be-overridden'] : ['X-Caller-Private' => 'api-only']), http:$cdn, documentPartSize:in_array($mode, ['document','changed'], true) ? 37 : 52428800);
        $result = null;
        if ($mode === 'changed') {
            $opens = 0;
            $source = static function (?CancellationToken $token) use ($plain, &$opens) {
                ++$opens;
                $copy = $plain;
                if ($opens > 1) {
                    $copy[0] = chr(ord($copy[0]) ^ 1);
                } return Utils::streamFor($copy);
            };
            $error = raises(fn () => $client->whatsappMedia->upload('session', $source, $options), MediaIntegrityException::class);
            check($error->errorCode === 'media_source_changed' && $opens === 2, 'Changed document source fails repeat pass before finalization');
        } elseif (in_array($mode, ['status507','status413','status415','redirect'], true)) {
            $error = raises(fn () => $client->whatsappMedia->uploadBytes('session', $plain, $options), ServerException::class);
            check($error->status === ($mode === 'redirect' ? 302 : (int) substr($mode, 6)), 'Nonretryable upload statuses preserve safe status');
            check(!str_contains($error->getMessage(), 'synthetic_grant') && $error->getPrevious() === null, 'Signed URL omitted from native errors');
        } elseif ($mode === 'invalid-grant') {
            $error = raises(fn () => $client->whatsappMedia->uploadBytes('session', $plain, $options), ServerException::class);
            check($error->errorCode === 'invalid_response', 'Grant must match encrypted media path before CDN request');
        } elseif ($mode === 'stall') {
            raises(fn () => $client->whatsappMedia->uploadBytes('session', $plain, $options), TimeoutException::class);
        } else {
            $result = $client->whatsappMedia->uploadBytes('session', $plain, $options);
            check(json_encode($result) === '{"redacted":true}' && !str_contains(print_r($result, true), 'synthetic_grant'), 'Upload result redacts locations and keys');
        }
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'], 'Actual TLS wire preserves ciphertext/hash/ranges/version and excludes credentials from CDN');
        if ($result !== null) {
            $info = $result->info;
            $decoded = WhatsAppMedia::decrypt(base64_decode($state['ciphertext'], true), new MediaDescriptor($kind, $info->mediaKey, fileSha256:$info->fileSha256, fileEncSha256:$info->fileEncSha256, fileLength:strlen($plain)), 268435456);
            check($decoded === $plain, 'Native uploaded ciphertext/MAC round trips all media kinds');
        }
        if ($mode === 'changed') {
            check($state['finals'] === 0, 'Changed source never sends final_hash');
        }
        if ($mode === 'document') {
            check($state['finals'] === 1 && $state['posts'] === 8, 'Document sends consecutive parts then finalize');
        }
        if (in_array($mode, ['status401','status408','status500'], true)) {
            check($state['posts'] === 2 && $state['probes'] === 1 && $state['grants'] === ($mode === 'status401' ? 2 : 1), 'Grant refresh/retry resumes exact encrypted offset');
        }
        if (in_array($mode, ['status507','status413','status415','redirect'], true)) {
            check($state['posts'] === 1 && $state['probes'] === 0, 'No redirect or forbidden retry');
        }
        if ($mode === 'invalid-grant') {
            check($state['posts'] === 0, 'Invalid grant never reaches CDN');
        }
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }
        proc_close($process);
    }
}
$cancelled = new CancellationToken();
$cancelled->cancel();
$client = new MessagingClient($credential);
raises(fn () => $client->whatsappMedia->uploadBytes('session', 'fixture', new UploadWhatsAppMediaOptions('image', requestOptions:new RequestOptions(cancellation:$cancelled))), CancelledException::class);
raises(fn () => new UploadWhatsAppMediaOptions('image', documentPartSize:67108865), ConfigurationException::class);
echo "Native TLS direct/relay uploads, six-kind integrity, refresh/resume, multipart fences, redirect/cancel/deadline and credential isolation passed.\n";
