<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';

use Polymorfa\{ConfigurationException,ValidationException,WebhookRequest,WebhookSignatureException};

function webhookBoundCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function webhookBoundError(callable $run, string $code, int $status, string $context = ''): void
{
    try {
        $run();
    } catch (ValidationException $error) {
        webhookBoundCheck($error->errorCode === $code && $error->status === $status, 'bounded error '.$code);
        return;
    }
    throw new RuntimeException('Expected '.$code.' '.$context);
}
class BoundSymfony extends Symfony\Component\HttpFoundation\Request
{
    public array $acquisitions = [];
    public function getContent(bool $asResource = false)
    {
        $this->acquisitions[] = $asResource;
        return parent::getContent($asResource);
    }
}
class BoundLaravel extends Illuminate\Http\Request
{
    public array $acquisitions = [];
    public function getContent(bool $asResource = false)
    {
        $this->acquisitions[] = $asResource;
        return parent::getContent($asResource);
    }
}
class BoundPsr extends GuzzleHttp\Psr7\ServerRequest
{
    public int $acquisitions = 0;
    // Cover exact values supplied by a PSR implementation, before Guzzle OWS normalization.
    public ?array $declaredLengths = null;
    public function getHeader($name): array
    {
        return strtolower($name) === 'content-length' && $this->declaredLengths !== null ? $this->declaredLengths : parent::getHeader($name);
    }
    public function getBody(): Psr\Http\Message\StreamInterface
    {
        $this->acquisitions++;
        return parent::getBody();
    }
}
final class BoundStream implements Psr\Http\Message\StreamInterface
{
    use GuzzleHttp\Psr7\StreamDecoratorTrait;
    private Psr\Http\Message\StreamInterface $stream;
    public array $reads = [];
    public int $closes = 0;
    public int $detaches = 0;
    public bool $seekable = true;
    public bool $readable = true;
    public bool $tellable = true;
    public string $failure = '';
    public int $shortRead = 8192;
    public function __construct(string $body)
    {
        $this->stream = GuzzleHttp\Psr7\Utils::streamFor($body);
    }
    public function __toString(): string
    {
        throw new RuntimeException('unbounded stringify');
    }
    public function getContents(): string
    {
        throw new RuntimeException('unbounded getContents');
    }
    public function isReadable(): bool
    {
        return $this->readable;
    }
    public function isSeekable(): bool
    {
        return $this->seekable;
    }
    public function tell(): int
    {
        if (!$this->tellable) {
            throw new RuntimeException('unknown position');
        }return $this->stream->tell();
    }
    public function rewind(): void
    {
        if ($this->failure === 'rewind') {
            throw new RuntimeException('rewind failed');
        }$this->stream->rewind();
    }
    public function read($length): string
    {
        $this->reads[] = $length;
        if ($this->failure === 'read') {
            throw new RuntimeException('read failed');
        }
        if ($this->failure === 'validation') {
            throw new ValidationException('must-not-leak', 'foreign_error', status:499);
        }
        if ($this->failure === 'empty') {
            return '';
        }
        if ($this->failure === 'over') {
            return str_repeat('x', $length + 1);
        }
        return $this->stream->read(min($length, $this->shortRead));
    }
    public function close(): void
    {
        $this->closes++;
        throw new RuntimeException('borrowed body closed');
    }
    public function detach()
    {
        $this->detaches++;
        throw new RuntimeException('borrowed body detached');
    }
    public function consume(): void
    {
        $this->stream->read(1);
    }
}
function boundedRequest(string $kind, mixed $body, array $lengths = []): object
{
    $signature = is_string($body) ? hash_hmac('sha256', $body, 'secret') : '';
    if ($kind === 'psr') {
        $request = new BoundPsr('POST', 'http://example.test/webhook', ['x-webhook-signature' => $signature], $body);
        $request->declaredLengths = $lengths;
        return $request;
    }
    $class = $kind === 'symfony' ? BoundSymfony::class : BoundLaravel::class;
    $request = new $class([], [], [], [], [], ['REQUEST_METHOD' => 'POST'], $body);
    $request->headers->set('x-webhook-signature', $signature);
    if ($lengths !== []) {
        $request->headers->set('content-length', $lengths);
    }
    return $request;
}
function boundedVerify(string $kind, object $request, ?int $limit = null): Polymorfa\WebhookEvent
{
    $method = match ($kind) {
        'symfony' => 'fromSymfony','laravel' => 'fromLaravel',default => 'fromPsr'
    };
    return $limit === null ? WebhookRequest::$method($request, 'secret') : WebhookRequest::$method($request, 'secret', $limit);
}
$boundedRaw = '{ "id":"bounded","session":"synthetic","timestamp":"2026-10-17T00:00:00Z","event":"future.event","payload":{"x":1}}';
foreach (['symfony','laravel','psr'] as $kind) {
    $request = boundedRequest($kind, $boundedRaw, ['999999999999999999999999999999999999']);
    webhookBoundError(fn () => boundedVerify($kind, $request, 200), 'webhook_body_too_large', 413);
    webhookBoundCheck($request->acquisitions === ($kind === 'psr' ? 0 : []), 'declared oversize acquired body');
    foreach ([0,-1] as $limit) {
        $request = boundedRequest($kind, $boundedRaw);
        try {
            boundedVerify($kind, $request, $limit);
            throw new RuntimeException('invalid limit accepted');
        } catch (ConfigurationException $e) {
            webhookBoundCheck($e->field === 'maxBodyBytes', 'limit field');
        }
        webhookBoundCheck($request->acquisitions === ($kind === 'psr' ? 0 : []), 'invalid limit acquired body');
    }
    foreach (['','+1','-1',' 1','1 ','1.0','1e2','1,1',"1\0",'١'] as $length) {
        $request = boundedRequest($kind, $boundedRaw, [$length]);
        webhookBoundError(fn () => boundedVerify($kind, $request), 'invalid_content_length', 400, $kind.' '.json_encode($length ?? 'duplicates'));
        webhookBoundCheck($request->acquisitions === ($kind === 'psr' ? 0 : []), 'bad length acquired body');
    }
    $request = boundedRequest($kind, $boundedRaw, ['1','1']);
    webhookBoundError(fn () => boundedVerify($kind, $request), 'invalid_content_length', 400, $kind.' '.json_encode($length ?? 'duplicates'));
    foreach ([[],['0'],['1'],[str_repeat('0', 40).strlen($boundedRaw)]] as $lengths) {
        $request = boundedRequest($kind, $boundedRaw, $lengths);
        webhookBoundCheck(boundedVerify($kind, $request, strlen($boundedRaw))->id === 'bounded', 'actual bytes authoritative and exact MAC');
        $request = boundedRequest($kind, $boundedRaw, $lengths);
        // Known declared oversize or the detection byte must win before HMAC.
        if ($kind === 'psr') {
            $request = $request->withHeader('x-webhook-signature', 'invalid');
        } else {
            $request->headers->set('x-webhook-signature', 'invalid');
        }
        webhookBoundError(fn () => boundedVerify($kind, $request, strlen($boundedRaw) - 1), 'webhook_body_too_large', 413);
    }
    foreach ([199,200,201,1048575,1048576,1048577] as $size) {
        $body = $boundedRaw.str_repeat(' ', $size - strlen($boundedRaw));
        foreach ([200,1048576] as $limit) {
            $request = boundedRequest($kind, $body);
            if ($size > $limit) {
                webhookBoundError(fn () => boundedVerify($kind, $request, $limit), 'webhook_body_too_large', 413);
            } else {
                webhookBoundCheck(boundedVerify($kind, $request, $limit)->id === 'bounded', 'max boundary');
            }
        }
    }
    webhookBoundCheck(boundedVerify($kind, boundedRequest($kind, $boundedRaw), PHP_INT_MAX)->id === 'bounded', 'PHP_INT_MAX safe arithmetic');
    webhookBoundCheck(boundedVerify($kind, boundedRequest($kind, $boundedRaw))->known === false, 'old two-argument default and unknown event');
    $defaultOversize = $boundedRaw.str_repeat(' ', 1048577 - strlen($boundedRaw));
    webhookBoundError(fn () => boundedVerify($kind, boundedRequest($kind, $defaultOversize)), 'webhook_body_too_large', 413);
    $request = boundedRequest($kind, $boundedRaw.' ');
    if ($kind === 'psr') {
        $request = $request->withHeader('x-webhook-signature', hash_hmac('sha256', $boundedRaw, 'secret'));
    } else {
        $request->headers->set('x-webhook-signature', hash_hmac('sha256', $boundedRaw, 'secret'));
    }
    try {
        boundedVerify($kind, $request);
        throw new RuntimeException('changed whitespace accepted');
    } catch (WebhookSignatureException) {
    }
    foreach (["\xff",'{'] as $bad) {
        $request = boundedRequest($kind, $bad);
        try {
            boundedVerify($kind, $request);
            throw new RuntimeException('bad JSON accepted');
        } catch (ValidationException $e) {
            webhookBoundCheck($e->errorCode === 'invalid_webhook_json', 'native JSON error retained');
        }
    }
}
foreach (['short','nonseekable','rewound','consumed','unknown','unreadable','read','validation','empty','over','rewind'] as $mode) {
    $stream = new BoundStream($boundedRaw);
    $stream->shortRead = $mode === 'short' ? 1 : 8192;
    $stream->seekable = !in_array($mode, ['nonseekable','consumed','unknown'], true);
    $stream->tellable = $mode !== 'unknown';
    $stream->readable = $mode !== 'unreadable';
    if (in_array($mode, ['consumed','rewound'], true)) {
        $stream->consume();
    }
    if (in_array($mode, ['read','validation','empty','over','rewind'], true)) {
        $stream->failure = $mode;
    }
    $request = boundedRequest('psr', $stream)->withHeader('x-webhook-signature', hash_hmac('sha256', $boundedRaw, 'secret'));
    if (in_array($mode, ['short','nonseekable','rewound'], true)) {
        webhookBoundCheck(boundedVerify('psr', $request, strlen($boundedRaw))->id === 'bounded', 'bounded short/nonseekable reads');
    } else {
        webhookBoundError(fn () => boundedVerify('psr', $request), 'invalid_webhook_body', 400);
    }
    webhookBoundCheck(!$stream->reads || max($stream->reads) <= 8192, 'read chunk bound');
    webhookBoundCheck($stream->closes === 0 && $stream->detaches === 0, 'borrowed PSR ownership');
}
foreach (['symfony','laravel'] as $kind) {
    foreach (['seekable','nonseekable','consumed','empty'] as $mode) {
        $pair = null;
        if ($mode === 'seekable') {
            $resource = fopen('php://temp', 'w+');
            fwrite($resource, $boundedRaw);
            fseek($resource, 5);
        } else {
            $pair = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
            $resource = $pair[1];
            if ($mode !== 'empty') {
                fwrite($pair[0], $boundedRaw);
                fclose($pair[0]);
                $pair[0] = null;
            } else {
                stream_set_blocking($resource, false);
            }if ($mode === 'consumed') {
                fread($resource, 1);
            }
        }
        try {
            $request = boundedRequest($kind, $resource);
            $request->headers->set('x-webhook-signature', hash_hmac('sha256', $boundedRaw, 'secret'));
            if (in_array($mode, ['seekable','nonseekable'], true)) {
                webhookBoundCheck(boundedVerify($kind, $request)->id === 'bounded', 'resource bounded full body');
            } else {
                webhookBoundError(fn () => boundedVerify($kind, $request), 'invalid_webhook_body', 400);
            }
            webhookBoundCheck(is_resource($resource), 'borrowed resource closed');
            webhookBoundCheck($request->acquisitions === [true], 'resource mode only');
        } finally {
            fclose($resource);
            if ($pair !== null && is_resource($pair[0])) {
                fclose($pair[0]);
            }
        }
    }
}
webhookBoundCheck(WebhookRequest::DEFAULT_MAX_BODY_BYTES === 1048576, 'shared default');
// Real Laravel JSON construction can already read/parse before a controller helper.
$base = boundedRequest('symfony', $boundedRaw, [(string)strlen($boundedRaw)]);
$base->headers->set('content-type', 'application/json');
$captured = BoundLaravel::createFromBase($base);
webhookBoundCheck($base->acquisitions !== [] || in_array(false, $captured->acquisitions, true), 'actual Laravel capture prebuffers');
webhookBoundCheck(boundedVerify('laravel', $captured)->id === 'bounded', 'capture compatibility');
echo "Bounded actual Symfony/Laravel/PSR objects: limits, exact length grammar, bounded reads, failures, byte HMAC and borrowed ownership passed. Laravel prebuffering remains outside adapter control.\n";
