<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Validation shared by Test mode changes and QuickLink configuration. */
final class BusinessAccountMode
{
    /** @param array<string,mixed> $value */
    public static function fields(array $value, bool $required = false): void
    {
        $account = array_key_exists('accountType', $value) ? $value['accountType'] : ($required ? null : 'whatsapp_app');
        CampaignContractValidation::enum($account, ['whatsapp_app', 'business_app', 'meta_cloud', 'meta_coexistence'], 'accountType');
        if (array_key_exists('primaryPlatform', $value)) {
            CampaignContractValidation::enum($value['primaryPlatform'], ['android', 'ios'], 'primaryPlatform');
            if ($account === 'meta_cloud') {
                CampaignContractValidation::invalid('primaryPlatform');
            }
        }
    }
}
