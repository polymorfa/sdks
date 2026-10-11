<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\ValidationException;

final class Voip extends Resource
{
    private function participant(?string $participant): void
    {
        if ($participant !== null && ($this->transport->credentialKind() === 'client_token' || !preg_match('/^[A-Za-z0-9._:@-]{1,128}$/D', $participant))) {
            throw new ValidationException('Invalid participant.');
        }
    }
    /**
 * @param array{session?:string,to?:string,participants?:list<string>,groupId?:string,video?:bool,exclusive?:bool,participant?:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{callId:string}}> */
    public function place(array $body, ?RequestOptions $options = null): ApiResponse
    {
        if ($this->transport->credentialKind() !== 'client_token' && empty($body['session'])) {
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
        /** @var ApiResponse<array{success:bool,data:array{callId:string}}> */
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
 * @return ApiResponse<array<string,mixed>> */
    public function reject(string $id, ?string $participant = null, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($participant);
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/reject', $participant === null ? null : ['participant' => $participant], options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function leave(string $id, string $connectionId, ?string $participant = null, ?RequestOptions $options = null): ApiResponse
    {
        $this->participant($participant);
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $connectionId)) {
            throw new ValidationException('Invalid connectionId.');
        }
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/leave', ['connectionId' => $connectionId] + ($participant === null ? [] : ['participant' => $participant]), options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function end(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('DELETE', '/messaging/voip/calls/' . self::segment($id), options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function addParticipant(string $id, string $to, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/participants', ['to' => $to], options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function ringParticipant(string $id, string $to, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('POST', '/messaging/voip/calls/' . self::segment($id) . '/participants/ring', ['to' => $to], options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieveCallPermission(string $session, string $to, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/messaging/' . self::segment($session) . '/call-permissions/' . self::segment($to), options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieveCallSettings(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/platform/sessions/' . self::segment($session) . '/call-settings', options: $options);
    }
    /**
 * @param array{callsEnabled?:bool,conferenceMode?:bool,inboundRoute?:'clients'|'sip_trunk',sipTrunkId?:?string,sipClaim?:bool,hostCloudApiCalls?:bool,expectedRevision?:int} $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function updateCallSettings(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if ($body === []) {
            throw new ValidationException('Provide a call setting.');
        } return $this->request('PUT', '/platform/sessions/' . self::segment($session) . '/call-settings', $body, options: $options);
    }
}
