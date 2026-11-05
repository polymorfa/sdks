<?php

declare(strict_types=1);
$key = implode('', array_map(chr(...), range(0, 31)));
$plain = 'Polymorfa golden vector: whatsmeow cbcutil + hkdfutil, 2026.';
foreach (['image' => '474233e574aba8c2e6f5c68cd3ea5b7e4cad764538e8593340c36d30d4067b87783033c9ef4b31ce661e6bd986f4a2c01c454eabdf2c3653726639cc1bc8eeb58ddb7d86c09618d427a0','document' => 'a152af0afcc1abc69708d42cd69405d5f54acb48a16964f8e61ebe26b53d1f07e8eeb87617194a5bcc9781404d5ab4b14ac1e3f51052d7ffbdb4102e3f1996744ea9bd705fff983e5d7c'] as $kind => $expected) {
    $encrypted = Polymorfa\MediaEncryption::encrypt($plain, $kind, $key);
    check(bin2hex($encrypted->ciphertext) === $expected, 'Independent encryption golden vector '.$kind);
    check(!str_contains(json_encode($encrypted), 'mediaKey') && !str_contains(json_encode($encrypted->info), 'mediaKey'), 'Encryption secrets excluded from ordinary JSON');
}
foreach (['image','video','audio','ptt','document','sticker'] as $kind) {
    foreach ([0,1,15,16,17,65535,65536,65537] as $size) {
        $plaintext = str_repeat(chr(31), $size);
        $encrypted = Polymorfa\MediaEncryption::encrypt($plaintext, $kind, $key);
        $info = $encrypted->info;
        $descriptor = new Polymorfa\MediaDescriptor($kind, $key, fileSha256:$info->fileSha256, fileEncSha256:$info->fileEncSha256, fileLength:$size);
        check(Polymorfa\WhatsAppMedia::decrypt($encrypted->ciphertext, $descriptor) === $plaintext && $info->encryptedLength === (intdiv($size, 16) + 1) * 16 + 10, 'Block boundary and media-kind round trip');
    }
}
$original = str_repeat('a', 65537);
$expected = Polymorfa\MediaEncryption::encrypt($original, 'document', $key)->info;
$source = GuzzleHttp\Psr7\Utils::streamFor(substr($original, 0, -1).'b');
$chunks = Polymorfa\MediaEncryption::chunks($source, 'document', $key, expected:$expected);
$released = '';
$error = raises(function () use ($chunks, &$released) {
    foreach ($chunks as $chunk) {
        $released .= $chunk;
    }
}, Polymorfa\MediaIntegrityException::class);
check($error->errorCode === 'media_source_changed' && strlen($released) < $expected->encryptedLength, 'Changed source cannot release final ciphertext block or MAC');
raises(fn () => Polymorfa\MediaEncryption::encrypt('oversized', 'image', maxBytes:2), Polymorfa\MediaIntegrityException::class);
$token = new Polymorfa\CancellationToken();
$token->cancel();
raises(fn () => Polymorfa\MediaEncryption::encrypt('fixture', 'image', cancellation:$token), Polymorfa\CancelledException::class);
echo "Native incremental media encryption, independent vectors, repeat-pass fencing and redaction checks passed.\n";
