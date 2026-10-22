<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Validates JSON kind before exposing established PHP array models. */
final class CampaignContractCodec
{
    public static function matches(mixed $value, mixed $schema): bool
    {
        if (is_string($schema)) {
            return match ($schema) {
                'string' => is_string($value),
                'int' => is_int($value) && abs($value) <= 9007199254740991,
                'bool' => is_bool($value),
                'number' => (is_int($value) || is_float($value)) && is_finite((float) $value),
                'any' => true,
                default => false,
            };
        }
        if (!is_array($schema)) {
            return false;
        }
        if (array_key_exists('nullable', $schema)) {
            return $value === null || self::matches($value, $schema['nullable']);
        }
        if (isset($schema['enum'])) {
            return in_array($value, $schema['enum'], true);
        }
        if (isset($schema['string'])) {
            return is_string($value) && CampaignContractValidation::length($value) >= $schema['string'][0] && CampaignContractValidation::length($value) <= $schema['string'][1];
        }
        if (isset($schema['union'])) {
            foreach ($schema['union'] as $part) {
                if (self::matches($value, $part)) {
                    return true;
                }
            }
            return false;
        }
        if (isset($schema['map'])) {
            if (!$value instanceof \stdClass) {
                return false;
            }
            foreach (get_object_vars($value) as $item) {
                if (!self::matches($item, $schema['map'])) {
                    return false;
                }
            }
            return true;
        }
        if (isset($schema['list'])) {
            if (!is_array($value) || !array_is_list($value)) {
                return false;
            }
            foreach ($value as $item) {
                if (!self::matches($item, $schema['list'])) {
                    return false;
                }
            }
            return true;
        }
        if (isset($schema['object'])) {
            if (!$value instanceof \stdClass) {
                return false;
            }
            foreach ($schema['object'] as $key => $part) {
                if (!property_exists($value, $key)) {
                    if (!in_array($key, $schema['optional'] ?? [], true)) {
                        return false;
                    }
                } elseif (!self::matches($value->{$key}, $part)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public static function model(string $model): mixed
    {
        $nullable = static fn (mixed $schema): array => ['nullable' => $schema];
        $object = static fn (array $fields, array $optional = []): array => ['object' => $fields, 'optional' => $optional];
        $list = static fn (mixed $schema): array => ['list' => $schema];
        $enum = static fn (array $values): array => ['enum' => $values];
        $map = static fn (mixed $schema): array => ['map' => $schema];
        $scalar = ['union' => ['string', 'number', 'bool', $enum([null])]];
        $source = $enum(['api', 'csv', 'form']);
        $provenance = ['source' => $source, 'reference' => 'string'];
        $consent = [...$provenance, 'purpose' => $enum(['campaigns']), 'allowed' => 'bool', 'assertedAt' => 'int', 'id' => 'string', 'profileRevision' => 'int', 'createdAt' => 'int'];
        $profile = $object(['id' => 'string', 'phone' => 'string', 'revision' => 'int', 'tags' => $list('string'), 'attributes' => $map($scalar), 'provenance' => $nullable($object($provenance)), 'createdAt' => 'int', 'updatedAt' => 'int']);
        $replySend = ['union' => [
            $object(['kind' => $enum(['text']), 'text' => 'string']),
            $object(['kind' => $enum(['buttons']), 'body' => 'string', 'footer' => 'string', 'buttons' => $list($object(['id' => 'string', 'text' => 'string']))], ['footer']),
            $object(['kind' => $enum(['list']), 'body' => 'string', 'buttonText' => 'string', 'footer' => 'string', 'rows' => $list($object(['id' => 'string', 'title' => 'string', 'description' => 'string'], ['description']))], ['footer']),
            $object(['kind' => $enum(['flow_form']), 'flowId' => 'string', 'body' => 'string', 'buttonText' => 'string', 'footer' => 'string', 'screen' => 'string'], ['footer']),
        ]];
        $replyMatch = ['union' => [
            $object(['kind' => $enum(['choice']), 'replyKind' => $enum(['button', 'list']), 'id' => 'string']),
            $object(['kind' => $enum(['keyword']), 'value' => ['string' => [1, 64]]]),
            $object(['kind' => $enum(['flow_submission'])]),
        ]];
        return match ($model) {
            'custody' => $object(['signalModeDefault' => $nullable($enum(['standard', 'zero_knowledge'])), 'effectiveSignalMode' => $enum(['standard', 'zero_knowledge']), 'revision' => 'int']),
            'replyFlow' => $object(['id' => 'string', 'flowKey' => 'string', 'revision' => 'int', 'name' => 'string', 'createdAt' => 'int', 'definition' => $object(['entryNodeId' => 'string', 'nodes' => $list($object(['id' => 'string', 'send' => $replySend, 'edges' => $list($object(['match' => $replyMatch, 'to' => 'string']))], ['send']))])]),
            'assignment' => $object(['campaignId' => 'string', 'replyFlowId' => $nullable('string')]),
            'testSend' => $object(['id' => 'string', 'campaignId' => 'string', 'status' => $enum(['sent']), 'from' => $object(['sessionId' => 'string', 'phone' => 'string']), 'to' => 'string', 'messageId' => $nullable('string'), 'variables' => $map('string'), 'createdAt' => 'int']),
            'links' => $list($object(['key' => 'string', 'url' => 'string', 'uniqueOpens' => 'int', 'totalOpens' => 'int'])),
            'approvals' => $list($object(['id' => 'string', 'campaignId' => 'string', 'action' => $enum(['launch', 'resume', 'reschedule']), 'status' => $enum(['pending', 'approved', 'rejected', 'superseded', 'expired']), 'reasons' => $list($enum(['audience_threshold', 'agent_request'])), 'recipientCount' => 'int', 'scheduledAt' => $nullable('int'), 'requestedBy' => $object(['type' => 'string', 'id' => 'string']), 'requestedAt' => 'int', 'expiresAt' => 'int', 'decidedBy' => $nullable('string'), 'decidedAt' => $nullable('int'), 'operationId' => $nullable('string')])),
            'settings' => $object(['launchApproval' => $object(['recipientThreshold' => $nullable('int')])]),
            'profile' => $profile,
            'profiles' => $list($profile),
            'consents' => $list($object($consent)),
            'page' => $object(['nextCursor' => $nullable('string'), 'hasMore' => 'bool']),
            'profileDelete' => $object(['deleted' => $enum([true]), 'phone' => 'string', 'revision' => 'int']),
            'import' => $object(['id' => 'string', 'state' => $enum(['queued', 'completed', 'cancelled']), 'totalValid' => 'int', 'invalidCount' => 'int', 'invalidSamples' => $list($object(['row' => 'int', 'reason' => 'string'])), 'conflictSamples' => $list($object(['row' => 'int', 'reason' => $enum(['quota', 'revision_conflict'])])), 'processedValid' => 'int', 'createdCount' => 'int', 'updatedCount' => 'int', 'conflictCount' => 'int', 'createdAt' => 'int', 'updatedAt' => 'int', 'completedAt' => $nullable('int')]),
            'retarget' => $object(['id' => 'string', 'name' => 'string', 'source' => $enum(['campaign']), 'recipientCount' => 'int', 'fileId' => $nullable('string'), 'columns' => $nullable($list('string')), 'sampleRow' => $nullable($map('string')), 'mapping' => $nullable($map('any')), 'createdAt' => 'int', 'updatedAt' => 'int', 'sourceCampaignId' => 'string', 'outcome' => $enum(['delivered', 'not_delivered', 'read', 'not_read', 'replied', 'not_replied', 'failed']), 'matchedCount' => 'int', 'optedOutCount' => 'int']),
            'stopSettings' => $object(['teamId' => 'string', 'enabled' => 'bool', 'locale' => $nullable($enum(['en', 'pt-BR', 'es'])), 'revision' => 'int', 'textRevision' => $enum([1]), 'acknowledgement' => $nullable('string'), 'updatedAt' => $nullable('int')]),
            'stopSummary' => $object(['enabled' => 'bool', 'counts' => $object(['queued' => 'int', 'admitted' => 'int', 'completed' => 'int', 'failed' => 'int', 'unknown' => 'int'])]),
            default => throw new \LogicException('Unknown contract model.'),
        };
    }

    public static function convert(mixed $value): mixed
    {
        if ($value instanceof \stdClass) {
            $result = [];
            foreach (get_object_vars($value) as $key => $child) {
                $result[$key] = self::convert($child);
            }
            return $result;
        }
        if (is_array($value)) {
            return array_map(self::convert(...), $value);
        }
        return $value;
    }
}
