<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/vendor/autoload.php';

use GuzzleHttp\Psr7\{FnStream,PumpStream,Utils};
use Polymorfa\{CancellationToken,CancelledException,Credential,EncryptedUploadStream,MediaDescriptor,MediaEncryption,MediaIntegrityException,MessagingClient,RequestOptions,UploadWhatsAppMediaOptions,WhatsAppDownload,WhatsAppEncryptedUploadBody,WhatsAppMedia,WhatsAppMediaUploadTransport,WhatsAppUploadLocation};

function transportCheck(bool $value, string $label): void
{
    if (!$value) {
        throw new RuntimeException($label);
    }
}
function transportFails(Closure $call, string $code): Throwable
{
    try {
        $call();
    } catch (Throwable $error) {
        transportCheck($error instanceof Polymorfa\PolymorfaException && $error->errorCode === $code, 'expected '.$code.', got '.$error::class.':'.$error->getMessage());
        transportCheck($error->getPrevious() === null, 'failure retains no unsafe callback cause');
        return $error;
    }
    throw new RuntimeException('expected '.$code);
}
final readonly class TestEncryptedTransport implements WhatsAppMediaUploadTransport
{
    public function __construct(private Closure $callback, private string $label = 'customer-store')
    {
    }
    public function name(): string
    {
        return $this->label;
    }
    public function upload(string $session, WhatsAppEncryptedUploadBody $body): WhatsAppUploadLocation
    {
        return ($this->callback)($session, $body);
    }
}
$http = new GuzzleHttp\Client(['handler' => static function () {
    throw new RuntimeException('unexpected API dispatch');
}]);
$resource = (new MessagingClient(Credential::organizationApiKey('pmfa_'.str_repeat('a', 72)), http:$http))->whatsappMedia;
$plain = str_repeat('synthetic-data', 12000);
$key = str_repeat('k', 32);
$location = new WhatsAppUploadLocation('/synthetic', 'https://cdn.whatsapp.net/synthetic');
foreach (['image' => 'image/jpeg','video' => 'video/mp4','audio' => 'audio/ogg','document' => 'application/octet-stream','sticker' => 'image/webp'] as $kind => $mime) {
    $download = new WhatsAppDownload(Utils::streamFor(''), new MediaDescriptor($kind, $key));
    transportCheck($download->mimetype === $mime, 'contract MIME fallback '.$kind);
    $download->close();
}
// PumpStream can buffer the final verified chunk while the caller reads one byte.
$chunks = MediaEncryption::chunks(Utils::streamFor('tiny'), 'image', $key, 100);
foreach ($chunks as $_) {
}
$info = $chunks->getReturn();
$stream = new EncryptedUploadStream(Utils::streamFor('tiny'), $info, 100);
$stream->read(1);
transportFails(fn () => $stream->complete(), 'media_source_failed');
$stream->getContents();
$stream->complete();
$stream->close();
foreach (['success','partial','later-failure','open-failure','bad-offset','callback','cancel','invalid-location','abandoned','timeout','blocked'] as $mode) {
    $opened = $closed = 0;
    $held = null;
    $token = new CancellationToken();
    $source = static function () use (&$opened, &$closed, $plain, $mode) {
        $opened++;
        if ($mode === 'open-failure' && $opened === 3) {
            throw new RuntimeException('https://secret-source.invalid/token');
        }
        $value = $mode === 'later-failure' && $opened === 3 ? $plain.'changed' : $plain;
        $stream = Utils::streamFor($value);
        if ($mode === 'blocked' && $opened === 2) {
            $pending = true;
            $stream = new PumpStream(static function () use ($value, &$pending): string|false {
                if (!$pending) {
                    return false;
                }
                $pending = false;
                usleep(30000);
                return $value;
            });
        }
        $wasClosed = false;
        return FnStream::decorate($stream, ['close' => static function () use ($stream, &$closed, &$wasClosed): void {
            if (!$wasClosed) {
                $wasClosed = true;
                $closed++;
                $stream->close();
            }
        }]);
    };
    $transport = new TestEncryptedTransport(static function (string $session, WhatsAppEncryptedUploadBody $body) use ($mode, &$held, $plain, $key, $location, $token): WhatsAppUploadLocation {
        $held = $body;
        transportCheck($session === 'session' && $body->mediaType === 'image' && strlen($body->fileEncSha256) === 32, 'public encrypted metadata');
        transportCheck(!str_contains(print_r($body, true), $key) && !str_contains(json_encode($body), $key), 'body hides key/source');
        if ($mode === 'callback') {
            throw new RuntimeException('https://secret.invalid/?key='.$key);
        }
        if ($mode === 'partial') {
            $body->open()->read(1);
            return $location;
        }
        if ($mode === 'blocked') {
            try {
                $body->open()->getContents();
            } catch (Throwable) {
            }
            return $location;
        }
        $full = $body->open();
        $encrypted = $full->getContents();
        transportCheck(strlen($encrypted) === $body->encryptedLength && WhatsAppMedia::decrypt($encrypted, new MediaDescriptor('image', $key, fileEncSha256:$body->fileEncSha256)) === $plain, 'custom consumes authenticated ciphertext only');
        if ($mode === 'success') {
            $offset = 37;
            transportCheck($body->open($offset)->getContents() === substr($encrypted, $offset), 'offset repeats exact immutable encrypted stream');
            transportCheck($body->open($body->encryptedLength)->getContents() === '', 'EOF offset verifies complete repeat pass');
        }
        if (in_array($mode, ['later-failure','open-failure','bad-offset'], true)) {
            try {
                $body->open($mode === 'bad-offset' ? -1 : 0)->getContents();
            } catch (Throwable) {
                // A transport cannot suppress a later source/integrity failure.
            }
        }
        if ($mode === 'timeout') {
            usleep(30000);
        }
        if ($mode === 'cancel') {
            $token->cancel();
        }
        if ($mode === 'abandoned') {
            $body->open()->read(1);
        }
        return $mode === 'invalid-location' ? new WhatsAppUploadLocation('', '') : $location;
    });
    $options = new UploadWhatsAppMediaOptions('image', mediaKey:$key, requestOptions:new RequestOptions(timeout:in_array($mode, ['timeout','blocked'], true) ? 0.005 : 30, cancellation:$token), uploadTransport:$transport);
    $call = fn () => $resource->upload('session', $source, $options);
    if (in_array($mode, ['success','abandoned'], true)) {
        $result = $call();
        transportCheck($result->egress === 'customer-store' && $result->location === $location, 'custom result');
    } else {
        $code = match($mode) {
            'callback' => 'media_upload_transport_failed', 'cancel' => 'request_cancelled', 'invalid-location' => 'invalid_response', 'timeout','blocked' => 'request_timeout', default => 'media_upload_incomplete'
        };
        $error = transportFails($call, $code);
        transportCheck(!str_contains($error->getMessage(), 'secret.invalid') && !str_contains($error->getMessage(), $key), 'callback errors redacted');
    }
    transportCheck($closed === $opened - ($mode === 'open-failure' ? 1 : 0), 'all actual source streams closed '.$mode);
    transportFails(fn () => $held->open(), 'media_upload_closed');
}
// Wrap both existing builtins: real TLS fixture policy is reused, not reimplemented.
foreach (['relay','direct'] as $mode) {
    $process = proc_open([PHP_BINARY,__DIR__.'/media-upload-server.php',$mode,'image'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    transportCheck(is_resource($process), 'TLS upload fixture started');
    try {
        $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        [$host,$port] = explode(':', $fixture['address']);
        $handler = GuzzleHttp\HandlerStack::create();
        $http = new GuzzleHttp\Client(['handler' => static fn ($request, $options) => $handler($request->withUri($request->getUri()->withHost($host)->withPort((int)$port), true), $options), 'verify' => $fixture['ca'],'proxy' => '']);
        $resource = (new MessagingClient(Credential::organizationApiKey('pmfa_'.str_repeat('a', 72)), baseUrl:'https://api.fixture.invalid', http:$http))->whatsappMedia;
        $options = new UploadWhatsAppMediaOptions('image', mediaKey:$key, http:$http);
        $builtin = $resource->uploadTransport($mode, $options);
        $wrapper = new TestEncryptedTransport(static fn (string $session, WhatsAppEncryptedUploadBody $body): WhatsAppUploadLocation => $builtin->upload($session, $body));
        $result = $resource->uploadBytes('session', $plain, new UploadWhatsAppMediaOptions('image', mediaKey:$key, uploadTransport:$wrapper));
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        transportCheck($state['valid'] && $state['posts'] > 0 && WhatsAppMedia::decrypt(base64_decode($state['ciphertext'], true), new MediaDescriptor('image', $key, fileEncSha256:$result->info->fileEncSha256)) === $plain, 'wrapped builtin actual TLS '.$mode);
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }
        proc_close($process);
    }
}
echo "PHP encrypted upload transport: ciphertext/offset/EOF, buffered-byte barrier, sticky repeat failures, cancellation/cleanup/redaction, closed body and wrapped TLS relay/direct passed.\n";
