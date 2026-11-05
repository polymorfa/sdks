<?php

declare(strict_types=1);

use Polymorfa\{ConfigurationException,RequestOptions,ServerException,WhatsAppMedia,WhatsAppMediaSendDescriptor,WhatsAppMediaSendMetadata,WhatsAppMediaUploadResult,WhatsAppUploadLocation};

foreach (['image','video','audio','ptt','document','sticker'] as $kind) {
    $process = proc_open([PHP_BINARY,__DIR__.'/media-upload-server.php','send',$kind], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native descriptor TLS fixture starts');
    try {
        $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        $http = new GuzzleHttp\Client(['verify' => $fixture['ca'],'proxy' => '']);
        $client = new Polymorfa\MessagingClient($credential, baseUrl:'https://'.$fixture['address'], http:$http);
        $mime = $kind === 'sticker' ? 'image/webp' : 'fixture/binary';
        $encrypted = Polymorfa\MediaEncryption::encrypt('native descriptor fixture', $kind, str_repeat(chr(24), 32), mimeType:$mime);
        $upload = new WhatsAppMediaUploadResult($encrypted->info, new WhatsAppUploadLocation('/fixture/path', 'https://cdn.whatsapp.net/fixture/path'), 'relay');
        $descriptor = WhatsAppMediaSendDescriptor::fromUpload($upload);
        check(json_encode($descriptor) === '{"redacted":true}' && !str_contains(print_r($descriptor, true), base64_encode($descriptor->mediaKey)), 'Descriptor formatting omits keys and locations');
        $mapped = match ($kind) {
            'document' => 'file','audio','ptt' => 'voice',default => $kind
        };
        $media = ['descriptor' => $descriptor];
        if ($kind === 'ptt') {
            $media['ptt'] = true;
        }
        $body = ['conversation' => ['id' => 'conversation'],'content' => [$mapped => $media]];
        $response = $client->messages->send('session', $body);
        $returned = $response->data['data']['content'][$mapped]['descriptor'];
        check($returned instanceof WhatsAppMediaSendDescriptor && $returned->mediaType === $kind && $returned->mediaKey === $descriptor->mediaKey && $returned->fileSha256 === $descriptor->fileSha256, 'Descriptor response preserves binary fields and media identity');
        check($body['content'][$mapped]['descriptor'] === $descriptor, 'Caller request remains typed and unmodified');
        $client->messages->send('session', ['conversation' => ['id' => 'conversation'],'content' => ['text' => 'legacy']]);
        $client->messages->send('session', $body, new RequestOptions(apiVersion:'2026-12-01'));
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'] && $state['posts'] === 3, 'Actual TLS descriptor wire, idempotency, legacy and explicit API versions');
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }
        proc_close($process);
    }
}
$wire = $descriptor->toWire();
foreach ([['mediaKey' => null],['mediaKey' => 'private secret'],['fileLength' => 1.1],['fileLength' => 0],['width' => 1],['waveform' => 'YQ=='],['url' => 'https://private:secret@cdn.whatsapp.net/fixture'],['directPath' => '//private']] as $invalid) {
    $error = raises(fn () => WhatsAppMediaSendDescriptor::fromWire('sticker', array_replace($wire, $invalid)), ServerException::class);
    check($error->errorCode === 'invalid_response' && $error->getPrevious() === null && !str_contains($error->getMessage(), 'private'), 'Malformed response fails with safe error');
}
foreach ([new WhatsAppMediaSendMetadata(width:1),new WhatsAppMediaSendMetadata(seconds:86401),new WhatsAppMediaSendMetadata(waveform:'tiny'),new WhatsAppMediaSendMetadata(thumbnail:str_repeat('x', 16385)),new WhatsAppMediaSendMetadata(mediaKeyTimestamp:1099511627777)] as $metadata) {
    raises(fn () => WhatsAppMediaSendDescriptor::fromUpload($upload, $metadata), ConfigurationException::class);
}
$client = new Polymorfa\MessagingClient($credential, baseUrl:'http://127.0.0.1:1');
foreach ([['sticker' => ['descriptor' => $descriptor,'url' => 'https://private.invalid']],['image' => ['descriptor' => $descriptor]],['sticker' => ['descriptor' => $descriptor,'caption' => 'unsupported']],['sticker' => ['descriptor' => $wire]],['text' => 'x','sticker' => ['descriptor' => $descriptor]]] as $content) {
    raises(fn () => $client->messages->send('session', ['conversation' => ['id' => 'conversation'],'content' => $content]), ConfigurationException::class);
}
echo "Native TLS descriptor sends/responses for six kinds, secret redaction, shape bounds and per-request API revisions passed.\n";
