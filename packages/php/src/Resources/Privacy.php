<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions, ValidationException};

/** @phpstan-import-type Privacy from Models as PrivacyData
 * @phpstan-import-type Success from Models */
final class Privacy extends Resource
{
    /** @return ApiResponse<array{success:bool,data:PrivacyData}> */
    public function get(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:PrivacyData}> */
        return $this->request('GET', $this->path($session), options:$options);
    }
    /**
     * @param 'groupadd'|'last'|'status'|'profile'|'readreceipts'|'online'|'calladd'|'messages'|'defense'|'stickers' $setting
     * @param 'all'|'contacts'|'contact_blacklist'|'none'|'match_last_seen'|'known'|'on_standard'|'off'|'contact_allowlist' $value
     * @return ApiResponse<array{success:bool,data:PrivacyData}>
     */
    public function set(string $session, string $setting, string $value, ?RequestOptions $options = null): ApiResponse
    {
        $allowed = match($setting) {
            'groupadd','last','status','profile' => ['all','contacts','contact_blacklist','none'],
            'readreceipts' => ['all','none'], 'online' => ['all','match_last_seen'],
            'calladd' => ['all','known'], 'messages' => ['all','contacts'],
            'defense' => ['on_standard','off'], 'stickers' => ['contacts','contact_allowlist','none'],
        };
        if (!in_array($value, $allowed, true)) {
            throw new ValidationException('Invalid privacy value for setting.', 'invalid_request');
        }
        /** @var ApiResponse<array{success:bool,data:PrivacyData}> */
        return $this->request('PUT', $this->path($session).'/'.self::segment($setting), ['value' => $value], options:$options);
    }
    /** @param array{durationSeconds:int} $body
     * @return ApiResponse<Success> */
    public function setDefaultDisappearingTimer(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/disappearing/default', $body, options:$options);
    }
    private function path(string $session): string
    {
        return '/messaging/'.self::segment($session).'/privacy';
    }
}
