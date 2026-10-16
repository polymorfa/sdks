<?php

declare(strict_types=1);
function chunkedWhatsAppSource(string $encrypted, int $width = 7, ?Polymorfa\CancellationToken $cancel = null): Psr\Http\Message\StreamInterface
{
    $offset = 0;
    return GuzzleHttp\Psr7\FnStream::decorate(GuzzleHttp\Psr7\Utils::streamFor(''), [
     'read' => function (int $size) use ($encrypted, $width, &$offset, $cancel): string {
         if ($cancel !== null && $offset > 0) {
             $cancel->cancel();
         }$chunk = substr($encrypted, $offset, min($size, $width));
         $offset += strlen($chunk);
         return $chunk;
     },
     'eof' => function () use (&$offset, $encrypted): bool {
         return $offset >= strlen($encrypted);
     },
    ]);
}
// Use independent Node-generated vectors, with boundaries inside blocks and inside MACs.
foreach ($mediaVectors as $vector) {
    $descriptor = Polymorfa\WhatsAppMedia::decode($vector['descriptor'], $vector['kind']);
    $encrypted = hex2bin($vector['encrypted']);
    $plain = hex2bin($vector['plaintext']);
    foreach (['before-release','streaming'] as $mode) {
        $body = new Polymorfa\WhatsAppDecryptBody(chunkedWhatsAppSource($encrypted), $descriptor, verify:$mode);
        check($body->getContents() === $plain, 'Incremental independent '.$vector['kind'].' '.$mode);
        $body->close();
    }
    $bad = $encrypted;
    $bad[strlen($bad) - 1] = chr(ord($bad[strlen($bad) - 1]) ^ 1);
    $released = '';
    raises(function () use ($bad, $descriptor, &$released) {
        foreach (Polymorfa\WhatsAppMedia::decryptChunks(chunkedWhatsAppSource($bad), $descriptor) as $chunk) {
            $released .= $chunk;
        }
    }, Polymorfa\MediaIntegrityException::class);
    check($released === '', 'Before-release emits no unauthenticated plaintext');
    $released = '';
    raises(function () use ($bad, $descriptor, &$released) {
        foreach (Polymorfa\WhatsAppMedia::decryptChunks(chunkedWhatsAppSource($bad), $descriptor, verify:'streaming') as $chunk) {
            $released .= $chunk;
        }
    }, Polymorfa\MediaIntegrityException::class);
    check($released !== '' && str_starts_with($plain, $released), 'Streaming emits provisional prefix and reports final integrity failure');
    check(Polymorfa\WhatsAppMedia::descriptor(['type' => $vector['kind'],'media' => $vector['descriptor']])->mediaKey === $descriptor->mediaKey, 'Webhook media input resolved');
}
$vector = $mediaVectors[0];
$descriptor = Polymorfa\WhatsAppMedia::decode($vector['descriptor'], 'image');
$encrypted = hex2bin($vector['encrypted']);
$cancel = new Polymorfa\CancellationToken();
raises(fn () => iterator_to_array(Polymorfa\WhatsAppMedia::decryptChunks(chunkedWhatsAppSource($encrypted, cancel:$cancel), $descriptor, cancellation:$cancel)), Polymorfa\CancelledException::class);
raises(fn () => iterator_to_array(Polymorfa\WhatsAppMedia::decryptChunks(chunkedWhatsAppSource($encrypted), $descriptor, maxBytes:1)), Polymorfa\MediaIntegrityException::class);
$history = [];
$http = new GuzzleHttp\Client(['headers' => ['Authorization' => 'Bearer synthetic-default','Polymorfa-Version' => 'must-not-forward'],'handler' => function ($request, $options) use (&$history, $encrypted) {
    $history[] = $request;
    check(!$request->hasHeader('authorization') && !$request->hasHeader('polymorfa-version'), 'Incremental CDN credential isolation');
    check($options['stream'] === true && $options['cookies'] === false, 'CDN streamed body and cookie isolation');
    return GuzzleHttp\Promise\Create::promiseFor(count($history) === 1 ? new GuzzleHttp\Psr7\Response(404) : new GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/octet-stream'], chunkedWhatsAppSource($encrypted)));
}]);
$download = Polymorfa\WhatsAppMedia::downloadStream(['type' => 'image','media' => $vector['descriptor']], http:$http);
check(count($history) === 2 && $download->bytes() === hex2bin($vector['plaintext']), 'Incremental CDN directPath fallback and metadata');
$directory = (getenv('POLYMORFA_TEST_WORK_DIR') ?: getenv('HOME').'/.polymorfa-agent-work').'/multi-language-sdks-20261011/php-native';
$destination = $directory.'/wa-integrity-'.getmypid();
file_put_contents($destination, 'previous');
try {
    $bad = $encrypted;
    $bad[strlen($bad) - 1] = chr(ord($bad[strlen($bad) - 1]) ^ 1);
    $download = new Polymorfa\WhatsAppDownload(new Polymorfa\WhatsAppDecryptBody(chunkedWhatsAppSource($bad), $descriptor, verify:'streaming'), $descriptor);
    raises(fn () => $download->writeToFile($destination), Polymorfa\MediaIntegrityException::class);
    check(file_get_contents($destination) === 'previous' && glob($directory.'/.polymorfa-*') === [], 'Failed streaming verification preserves previous destination and removes private file');
    $download = new Polymorfa\WhatsAppDownload(new Polymorfa\WhatsAppDecryptBody(chunkedWhatsAppSource($encrypted), $descriptor, verify:'streaming'), $descriptor);
    check($download->writeToFile($destination) === strlen(hex2bin($vector['plaintext'])) && file_get_contents($destination) === hex2bin($vector['plaintext']), 'Verified atomic incremental output');
    check((fileperms($destination) & 0777) === 0600, 'Private media file permissions');
} finally {
    if (is_file($destination)) {
        unlink($destination);
    }
}
echo "Incremental WhatsApp CBC/MAC/hash modes, CDN isolation and atomic integrity checks passed.\n";
$cancel = new Polymorfa\CancellationToken();
$closed = false;
$http = new GuzzleHttp\Client(['handler' => function () use ($cancel, &$closed) {
    $cancel->cancel();
    return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(200, [], GuzzleHttp\Psr7\FnStream::decorate(GuzzleHttp\Psr7\Utils::streamFor(''), ['close' => function () use (&$closed): void {
        $closed = true;
    }])));
}]);
raises(fn () => Polymorfa\WhatsAppMedia::downloadStream($descriptor, cancellation:$cancel, http:$http), Polymorfa\CancelledException::class);
check($closed, 'Cancelled CDN admission closes body before handing it to consumer');
