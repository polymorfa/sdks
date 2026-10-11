<?php

declare(strict_types=1);

namespace Polymorfa;

/** Server PCM/H.264 connection with credentials in the first frame only. */
final class MediaSocket
{
    private ?CallSocket $socket = null;
    private readonly string $url;
    /** @var \Closure(string,?string,float):CallSocket */
    private readonly \Closure $connector;
    public bool $connected = false;
    public int $sampleRate = 16000;
    public bool $video = false;
    /** @param callable(string,?string,float):CallSocket|null $connector */
    public function __construct(
        private readonly Credential $credential,
        string $callId,
        public readonly string $connectionId,
        private readonly ?string $participant = null,
        string $baseUrl = 'https://api.polymorfa.com',
        private readonly float $readyTimeout = 10,
        ?callable $connector = null
    ) {
        $parsed = parse_url($baseUrl);
        if ($parsed === false || !isset($parsed['host'],$parsed['scheme']) || !in_array($parsed['scheme'], ['http','https'], true)
            || isset($parsed['user']) || isset($parsed['pass']) || isset($parsed['query']) || isset($parsed['fragment'])
            || !in_array($parsed['path'] ?? '', ['','/'], true)
            || ($parsed['scheme'] === 'http' && !in_array($parsed['host'], ['localhost','127.0.0.1','[::1]'], true))
            || $callId === '' || !preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $connectionId) || $readyTimeout <= 0 || !is_finite($readyTimeout)
            || ($participant !== null && ($credential->kind === 'client_token' || !preg_match('/^[A-Za-z0-9._:@-]{1,128}$/D', $participant)))) {
            throw new ConfigurationException('mediaSocket');
        }
        $this->url = preg_replace('/^http/', 'ws', rtrim($baseUrl, '/')).'/voip/calls/'.rawurlencode($callId).'/media';
        $this->connector = \Closure::fromCallable($connector ?? static fn (string $url, ?string $protocol, float $timeout): CallSocket => new NativeCallSocket($url, $protocol, $timeout));
    }
    public function connect(): void
    {
        if ($this->connected) {
            return;
        }
        try {
            $this->socket = ($this->connector)($this->url, 'pmfa.calls.v2', $this->readyTimeout);
            $auth = ['type' => 'auth','token' => substr($this->credential->authorization(), 7),'connectionId' => $this->connectionId];
            if ($this->participant !== null) {
                $auth['participant'] = $this->participant;
            }
            $this->socket->send(json_encode($auth, JSON_THROW_ON_ERROR));
            $deadline = microtime(true) + $this->readyTimeout;
            while (microtime(true) < $deadline) {
                $received = $this->socket->receive();
                if ($received['binary']) {
                    continue;
                }
                $control = json_decode($received['data'], true);
                if (!is_array($control)) {
                    continue;
                }
                if (($control['type'] ?? '') === 'error') {
                    $code = is_string($control['code'] ?? null) ? $control['code'] : 'connection_error';
                    if ($code === 'call_claimed') {
                        throw new ConflictException('Call claimed by another participant.', $code);
                    }
                    throw new AuthorizationException('Call media connection refused.', $code);
                }
                if (($control['type'] ?? '') === 'ready') {
                    if (!is_int($control['sampleRate'] ?? null) || $control['sampleRate'] <= 0 || !is_bool($control['video'] ?? null)) {
                        throw new ServerException('Invalid media ready frame.', 'invalid_response');
                    }
                    $this->sampleRate = $control['sampleRate'];
                    $this->video = $control['video'];
                    $this->connected = true;
                    return;
                }
            }
            throw new TimeoutException('Call media readiness timed out.', 'request_timeout');
        } catch (PolymorfaException $error) {
            $this->close();
            throw $error;
        } catch (\Throwable) {
            $this->close();
            throw new ConnectionException('Call media connection failed.', 'connection_error');
        }
    }
    /** @param list<int> $samples */
    public static function encodeAudio(array $samples): string
    {
        $bytes = "\x01";
        foreach ($samples as $sample) {
            if ($sample < -32768 || $sample > 32767) {
                throw new ValidationException('Audio samples must be signed16-bit integers.');
            }
            $bytes .= pack('v', $sample & 65535);
        }
        return $bytes;
    }
    public static function encodeVideo(VideoFrame $frame): string
    {
        if ($frame->data === '' || $frame->timestampUs < 0 || $frame->timestampUs > 9007199254740991 || $frame->source < 0 || $frame->source > 4294967295) {
            throw new ValidationException('Invalid video frame.');
        }
        return "\x02".pack('CCNJ', 1, $frame->keyframe ? 1 : 0, $frame->source, $frame->timestampUs).$frame->data;
    }
    public static function decodeFrame(string $bytes): AudioFrame|VideoFrame|null
    {
        if ($bytes === '') {
            return null;
        }
        if (ord($bytes[0]) === 1 && (strlen($bytes) - 1) % 2 === 0) {
            $samples = [];
            for ($i = 1;$i < strlen($bytes);$i += 2) {
                $value = ord($bytes[$i]) | (ord($bytes[$i + 1]) << 8);
                $samples[] = $value >= 32768 ? $value - 65536 : $value;
            }
            return new AudioFrame($samples);
        }
        if (ord($bytes[0]) === 2 && strlen($bytes) > 15 && ord($bytes[1]) === 1) {
            $values = unpack('Nsource/Jtimestamp', substr($bytes, 3, 12));
            if ($values === false || !is_int($values['source']) || !is_int($values['timestamp']) || $values['timestamp'] < 0) {
                return null;
            }
            return new VideoFrame(substr($bytes, 15), $values['timestamp'], (ord($bytes[2]) & 1) !== 0, $values['source']);
        }
        return null;
    }
    /** @param list<int> $samples */
    public function sendAudio(array $samples): void
    {
        $this->attached()->send(self::encodeAudio($samples), true);
    }
    public function sendVideo(VideoFrame $frame): void
    {
        $this->attached()->send(self::encodeVideo($frame), true);
    }
    /** @param array<string,mixed> $frame */
    public function sendControl(array $frame): void
    {
        $this->attached()->send(json_encode($frame, JSON_THROW_ON_ERROR));
    }
    /** @return AudioFrame|VideoFrame|array<string,mixed> */
    public function receive(): AudioFrame|VideoFrame|array
    {
        while (true) {
            $received = $this->attached()->receive();
            if ($received['binary']) {
                $frame = self::decodeFrame($received['data']);
                if ($frame !== null) {
                    return $frame;
                }
            } else {
                $control = json_decode($received['data'], true);
                if (is_array($control) && !array_is_list($control)) {
                    /** @var array<string,mixed> $control */
                    return $control;
                }
            }
        }
    }
    public function ping(): void
    {
        $this->sendControl(['type' => 'ping']);
    }
    public function leave(): void
    {
        $this->sendControl(['type' => 'leave']);
        $this->close();
    }
    public function close(): void
    {
        $this->connected = false;
        if ($this->socket !== null) {
            try {
                $this->socket->close();
            } catch (\Throwable) {
            } $this->socket = null;
        }
    }
    private function attached(): CallSocket
    {
        if (!$this->connected || $this->socket === null) {
            throw new ConfigurationException('connection');
        }
        return $this->socket;
    }
}
