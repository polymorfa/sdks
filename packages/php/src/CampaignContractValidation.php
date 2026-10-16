<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Strict request validation for the additive 2026-10-14 contract. */
final class CampaignContractValidation
{
    public static function invalid(string $field): never
    {
        throw new ConfigurationException($field);
    }

    public static function uuid(mixed $value, string $field): string
    {
        if (!is_string($value) || preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iD', $value) !== 1) {
            self::invalid($field);
        }
        return $value;
    }

    /** @param array<string|int,mixed> $value
     * @param list<string> $allowed
     * @param list<string> $required */
    public static function fields(array $value, array $allowed, array $required, string $field = 'body'): void
    {
        foreach ($value as $key => $_) {
            if (!in_array($key, $allowed, true)) {
                self::invalid($field.'.'.$key);
            }
        }
        foreach ($required as $key) {
            if (!array_key_exists($key, $value)) {
                self::invalid($field.'.'.$key);
            }
        }
    }

    public static function integer(mixed $value, string $field, int $min = 0, int $max = 9007199254740991): int
    {
        if (!is_int($value) || $value < $min || $value > $max) {
            self::invalid($field);
        }
        return $value;
    }

    /** @param list<string> $allowed */
    public static function enum(mixed $value, array $allowed, string $field): string
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            self::invalid($field);
        }
        return $value;
    }

    /** @param array<string,mixed> $body */
    public static function custody(array $body, bool $customer): void
    {
        self::fields($body, ['expectedRevision', 'signalModeDefault'], ['expectedRevision', 'signalModeDefault']);
        self::integer($body['expectedRevision'], 'body.expectedRevision');
        if (!$customer || $body['signalModeDefault'] !== null) {
            self::enum($body['signalModeDefault'], ['standard', 'zero_knowledge'], 'body.signalModeDefault');
        }
    }

    public static function text(mixed $value, string $field, int $min = 1, int $max = PHP_INT_MAX): string
    {
        if (!is_string($value) || preg_match('//u', $value) !== 1 || self::length($value) < $min || self::length($value) > $max) {
            self::invalid($field);
        }
        return $value;
    }

    public static function length(string $value): int
    {
        return (int) preg_match_all('/[\s\S]/u', $value) + (int) preg_match_all('/[\x{10000}-\x{10ffff}]/u', $value);
    }

    public static function trim(string $value): string
    {
        return preg_replace('/^[\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+|[\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+$/u', '', $value) ?? '';
    }

    public static function bytes(mixed $value, string $field, int $min, int $max): string
    {
        $text = self::text($value, $field, 0);
        if (strlen($text) < $min || strlen($text) > $max) {
            self::invalid($field);
        }
        return $text;
    }

    /** Known JSON dictionaries use PHP arrays, including [] for an empty object.
     * @return array<string|int,mixed> */
    public static function object(mixed $value, string $field): array
    {
        if (!is_array($value)) {
            self::invalid($field);
        }
        return $value;
    }

    /** @return list<mixed> */
    public static function list(mixed $value, string $field, int $min = 0, int $max = PHP_INT_MAX): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) < $min || count($value) > $max) {
            self::invalid($field);
        }
        return $value;
    }

    /** @param array<string|int,mixed> $value */
    public static function selection(array $value): void
    {
        self::fields($value, ['projectId'], ['projectId'], 'params');
        self::uuid($value['projectId'], 'params.projectId');
    }

    private static function nodeId(mixed $value, string $field): string
    {
        $text = self::text($value, $field);
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/D', $text) !== 1) {
            self::invalid($field);
        }
        return $text;
    }

    private static function message(mixed $value, string $field, int $max, bool $multiline = false): void
    {
        $text = self::bytes($value, $field, 1, $max);
        $checked = $multiline ? str_replace(["\r", "\n", "\t"], '', $text) : $text;
        if (($multiline && self::trim($text) === '') || preg_match('/\p{Cc}/u', $checked) === 1) {
            self::invalid($field);
        }
    }

    /** @param array<string,mixed> $body */
    public static function replyCreate(array $body, bool $project = false): void
    {
        self::fields($body, ['name', 'definition', 'flowKey', 'revision', ...($project ? ['projectId'] : [])], ['name', 'definition', ...($project ? ['projectId'] : [])]);
        self::bytes($body['name'], 'body.name', 1, 128);
        if ($project) {
            self::uuid($body['projectId'], 'body.projectId');
        }
        if (array_key_exists('flowKey', $body)) {
            self::uuid($body['flowKey'], 'body.flowKey');
        }
        if (array_key_exists('revision', $body)) {
            self::integer($body['revision'], 'body.revision', 1, 1000000);
        }
        $definition = self::object($body['definition'], 'body.definition');
        self::fields($definition, ['entryNodeId', 'nodes'], ['entryNodeId', 'nodes'], 'body.definition');
        self::nodeId($definition['entryNodeId'], 'body.definition.entryNodeId');
        $nodes = self::list($definition['nodes'], 'body.definition.nodes', 2, 12);
        $ids = [];
        foreach ($nodes as $index => $raw) {
            $field = 'body.definition.nodes.'.$index;
            $node = self::object($raw, $field);
            self::fields($node, ['id', 'send', 'edges'], ['id', 'edges'], $field);
            $id = self::nodeId($node['id'], $field.'.id');
            if (in_array($id, $ids, true)) {
                self::invalid($field.'.id');
            }
            $ids[] = $id;
            if (array_key_exists('send', $node)) {
                self::send(self::object($node['send'], $field.'.send'), $field.'.send');
            }
            foreach (self::list($node['edges'], $field.'.edges', 0, 3) as $edgeIndex => $rawEdge) {
                $edgeField = $field.'.edges.'.$edgeIndex;
                $edge = self::object($rawEdge, $edgeField);
                self::fields($edge, ['match', 'to'], ['match', 'to'], $edgeField);
                self::nodeId($edge['to'], $edgeField.'.to');
                $match = self::object($edge['match'], $edgeField.'.match');
                $kind = self::enum($match['kind'] ?? null, ['choice', 'keyword', 'flow_submission'], $edgeField.'.match.kind');
                $keys = match ($kind) {
                    'choice' => ['kind', 'replyKind', 'id'],
                    'keyword' => ['kind', 'value'],
                    default => ['kind'],
                };
                self::fields($match, $keys, $keys, $edgeField.'.match');
                if ($kind === 'choice') {
                    self::enum($match['replyKind'], ['button', 'list'], $edgeField.'.match.replyKind');
                    self::nodeId($match['id'], $edgeField.'.match.id');
                } elseif ($kind === 'keyword') {
                    self::message($match['value'], $edgeField.'.match.value', 64);
                }
            }
        }
        if (strlen(self::semanticJson($nodes)) > 24 * 1024) {
            self::invalid('body.definition.nodes');
        }
    }

    /** @param array<string|int,mixed> $send */
    private static function send(array $send, string $field): void
    {
        $kind = self::enum($send['kind'] ?? null, ['text', 'buttons', 'list', 'flow_form'], $field.'.kind');
        if ($kind === 'text') {
            self::fields($send, ['kind', 'text'], ['kind', 'text'], $field);
            self::message($send['text'], $field.'.text', 4096, true);
            return;
        }
        $extras = match ($kind) {
            'buttons' => ['buttons'],
            'list' => ['buttonText', 'rows'],
            default => ['flowId', 'buttonText', 'screen'],
        };
        self::fields($send, ['kind', 'body', 'footer', ...$extras], ['kind', 'body', ...$extras], $field);
        self::message($send['body'], $field.'.body', 1024, true);
        if (array_key_exists('footer', $send)) {
            self::message($send['footer'], $field.'.footer', 60);
        }
        if ($kind !== 'buttons') {
            self::message($send['buttonText'], $field.'.buttonText', 20);
        }
        if ($kind === 'flow_form') {
            self::uuid($send['flowId'], $field.'.flowId');
            if (preg_match('/^[A-Za-z0-9_]{1,64}$/D', self::text($send['screen'], $field.'.screen')) !== 1) {
                self::invalid($field.'.screen');
            }
            return;
        }
        $key = $kind === 'buttons' ? 'buttons' : 'rows';
        $ids = [];
        foreach (self::list($send[$key], $field.'.'.$key, 1, $kind === 'buttons' ? 3 : 10) as $index => $raw) {
            $itemField = $field.'.'.$key.'.'.$index;
            $item = self::object($raw, $itemField);
            self::fields($item, $kind === 'buttons' ? ['id', 'text'] : ['id', 'title', 'description'], $kind === 'buttons' ? ['id', 'text'] : ['id', 'title'], $itemField);
            $id = self::nodeId($item['id'], $itemField.'.id');
            if (in_array($id, $ids, true)) {
                self::invalid($itemField.'.id');
            }
            $ids[] = $id;
            if ($kind === 'buttons') {
                self::message($item['text'], $itemField.'.text', 20);
            } else {
                self::message($item['title'], $itemField.'.title', 24);
                if (array_key_exists('description', $item)) {
                    self::message($item['description'], $itemField.'.description', 72);
                }
            }
        }
    }

    /** @param array<string,mixed> $body */
    public static function testSend(array $body, bool $project = false): void
    {
        self::fields($body, ['sessionId', 'to', 'sampleRecipientId', 'variables', ...($project ? ['projectId'] : [])], ['sessionId', 'to', ...($project ? ['projectId'] : [])]);
        self::uuid($body['sessionId'], 'body.sessionId');
        self::text($body['to'], 'body.to', 1, 32);
        if ($project) {
            self::uuid($body['projectId'], 'body.projectId');
        }
        if (array_key_exists('sampleRecipientId', $body)) {
            self::uuid($body['sampleRecipientId'], 'body.sampleRecipientId');
        }
        if (array_key_exists('variables', $body)) {
            $variables = self::object($body['variables'], 'body.variables');
            if (count($variables) > 50) {
                self::invalid('body.variables');
            }
            foreach ($variables as $key => $value) {
                if (preg_match('/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/D', (string) $key) !== 1 || !(is_string($value) || is_bool($value) || ((is_int($value) || is_float($value)) && is_finite((float) $value)))) {
                    self::invalid('body.variables.'.$key);
                }
                $rendered = is_string($value) ? self::text($value, 'body.variables.'.$key, 0) : (is_bool($value) ? ($value ? 'true' : 'false') : self::number((float) $value));
                if (self::length($rendered) > 1024) {
                    self::invalid('body.variables.'.$key);
                }
            }
        }
    }

    /** @param array<string,mixed> $body */
    public static function assignment(array $body, bool $project = false): void
    {
        $keys = ['replyFlowId', ...($project ? ['projectId'] : [])];
        self::fields($body, $keys, $keys);
        if ($body['replyFlowId'] !== null) {
            self::uuid($body['replyFlowId'], 'body.replyFlowId');
        }
        if ($project) {
            self::uuid($body['projectId'], 'body.projectId');
        }
    }

    /** @param array<string,mixed> $params */
    public static function export(array $params, bool $project = false): void
    {
        self::fields($params, ['status', 'reason', 'cursor', 'limit', ...($project ? ['projectId'] : [])], $project ? ['projectId'] : [], 'params');
        if ($project) {
            self::uuid($params['projectId'], 'params.projectId');
        }
        if (array_key_exists('status', $params)) {
            self::enum($params['status'], ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped'], 'params.status');
        }
        if (array_key_exists('reason', $params)) {
            self::enum($params['reason'], ['opted_out', 'cold_held', 'campaign_cancelled', 'invalid_recipient', 'session_not_connected', 'ack_timeout', 'blocked_by_safety', 'send_failed', 'missing_variable', 'other'], 'params.reason');
        }
        if (array_key_exists('cursor', $params)) {
            self::text($params['cursor'], 'params.cursor', 1, 256);
        }
        if (array_key_exists('limit', $params)) {
            self::integer($params['limit'], 'params.limit', 1, 1000);
        }
        if ((array_key_exists('status', $params) || array_key_exists('reason', $params)) && (array_key_exists('cursor', $params) || (array_key_exists('limit', $params) && $params['limit'] !== 1000))) {
            self::invalid('params');
        }
    }

    public static function phone(mixed $value): string
    {
        if (!is_string($value) || preg_match('/^\+[1-9][0-9]{6,14}$/D', $value) !== 1) {
            self::invalid('phone');
        }
        return $value;
    }

    /** @param array<string,mixed> $params */
    public static function page(array $params): void
    {
        self::fields($params, ['cursor', 'limit'], [], 'params');
        if (array_key_exists('cursor', $params)) {
            self::uuid($params['cursor'], 'params.cursor');
        }
        if (array_key_exists('limit', $params)) {
            self::integer($params['limit'], 'params.limit', 1, 100);
        }
    }

    /** @param array<string,mixed> $body */
    public static function profile(array $body): void
    {
        self::fields($body, ['tags', 'attributes', 'expectedRevision', 'provenance', 'consent'], ['tags', 'attributes']);
        if (array_key_exists('expectedRevision', $body)) {
            self::integer($body['expectedRevision'], 'body.expectedRevision', 1);
        }
        $tags = self::list($body['tags'], 'body.tags', 0, 20);
        $seen = [];
        foreach ($tags as $tag) {
            $text = self::bytes($tag, 'body.tags', 1, 48);
            if (preg_match('/[\x00-\x1f\x7f]/', $text) === 1 || in_array($text, $seen, true)) {
                self::invalid('body.tags');
            }
            $seen[] = $text;
        }
        $attributes = self::object($body['attributes'], 'body.attributes');
        if (count($attributes) > 20) {
            self::invalid('body.attributes');
        }
        foreach ($attributes as $key => $value) {
            if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,47}$/D', (string) $key) !== 1 || !(is_string($value) || is_bool($value) || $value === null || ((is_int($value) || is_float($value)) && is_finite((float) $value)))) {
                self::invalid('body.attributes.'.$key);
            }
            if (is_string($value) && (strlen(self::text($value, 'body.attributes.'.$key, 0)) > 256 || str_contains($value, "\0"))) {
                self::invalid('body.attributes.'.$key);
            }
        }
        if (strlen(self::semanticJson((object) $attributes)) > 8192) {
            self::invalid('body.attributes');
        }
        foreach (['provenance', 'consent'] as $key) {
            if (!array_key_exists($key, $body)) {
                continue;
            }
            $value = self::object($body[$key], 'body.'.$key);
            $keys = ['source', 'reference', ...($key === 'consent' ? ['purpose', 'allowed', 'assertedAt'] : [])];
            self::fields($value, $keys, $keys, 'body.'.$key);
            self::enum($value['source'], ['api', 'csv', 'form'], 'body.'.$key.'.source');
            $reference = self::bytes($value['reference'], 'body.'.$key.'.reference', 1, 128);
            if (preg_match('/[\x00-\x1f\x7f]/', $reference) === 1) {
                self::invalid('body.'.$key.'.reference');
            }
            if ($key === 'consent') {
                if ($value['purpose'] !== 'campaigns' || !is_bool($value['allowed'])) {
                    self::invalid('body.consent');
                }
                self::integer($value['assertedAt'], 'body.consent.assertedAt', 0, 8640000000000000);
            }
        }
    }

    /** @param array<string,mixed> $body */
    public static function profileImport(array $body): void
    {
        self::fields($body, ['replayKey', 'csvBase64', 'mapping'], ['replayKey', 'csvBase64']);
        if (preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', self::text($body['replayKey'], 'body.replayKey')) !== 1) {
            self::invalid('body.replayKey');
        }
        $encoded = self::text($body['csvBase64'], 'body.csvBase64', 1, 13981016);
        $decoded = base64_decode($encoded, true);
        if (strlen($encoded) % 4 !== 0 || preg_match('/^[A-Za-z0-9+\/]+={0,2}$/D', $encoded) !== 1 || $decoded === false || base64_encode($decoded) !== $encoded || strlen($decoded) > 10 * 1024 * 1024 || preg_match('//u', $decoded) !== 1 || str_contains($decoded, "\0")) {
            self::invalid('body.csvBase64');
        }
        if (array_key_exists('mapping', $body)) {
            $mapping = self::object($body['mapping'], 'body.mapping');
            self::fields($mapping, ['phone', 'tags', 'attributes', 'expectedRevision', 'provenanceReference', 'consentAllowed', 'consentAssertedAt', 'consentReference'], ['phone', 'tags', 'attributes'], 'body.mapping');
            $seen = [];
            foreach ($mapping as $key => $raw) {
                $header = self::bytes($raw, 'body.mapping.'.$key, 1, 64);
                if ($header !== self::trim($header) || preg_match('/\p{Cc}/u', $header) === 1 || in_array($header, $seen, true)) {
                    self::invalid('body.mapping.'.$key);
                }
                $seen[] = $header;
            }
        }
        if (strlen(self::semanticJson($body)) > 14 * 1024 * 1024) {
            self::invalid('body');
        }
    }

    /** @param array<string,mixed> $body */
    public static function retarget(array $body): void
    {
        self::fields($body, ['name', 'campaignId', 'outcome', 'projectId'], ['name', 'campaignId', 'outcome']);
        $name = self::text($body['name'], 'body.name');
        if (self::trim($name) === '' || self::length(self::trim($name)) > 200) {
            self::invalid('body.name');
        }
        self::uuid($body['campaignId'], 'body.campaignId');
        if (array_key_exists('projectId', $body)) {
            self::uuid($body['projectId'], 'body.projectId');
        }
        self::enum($body['outcome'], ['delivered', 'not_delivered', 'read', 'not_read', 'replied', 'not_replied', 'failed'], 'body.outcome');
    }

    /** @param array<string,mixed> $body */
    public static function stopConfirmation(array $body): void
    {
        self::fields($body, ['teamId', 'enabled', 'locale', 'revision'], ['teamId', 'enabled', 'locale', 'revision']);
        self::uuid($body['teamId'], 'body.teamId');
        self::integer($body['revision'], 'body.revision', 0, 2147483646);
        if (!is_bool($body['enabled'])) {
            self::invalid('body.enabled');
        }
        if ($body['locale'] !== null) {
            self::enum($body['locale'], ['en', 'pt-BR', 'es'], 'body.locale');
        } elseif ($body['enabled']) {
            self::invalid('body.locale');
        }
    }

    /** Compact JSON semantics used by the JavaScript producer's byte quotas. */
    public static function semanticJson(mixed $value): string
    {
        if (is_int($value) || is_float($value)) {
            return self::number((float) $value);
        }
        if ($value instanceof \stdClass || (is_array($value) && !array_is_list($value))) {
            $items = [];
            foreach ((array) $value as $key => $child) {
                $items[] = self::semanticJson((string) $key).':'.self::semanticJson($child);
            }
            return '{'.implode(',', $items).'}';
        }
        if (is_array($value)) {
            return '['.implode(',', array_map(self::semanticJson(...), $value)).']';
        }
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    }

    private static function number(float $number): string
    {
        if (!is_finite($number)) {
            self::invalid('number');
        }
        if ($number == 0) {
            return '0';
        }
        $raw = strtolower(json_encode($number, JSON_THROW_ON_ERROR));
        [$mantissa, $exponent] = array_pad(explode('e', $raw, 2), 2, '0');
        $negative = str_starts_with($mantissa, '-');
        $digits = ltrim($mantissa, '-');
        $dot = strpos($digits, '.');
        $decimal = ($dot === false ? strlen($digits) : $dot) + (int) $exponent;
        $digits = rtrim(str_replace('.', '', $digits), '0');
        $sign = $negative ? '-' : '';
        if (abs($number) >= 1e-6 && abs($number) < 1e21) {
            return $sign.($decimal <= 0 ? '0.'.str_repeat('0', -$decimal).$digits : ($decimal >= strlen($digits) ? $digits.str_repeat('0', $decimal - strlen($digits)) : substr($digits, 0, $decimal).'.'.substr($digits, $decimal)));
        }
        $exp = $decimal - 1;
        return $sign.$digits[0].(strlen($digits) > 1 ? '.'.substr($digits, 1) : '').'e'.($exp >= 0 ? '+' : '-').abs($exp);
    }
}
