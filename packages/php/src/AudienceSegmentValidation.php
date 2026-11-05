<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Rejects condition shapes and value types the pinned contract does not define.
 * Counts, sizes, patterns and evaluation remain API authority. */
final class AudienceSegmentValidation
{
    public static function rules(mixed $value): void
    {
        $rules = CampaignContractValidation::object($value, 'rules');
        CampaignContractValidation::fields($rules, ['match','groups'], ['match','groups'], 'rules');
        CampaignContractValidation::enum($rules['match'], ['all','any'], 'rules.match');
        foreach (CampaignContractValidation::list($rules['groups'], 'rules.groups') as $entry) {
            $group = CampaignContractValidation::object($entry, 'rules.group');
            CampaignContractValidation::fields($group, ['match','negate','conditions'], ['match','conditions'], 'rules.group');
            CampaignContractValidation::enum($group['match'], ['all','any'], 'rules.group.match');
            if (array_key_exists('negate', $group) && !is_bool($group['negate'])) {
                CampaignContractValidation::invalid('rules.group.negate');
            }
            foreach (CampaignContractValidation::list($group['conditions'], 'rules.group.conditions') as $condition) {
                self::condition($condition);
            }
        }
    }

    private static function condition(mixed $value): void
    {
        $c = CampaignContractValidation::object($value, 'condition');
        $keys = array_keys($c);
        sort($keys);
        $has = static function (string ...$expected) use ($keys): bool {
            sort($expected);
            return $keys === $expected;
        };
        $field = $c['field'] ?? null;
        $operator = $c['operator'] ?? null;
        $scalar = static fn (mixed $v, bool $bool): bool => is_string($v) || is_int($v) || (is_float($v) && is_finite($v)) || ($bool && is_bool($v));
        $strings = static fn (mixed $v): bool => is_array($v) && array_is_list($v) && array_filter($v, static fn (mixed $x): bool => !is_string($x)) === [];
        $named = is_string($c['name'] ?? null);
        $ok = match (true) {
            $field === 'tag' && $operator === 'contains' => $has('field', 'operator', 'value') && is_string($c['value']),
            $field === 'tag' && $operator === 'in' => $has('field', 'operator', 'values') && $strings($c['values']),
            $field === 'tag' && $operator === 'exists' => $has('field', 'operator'),
            $field === 'attribute' && $operator === 'equals' => $named && $has('field', 'name', 'operator', 'value') && $scalar($c['value'], true),
            $field === 'attribute' && in_array($operator, ['contains','before','after'], true) => $named && $has('field', 'name', 'operator', 'value') && is_string($c['value']),
            $field === 'attribute' && $operator === 'in' => $named && $has('field', 'name', 'operator', 'values') && is_array($c['values']) && array_is_list($c['values']) && array_filter($c['values'], static fn (mixed $x): bool => !$scalar($x, false)) === [],
            $field === 'attribute' && in_array($operator, ['greater_than','less_than'], true) => $named && $has('field', 'name', 'operator', 'value') && (is_int($c['value']) || (is_float($c['value']) && is_finite($c['value']))),
            $field === 'attribute' && $operator === 'exists' => $named && $has('field', 'name', 'operator'),
            $field === 'consent' && $operator === 'equals' => $has('field', 'operator', 'value') && is_bool($c['value']),
            $field === 'campaign' => $has('field', 'campaignId', 'outcome') && is_string($c['campaignId']) && is_string($c['outcome']),
            default => false,
        };
        if (!$ok) {
            CampaignContractValidation::invalid('condition');
        }
    }
}
