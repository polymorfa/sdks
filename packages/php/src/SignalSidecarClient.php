<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\{Client,ClientInterface};
use GuzzleHttp\Exception\TransferException;
use GuzzleHttp\Psr7\{FnStream,Request,Utils};
use Psr\Http\Message\{ResponseInterface,StreamInterface};

/** Customer application HTTP boundary; never imports or owns Signal core keys. */
final class SignalSidecarClient implements \JsonSerializable
{
    public const SOURCE_COMMIT = '8aa191ef0d4c318229c91bcdf474bf2d79dac47c';
    private readonly string $baseUrl;
    private readonly ClientInterface $http;
    public function __construct(string $url, #[\SensitiveParameter] private readonly string $secret, ?ClientInterface $http = null, private readonly float $timeout = 30)
    {
        $target = parse_url($url);
        if ($target === false || !isset($target['scheme'],$target['host']) || isset($target['user']) || isset($target['pass']) || isset($target['query']) || isset($target['fragment']) || !in_array($target['path'] ?? '', ['','/'], true) || !SignalCodec::secret($secret) || !is_finite($timeout) || $timeout <= 0) {
            throw new ConfigurationException('signalSidecar');
        }
        if ($target['scheme'] !== 'https' && ($target['scheme'] !== 'http' || !($target['host'] === 'localhost' || $target['host'] === '[::1]' || (filter_var($target['host'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false && str_starts_with($target['host'], '127.'))))) {
            throw new ConfigurationException('signalSidecar');
        }
        $this->baseUrl = rtrim($url, '/');
        $this->http = $http ?? new Client();
    }
    private static function refused(int $status): never
    {
        throw new SignalSidecarException('The Signal sidecar refused the request.', 'signal_sidecar_request_failed', $status);
    }
    /** @return array{ResponseInterface,string,float} */
    private function perform(string $method, string $path, mixed $body, bool $authenticated, bool $stream, ?CancellationToken $cancellation): array
    {
        $cancellation?->throwIfCancelled();
        try {
            $raw = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException) {
            throw new ConfigurationException('signalBody');
        }
        if (strlen($raw) > SignalCodec::MAX_BYTES) {
            throw new ConfigurationException('signalBody');
        }
        $headers = ['Accept' => $stream ? 'text/event-stream' : 'application/json'];
        if ($authenticated) {
            $headers['Authorization'] = 'Bearer '.$this->secret;
        }if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
        }
        $received = '';
        $deadline = microtime(true) + $this->timeout;
        $options = ['http_errors' => false,'allow_redirects' => false,'headers' => null,'auth' => null,'cookies' => false,'timeout' => $this->timeout,'read_timeout' => $stream ? 0.25 : $this->timeout,'stream' => $stream,'progress' => static function () use ($cancellation): void {
            $cancellation?->throwIfCancelled();
        }];
        if (!$stream) {
            $options['sink'] = FnStream::decorate(Utils::streamFor(''), ['write' => static function (string $part) use (&$received, $cancellation): int {
                $cancellation?->throwIfCancelled();
                if (strlen($received) + strlen($part) > SignalCodec::MAX_BYTES) {
                    SignalCodec::invalid();
                }$received .= $part;
                return strlen($part);
            }]);
        }
        try {
            $response = $this->http->send(new Request($method, $this->baseUrl.$path, $headers, $raw), $options);
        } catch (CancelledException $error) {
            throw $error;
        } catch (TransferException|\RuntimeException $error) {
            $cancellation?->throwIfCancelled();
            if ($error instanceof SignalSidecarException) {
                throw $error;
            }throw new SignalSidecarException('The Signal sidecar connection failed.', microtime(true) >= $deadline ? 'signal_sidecar_timeout' : 'signal_sidecar_connection_failed');
        }
        try {
            $cancellation?->throwIfCancelled();
        } catch (CancelledException $error) {
            $response->getBody()->close();
            throw $error;
        }
        return [$response,$received,$deadline];
    }
    /** @phpstan-impure */private static function ended(StreamInterface $stream): bool
    {
        return $stream->eof();
    }
    private function request(string $method, string $path, mixed $body, bool $authenticated, int $expected, ?CancellationToken $cancellation): string
    {
        [$response,$data,$deadline] = $this->perform($method, $path, $body, $authenticated, false, $cancellation);
        $source = $response->getBody();
        try {
            while (!self::ended($source)) {
                $cancellation?->throwIfCancelled();
                if (microtime(true) > $deadline) {
                    throw new SignalSidecarException('The Signal sidecar request timed out.', 'signal_sidecar_timeout');
                }$part = $source->read(min(65536, SignalCodec::MAX_BYTES + 1 - strlen($data)));
                $data .= $part;
                if (strlen($data) > SignalCodec::MAX_BYTES || ($part === '' && !self::ended($source))) {
                    SignalCodec::invalid();
                }
            }
        } catch (\RuntimeException $error) {
            $cancellation?->throwIfCancelled();
            if ($error instanceof SignalSidecarException) {
                throw $error;
            }throw new SignalSidecarException('The Signal sidecar body could not be read.', 'signal_sidecar_connection_failed');
        } finally {
            $source->close();
        }
        if ($response->getStatusCode() !== $expected) {
            self::refused($response->getStatusCode());
        }
        if ($expected !== 204 && strtolower(trim(explode(';', $response->getHeaderLine('Content-Type'))[0])) !== 'application/json') {
            SignalCodec::invalid();
        }
        return $data;
    }
    public function health(?CancellationToken $cancellation = null): void
    {
        $data = SignalCodec::object($this->request('GET', '/healthz', null, false, 200, $cancellation));
        if (($data['status'] ?? null) !== 'ok') {
            SignalCodec::invalid();
        }
    }
    public function sessions(?CancellationToken $cancellation = null): SignalSessions
    {
        $data = SignalCodec::object($this->request('GET', '/v1/sessions', null, true, 200, $cancellation));
        $id = SignalCodec::string($data, 'node_id');
        if ($id === '' || !isset($data['sessions']) || !is_array($data['sessions']) || !array_is_list($data['sessions'])) {
            SignalCodec::invalid();
        }$sessions = [];
        foreach ($data['sessions'] as $session) {
            if (!is_array($session) || array_is_list($session)) {
                SignalCodec::invalid();
            }$sessions[] = SignalSessionInfo::fromWire($session);
        }return new SignalSessions($id, $sessions);
    }
    public function send(string $session, SignalSendRequest $body, ?CancellationToken $cancellation = null): SignalSendOutcome
    {
        if ($session === '') {
            throw new ConfigurationException('session');
        }$data = SignalCodec::object($this->request('POST', '/v1/sessions/'.rawurlencode($session).'/messages', $body->toWire(), true, 200, $cancellation));
        $id = SignalCodec::string($data, 'message_id');
        if ($id === '') {
            SignalCodec::invalid();
        }return new SignalSendOutcome($id, SignalCodec::integer($data, 'server_timestamp'), SignalCodec::boolean($data, 'resent'));
    }
    /** Manual ACK after durable processing. Timeout/cancellation never undo it. */
    public function acknowledge(string $eventId, ?CancellationToken $cancellation = null): void
    {
        if ($eventId === '') {
            throw new ConfigurationException('eventId');
        }$this->request('POST', '/v1/events/'.rawurlencode($eventId).'/ack', null, true, 204, $cancellation);
    }
    /** One connection; no Last-Event-ID, cursor, auto reconnect or auto ACK. */
    public function events(?string $sessionId = null, ?CancellationToken $cancellation = null): SignalEventStream
    {
        $path = '/v1/events'.($sessionId === null || $sessionId === '' ? '' : '?session_id='.rawurlencode($sessionId));
        [$response] = $this->perform('GET', $path, null, true, true, $cancellation);
        if ($response->getStatusCode() !== 200) {
            $response->getBody()->close();
            self::refused($response->getStatusCode());
        }
        if (strtolower(trim(explode(';', $response->getHeaderLine('Content-Type'))[0])) !== 'text/event-stream') {
            $response->getBody()->close();
            SignalCodec::invalid();
        }
        return new SignalEventStream($response->getBody(), $sessionId, $cancellation);
    }
    /** @return array{redacted:true} */public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
