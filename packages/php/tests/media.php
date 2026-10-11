<?php

declare(strict_types=1);

use Polymorfa\{WhatsAppMedia,MediaDescriptor,MediaIntegrityException,CancellationToken,CancelledException};

$mediaVectors = json_decode(file_get_contents(dirname(__DIR__, 3).'/contracts/fixtures/whatsapp-media.json'), true, flags:JSON_THROW_ON_ERROR)['fixtures'];
foreach ($mediaVectors as $vector) {
    $descriptor = WhatsAppMedia::decode($vector['descriptor'], $vector['kind']);
    check($descriptor->mediaKind === $vector['kind'], 'Media kind');
    $keys = WhatsAppMedia::deriveKeys($descriptor->mediaKey, $descriptor->mediaKind);
    foreach ($keys as $name => $bytes) {
        check(bin2hex($bytes) === $vector[$name], 'Independent media derivation '.$name);
    }
    $encrypted = hex2bin($vector['encrypted']);
    check(WhatsAppMedia::decrypt($encrypted, $descriptor) === hex2bin($vector['plaintext']), 'Independent verified plaintext');
    $corrupted = $encrypted;
    $corrupted[0] = chr(ord($corrupted[0]) ^ 1);
    $error = raises(fn () => WhatsAppMedia::decrypt($corrupted, $descriptor), MediaIntegrityException::class);
    check($error->errorCode === 'media_enc_hash_mismatch', 'Encrypted integrity check precedes decrypt');
    $noHash = new MediaDescriptor($descriptor->mediaKind, $descriptor->mediaKey, fileSha256:$descriptor->fileSha256);
    check(raises(fn () => WhatsAppMedia::decrypt($corrupted, $noHash), MediaIntegrityException::class)->errorCode === 'media_mac_mismatch', 'MAC check');
    $wrongHash = new MediaDescriptor($descriptor->mediaKind, $descriptor->mediaKey, fileSha256:str_repeat('x', 32));
    check(raises(fn () => WhatsAppMedia::decrypt($encrypted, $wrongHash), MediaIntegrityException::class)->errorCode === 'media_hash_mismatch', 'Plaintext check');
    check(raises(fn () => WhatsAppMedia::decrypt($encrypted, $descriptor, maxBytes:1), MediaIntegrityException::class)->errorCode === 'media_too_large', 'Bounded media');
    $token = new CancellationToken();
    $token->cancel();
    raises(fn () => WhatsAppMedia::download($descriptor, cancellation:$token), CancelledException::class);
    check(!str_contains(json_encode($descriptor->__debugInfo()), $descriptor->mediaKey), 'Media descriptor redaction');
}
foreach (['https://evil.test/m','https://whatsapp.net.evil.test/m','https://u:p@mmg.whatsapp.net/m','https://mmg.whatsapp.net:444/m','http://mmg.whatsapp.net/m','https://mmg.whatsapp.net/m#secret'] as $url) {
    check(!WhatsAppMedia::isMediaUrl($url), 'Reject media URL '.$url);
}
check(WhatsAppMedia::isMediaUrl('https://mmg.whatsapp.net/m'), 'Allow canonical media URL');
raises(fn () => WhatsAppMedia::decode('AAAA', 'image'), MediaIntegrityException::class);
echo count($mediaVectors)." independent WhatsApp media vectors and integrity checks passed.\n";

$vector = $mediaVectors[0];
$descriptor = WhatsAppMedia::decode($vector['descriptor'], 'image');
$attempts = 0;
$http = new GuzzleHttp\Client(['headers' => ['Authorization' => 'Bearer do-not-forward','Polymorfa-Version' => 'do-not-forward'],'handler' => function ($request, $options) use (&$attempts, $vector) {
    ++$attempts;
    check(!$request->hasHeader('Authorization') && !$request->hasHeader('Polymorfa-Version'), 'CDN never gets API defaults');
    check($request->getHeaderLine('Origin') === 'https://web.whatsapp.com' && $request->getHeaderLine('Referer') === 'https://web.whatsapp.com/', 'CDN web origin headers');
    if ($attempts === 1) {
        return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(404));
    }
    if ($attempts === 2) {
        parse_str($request->getUri()->getQuery(), $query);
        check($query['mms-type'] === 'image' && isset($query['hash']), 'Direct path capability parameters');
        return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(302, ['Location' => 'https://cdn.whatsapp.net/verified']));
    }
    $options['sink']->write(hex2bin($vector['encrypted']));
    return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(200));
}]);
check(WhatsAppMedia::download($descriptor, http:$http) === hex2bin($vector['plaintext']) && $attempts === 3, 'Verified CDN fallback and redirect');
$unsafe = new GuzzleHttp\Client(['handler' => fn () => GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(302, ['Location' => 'https://evil.test/file']))]);
raises(fn () => WhatsAppMedia::download($descriptor, http:$unsafe), MediaIntegrityException::class);
echo "CDN fallback, host confinement and credential isolation checks passed.\n";
