<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use GuzzleHttp\{Client,ClientInterface};
use GuzzleHttp\Exception\TransferException;
use Polymorfa\{ApiResponse,CancellationToken,CancelledException,ConfigurationException,ConnectionException,CursorPage,HttpTransport,NotFoundException,RequestOptions,ServerException,TimeoutException,ValidationException,VoiceModels};

/**
 * @phpstan-import-type AudioBody from VoiceModels
 * @phpstan-import-type Asset from VoiceModels
 * @phpstan-import-type UploadCreated from VoiceModels
 * @phpstan-import-type Preview from VoiceModels
 * @phpstan-import-type Deleted from VoiceModels
 * @phpstan-import-type ListParams from VoiceModels
 * @phpstan-import-type CreateUploadInput from VoiceModels
 * @phpstan-import-type SynthesizeInput from VoiceModels
 * @phpstan-import-type UpdateInput from VoiceModels
 */
final class VoiceAudio extends PlatformResource
{
    private const PATH = '/platform/voice/audio';
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null, private readonly bool $confineById = false, private readonly ?ClientInterface $storage = null)
    {
        parent::__construct($transport, '/platform');
        $this->server();
    }
    /** @param ListParams $params
     * @return CursorPage<Asset> */
    public function list(?string $projectId = null, array $params = [], ?RequestOptions $options = null): CursorPage
    { /** @var CursorPage<Asset> */ return $this->page(self::PATH, ['projectId' => $this->project($projectId)] + $params, $options);
    }
    /** @param CreateUploadInput $input
     * @return ApiResponse<UploadCreated> */
    public function createUpload(array $input, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<UploadCreated> */ return $this->unwrapped('POST', self::PATH, array_replace($input, ['projectId' => $this->project($projectId)]), options:$options);
    }
    /** @param SynthesizeInput $input
     * @return ApiResponse<Asset> */
    public function synthesize(array $input, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Asset> */ return $this->unwrapped('POST', self::PATH.'/tts', array_replace($input, ['projectId' => $this->project($projectId)]), options:$options);
    }
    /** @return ApiResponse<Asset> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Asset> $r */ $r = $this->unwrapped('GET', self::path($id), options:$options);
        $this->assertProject($r->data['projectId']);
        return $r;
    }
    /** @return ApiResponse<Asset> */
    public function complete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<Asset> */ return $this->unwrapped('POST', self::path($id).'/complete', options:$options);
    }
    /** @param UpdateInput $input
     * @return ApiResponse<Asset> */
    public function update(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<Asset> */ return $this->unwrapped('PATCH', self::path($id), (object)$input, options:$options);
    }
    /** @return ApiResponse<Deleted> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<Deleted> */ return $this->unwrapped('DELETE', self::path($id), options:$options);
    }
    /** @return ApiResponse<Preview> */
    public function previewUrl(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<Preview> */ return $this->unwrapped('GET', self::path($id).'/preview', options:$options);
    }
    /** Durations are in seconds; failed assets are terminal results.
     * @return ApiResponse<Asset> */
    public function waitUntilReady(string $id, float $timeout = 120, float $interval = 2, ?CancellationToken $cancellation = null, ?RequestOptions $options = null): ApiResponse
    {
        if (!is_finite($timeout) || !is_finite($interval) || $timeout < 0 || $interval < 0) {
            throw new ConfigurationException('wait');
        }
        $options ??= new RequestOptions();
        $caller = CancellationToken::linked(...array_values(array_filter([$options->cancellation,$cancellation])));
        $deadline = microtime(true) + $timeout;
        $budget = CancellationToken::linked($caller, CancellationToken::after($timeout));
        while (true) {
            $caller->throwIfCancelled();
            $left = $deadline - microtime(true);
            if ($left <= 0) {
                throw new TimeoutException('Audio asset processing timed out.', 'request_timeout');
            }
            try {
                $r = $this->retrieve($id, new RequestOptions(min($options->timeout ?? 30, $left), $options->maxNetworkRetries, $options->apiVersion, $options->idempotencyKey, $options->headers, $budget));
            } catch (CancelledException $e) {
                if (!$caller->isCancelled() && microtime(true) >= $deadline) {
                    throw new TimeoutException('Audio asset processing timed out.', 'request_timeout');
                } throw $e;
            }
            if (microtime(true) >= $deadline) {
                throw new TimeoutException('Audio asset processing timed out.', 'request_timeout');
            }
            if (in_array($r->data['status'], ['ready','failed'], true)) {
                return $r;
            }
            $pause = min($interval, max(0, $deadline - microtime(true)));
            $until = microtime(true) + $pause;
            while (microtime(true) < $until) {
                $caller->throwIfCancelled();
                usleep((int)(min(0.02, $until - microtime(true)) * 1000000));
            }
        }
    }
    /** A string carries binary audio; streams are bounded and read before API admission.
     * @param CreateUploadInput $input
     * @param AudioBody $body
     * @return ApiResponse<Asset> */
    public function upload(array $input, mixed $body, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    {
        $options ??= new RequestOptions();
        $options->cancellation?->throwIfCancelled();
        self::validateUpload($input);
        $bytes = self::readAudioBody($body, $input['sizeBytes'], $options);
        if (strlen($bytes) !== $input['sizeBytes']) {
            throw new ValidationException('Audio upload size differs.', 'invalid_parameter');
        }
        $created = $this->createUpload($input, $projectId, $options);
        $upload = $created->data['upload'];
        self::validateTarget($upload, strlen($bytes));
        foreach ($upload['headers'] as $name => $value) {
            if (in_array(strtolower($name), ['authorization','cookie','host','proxy-authorization'], true) || strpbrk($name.$value, "\r\n") !== false) {
                throw new ServerException('Invalid audio upload header.', 'invalid_response');
            }
        }
        try {
            $http = $this->storage ?? new Client(['cookies' => false]);
            $response = $http->request('POST', $upload['url'], ['body' => $bytes,'headers' => $upload['headers'],'allow_redirects' => false,'http_errors' => false,'timeout' => $options->timeout ?? 30,'progress' => static function () use ($options): void {
                $options->cancellation?->throwIfCancelled();
            }]);
            $response->getBody()->close();
            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                throw new ServerException('Audio storage rejected the upload.', 'voice_upload_failed');
            }
        } catch (TransferException $e) {
            $options->cancellation?->throwIfCancelled();
            $context = $e instanceof \GuzzleHttp\Exception\RequestException ? $e->getHandlerContext() : [];
            if (($context['errno'] ?? null) === 28) {
                throw new TimeoutException('Audio upload timed out.', 'request_timeout');
            } throw new ConnectionException('Cannot reach audio storage.', 'connection_error');
        }
        /** @var ApiResponse<Asset> */ return $this->unwrapped('POST', self::path($created->data['asset']['id']).'/complete', options:self::withoutKey($options));
    }
    /** @param AudioBody $body */
    private static function readAudioBody(mixed $body, int $size, RequestOptions $options): string
    {
        if (is_string($body)) {
            return $body;
        }
        if (!is_resource($body)) {
            throw new ConfigurationException('body');
        }
        $meta = stream_get_meta_data($body);
        $blocked = $meta['blocked'];
        $changed = stream_set_blocking($body, false);
        $started = microtime(true);
        $bytes = '';
        try {
            while (!feof($body)) {
                $options->cancellation?->throwIfCancelled();
                if (microtime(true) - $started >= ($options->timeout ?? 30)) {
                    throw new TimeoutException('Audio input timed out.', 'request_timeout');
                } $part = fread($body, 65536);
                if ($part === false) {
                    throw new ConnectionException('Cannot read audio input.', 'connection_error');
                } if ($part === '') {
                    usleep(1000);
                    continue;
                } $bytes .= $part;
                if (strlen($bytes) > $size) {
                    throw new ValidationException('Audio upload size differs.', 'invalid_parameter');
                }
            } return $bytes;
        } finally {
            if ($changed) {
                stream_set_blocking($body, $blocked);
            }
        }
    }
    /** @param array<string,mixed> $input */
    private static function validateUpload(array $input): void
    {
        if (!isset($input['sizeBytes']) || !is_int($input['sizeBytes']) || $input['sizeBytes'] < 1 || $input['sizeBytes'] > 16777216 || !in_array($input['contentType'] ?? null, ['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/x-m4a'], true)) {
            throw new ValidationException('Invalid audio upload size or content type.', 'invalid_parameter');
        }
    }
    /** @param array<string,mixed> $upload */
    private static function validateTarget(array $upload, int $bytes): void
    {
        $value = $upload['url'] ?? null;
        $url = is_string($value) ? parse_url($value) : false;
        if ($url === false || ($url['scheme'] ?? '') !== 'https' || empty($url['host']) || isset($url['user']) || isset($url['pass']) || ($upload['method'] ?? null) !== 'POST' || !isset($upload['maxBytes']) || !is_int($upload['maxBytes']) || $upload['maxBytes'] < $bytes) {
            throw new ServerException('Invalid audio upload target.', 'invalid_response');
        }
    }
    private function project(?string $id): string
    {
        $id = $this->projectId ?? $id;
        if ($id === null || trim($id) === '') {
            throw new ConfigurationException('projectId');
        } return $id;
    }
    private static function path(string $id): string
    {
        if (trim($id) === '') {
            throw new ConfigurationException('assetId');
        } return self::PATH.'/'.self::segment($id);
    }
    private function assertProject(string $id): void
    {
        if ($this->projectId !== null && strtolower($id) !== strtolower($this->projectId)) {
            throw new NotFoundException('Audio asset not found.', 'resource_not_found', status:404);
        }
    }
    private function confine(string $id, ?RequestOptions $options): void
    {
        if ($this->confineById) {
            $this->retrieve($id, self::withoutKey($options ?? new RequestOptions()));
        }
    }
    private static function withoutKey(RequestOptions $o): RequestOptions
    {
        return new RequestOptions($o->timeout,$o->maxNetworkRetries,$o->apiVersion,null,$o->headers,$o->cancellation);
    }
}
