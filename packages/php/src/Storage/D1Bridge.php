<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use GuzzleHttp\{Client,ClientInterface};
use GuzzleHttp\Exception\TransferException;
use GuzzleHttp\Psr7\Request;
use Polymorfa\{CancellationToken,CancelledException};

/** Signed customer Worker binding, never administrative D1 REST. */
final class D1Bridge implements Adapter, \JsonSerializable
{
    public const CONTRACT = 'polymorfa-d1-storage-v1';
    public const SOURCE_COMMIT = '9ae35e671f7f4868a67c1562422c5af9284b95c1';
    private const MAX_BODY = 8388608;
    private readonly ClientInterface $http;
    private readonly string $baseUrl;
    private bool $setupAllowed = false;
    private bool $verified = false;
    public function __construct(string $url, private readonly string $authority, private readonly string $tablePrefix, #[\SensitiveParameter] private readonly string $secret, ?ClientInterface $http = null, private readonly float $timeout = 30, ?CancellationToken $cancellation = null)
    {
        $target = parse_url($url);
        if ($target === false || !isset($target['host'],$target['scheme']) || (isset($target['user']) || isset($target['pass'])) || isset($target['query']) || isset($target['fragment']) || !in_array($target['path'] ?? '', ['','/'], true) || !preg_match('/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/D', $authority) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/D', $tablePrefix) || !preg_match('/^[!-~]{32,256}$/D', $secret) || !is_finite($timeout) || $timeout <= 0) {
            Schema::invalid();
        }
        if ($target['scheme'] !== 'https' && ($target['scheme'] !== 'http' || !($target['host'] === 'localhost' || $target['host'] === '[::1]' || (filter_var($target['host'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false && str_starts_with($target['host'], '127.'))))) {
            Schema::invalid();
        }
        $this->baseUrl = rtrim($url, '/');
        $this->http = $http ?? new Client();
        $data = $this->request('GET', '/handshake', null, $cancellation);
        if (!is_array($data) || ($data['atomicCommit'] ?? null) !== true || ($data['maxCommitSize'] ?? null) !== 50 || ($data['maxGetSize'] ?? null) !== 1000 || ($data['maxQuerySize'] ?? null) !== 1000 || ($data['maxBodyBytes'] ?? null) !== self::MAX_BODY || ($data['conditionalDeletes'] ?? null) !== true || !isset($data['setupAllowed']) || !is_bool($data['setupAllowed'])) {
            self::untrusted();
        }
        $this->setupAllowed = $data['setupAllowed'];
        $this->verified = true;
    }
    /** @return array{atomicCommit:true,maxCommitSize:50} */
    public function capabilities(): array
    {
        if (!$this->verified) {
            throw new StorageException('storage_handshake_required');
        }
        return ['atomicCommit' => true,'maxCommitSize' => 50];
    }
    private static function untrusted(): never
    {
        throw new StorageException('untrusted_storage_response');
    }
    private function signature(string $data): string
    {
        return 'v1='.hash_hmac('sha256', $data, $this->secret);
    }
    private function request(string $method, string $path, mixed $body, ?CancellationToken $cancellation): mixed
    {
        $cancellation?->throwIfCancelled();
        Schema::validateJson($body);
        try {
            $raw = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException) {
            Schema::invalid();
        }
        if (strlen($raw) > self::MAX_BODY) {
            Schema::invalid();
        }
        $nonce = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $headers = ['Authorization' => 'Bearer '.$this->secret,'Polymorfa-Storage-Authority' => $this->authority,'Polymorfa-Storage-Prefix' => $this->tablePrefix,'Polymorfa-Storage-Nonce' => $nonce,'Polymorfa-Storage-Signature' => $this->signature($nonce.'.'.$method.'.'.$path.'.'.$raw)];
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
        }
        $received = '';
        $deadline = microtime(true) + $this->timeout;
        try {
            $response = $this->http->send(new Request($method, $this->baseUrl.$path, $headers, $raw), ['http_errors' => false,'allow_redirects' => false,'timeout' => $this->timeout,'read_timeout' => $this->timeout,'headers' => null,'auth' => null,'cookies' => false,'sink' => \GuzzleHttp\Psr7\FnStream::decorate(\GuzzleHttp\Psr7\Utils::streamFor(''), ['write' => static function (string $part) use (&$received, $cancellation): int {
                $cancellation?->throwIfCancelled();
                if (strlen($received) + strlen($part) > self::MAX_BODY) {
                    self::untrusted();
                }$received .= $part;
                return strlen($part);
            }]),'progress' => static function () use ($cancellation): void {
                $cancellation?->throwIfCancelled();
            }]);
            $stream = $response->getBody();
            $data = $received;
            try {
                while (!self::streamEnded($stream)) {
                    $cancellation?->throwIfCancelled();
                    if (microtime(true) > $deadline) {
                        throw new StorageException('storage_timeout');
                    }$part = $stream->read(min(65536, self::MAX_BODY + 1 - strlen($data)));
                    $data .= $part;
                    if (strlen($data) > self::MAX_BODY || ($part === '' && !self::streamEnded($stream))) {
                        self::untrusted();
                    }
                }
            } finally {
                $stream->close();
            }
        } catch (CancelledException $error) {
            throw $error;
        } catch (TransferException|\RuntimeException $error) {
            $cancellation?->throwIfCancelled();
            if ($error instanceof StorageException) {
                throw $error;
            }if (microtime(true) >= $deadline) {
                throw new StorageException('storage_timeout');
            }throw new StorageException('storage_connection_failed');
        }
        $cancellation?->throwIfCancelled();
        if ($response->getHeaderLine('Polymorfa-Storage-Nonce') !== $nonce || !hash_equals($this->signature($nonce.'.'.$response->getStatusCode().'.'.$data), $response->getHeaderLine('Polymorfa-Storage-Signature'))) {
            self::untrusted();
        }
        try {
            $decoded = json_decode($data, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            self::untrusted();
        }
        if (!is_array($decoded) || ($decoded['contract'] ?? null) !== self::CONTRACT || ($decoded['schemaVersion'] ?? null) !== Schema::VERSION || ($decoded['authority'] ?? null) !== $this->authority || ($decoded['tablePrefix'] ?? null) !== $this->tablePrefix || !array_key_exists('data', $decoded)) {
            self::untrusted();
        }
        Schema::validateJson($decoded['data']);
        if ($response->getStatusCode() !== 200) {
            throw new StorageException('storage_operation_rejected');
        }
        return $decoded['data'];
    }
    public function setup(?CancellationToken $cancellation = null): void
    {
        if (!$this->setupAllowed) {
            throw new StorageException('storage_setup_disabled');
        }
        $data = $this->request('POST', '/setup', new \stdClass(), $cancellation);
        if (!is_array($data) || ($data['ok'] ?? null) !== true) {
            self::untrusted();
        }
    }
    /** @phpstan-impure */
    private static function streamEnded(\Psr\Http\Message\StreamInterface $stream): bool
    {
        return $stream->eof();
    }
    /** @param array<array-key,mixed> $ids */
    private static function validateIDs(array $ids): void
    {
        if (count($ids) > 1000 || !array_is_list($ids)) {
            Schema::invalid();
        }
        foreach ($ids as $id) {
            if (!is_string($id) || $id === '' || strlen($id) > 4096) {
                Schema::invalid();
            }
        }
    }
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        Schema::definition($entity);
        self::validateIDs($ids);
        $data = $this->request('POST', '/get', ['entity' => $entity,'ids' => $ids], $cancellation);
        if (!is_array($data) || !array_is_list($data)) {
            self::untrusted();
        }$rows = [];
        foreach ($data as $row) {
            if (!is_array($row)) {
                self::untrusted();
            }try {
                Schema::validateRow($entity, $row);
            } catch (StorageException) {
                self::untrusted();
            }$id = $row['_id'];
            if (!is_string($id) || !in_array($id, $ids, true) || isset($rows[$id])) {
                self::untrusted();
            }$rows[$id] = $row;
        }
        return $rows;
    }
    /** @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        Schema::validateWrites($writes, 50);
        foreach ($writes as &$write) {
            if ($write['kind'] === 'put') {
                $write['row']['_v'] = (object)$write['row']['_v'];
            } elseif (!isset($write['expectedRev'])) {
                $scope = 'k'.explode(':', substr($write['id'], 1), 2)[0];
                $fenced = false;
                foreach ($writes as $fence) {
                    if ($fence['kind'] === 'put' && $fence['entity'] === 'leases' && isset($fence['expectedRev']) && ($fence['row']['_id'] ?? null) === $scope && $fence['row']['_rev'] === $fence['expectedRev'] + 1) {
                        $fenced = true;
                    }
                }
                if (!$fenced) {
                    Schema::invalid();
                }
            }
        }unset($write);
        $data = $this->request('POST', '/commit', ['writes' => $writes], $cancellation);
        if (!is_array($data) || !isset($data['ok']) || !is_bool($data['ok'])) {
            self::untrusted();
        }
        if ($data['ok']) {
            if (isset($data['conflicts']) && $data['conflicts'] !== []) {
                self::untrusted();
            }return ['ok' => true];
        }
        if (!isset($data['conflicts']) || !is_array($data['conflicts']) || !array_is_list($data['conflicts']) || $data['conflicts'] === [] || count($data['conflicts']) > count($writes)) {
            self::untrusted();
        }
        $ids = array_map(static fn (array $w): string => $w['kind'] === 'put' ? $w['row']['_id'] : $w['id'], $writes);
        foreach ($data['conflicts'] as $id) {
            if (!is_string($id) || !in_array($id, $ids, true)) {
                self::untrusted();
            }
        }
        return ['ok' => false,'conflicts' => $data['conflicts']];
    }
    /** @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $index = Schema::validateQuery($entity, $query, 1000);
        $data = $this->request('POST', '/query', ['entity' => $entity,'query' => $query], $cancellation);
        if (!is_array($data) || !array_is_list($data) || count($data) > $query['limit']) {
            self::untrusted();
        }$seen = [];
        $previous = null;
        foreach ($data as $row) {
            if (!is_array($row)) {
                self::untrusted();
            }try {
                Schema::validateRow($entity, $row);
            } catch (StorageException) {
                self::untrusted();
            }$id = $row['_id'];
            if (!is_string($id) || isset($seen[$id])) {
                self::untrusted();
            }$seen[$id] = true;
            foreach ($index['equals'] as $field) {
                if (($row[$field] ?? null) !== $query['equals'][$field]) {
                    self::untrusted();
                }
            }
            $sort = $row[$index['sort']] ?? 0;
            foreach ($query['range'] ?? [] as $op => $value) {
                if (!match($op) {
                    'gt' => $sort > $value,'gte' => $sort >= $value,'lt' => $sort < $value,'lte' => $sort <= $value,default => false
                }) {
                    self::untrusted();
                }
            }
            $cursor = ['sort' => $sort,'id' => $id];
            foreach ([$query['after'] ?? null,$previous] as $before) {
                if ($before !== null) {
                    $cmp = ($sort <=> $before['sort']) ?: strcmp($id, $before['id']);
                    if (($query['order'] ?? 'asc') === 'desc' ? $cmp >= 0 : $cmp <= 0) {
                        self::untrusted();
                    }
                }
            }$previous = $cursor;
        }
        return $data;
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */
    public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
