<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\VoipModels;
use Polymorfa\Models;
use Polymorfa\ConfigurationException;
use Polymorfa\ValidationException;

/**
 * @phpstan-import-type CallLinkRequest from VoipModels
 * @phpstan-import-type PreviewCallLinkRequest from VoipModels
 * @phpstan-import-type CreatedCallLink from VoipModels
 * @phpstan-import-type PreviewedCallLink from VoipModels
 * @phpstan-import-type Participant from VoipModels as ParticipantData
 * @phpstan-import-type CallSettings from VoipModels
 * @phpstan-import-type CallPermission from VoipModels
 * @phpstan-import-type CheckRequest from VoipModels
 * @phpstan-import-type CallCheck from VoipModels
 * @phpstan-import-type Reaction from VoipModels
 * @phpstan-import-type HandRaised from VoipModels
 * @phpstan-import-type Report from VoipModels
 * @phpstan-import-type Success from Models
 */
final class Voip extends Resource
{
    private function participant(?string $participant): void
    {
        if ($participant === null) {
            return;
        }
        if ($this->transport->credentialKind() === 'client_token') {
            throw new ConfigurationException('participant');
        }
        if (!preg_match('/^[A-Za-z0-9._:@-]{1,128}$/D', $participant)) {
            throw new ValidationException('Invalid participant.');
        }
    }
    /**
 * @param array{session?:string,to?:string,participants?:list<string>,groupId?:string,video?:bool,exclusive?:bool,participant?:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{callId:string,session:string,video:bool}}> */
    public function place(array $body, ?RequestOptions $options = null): ApiResponse
    {
        if ($this->transport->credentialKind() !== 'client_token' && (!isset($body['session']) || trim($body['session']) === '')) {
            throw new ValidationException('A server call requires session.');
        }
        $this->participant($body['participant'] ?? null);
        $valid = static fn (string $value): bool => preg_match('/^(?:\+[1-9]\d{1,14}|[1-9][0-9]{0,18})$/D', $value) === 1;
        if (isset($body['groupId'])) {
            if (isset($body['to']) || isset($body['participants']) || !preg_match('/^[1-9][0-9]{0,18}$/D', $body['groupId'])) {
                throw new ValidationException('Provide groupId without to or participants.');
            }
        } elseif (isset($body['participants'])) {
            $values = $body['participants'];
            if (isset($body['to']) || count($values) < 2 || count($values) > 31 || count(array_unique($values)) !== count($values) || count(array_filter($values, $valid)) !== count($values)) {
                throw new ValidationException('Provide 2 to 31 distinct participants.');
            }
        } elseif (!isset($body['to']) || !$valid($body['to'])) {
            throw new ValidationException('Provide a valid call target.');
        }
        /** @var ApiResponse<array{success:bool,data:array{callId:string,session:string,video:bool}}> */
        return $this->request('POST', '/messaging/voip/calls', $body, options: $options);
    }
    /**
 * @param array{video?:bool,exclusive?:bool,participant?:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{answered:bool,answeredBy:string,exclusive:bool}}> */
    public function accept(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($body['participant'] ?? null);
        /** @var ApiResponse<array{success:bool,data:array{answered:bool,answeredBy:string,exclusive:bool}}> */
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/accept', $body === [] ? new \stdClass() : $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function reject(string $id, ?string $participant = null, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($participant);
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/reject', $participant === null ? null : ['participant' => $participant], options: $options);
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function leave(string $id, string $connectionId, ?string $participant = null, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($participant);
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $connectionId)) {
            throw new ValidationException('Invalid connectionId.');
        }
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/leave', ['connectionId' => $connectionId] + ($participant === null ? [] : ['participant' => $participant]), options: $options);
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function end(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', '/messaging/voip/calls/' . self::segment($id), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:ParticipantData}> */
    public function addParticipant(string $id, string $to, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ParticipantData}> */
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/participants', ['to' => $to], options: $options);
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function ringParticipant(string $id, string $to, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/participants/ring', ['to' => $to], options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:CallPermission}> */
    public function retrieveCallPermission(string $session, string $to, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (trim($session) === '') {
            throw new ConfigurationException('session');
        }
        if (trim($to) === '') {
            throw new ConfigurationException('to');
        }
        /** @var ApiResponse<array{success:bool,data:CallPermission}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/call-permissions/' . self::segment($to), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:CallSettings}> */
    public function retrieveCallSettings(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:CallSettings}> */
        return $this->request('GET', '/platform/sessions/' . self::segment($session) . '/call-settings', options: $options);
    }
    /**
 * @param array{callsEnabled?:bool,conferenceMode?:bool,inboundRoute?:'clients'|'sip_trunk',sipTrunkId?:?string,sipClaim?:bool,hostCloudApiCalls?:bool,expectedRevision?:int} $body
 *
 * @return ApiResponse<array{success:bool,data:CallSettings}> */
    public function updateCallSettings(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (array_intersect(array_keys($body), ['callsEnabled','conferenceMode','inboundRoute','sipTrunkId','sipClaim','hostCloudApiCalls']) === []) {
            throw new ValidationException('Provide a call setting.');
        }
        self::validateSettings($body);
        /** @var ApiResponse<array{success:bool,data:CallSettings}> */
        return $this->request('PUT', '/platform/sessions/' . self::segment($session) . '/call-settings', $body, options: $options);
    }
    /** @param CallLinkRequest $body
     * @return ApiResponse<array{success:bool,data:CreatedCallLink}> */
    public function createCallLink(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->callLink($body, $options);
        /** @var ApiResponse<array{success:bool,data:CreatedCallLink}> */
        return $this->request('POST', '/messaging/voip/call-links', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param PreviewCallLinkRequest $body
     * @return ApiResponse<array{success:bool,data:PreviewedCallLink}> */
    public function previewCallLink(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->callLink($body, $options);
        if (!preg_match('/^[A-Za-z0-9_-]{1,256}$/D', $body['token'])) {
            throw new ValidationException('Invalid call-link token.');
        }
        /** @var ApiResponse<array{success:bool,data:PreviewedCallLink}> */
        return $this->request('POST', '/messaging/voip/call-links/preview', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param CheckRequest $body
     * @return ApiResponse<array{success:bool,data:CallCheck}> */
    public function check(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (trim($body['session']) === '' || trim($body['to']) === '') {
            throw new ValidationException('Call checks require session and destination.');
        }
        /** @var ApiResponse<array{success:bool,data:CallCheck}> */
        return $this->request('POST', '/messaging/voip/calls/check', $body, options:$options);
    }
    /** @param Reaction $body
     * @return ApiResponse<Success> */
    public function sendReaction(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($body['participant'] ?? null);
        self::connection($body['connectionId']);
        self::reaction($body['emoji']);
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/'.self::segment($id).'/reaction', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param HandRaised $body
     * @return ApiResponse<Success> */
    public function setHandRaised(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($body['participant'] ?? null);
        self::connection($body['connectionId']);
        self::hand($body['raised']);
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/'.self::segment($id).'/hand', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param Report $body
     * @return ApiResponse<Success> */
    public function report(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        self::validateReport($body);
        $this->participant($body['participant'] ?? null);
        /** @var ApiResponse<Success> */
        return $this->request('POST', '/messaging/voip/calls/'.self::segment($id).'/reports', $body, options:$options);
    }
    private static function connection(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $value)) {
            throw new ValidationException('Invalid connectionId.');
        }
    }
    private static function reaction(mixed $value): void
    {
        if (!in_array($value, ['','👍','❤️','😂','😮','😢','🙏'], true)) {
            throw new ValidationException('Invalid call reaction.');
        }
    }
    private static function hand(mixed $value): void
    {
        if (!is_bool($value)) {
            throw new ValidationException('Invalid raised hand state.');
        }
    }
    /** @param array<string,mixed> $body */
    private function callLink(array $body, ?RequestOptions $options): void
    {
        $this->server();
        if (!is_string($body['session'] ?? null) || trim($body['session']) === '' || strlen($body['session']) > 128 || (array_key_exists('video', $body) && !is_bool($body['video']))) {
            throw new ValidationException('Call links require a session and optional video flag.');
        }
        if ($options?->idempotencyKey !== null) {
            throw new ValidationException('Call links do not support Idempotency-Key.');
        }
        foreach (array_keys($options->headers ?? []) as $name) {
            if (strtolower($name) === 'idempotency-key') {
                throw new ValidationException('Call links do not support Idempotency-Key.');
            }
        }
    }
    /** @param array<string,mixed> $body */
    private static function validateReport(array $body): void
    {
        self::connection($body['connectionId'] ?? null);
        $kind = $body['kind'] ?? null;
        if (!in_array($kind, ['quality','error'], true) || array_diff(array_keys($body), ['kind','connectionId','participant','client',$kind]) !== []) {
            throw new ValidationException('Invalid call report fields.');
        }
        if (array_key_exists('client', $body)) {
            $client = $body['client'];
            if (!is_array($client) || array_diff(array_keys($client), ['sdk','version','platform']) !== [] || !is_string($client['sdk'] ?? null) || !preg_match('/^[a-z0-9@\/._-]{1,32}$/D', $client['sdk']) || !is_string($client['version'] ?? null) || strlen($client['version']) > 32 || !preg_match('/^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:[-+][0-9A-Za-z.+-]{1,24})?$/D', $client['version']) || !in_array($client['platform'] ?? null, ['browser','node','other'], true)) {
                throw new ValidationException('Invalid call report client.');
            }
        }
        if ($kind === 'error') {
            $error = $body['error'] ?? null;
            if (!is_array($error) || array_keys($error) !== ['code'] || !in_array($error['code'], ['media_permission_denied','device_not_found','device_in_use','ice_failed','negotiation_failed','media_timeout','reconnect_exhausted','token_refresh_failed','unsupported_browser','other'], true)) {
                throw new ValidationException('Invalid call report error.');
            }
        } else {
            $quality = $body['quality'] ?? null;
            if (!is_array($quality) || $quality === []) {
                throw new ValidationException('A quality report requires figures.');
            }
            $bounds = ['rttMs' => 60000,'jitterMs' => 60000,'packetsLost' => 2147483647,'packetsReceived' => 2147483647,'reconnects' => 1000];
            foreach ($quality as $name => $figure) {
                $valid = match (true) {
                    isset($bounds[$name]) => is_int($figure) && $figure >= 0 && $figure <= $bounds[$name],
                    in_array($name, ['audioCodec','videoCodec'], true) => is_string($figure) && preg_match('/^[A-Za-z0-9\/.-]{1,32}$/D', $figure) === 1,
                    $name === 'candidateType' => in_array($figure, ['host','srflx','prflx','relay'], true),
                    default => false,
                };
                if (!$valid) {
                    throw new ValidationException('Invalid call quality figure.');
                }
            }
        }
    }
    /** @param array<string,mixed> $body */
    private static function validateSettings(array $body): void
    {
        foreach (['callsEnabled','conferenceMode','sipClaim','hostCloudApiCalls'] as $name) {
            if (array_key_exists($name, $body) && !is_bool($body[$name])) {
                throw new ValidationException('Call switches must be booleans.');
            }
        }
        if (array_key_exists('inboundRoute', $body) && !in_array($body['inboundRoute'], ['clients','sip_trunk'], true)) {
            throw new ValidationException('Invalid inbound call route.');
        }
        if (array_key_exists('expectedRevision', $body) && (!is_int($body['expectedRevision']) || $body['expectedRevision'] < 0 || $body['expectedRevision'] > 9007199254740991)) {
            throw new ValidationException('Invalid expected call-settings revision.');
        }
    }
}
