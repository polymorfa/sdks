<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions};

/**
 * @phpstan-import-type Contact from Models
 * @phpstan-import-type ContactCheck from Models
 * @phpstan-import-type Identity from Models
 * @phpstan-import-type UserInfo from Models
 * @phpstan-import-type BusinessProfile from Models
 * @phpstan-import-type Success from Models
 */
final class Contacts extends Resource
{
    /**
 * @return ApiResponse<array{success:bool,data:list<Contact>}> */
    public function list(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Contact>}> */
        return $this->request('GET', $this->path($session), options: $options);
    }
    /** @param string|list<string> $phone
 * @return ApiResponse<array{success:bool,data:list<ContactCheck>}> */
    public function check(string $session, string|array $phone, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<ContactCheck>}> */
        return $this->request('GET', $this->path($session).'/check', query: ['phone' => is_string($phone) ? $phone : implode(',', $phone)], options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:array{hash:string,contacts:list<Identity>}}> */
    public function blocklist(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{hash:string,contacts:list<Identity>}}> */
        return $this->request('GET', $this->path($session).'/blocked', options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:Contact}> */
    public function retrieve(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Contact}> */
        return $this->request('GET', $this->path($session, $contactId), options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:array{url:string}}> */
    public function picture(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{url:string}}> */
        return $this->request('GET', $this->path($session, $contactId).'/picture', options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:UserInfo}> */
    public function info(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:UserInfo}> */
        return $this->request('GET', $this->path($session, $contactId).'/info', options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:list<string>}> */
    public function devices(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<string>}> */
        return $this->request('GET', $this->path($session, $contactId).'/devices', options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:BusinessProfile}> */
    public function businessProfile(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:BusinessProfile}> */
        return $this->request('GET', $this->path($session, $contactId).'/business-profile', options:$options);
    }
    /**
 * @return ApiResponse<Success> */
    public function block(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $contactId).'/block', options:$options);
    }
    /**
 * @return ApiResponse<Success> */
    public function unblock(string $session, string $contactId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $contactId).'/unblock', options:$options);
    }
    private function path(string $session, ?string $contactId = null): string
    {
        return '/messaging/'.self::segment($session).'/contacts'.($contactId === null ? '' : '/'.self::segment($contactId));
    }
}
