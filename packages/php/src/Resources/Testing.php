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
        /** @var ApiResponse<array{fixtureId:string}> */ return $this->request('POST', '/messaging/projects/'.self::segment($projectId).'/test-history-fixtures', $input, options:$options);
    }
    /** @param Trigger $input
     * @return ApiResponse<TriggerResult> */
    public function triggerEvent(string $session, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<TriggerResult> */ return $this->request('POST', '/messaging/'.self::segment($session).'/test-events', $input, options:$options);
    }
    /** @return ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */
    public function listEventFixtures(?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */ return $this->request('GET', '/messaging/test-events/fixtures', options:$options);
    }
    /** @return ApiResponse<Phone> */
    public function getPhone(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Phone> */ return \Polymorfa\ExistingContract::bare($this->transport, 'GET', $this->phone($session), null, $options, 'testingPhone');
    }
    /** @param array{to:string,text:string} $input
     * @return ApiResponse<array{session:string,to:string,messageId:?string}> */
    public function sendPhoneMessage(string $session, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{session:string,to:string,messageId:?string}> */ return \Polymorfa\ExistingContract::bare($this->transport, 'POST', $this->phone($session).'/messages', $input, $options, 'testingSend', 202);
    }
    /** @return ApiResponse<array{session:string,deviceId:int,unlinked:true}> */
    public function unlinkPhoneDevice(string $session, int $deviceId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if ($deviceId < 1 || $deviceId > 99) {
            throw new ValidationException('deviceId must be a companion device ID from 1 to 99.');
        } /** @var ApiResponse<array{session:string,deviceId:int,unlinked:true}> */ return \Polymorfa\ExistingContract::bare($this->transport, 'POST', $this->phone($session).'/devices/'.$deviceId.'/unlink', null, $options, 'testingUnlink');
    }
    private function phone(string $session): string
    {
        return '/messaging/'.self::segment($session).'/phone';
    }
}
