<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Validation of changed campaign inputs, separate from response facts. */
final class ExistingCampaignValidation
{
    /** @param array<string,mixed> $body */
    public static function input(array $body, bool $platform = false, bool $patch = false): void
    {
        if (!$platform && $patch && $body === []) {
            CampaignContractValidation::invalid('body');
        }
        if (array_key_exists('variableMapping', $body) && !($patch && $body['variableMapping'] === null)) {
            $mapping = CampaignContractValidation::object($body['variableMapping'], 'variableMapping');
            if (count($mapping) > 50) {
                CampaignContractValidation::invalid('variableMapping');
            }
            foreach ($mapping as $key => $binding) {
                self::variable((string) $key, 'variableMapping');
                $v = CampaignContractValidation::object($binding, 'variableMapping');
                CampaignContractValidation::fields($v, ['source','fallback'], [], 'variableMapping');
                if (array_key_exists('source', $v)) {
                    self::variable($v['source'], 'variableMapping.source');
                }
                if (array_key_exists('fallback', $v) && CampaignContractValidation::trim(CampaignContractValidation::text($v['fallback'], 'variableMapping.fallback', 1, 1024)) === '') {
                    CampaignContractValidation::invalid('variableMapping.fallback');
                }
            }
        }
        if (array_key_exists('trackedLinks', $body) && $body['trackedLinks'] !== null) {
            $keys = [];
            foreach (CampaignContractValidation::list($body['trackedLinks'], 'trackedLinks', 0, 5) as $link) {
                $v = CampaignContractValidation::object($link, 'trackedLinks');
                CampaignContractValidation::fields($v, ['key','url'], ['key','url'], 'trackedLinks');
                $key = CampaignContractValidation::text($v['key'], 'trackedLinks.key', 1, 32);
                if (!preg_match('/^[a-z0-9_]+$/D', $key) || in_array($key, $keys, true)) {
                    CampaignContractValidation::invalid('trackedLinks.key');
                }
                $keys[] = $key;
                self::url(CampaignContractValidation::text($v['url'], 'trackedLinks.url', 1, 2048));
            }
        }
        if ($patch && array_key_exists('templateId', $body) && $body['templateId'] !== null) {
            CampaignContractValidation::uuid($body['templateId'], 'templateId');
        }
        if (array_key_exists('followUp', $body) && $body['followUp'] !== null) {
            self::followUp($body['followUp']);
        }
        if (array_key_exists('messagesArray', $body)) {
            self::composed($body['messagesArray']);
        }
        foreach (['variants' => true,'messageVariations' => false] as $key => $variants) {
            if (array_key_exists($key, $body) && !($body[$key] === null && (!$platform || $patch))) {
                self::alternatives($body[$key], $variants, $platform);
            }
        }
        if (array_key_exists('variantStrategy', $body) && !($body['variantStrategy'] === null && (!$platform || $patch))) {
            $v = CampaignContractValidation::object($body['variantStrategy'], 'variantStrategy');
            CampaignContractValidation::fields($v, ['winnerCriterion','holdoutPercent','testSlicePercent','autoPromote','testWindowMinutes'], ['winnerCriterion','holdoutPercent','autoPromote','testWindowMinutes'], 'variantStrategy');
            CampaignContractValidation::enum($v['winnerCriterion'], ['delivery','read','reply'], 'winnerCriterion');
            CampaignContractValidation::integer($v['holdoutPercent'], 'holdoutPercent', 0, 30);
            if (array_key_exists('testSlicePercent', $v)) {
                CampaignContractValidation::integer($v['testSlicePercent'], 'testSlicePercent', 5, 50);
            }
            if ($v['autoPromote'] !== true) {
                CampaignContractValidation::invalid('autoPromote');
            }
            CampaignContractValidation::integer($v['testWindowMinutes'], 'testWindowMinutes', 15, 1440);
        }
    }
    private static function variable(mixed $v, string $field): void
    {
        if (!is_string($v) || !preg_match('/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/D', $v)) {
            CampaignContractValidation::invalid($field);
        }
    }
    private static function url(string $raw): void
    {
        $url = parse_url($raw);
        $host = strtolower(rtrim($url['host'] ?? '', '.'));
        // Syntactic public HTTPS policy only. No DNS or reachability claim.
        $normalized = preg_replace_callback('/[^\x21-\x7e]/u', static fn (array $m): string => rawurlencode($m[0]), $raw) ?? '';
        if ($url === false || preg_match('/[\s\x00-\x20\x7f\\\\]/u', $raw) || ($url['scheme'] ?? '') !== 'https' || isset($url['user']) || isset($url['pass']) || CampaignContractValidation::length($normalized) > 2048 || !str_contains($host, '.') || str_starts_with($host, '[') || preg_match('/^[0-9.]+$/D', $host) || preg_match('/\.[0-9]+$/D', $host) || preg_match('/\.(local|internal|localhost)$/D', $host)) {
            CampaignContractValidation::invalid('trackedLinks.url');
        }
    }
    private static function followUp(mixed $value): void
    {
        $v = CampaignContractValidation::object($value, 'followUp');
        CampaignContractValidation::fields($v, ['delaySeconds','expirySeconds','message'], ['message'], 'followUp');
        $delay = array_key_exists('delaySeconds', $v) ? CampaignContractValidation::integer($v['delaySeconds'], 'delaySeconds', 60, 604800) : 86400;
        $expiry = array_key_exists('expirySeconds', $v) ? CampaignContractValidation::integer($v['expirySeconds'], 'expirySeconds', 86400, 2592000) : 604800;
        if ($expiry <= $delay) {
            CampaignContractValidation::invalid('followUp.expirySeconds');
        }
        $m = CampaignContractValidation::object($v['message'], 'followUp.message');
        if (($m['type'] ?? null) === 'text') {
            CampaignContractValidation::fields($m, ['type','text'], ['type','text'], 'followUp.message');
            if (preg_match('/\{\{\s*link:/i', CampaignContractValidation::text($m['text'], 'followUp.message.text', 1, 16384))) {
                CampaignContractValidation::invalid('followUp.message.text');
            }
        } else {
            CampaignContractValidation::fields($m, ['type','templateId'], ['type','templateId'], 'followUp.message');
            CampaignContractValidation::enum($m['type'], ['template'], 'followUp.message.type');
            CampaignContractValidation::uuid($m['templateId'], 'followUp.message.templateId');
        }
    }
    private static function composed(mixed $value): void
    {
        foreach (CampaignContractValidation::list($value, 'messagesArray', 0, 10) as $item) {
            $v = CampaignContractValidation::object($item, 'messagesArray');
            if (array_key_exists('version', $v) && $v['version'] !== 2) {
                CampaignContractValidation::invalid('version');
            }
            foreach (['source','footer'] as $key) {
                if (array_key_exists($key, $v)) {
                    CampaignContractValidation::text($v[$key], $key, 0);
                }
            }
            if (array_key_exists('delayAfterSec', $v)) {
                CampaignContractValidation::integer($v['delayAfterSec'], 'delayAfterSec', 0, 86400);
            }
            if (array_key_exists('media', $v)) {
                $media = CampaignContractValidation::object($v['media'], 'media');
                CampaignContractValidation::enum($media['kind'] ?? null, ['image','video','audio','document'], 'media.kind');
                CampaignContractValidation::text($media['url'] ?? null, 'media.url', 0);
                foreach (['filename','caption'] as $key) {
                    if (array_key_exists($key, $media)) {
                        CampaignContractValidation::text($media[$key], $key, 0);
                    }
                }
            }
            if (array_key_exists('buttons', $v)) {
                foreach (CampaignContractValidation::list($v['buttons'], 'buttons') as $button) {
                    $b = CampaignContractValidation::object($button, 'button');
                    CampaignContractValidation::enum($b['kind'] ?? null, ['reply','link','call'], 'button.kind');
                    CampaignContractValidation::text($b['label'] ?? null, 'button.label', 0);
                    foreach (['url','phone'] as $key) {
                        if (array_key_exists($key, $b)) {
                            CampaignContractValidation::text($b[$key], $key, 0);
                        }
                    }
                }
            }
        }
    }
    private static function alternatives(mixed $value, bool $variants, bool $platform): void
    {
        $total = 0;
        $keys = [];
        foreach (CampaignContractValidation::list($value, 'variants', 2, $variants ? 4 : 5) as $item) {
            $v = CampaignContractValidation::object($item, 'variants');
            $fields = $variants ? ['key','label','weight','blueprint'] : ['key','weight','blueprint'];
            CampaignContractValidation::fields($v, $fields, $fields, 'variants');
            $key = CampaignContractValidation::text($v['key'], 'key', 1, 16);
            if (!preg_match('/^[a-z][a-z0-9_-]{0,15}$/D', $key) || in_array($key, $keys, true)) {
                CampaignContractValidation::invalid('key');
            }
            $keys[] = $key;
            if ($variants) {
                $label = CampaignContractValidation::text($v['label'], 'label');
                $label = $platform ? $label : CampaignContractValidation::trim($label);
                CampaignContractValidation::text($label, 'label', 1, 100);
            }
            $total += CampaignContractValidation::integer($v['weight'], 'weight', 1, 99);
            $blueprint = CampaignContractValidation::object($v['blueprint'], 'blueprint');
            if (($blueprint['version'] ?? null) !== 2 || CampaignContractValidation::trim(CampaignContractValidation::text($blueprint['source'] ?? null, 'blueprint.source', 1, 4096)) === '') {
                CampaignContractValidation::invalid('blueprint');
            }
        }
        if ($total !== 100) {
            CampaignContractValidation::invalid('weight');
        }
    }
    /** @param array<string,mixed> $body */
    public static function launch(array $body, bool $platform): void
    {
        CampaignContractValidation::fields($body, $platform ? ['projectId','scheduledAt','skipMissingVariables'] : ['scheduledAt','skipMissingVariables'], $platform ? ['projectId'] : []);
        if ($platform) {
            CampaignContractValidation::uuid($body['projectId'], 'projectId');
        }
        if (array_key_exists('scheduledAt', $body) && (!(is_int($body['scheduledAt']) || is_float($body['scheduledAt'])) || !is_finite((float) $body['scheduledAt']))) {
            CampaignContractValidation::invalid('scheduledAt');
        }
        if (array_key_exists('skipMissingVariables', $body) && !is_bool($body['skipMissingVariables'])) {
            CampaignContractValidation::invalid('skipMissingVariables');
        }
    }
    /** @param array<string,mixed> $params */
    public static function recipients(array $params, bool $platform): void
    {
        CampaignContractValidation::fields($params, $platform ? ['projectId','status','reason','cursor','limit'] : ['status','reason','cursor','limit'], $platform ? ['projectId'] : [], 'params');
        if ($platform) {
            CampaignContractValidation::uuid($params['projectId'], 'projectId');
        }
        if (array_key_exists('status', $params)) {
            CampaignContractValidation::enum($params['status'], ['queued','sending','sent','delivered','read','failed','skipped'], 'status');
        }
        if (array_key_exists('reason', $params)) {
            CampaignContractValidation::enum($params['reason'], ['opted_out','cold_held','campaign_cancelled','invalid_recipient','session_not_connected','ack_timeout','blocked_by_safety','send_failed','missing_variable','other'], 'reason');
        }
        if (array_key_exists('cursor', $params)) {
            CampaignContractValidation::text($params['cursor'], 'cursor', 1, 256);
        }
        if (array_key_exists('limit', $params)) {
            CampaignContractValidation::integer($params['limit'], 'limit', 1, 100);
        }
    }
}
