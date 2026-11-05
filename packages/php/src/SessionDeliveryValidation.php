<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Narrow delivery/custody intent validation. Authority stays at the API. */
final class SessionDeliveryValidation
{
    public const RESETS = ['historySync','historySync.mode','historySync.requestFull','historySync.delivery','hms','observation','observation.presenceMode','observation.typingMode','observation.labelMode','observation.quickReplyMode'];
    private static function history(mixed $value, bool $quickLink = false): bool
    {
        $v = CampaignContractValidation::object($value, 'historySync');
        CampaignContractValidation::fields($v, $quickLink ? ['mode','requestFull','delivery','consent'] : ['mode','requestFull','delivery'], [], 'historySync');
        if (array_key_exists('mode', $v)) {
            CampaignContractValidation::enum($v['mode'], ['metadata_only','deliver'], 'historySync.mode');
        }
        if (array_key_exists('requestFull', $v) && !is_bool($v['requestFull'])) {
            CampaignContractValidation::invalid('historySync.requestFull');
        }
        if (array_key_exists('delivery', $v) && $v['delivery'] !== 'descriptor') {
            CampaignContractValidation::invalid('historySync.delivery');
        }
        if (array_key_exists('consent', $v)) {
            CampaignContractValidation::enum($v['consent'], ['ask','force_on','force_off'], 'historySync.consent');
        }
        return array_key_exists('delivery', $v);
    }
    /** @param array<string,mixed> $input */
    public static function configuration(array $input): bool
    {
        CampaignContractValidation::fields($input, ['configuration','revision'], ['configuration','revision']);
        CampaignContractValidation::integer($input['revision'], 'revision');
        $patch = CampaignContractValidation::object($input['configuration'], 'configuration');
        CampaignContractValidation::fields($patch, ['set','reset'], [], 'configuration');
        $intent = false;
        if (array_key_exists('set', $patch)) {
            $set = CampaignContractValidation::object($patch['set'], 'configuration.set');
            CampaignContractValidation::fields($set, ['observation','historySync','hms'], [], 'configuration.set');
            if (array_key_exists('historySync', $set)) {
                $intent = self::history($set['historySync']);
            }
        }
        if (array_key_exists('reset', $patch)) {
            foreach (CampaignContractValidation::list($patch['reset'], 'configuration.reset') as $reset) {
                CampaignContractValidation::enum($reset, self::RESETS, 'configuration.reset');
            }
            $intent = $intent || in_array('historySync.delivery', $patch['reset'], true);
        }
        return $intent;
    }
    /** @param array<string,mixed> $input */
    public static function quickLink(array $input): bool
    {
        CampaignContractValidation::fields($input, ['purpose','signalMode','session','addConnection','connectionGoal','projectId','customerId','externalId','billingControls','configuration'], []);
        if (array_key_exists('signalMode', $input)) {
            CampaignContractValidation::enum($input['signalMode'], ['standard','zero_knowledge'], 'signalMode');
        }
        if (array_key_exists('connectionGoal', $input)) {
            CampaignContractValidation::enum($input['connectionGoal'], ['single','hybrid'], 'connectionGoal');
        }
        if (($input['purpose'] ?? null) === 'add_connection') {
            CampaignContractValidation::text($input['session'] ?? null, 'session');
            CampaignContractValidation::enum($input['addConnection'] ?? null, ['linked_devices','official_api'], 'addConnection');
            if (($input['connectionGoal'] ?? null) === 'single' || array_intersect(['signalMode','customerId','externalId','billingControls'], array_keys($input)) !== []) {
                CampaignContractValidation::invalid('purpose');
            }
        } elseif ((array_key_exists('purpose', $input) && $input['purpose'] !== 'initial') || array_key_exists('session', $input) || array_key_exists('addConnection', $input)) {
            CampaignContractValidation::invalid('purpose');
        }
        $intent = array_key_exists('signalMode', $input);
        if (array_key_exists('configuration', $input)) {
            $v = CampaignContractValidation::object($input['configuration'], 'configuration');
            CampaignContractValidation::fields($v, ['observation','hms','testing','connectionPreference','connectionEnforcement','methods','defaultMethod','prefillPhone','allowPhoneChange','historySync'], [], 'configuration');
            if (array_key_exists('historySync', $v)) {
                $intent = self::history($v['historySync'], true) || $intent;
            }
        }
        return $intent;
    }
    public static function responseModel(): mixed
    {
        $o = static fn (array $v, array $optional = []): array => ['object' => $v,'optional' => $optional];
        $e = static fn (array $v): array => ['enum' => $v];
        $source = $e(['platform','team','project','session']);
        $history = $o(['mode' => $e(['metadata_only','deliver']),'requestFull' => 'bool','delivery' => $e(['archive','descriptor'])], ['delivery']);
        $historyPatch = $o(['mode' => $e(['metadata_only','deliver']),'requestFull' => 'bool','delivery' => $e(['descriptor'])], ['mode','requestFull','delivery']);
        $observation = $o(['presenceMode' => $e(['off','events','cache']),'typingMode' => $e(['off','events','cache']),'labelMode' => $e(['off','events','cache','project']),'quickReplyMode' => $e(['off','events','cache'])]);
        $obsPatch = $observation;
        $obsPatch['optional'] = array_keys($observation['object']);
        $hms = ['union' => [$o(['enabled' => $e([false])]),$o(['enabled' => $e([true]),'region' => 'string','policy' => $e(['short','standard','extended','compliance','enterprise_archive']),'retentionDays' => 'int','policyVersion' => 'string','legalHold' => 'bool'], ['retentionDays','policyVersion','legalHold'])]];
        return $o(['effective' => $o(['observation' => $observation,'historySync' => $history,'hms' => $hms]),'overrides' => $o(['observation' => $obsPatch,'historySync' => $historyPatch,'hms' => $hms], ['observation','historySync','hms']),'sources' => $o(['historySync.mode' => $e(['platform','team','project','session','consent']),'historySync.requestFull' => $e(['platform','team','project','session','consent']),'historySync.delivery' => $source,'hms' => $source,'observation.presenceMode' => $source,'observation.typingMode' => $source,'observation.labelMode' => $source,'observation.quickReplyMode' => $source], ['historySync.delivery']),'requestedHistory' => $history,'revisions' => $o(['team' => 'int','project' => 'int','session' => 'int']),'historyConsent' => $e(['pending','accepted','declined']),'application' => $o(['desiredGeneration' => 'int','appliedGeneration' => 'int','status' => $e(['pending','applied'])])], ['historyConsent','application']);
    }
}
