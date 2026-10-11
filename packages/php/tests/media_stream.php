<?php

declare(strict_types=1);
$directory = getenv('HOME').'/.polymorfa-agent-work/multi-language-sdks-20261011/php-media-file';
if (!is_dir($directory)) {
    mkdir($directory, 0700, true);
}
$destination = $directory.'/fixture-'.getmypid().'.bin';
$streamResponse = function ($download) {
    try {
        return new Polymorfa\ApiResponse($download->body->getContents(), $download->metadata);
    } finally {
        $download->close();
    }
};
try {
    nativeCases([
     ['GET','/messaging/media/media',null,'binary_fixture',fn ($c) => $c->media->download('media'),'binary_fixture'],
     ['GET','/messaging/media/media',null,'stream_fixture',fn ($c) => $streamResponse($c->media->downloadStream('media')),'stream_fixture',['responseHeaders' => ['Content-Disposition' => "attachment; filename=plain.txt; filename*=UTF-8''..%2Fverified%20name.txt"]]],
     ['GET','/messaging/media/media',null,'file_fixture',fn ($c) => $c->media->downloadToFile('media', $destination),['path' => $destination,'bytes' => 12]],
    ], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
    check(file_get_contents($destination) === 'file_fixture', 'Atomic native media file complete');
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([new GuzzleHttp\Psr7\Response(302, ['Location' => 'https://storage.fixture.invalid/media?X-Amz-Date=20261011T000000Z&X-Amz-Expires=60','X-Request-Id' => 'req_redirect'])], $history));
    $url = $client->media->downloadUrl('media');
    check(!$url->streamed && $url->expiresAt->format('c') === '2026-10-11T00:01:00+00:00' && count($history) === 1, 'Signed URL metadata returned without following');
    ob_start();
    var_dump($url);
    $debug = ob_get_clean();
    check(!str_contains($debug, 'X-Amz'), 'Signed URL debug redaction');
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'text/plain','Content-Length' => '3','Content-Disposition' => "attachment; filename*=UTF-8''..%2Fname.txt"], 'abc')], $history));
    $stream = $client->media->downloadStream('media');
    check($stream->contentType === 'text/plain' && $stream->contentLength === 3 && $stream->filename === 'name.txt' && !$stream->redirected, 'Stream media response metadata');
    $stream->close();
    check(Polymorfa\MediaFiles::filename('attachment; filename="../a;b.txt"') === 'a;b.txt' && Polymorfa\MediaFiles::filename("attachment; filename*=ISO-8859-1''caf%E9.txt") === 'café.txt' && Polymorfa\MediaFiles::filename('attachment; filename=".."') === null, 'Filename parsing matches escaped, extended and path cases');
    check(Polymorfa\MediaFiles::signedUrlExpiry('https://fixture.invalid/?Expires=1700000000')->getTimestamp() === 1700000000, 'Epoch signed URL expiry');
    file_put_contents($destination, 'previous');
    raises(fn () => Polymorfa\MediaFiles::write(GuzzleHttp\Psr7\Utils::streamFor('oversized'), $destination, maxBytes:2), Polymorfa\MediaIntegrityException::class);
    check(file_get_contents($destination) === 'previous', 'Oversized media does not replace destination');
    $token = new Polymorfa\CancellationToken();
    $token->cancel();
    raises(fn () => Polymorfa\MediaFiles::write(GuzzleHttp\Psr7\Utils::streamFor('cancelled'), $destination, cancellation:$token), Polymorfa\CancelledException::class);
    check(file_get_contents($destination) === 'previous', 'Cancelled media does not replace destination');
    $broken = GuzzleHttp\Psr7\FnStream::decorate(GuzzleHttp\Psr7\Utils::streamFor('x'), ['read' => fn () => throw new RuntimeException('synthetic read failure')]);
    $md = new Polymorfa\ResponseMetadata(200, 1, [], 'body_request', '2026-09-22', 'body_operation');
    $error = raises(fn () => Polymorfa\MediaFiles::write(new Polymorfa\MediaBodyStream($broken, $md, null), $destination), Polymorfa\ConnectionException::class);
    check($error->metadata->operationId === 'body_operation' && file_get_contents($destination) === 'previous', 'Stream failure preserves admission metadata and destination');
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, [], 'body')], $history));
    $url = $client->media->downloadUrl('media');
    check($url->streamed && $url->url === null, 'Streamed media URL has no capability URL');
} finally {
    if (is_file($destination)) {
        unlink($destination);
    }
}
echo "Native media streams, filenames, signed URLs, cancellation and atomic output checks passed.\n";
