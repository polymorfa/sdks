<?php

declare(strict_types=1);

namespace Polymorfa;

/** One call. connectionId survives media reconnects; confirmed preferences are restored. */
final class Call
{
    public readonly string $connectionId;
    public readonly float $startedAt;
    public readonly string $session;
    public string $state;
    public ?string $endReason = null;
    public bool $answered = false;
    public ?string $answeredBy = null;
    public bool $exclusive = false;
    public bool $claimedByOther = false;
    public bool $canJoin = false;
    public bool $audioMuted = false;
    public bool $videoEnabled = false;
    public bool $screenSharing = false;
    public bool $handRaised = false;
    public ?bool $remoteAudioMuted = null;
    /** @var array{video:bool,invite:bool} */ public array $capabilities = ['video' => true,'invite' => true];
    public bool $handSupported = false;
    public int $sampleRate = 16000;
    public int $reconnects = 0;
    public ?float $connectedAt = null;
    public ?float $endedAt = null;
    /** @var array<string,CallParticipant> */ public array $participants = [];
    /** @var array<int,CallVideoSource> */ public array $videoSources = [];
    private ?MediaSocket $media = null;
    private bool $acceptedLocally = false;
    private bool $claimedBySelf = false;
    private bool $mediaBusy = false;
    private bool $refreshNext = false;
    private int $reattachAttempts = 0;
    private float $retryAt = 0;
    private float $beatAt = 0;
    private bool $awaitingPong = false;
    /** @var array{audioMuted:bool,videoEnabled:bool,screenSharing:bool}|null */ private ?array $confirmedPreferences = null;
    private ?CallReporter $reporter = null;
    public function __construct(
        private readonly CallsClient $client,
        public readonly string $id,
        public readonly string $direction,
        public readonly string $peer,
        public readonly bool $offeredVideo,
        bool $exclusive = false
    ) {
        $this->startedAt = microtime(true);
        $this->session = $client->session() ?? '';
        $this->connectionId = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
        $this->state = $direction === 'inbound' ? 'incoming' : 'ringing';
        $this->claimedBySelf = $exclusive;
        $this->exclusive = $exclusive;
    }
    public function answer(bool $exclusive = false, ?bool $video = null, ?CancellationToken $cancellation = null): void
    {
        $cancellation?->throwIfCancelled();
        if ($this->direction !== 'inbound' || $this->state !== 'incoming' || $this->claimedByOther) {
            throw new ConflictException('Call cannot be answered.', 'call_claimed');
        }
        $body = ['exclusive' => $exclusive,'video' => $video ?? $this->offeredVideo];
        $participant = $this->client->serverParticipant();
        if ($participant !== null) {
            $body['participant'] = $participant;
        }
        $this->transition('connecting');
        try {
            $reply = $this->client->api($cancellation)->accept($this->id, $body, (new RequestOptions(cancellation:$cancellation))->withIdempotencyKey());
            $this->acceptedLocally = true;
            $this->claimedBySelf = $reply->data['data']['exclusive'];
            if ($this->state === 'ended') {
                try {
                    if ($this->claimedBySelf) {
                        $this->client->api()->end($this->id, new RequestOptions(timeout:5, maxNetworkRetries:0));
                    } else {
                        $this->client->api()->leave($this->id, $this->connectionId, $this->client->serverParticipant(), new RequestOptions(timeout:5, maxNetworkRetries:0));
                    }
                } catch (\Throwable) {
                } throw new CancelledException('Call was disconnected while acceptance was pending.', 'request_cancelled');
            }
            $this->answered = $reply->data['data']['answered'];
            $this->answeredBy = $reply->data['data']['answeredBy'];
            $this->exclusive = $reply->data['data']['exclusive'];
            $this->videoEnabled = $body['video'];
            $this->attach($cancellation);
        } catch (\Throwable $error) {
            if (!$this->acceptedLocally && $this->state !== 'ended') {
                if ($error instanceof ConflictException && $error->errorCode === 'call_claimed') {
                    $this->answered = true;
                    $this->exclusive = true;
                    $this->claimedByOther = true;
                }
                $this->state = 'incoming';
            } elseif ($this->state !== 'ended') {
                $this->releaseAfterFailure();
            } throw $error;
        }
    }
    public function join(?bool $video = null, ?CancellationToken $cancellation = null): void
    {
        if (!$this->canJoin || $this->claimedByOther) {
            throw new ConflictException('Call cannot be joined.', 'call_claimed');
        }
        $this->answer(false, $video, $cancellation);
    }
    public function reject(?CancellationToken $cancellation = null): void
    {
        if ($this->direction !== 'inbound' || $this->state !== 'incoming' || $this->answered) {
            throw new ConflictException('Call cannot be rejected.', 'call_claimed');
        }
        $this->client->api($cancellation)->reject($this->id, $this->client->serverParticipant(), (new RequestOptions(cancellation:$cancellation))->withIdempotencyKey());
        $this->finish('rejected');
    }
    public function leave(?CancellationToken $cancellation = null): void
    {
        if ($this->state === 'ended') {
            return;
        }
        if ($this->direction === 'outbound' && $this->state === 'ringing') {
            $this->end($cancellation);
            return;
        }
        if (!$this->acceptedLocally) {
            $this->finish('left');
            return;
        }
        $this->client->api($cancellation)->leave($this->id, $this->connectionId, $this->client->serverParticipant(), (new RequestOptions(cancellation:$cancellation))->withIdempotencyKey());
        $this->finish('left');
    }
    public function end(?CancellationToken $cancellation = null): void
    {
        if ($this->state === 'ended') {
            return;
        }
        $this->client->api($cancellation)->end($this->id, (new RequestOptions(cancellation:$cancellation))->withIdempotencyKey());
        $this->finish('hangup');
    }
    public function invite(string $to, ?CancellationToken $cancellation = null): void
    {
        $this->live();
        if (!$this->capabilities['invite']) {
            throw new ConflictException('Invitations are unavailable.', 'call_restricted');
        } $this->client->api($cancellation)->addParticipant($this->id, $to, (new RequestOptions(cancellation:$cancellation))->withIdempotencyKey());
    }
    public function ring(string $to, ?CancellationToken $cancellation = null): void
    {
        $this->live();
        $this->client->api($cancellation)->ringParticipant($this->id, $to, (new RequestOptions(cancellation:$cancellation))->withoutRetries());
    }
    public function sendReaction(string $emoji, ?CancellationToken $cancellation = null): void
    {
        if (!in_array($emoji, ['','👍','❤️','😂','😮','😢','🙏'], true)) {
            throw new ValidationException('Invalid call reaction.');
        }
        $this->live();
        $body = ['connectionId' => $this->connectionId,'emoji' => $emoji];
        $participant = $this->client->serverParticipant();
        if ($participant !== null) {
            $body['participant'] = $participant;
        }
        $this->client->api($cancellation)->sendReaction($this->id, $body, new RequestOptions(cancellation:$cancellation));
    }
    public function setHandRaised(bool $raised, ?CancellationToken $cancellation = null): void
    {
        $this->live();
        $body = ['connectionId' => $this->connectionId,'raised' => $raised];
        $participant = $this->client->serverParticipant();
        if ($participant !== null) {
            $body['participant'] = $participant;
        }
        $this->client->api($cancellation)->setHandRaised($this->id, $body, new RequestOptions(cancellation:$cancellation));
        $this->handRaised = $raised;
    }
    /** @param list<int> $samples */ public function writeAudio(array $samples): void
    {
        $this->attached()->sendAudio($samples);
    }
    public function writeVideo(VideoFrame $frame): void
    {
        $this->attached()->sendVideo(new VideoFrame($frame->data, $frame->timestampUs, $frame->keyframe, 0));
    }
    public function setMediaState(?bool $audioMuted = null, ?bool $videoEnabled = null, ?bool $screenSharing = null, ?CancellationToken $cancellation = null): void
    {
        $cancellation?->throwIfCancelled();
        if ($audioMuted === null && $videoEnabled === null && $screenSharing === null) {
            throw new ValidationException('Provide a media preference.');
        }
        if ($this->mediaBusy) {
            throw new ConflictException('A media command is pending.', 'media_control_unavailable');
        }
        $media = $this->attached();
        $this->mediaBusy = true;
        try {
            $id = bin2hex(random_bytes(12));
            $request = ['type' => 'media_state','requestId' => $id];
            foreach (['audioMuted' => $audioMuted,'videoEnabled' => $videoEnabled,'screenSharing' => $screenSharing] as $key => $value) {
                if ($value !== null) {
                    $request[$key] = $value;
                }
            }
            $media->sendControl($request);
            $deadline = microtime(true) + $this->client->options->controlTimeout;
            while (microtime(true) < $deadline) {
                $cancellation?->throwIfCancelled();
                $frame = $media->poll(min(0.1, max(0.001, $deadline - microtime(true))));
                if (is_array($frame) && ($frame['requestId'] ?? null) === $id) {
                    if (($frame['type'] ?? null) === 'media_error') {
                        throw new ConflictException('Media preference refused.', is_string($frame['code'] ?? null) ? $frame['code'] : 'media_control_unavailable');
                    }
                    if (($frame['type'] ?? null) === 'media_state' && is_bool($frame['audioMuted'] ?? null) && is_bool($frame['videoEnabled'] ?? null)) {
                        $this->audioMuted = $frame['audioMuted'];
                        $this->videoEnabled = $frame['videoEnabled'];
                        $this->screenSharing = ($frame['screenSharing'] ?? false) === true;
                        $this->confirmedPreferences = ['audioMuted' => $this->audioMuted,'videoEnabled' => $this->videoEnabled,'screenSharing' => $this->screenSharing];
                        return;
                    }
                    throw new ServerException('Invalid media acknowledgement.', 'invalid_response');
                }
                if ($frame !== null) {
                    $this->mediaFrame($frame);
                }
            }
            throw new TimeoutException('Media acknowledgement timed out; its effect is unknown.', 'media_control_timeout');
        } finally {
            $this->mediaBusy = false;
        }
    }
    /** @param array<string,mixed> $payload @internal */ public function lifecycle(string $event, array $payload): void
    {
        if ($this->state === 'ended') {
            return;
        }
        if (is_array($payload['capabilities'] ?? null)) {
            foreach (['video','invite'] as $key) {
                if (is_bool($payload['capabilities'][$key] ?? null)) {
                    $this->capabilities[$key] = $payload['capabilities'][$key];
                }
            }
        }
        if ($event === 'call.accepted') {
            $this->answered = true;
            $this->answeredBy = is_string($payload['answeredBy'] ?? null) ? $payload['answeredBy'] : null;
            $this->exclusive = ($payload['exclusive'] ?? false) === true || $this->claimedBySelf;
            $self = $this->client->participant;
            $this->claimedByOther = $this->direction === 'inbound' && !$this->acceptedLocally && $this->state !== 'connecting' && $this->exclusive && ($this->answeredBy === null || $this->answeredBy !== $self);
            $this->canJoin = !$this->exclusive && !$this->acceptedLocally;
            if (!$this->claimedByOther && $this->direction === 'outbound' && $this->state === 'ringing') {
                $this->acceptedLocally = true;
                $this->videoEnabled = $this->offeredVideo;
                try {
                    $this->attach();
                } catch (\Throwable) {
                    $this->releaseAfterFailure();
                }
            }
            $this->client->emit(new CallsEvent('claim', $this));
        } elseif ($event === 'call.missed' || $event === 'call.rejected') {
            $this->finish($event === 'call.missed' ? 'missed' : 'rejected');
        } elseif (in_array($event, ['call.participant_joined','call.participant_state','call.participant_left'], true) && ($payload['callId'] ?? null) === $this->id) {
            $this->mediaFrame(['type' => substr($event, 5)] + $payload);
        } elseif ($event === 'call.ended') {
            $reason = is_string($payload['reason'] ?? null) ? $payload['reason'] : 'unknown';
            if ($reason === 'user_hangup') {
                $reason = 'remote_hangup';
            } elseif ($reason === 'media_timeout' || $reason === 'setup_timeout') {
                $reason = 'timeout';
            }
            $this->finish(in_array($reason, ['hangup','left','claimed','rejected','missed','busy','timeout','connection_failed','pod_lost','capacity','call_restricted'], true) ? $reason : ($reason === 'remote_hangup' ? $reason : 'unknown'));
        }
    }
    private function attach(?CancellationToken $cancellation = null): void
    {
        $this->transition('connecting');
        $this->media = $this->client->media($this, $this->refreshNext, $cancellation);
        $this->refreshNext = false;
        $this->media->connect($cancellation);
        $this->sampleRate = $this->media->sampleRate;
        $this->state = 'connected';
        $this->connectedAt ??= microtime(true);
        $preferences = $this->confirmedPreferences;
        if ($preferences !== null) {
            $this->setMediaState($preferences['audioMuted'], $preferences['videoEnabled'], $preferences['screenSharing'], $cancellation);
        } elseif ($this->videoEnabled) {
            $this->setMediaState(false, $this->videoEnabled, false, $cancellation);
        }
        $this->awaitingPong = false;
        $this->beatAt = microtime(true) + $this->client->options->mediaHeartbeat;
        if ($this->client->options->diagnostics && $this->reporter === null) {
            $this->reporter = new CallReporter($this->client, $this);
        }
        $this->client->emit(new CallsEvent('state', $this));
    }
    /** @internal */ public function pollMedia(float $timeout, ?CancellationToken $cancellation = null): void
    {
        if ($this->state === 'ended' || $this->mediaBusy) {
            return;
        }
        $cancellation?->throwIfCancelled();
        $wasConnected = $this->state === 'connected';
        try {
            if ($this->state === 'reconnecting' && microtime(true) >= $this->retryAt) {
                if ($this->reattachAttempts >= $this->client->options->maxMediaReattach) {
                    $this->reporter?->error('reconnect_exhausted');
                    $this->releaseAfterFailure();
                    return;
                }
                ++$this->reattachAttempts;
                ++$this->reconnects;
                $this->attach($cancellation);
            }
            if ($this->state === 'connected') {
                if ($this->client->options->mediaHeartbeat > 0 && microtime(true) >= $this->beatAt) {
                    if ($this->awaitingPong) {
                        throw new TimeoutException('Media heartbeat timed out.', 'request_timeout');
                    } $this->media?->ping();
                    $this->awaitingPong = true;
                    $this->beatAt = microtime(true) + $this->client->options->mediaHeartbeat;
                }
                $frame = $this->media?->poll($timeout);
                if ($frame !== null) {
                    $this->mediaFrame($frame);
                }
            }
        } catch (CancelledException $error) {
            throw $error;
        } catch (PolymorfaException $error) {
            if ($wasConnected) {
                $this->reattachAttempts = 0;
            }
            $this->media?->close();
            $this->clearVideoSources();
            if ($error instanceof ConflictException) {
                $this->finish($error->errorCode === 'call_ended' ? 'remote_hangup' : 'claimed');
                return;
            }
            if ($error instanceof AuthorizationException || $error instanceof ConfigurationException) {
                $this->releaseAfterFailure();
                return;
            }
            $this->refreshNext = $error instanceof AuthenticationException;
            $this->reporter?->error($this->refreshNext ? 'token_refresh_failed' : 'other');
            $this->state = 'reconnecting';
            $this->retryAt = microtime(true) + min($this->client->options->maxBackoff, $this->client->options->minBackoff * 2 ** min(10, $this->reattachAttempts));
            $this->client->emit(new CallsEvent('error', $this, $error));
        } catch (\Throwable) {
            if ($wasConnected) {
                $this->reattachAttempts = 0;
            }
            $this->media?->close();
            $this->clearVideoSources();
            $this->state = 'reconnecting';
            $this->retryAt = microtime(true) + $this->client->options->minBackoff;
        }
    }
    /** @param AudioFrame|VideoFrame|array<string,mixed> $frame */ private function mediaFrame(AudioFrame|VideoFrame|array $frame): void
    {
        if ($frame instanceof AudioFrame || $frame instanceof VideoFrame) {
            $this->client->emit(new CallsEvent($frame instanceof AudioFrame ? 'audio' : 'video', $this, $frame));
            return;
        }
        $type = $frame['type'] ?? null;
        if ($type === 'pong') {
            $this->awaitingPong = false;
            return;
        }
        if ($type === 'keyframe_request') {
            $this->client->emit(new CallsEvent('keyframe_request', $this));
            return;
        }
        if ($type === 'error' && is_string($frame['code'] ?? null)) {
            throw CallsSocketErrors::control($frame['code']);
        }
        if ($type === 'remote_media' && (is_bool($frame['audioMuted'] ?? null) || array_key_exists('audioMuted', $frame) && $frame['audioMuted'] === null)) {
            $this->remoteAudioMuted = $frame['audioMuted'];
        }
        if ($type === 'hand_state' && is_bool($frame['raised'] ?? null) && is_bool($frame['supported'] ?? null)) {
            $this->handRaised = $frame['raised'];
            $this->handSupported = $frame['supported'];
        }
        if ($type === 'reaction' && is_string($frame['emoji'] ?? null)) {
            try {
                $reaction = new CallReaction($frame['emoji'], ($frame['self'] ?? false) === true, is_string($frame['participantId'] ?? null) ? $frame['participantId'] : null);
                $this->client->emit(new CallsEvent('reaction', $this, $reaction));
            } catch (ValidationException) {
            } return;
        }
        if (($type === 'participant_state' || $type === 'participant_joined') && is_array($frame['participant'] ?? null)) {
            /** @var array<string,mixed> $data */ $data = $frame['participant'];
            $participant = CallParticipant::fromArray($data);
            if ($participant !== null) {
                if ($participant->state === 'left') {
                    $this->removeParticipant($participant->id);
                } else {
                    $this->participants[$participant->id] = $participant;
                    foreach ($this->videoSources as $id => $source) {
                        if ($source->participant?->id === $participant->id) {
                            $this->videoSources[$id] = new CallVideoSource($id, $participant->label(), $participant);
                        }
                    }
                }
                $this->client->emit(new CallsEvent($type, $this, $participant));
                return;
            }
        }
        if ($type === 'participant_left' && is_string($frame['participantId'] ?? null)) {
            $this->removeParticipant($frame['participantId']);
        }
        if ($type === 'video_source' && is_int($frame['source'] ?? null) && $frame['source'] >= 0 && $frame['source'] <= 4294967295) {
            if (is_string($frame['connectionId'] ?? null) && preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $frame['connectionId'])) {
                $owner = is_string($frame['connectionParticipant'] ?? null) ? $frame['connectionParticipant'] : null;
                $this->videoSources[$frame['source']] = new CallVideoSource($frame['source'], $owner ?? $frame['connectionId'], connectionId:$frame['connectionId'], connectionParticipant:$owner);
            } elseif (is_array($frame['participant'] ?? null)) {
                /** @var array<string,mixed> $data */ $data = $frame['participant'];
                $participant = CallParticipant::fromArray($data);
                if ($participant !== null) {
                    $this->videoSources[$frame['source']] = new CallVideoSource($frame['source'], $participant->label(), $participant);
                }
            }
        }
        if ($type === 'video_source' && is_int($frame['source'] ?? null) && isset($this->videoSources[$frame['source']])) {
            $this->client->emit(new CallsEvent('video_source', $this, $this->videoSources[$frame['source']]));
        }
        if ($type === 'video_source_removed' && is_int($frame['source'] ?? null) && isset($this->videoSources[$frame['source']])) {
            unset($this->videoSources[$frame['source']]);
            $this->client->emit(new CallsEvent('video_source_removed', $this, $frame['source']));
        }
        $this->client->emit(new CallsEvent('state', $this));
    }
    private function clearVideoSources(): void
    {
        $sources = $this->videoSources;
        $this->videoSources = [];
        foreach ($sources as $id => $source) {
            $this->client->emit(new CallsEvent('video_source_removed', $this, $id));
        }
    }
    private function removeParticipant(string $id): void
    {
        unset($this->participants[$id]);
        foreach ($this->videoSources as $sourceId => $source) {
            if ($source->participant?->id === $id) {
                unset($this->videoSources[$sourceId]);
            }
        }
    }
    /** @internal */ public function disconnect(): void
    {
        if ($this->state === 'ended') {
            return;
        }
        if ($this->acceptedLocally) {
            $this->leave();
        } elseif ($this->direction === 'outbound') {
            $this->end();
        } else {
            $this->finish('left');
        }
    }
    /** @internal */ public function finish(string $reason): void
    {
        if ($this->state === 'ended') {
            return;
        }
        $this->media?->close();
        $this->media = null;
        $this->clearVideoSources();
        $this->state = 'ended';
        $this->endReason = $reason;
        $this->endedAt = microtime(true);
        $this->reporter?->quality(['reconnects' => $this->reconnects]);
        $this->reporter?->stop();
        $this->client->finished($this);
        $this->client->emit(new CallsEvent('ended', $this));
    }
    private function releaseAfterFailure(): void
    {
        try {
            if ($this->claimedBySelf) {
                $this->client->api()->end($this->id, new RequestOptions(timeout:5, maxNetworkRetries:0));
            } else {
                $this->client->api()->leave($this->id, $this->connectionId, $this->client->serverParticipant(), new RequestOptions(timeout:5, maxNetworkRetries:0));
            }
        } catch (\Throwable) {
        } $this->finish('connection_failed');
    }
    public function duration(): int
    {
        return $this->connectedAt === null ? 0 : max(0, (int)floor(($this->endedAt ?? microtime(true)) - $this->connectedAt));
    }
    /** @phpstan-impure */
    private function transition(string $state): void
    {
        $this->state = $state;
        $this->client->emit(new CallsEvent('state', $this));
    }
    private function live(): void
    {
        if ($this->state === 'ended') {
            throw new ConflictException('Call ended.', 'call_ended');
        }
    }
    private function attached(): MediaSocket
    {
        if ($this->state !== 'connected' || $this->media === null) {
            throw new ConflictException('Media is unavailable.', 'media_control_unavailable');
        } return $this->media;
    }
}
