<?php

declare(strict_types=1);
require_once __DIR__.'/storage_engine.php';

use Polymorfa\{CancellationToken,CancelledException,ConfigurationException,ConnectionException,Credential,MediaDescriptor,MediaIntegrityException,MessagingClient,RequestOptions,S3ArchiveOptions,S3MediaStore,TimeoutException,UploadWhatsAppMediaOptions,WhatsAppMedia};
use GuzzleHttp\Psr7\{Response,Utils};

function s3Raises(callable $operation, string $type): Throwable
{
    try {
        $operation();
    } catch (Throwable $error) {
        storageCheck($error instanceof $type, 'expected '.$type.', got '.$error::class);
        return $error;
    } throw new RuntimeException('expected '.$type);
}
$autoload = getenv('POLYMORFA_STORAGE_PROVIDER_AUTOLOAD');
if ($autoload !== false && $autoload !== '') {
    require_once $autoload;
}
$metadata = getenv('POLYMORFA_S3_NATIVE_FIXTURE');
$scratch = getenv('POLYMORFA_S3_NATIVE_SCRATCH');
if ($metadata === false || $metadata === '' || $scratch === false || $scratch === '' || !class_exists(Aws\S3\S3Client::class)) {
    echo "PHP native S3 proof skipped: optional official client/MinIO/scratch not configured.\n";
    return;
}
$native = json_decode(file_get_contents($metadata), true, flags:JSON_THROW_ON_ERROR);
$s3 = new Aws\S3\S3Client(['version' => 'latest','region' => $native['region'],'endpoint' => $native['dockerEndpoint'] ?? $native['endpoint'],'use_path_style_endpoint' => true,'credentials' => ['key' => $native['accessKeyId'],'secret' => $native['secretAccessKey']],'retries' => 0]);
$bucket = 'php-s3-'.bin2hex(random_bytes(6));
$s3->createBucket(['Bucket' => $bucket]);
if (!is_dir($scratch)) {
    mkdir($scratch, 0700, true);
} $sentinel = $scratch.'/unrelated-sentinel';
file_put_contents($sentinel, 'preserve');
$phase = '';
$heads = $gets = $puts = 0;
$matches = [];
$change = false;
$changeKey = '';
$plain = '';
$cancel = null;
$s3->getHandlerList()->appendInit(static function (callable $next) use (&$phase, &$heads, &$gets, &$puts, &$matches, &$change, &$changeKey, &$plain, &$cancel, $s3, $bucket, $scratch): Closure {
    return static function ($command, $request = null) use ($next, &$phase, &$heads, &$gets, &$puts, &$matches, &$change, &$changeKey, &$plain, &$cancel, $s3, $bucket, $scratch) {
        if ($phase === 'upload') {
            if ($command->getName() === 'HeadObject') {
                $heads++;
            }
            if ($command->getName() === 'GetObject') {
                $gets++;
                $matches[] = $command['IfMatch'];
                if ($change && $gets === 2) {
                    $s3->putObject(['Bucket' => $bucket,'Key' => $changeKey,'Body' => str_repeat('x', strlen($plain))]);
                }
            }
        }
        if ($phase === 'archive' && $command->getName() === 'PutObject') {
            $puts++;
            $body = $command['Body'];
            $path = $body->getMetadata('uri');
            storageCheck(is_string($path) && str_starts_with($path, $scratch.'/polymorfa-s3-'), 'PUT body is owned private spool');
            storageCheck((fileperms($path) & 0777) === 0600 && (fileperms(dirname($path)) & 0777) === 0700, 'archive spool private modes');
            storageCheck($command['ContentLength'] === $body->getSize(), 'S3 PUT exact known length');
            storageCheck(!isset($command['Metadata']['media-key']) && !isset($command['Metadata']['mediaKey']), 'metadata never includes media key');
        }
        return $next($command, $request);
    };
}, 'synthetic_native_s3_proof');
try {
    foreach (['relay','direct','custom','document','changed'] as $mode) {
        $kind = in_array($mode, ['document','changed'], true) ? 'document' : 'image';
        $serverMode = in_array($mode, ['document','changed'], true) ? 'document' : ($mode === 'custom' ? 'relay' : $mode);
        $process = proc_open([PHP_BINARY,__DIR__.'/media-upload-server.php',$serverMode,$kind], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
        storageCheck(is_resource($process), 'native TLS upload fixture started');
        try {
            $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
            [$address,$port] = explode(':', $fixture['address']);
            $handler = GuzzleHttp\HandlerStack::create();
            $wire = static function ($request, $options) use ($handler, $address, $port) {
                storageCheck(in_array($request->getUri()->getHost(), ['api.fixture.invalid','cdn.whatsapp.net'], true), 'approved API/CDN fixture target');
                return $handler($request->withUri($request->getUri()->withHost($address)->withPort((int)$port), true), $options);
            };
            $http = new GuzzleHttp\Client(['handler' => $wire,'verify' => $fixture['ca'],'proxy' => '']);
            $client = new MessagingClient(Credential::organizationApiKey('pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), baseUrl:'https://api.fixture.invalid', http:$http);
            $plain = str_repeat(chr(56), $kind === 'document' ? 257 : 70003);
            $changeKey = 'media/source-'.$mode;
            $phase = '';
            $s3->putObject(['Bucket' => $bucket,'Key' => $changeKey,'Body' => $plain,'ContentType' => 'fixture/binary']);
            $store = new S3MediaStore($s3, $bucket, 'media/');
            $phase = 'upload';
            $heads = $gets = 0;
            $matches = [];
            $change = $mode === 'changed';
            $options = new UploadWhatsAppMediaOptions($kind, mediaKey:str_repeat(chr(31), 32), egress:$mode === 'relay' ? 'relay' : 'direct', requestOptions:new RequestOptions(timeout:10), http:$http, documentPartSize:$kind === 'document' ? 37 : 52428800);
            if ($mode === 'custom') {
                $options = new UploadWhatsAppMediaOptions($kind, mediaKey:str_repeat(chr(31), 32), uploadTransport:$client->whatsappMedia->uploadTransport('relay', $options));
            }
            if ($change) {
                $error = s3Raises(fn () => $store->uploadToWhatsApp($client->whatsappMedia, 'session', 'source-'.$mode, $options), MediaIntegrityException::class);
                storageCheck($error->getPrevious() === null && !str_contains($error->getMessage(), $native['secretAccessKey']), '412 source failure redacted');
            } else {
                $result = $store->uploadToWhatsApp($client->whatsappMedia, 'session', 'source-'.$mode, $options);
                storageCheck($result->info->fileLength === strlen($plain), 'native S3 upload plaintext length');
            }
            $phase = '';
            fwrite($pipes[0], "finish\n");
            $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
            storageCheck($state['valid'] && $heads === 1 && $gets === 2 && count(array_unique($matches)) === 1 && $matches[0] !== '', 'actual HEAD and two immutable IfMatch GETs with TLS upload');
            if ($change) {
                storageCheck($state['posts'] === 0 && $state['finals'] === 0, 'actual MinIO412 prevents upload/finalization');
            } else {
                storageCheck(WhatsAppMedia::decrypt(base64_decode($state['ciphertext'], true), new MediaDescriptor($kind, $result->info->mediaKey, fileSha256:$result->info->fileSha256, fileEncSha256:$result->info->fileEncSha256)) === $plain, 'actual MinIO to TLS upload authenticated roundtrip');
            }
        } finally {
            proc_terminate($process);
            foreach ($pipes as $pipe) {
                fclose($pipe);
            } proc_close($process);
        }
    }
    // Actual HEAD rejects an oversized object before any GET/API dispatch.
    $phase = '';
    $s3->putObject(['Bucket' => $bucket,'Key' => 'media/large','Body' => 'oversized']);
    $phase = 'upload';
    $heads = $gets = 0;
    $change = false;
    $apiCalls = 0;
    $noApi = new GuzzleHttp\Client(['handler' => static function () use (&$apiCalls) {
        $apiCalls++;
        throw new RuntimeException('No API dispatch expected.');
    }]);
    $messaging = new MessagingClient(Credential::organizationApiKey('pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), http:$noApi);
    $store = new S3MediaStore($s3, $bucket, 'media/');
    $error = s3Raises(fn () => $store->uploadToWhatsApp($messaging->whatsappMedia, 'session', 'large', new UploadWhatsAppMediaOptions('image', maxBytes:1)), MediaIntegrityException::class);
    storageCheck($error->errorCode === 'media_too_large' && $heads === 1 && $gets === 0 && $apiCalls === 0, 'HEAD length bound prevents source/API dispatch');
    $phase = '';
    $vectors = json_decode(file_get_contents(dirname(__DIR__, 3).'/contracts/fixtures/whatsapp-media.json'), true, flags:JSON_THROW_ON_ERROR)['fixtures'];
    $vector = $vectors[0];
    $descriptor = WhatsAppMedia::decode($vector['descriptor'], $vector['kind']);
    $encrypted = hex2bin($vector['encrypted']);
    $plaintext = hex2bin($vector['plaintext']);
    foreach (['good','missingmime','inputmutation','corrupt','length','cancel','metadata','secret','deadline','spool'] as $mode) {
        $phase = '';
        $key = 'media/archive-'.$mode;
        $s3->putObject(['Bucket' => $bucket,'Key' => $key,'Body' => 'previous']);
        $puts = 0;
        $phase = 'archive';
        $store = new S3MediaStore($s3, $bucket, 'media/');
        $token = new CancellationToken();
        $bytes = $encrypted;
        if ($mode === 'corrupt') {
            $bytes[strlen($bytes) - 1] = chr(ord($bytes[strlen($bytes) - 1]) ^ 1);
        }
        $input = $mode === 'length' ? new MediaDescriptor($descriptor->mediaKind, $descriptor->mediaKey, $descriptor->url, $descriptor->directPath, $descriptor->fileSha256, $descriptor->fileEncSha256, strlen($plaintext) + 1, $descriptor->mimetype, $descriptor->fileName) : $descriptor;
        if ($mode === 'missingmime') {
            $input = new MediaDescriptor($descriptor->mediaKind, $descriptor->mediaKey, $descriptor->url, $descriptor->directPath, $descriptor->fileSha256, $descriptor->fileEncSha256, $descriptor->fileLength, fileName:"name!'()*.jpg");
        }
        $immutable = false;
        $http = new GuzzleHttp\Client(['headers' => ['Authorization' => 'never-forward','Cookie' => 'never-forward'],'handler' => static function ($request, $options) use ($bytes, $mode, $token, $descriptor, &$immutable) {
            storageCheck(!$request->hasHeader('Authorization') && !$request->hasHeader('Cookie') && $options['allow_redirects'] === false, 'CDN excludes project and caller credentials');
            if ($mode === 'inputmutation') {
                try {
                    $descriptor->mediaKey[0] = 'x';
                } catch (Error) {
                    $immutable = true;
                }
            }
            if ($mode === 'cancel') {
                $token->cancel();
            } return GuzzleHttp\Promise\Create::promiseFor(new Response(200, ['Content-Length' => (string)strlen($bytes)], $bytes));
        }]);
        $extra = $mode === 'metadata' ? ['media-key' => 'blocked'] : ($mode === 'secret' ? ['note' => base64_encode($descriptor->mediaKey)] : ['purpose' => 'fixture']);
        $options = new S3ArchiveOptions('archive-'.$mode, $extra, $mode === 'spool' ? $scratch.'/missing' : $scratch, requestOptions:new RequestOptions(timeout:$mode === 'deadline' ? 0.000001 : 10, cancellation:$token), http:$http);
        if (in_array($mode, ['good','missingmime','inputmutation'], true)) {
            $result = $store->archive($input, $options);
            storageCheck($result->bytes === strlen($plaintext) && $puts === 1, 'verified private spool before actual MinIO PUT');
            $object = $s3->getObject(['Bucket' => $bucket,'Key' => $key]);
            storageCheck((string)$object['Body'] === $plaintext && $object['Metadata']['wa-file-sha256'] === bin2hex($descriptor->fileSha256), 'native archive content and safe metadata');
            if ($mode === 'missingmime') {
                storageCheck($object['ContentType'] === WhatsAppMedia::defaultMimeType($descriptor->mediaKind) && $object['Metadata']['wa-file-name'] === "name!'()*.jpg", 'missing MIME and canonical encodeURIComponent metadata');
            }
            if ($mode === 'inputmutation') {
                storageCheck($immutable, 'PHP readonly descriptor strings cannot be mutated during archive');
            }
        } else {
            $type = match($mode) {
                'corrupt','length' => MediaIntegrityException::class,'cancel' => CancelledException::class,'deadline' => TimeoutException::class,default => ConfigurationException::class
            };
            $error = s3Raises(fn () => $store->archive($input, $options), $type);
            storageCheck($puts === 0 && (string)$s3->getObject(['Bucket' => $bucket,'Key' => $key])['Body'] === 'previous', 'failed archive never overwrites valid object');
            storageCheck($error->getPrevious() === null && !str_contains($error->getMessage(), $native['secretAccessKey']), 'archive error excludes credentials/causes');
        }
        storageCheck(glob($scratch.'/polymorfa-s3-*') === [] && file_get_contents($sentinel) === 'preserve', 'only owned spool removed, unrelated file remains');
        storageCheck(json_encode($store) === '{"redacted":true}' && json_encode($options) === '{"redacted":true}' && !str_contains(print_r($store, true), $native['secretAccessKey']), 'store/options debug redacted');
        $store->close();
        storageCheck($s3->headObject(['Bucket' => $bucket,'Key' => $key])['ContentLength'] > 0, 'closing store preserves borrowed S3 client');
    }
    echo "PHP official S3/actual MinIO: HEAD+twoIfMatch GETs,TLS relay/direct/multipart,412 nofinalize,verified private archive,corrupt/length/cancel/deadline/metadata nooverwrite,spool/client ownership and redaction passed.\n";
} finally {
    $phase = '';
    foreach ($s3->listObjectsV2(['Bucket' => $bucket])['Contents'] ?? [] as $object) {
        $s3->deleteObject(['Bucket' => $bucket,'Key' => $object['Key']]);
    } $s3->deleteBucket(['Bucket' => $bucket]);
    if (is_file($sentinel)) {
        unlink($sentinel);
    }
}
