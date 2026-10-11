<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OnboardingModels,ValidationException};

/**
 * @phpstan-import-type HistoryMessage from OnboardingModels
 * @phpstan-import-type Fixture from OnboardingModels
 * @phpstan-import-type Trigger from OnboardingModels
 * @phpstan-import-type TriggerResult from OnboardingModels
 * @phpstan-import-type Phone from OnboardingModels
 */
final class Testing extends Resource
{
    /** @param array{messages:list<HistoryMessage>} $input
     * @return ApiResponse<array{fixtureId:string}> */
    public function createHistoryFixture(string $projectId, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{fixtureId:string}> */ return $this->request('POST', $this->base($projectId).'/history-fixtures', $input, options:$options);
    }
    /** @param Trigger $input
     * @return ApiResponse<TriggerResult> */
    public function triggerEvent(string $projectId, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<TriggerResult> */ return $this->request('POST', $this->base($projectId).'/events', $input, options:$options);
    }
    /** @return ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */
    public function listEventFixtures(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */ return $this->request('GET', $this->base($projectId).'/events/fixtures', options:$options);
    }
    /** @return ApiResponse<Phone> */
    public function getPhone(string $projectId, string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Phone> */ return $this->request('GET', $this->phone($projectId, $session), options:$options);
    }
    /** @param array{to:string,text:string} $input
     * @return ApiResponse<array{session:string,to:string,messageId:?string}> */
    public function sendPhoneMessage(string $projectId, string $session, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{session:string,to:string,messageId:?string}> */ return $this->request('POST', $this->phone($projectId, $session).'/messages', $input, options:$options);
    }
    /** @return ApiResponse<array{session:string,deviceId:int,unlinked:true}> */
    public function unlinkPhoneDevice(string $projectId, string $session, int $deviceId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if ($deviceId < 1 || $deviceId > 99) {
            throw new ValidationException('deviceId must be a companion device ID from 1 to 99.');
        } /** @var ApiResponse<array{session:string,deviceId:int,unlinked:true}> */ return $this->request('POST', $this->phone($projectId, $session).'/devices/'.$deviceId.'/unlink', options:$options);
    }
    private function base(string $projectId): string
    {
        return '/messaging/testing/'.self::segment($projectId);
    }
    private function phone(string $projectId, string $session): string
    {
        return $this->base($projectId).'/numbers/'.self::segment($session).'/phone';
    }
}
