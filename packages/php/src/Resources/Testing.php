<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OnboardingModels,ValidationException};

/**
 * @phpstan-import-type HistoryMessage from OnboardingModels
 * @phpstan-import-type Fixture from OnboardingModels
 * @phpstan-import-type Trigger from OnboardingModels
 * @phpstan-import-type TriggerResult from OnboardingModels
 * @phpstan-import-type AccountModeInput from OnboardingModels
 * @phpstan-import-type AccountMode from OnboardingModels
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
    public function triggerEvent(string $connection, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<TriggerResult> */ return $this->request('POST', '/messaging/'.self::segment($connection).'/test-events', $input, options:$options);
    }
    /** @return ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */
    public function listEventFixtures(?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{fixtures:list<array{name:Fixture,description:string,overrides:list<string>}>}> */ return $this->request('GET', '/messaging/test-events/fixtures', options:$options);
    }
    /** @return ApiResponse<Phone> */
    public function getPhone(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Phone> */ return \Polymorfa\ExistingContract::bare($this->transport, 'GET', $this->phone($connection), null, $options, 'testingPhone');
    }
    /** @param array{to:string,text:string} $input
     * @return ApiResponse<array{connection:string,to:string,messageId:?string}> */
    public function sendPhoneMessage(string $connection, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{connection:string,to:string,messageId:?string}> */ return \Polymorfa\ExistingContract::bare($this->transport, 'POST', $this->phone($connection).'/messages', $input, $options, 'testingSend', 202);
    }
    /** @return ApiResponse<array{connection:string,deviceId:int,unlinked:true}> */
    public function unlinkPhoneDevice(string $connection, int $deviceId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if ($deviceId < 1 || $deviceId > 99) {
            throw new ValidationException('deviceId must be a companion device ID from 1 to 99.');
        } /** @var ApiResponse<array{connection:string,deviceId:int,unlinked:true}> */ return \Polymorfa\ExistingContract::bare($this->transport, 'POST', $this->phone($connection).'/devices/'.$deviceId.'/unlink', null, $options, 'testingUnlink');
    }
    /** @param AccountModeInput $input
     * @return ApiResponse<AccountMode> */
    public function setAccountMode(string $connection, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($connection, 'connection', 1, 256);
        \Polymorfa\CampaignContractValidation::fields($input, ['accountType', 'primaryPlatform'], ['accountType']);
        \Polymorfa\BusinessAccountMode::fields($input, true);
        /** @var ApiResponse<AccountMode> */
        return \Polymorfa\ExistingContract::bare($this->transport, 'PUT', $this->phone($connection).'/account-mode', $input, $options, 'testingAccountMode');
    }
    private function phone(string $connection): string
    {
        return '/messaging/'.self::segment($connection).'/phone';
    }
}
