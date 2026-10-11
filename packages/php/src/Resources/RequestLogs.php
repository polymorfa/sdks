<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{HttpTransport,RequestOptions,RequestLogModels,RequestLogPage,ConfigurationException,ValidationException,RateLimitException,CancellationToken};

/**
 * @phpstan-import-type Log from RequestLogModels
 * @phpstan-import-type ListParams from RequestLogModels
 * @phpstan-import-type TailParams from RequestLogModels
 */
final class RequestLogs extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
    }
    /** @param ListParams $params */
    public function list(array $params = [], ?RequestOptions $options = null): RequestLogPage
    {
        $query = $this->filters($params);
        if (isset($params['cursor']) && $query !== []) {
            throw new ValidationException('Do not combine cursor with request log filters.');
        }
        foreach (['limit','cursor'] as $field) {
            if (isset($params[$field])) {
                $query[$field] = $params[$field];
            }
        }
        return $this->read($params['projectId'] ?? null, $query, $options);
    }
    /** @param array{after:string,projectId?:string,limit?:int} $params */
    public function follow(array $params, ?RequestOptions $options = null): RequestLogPage
    {
        $query = ['after' => $params['after']];
        if (isset($params['limit'])) {
            $query['limit'] = $params['limit'];
        }
        return $this->read($params['projectId'] ?? null, $query, $options);
    }
    /** @param TailParams $params
 * @return \Generator<int,Log> */
    public function tail(array $params = [], ?RequestOptions $options = null): \Generator
    {
        $interval = $params['intervalMs'] ?? 2000;
        $backfill = $params['backfill'] ?? 0;
        if ($interval < 1000 || $interval > 60000 || $backfill < 0 || $backfill > 100) {
            throw new ValidationException('Invalid request log tail interval or backfill.');
        }
        unset($params['intervalMs'], $params['backfill']);
        $options ??= new RequestOptions();
        $first = $this->rateLimited(fn () => $this->list(array_replace($params, ['limit' => max(1, $backfill)]), $options), $options->cancellation);
        if ($first === null) {
            return;
        }
        if ($backfill > 0) {
            foreach (array_reverse($first->items) as $log) {
                if ($options->cancellation?->isCancelled()) {
                    return;
                } yield $log;
            }
        }
        $after = $first->followCursor;
        while (!$options->cancellation?->isCancelled()) {
            $query = ['after' => $after,'limit' => 100];
            if (isset($params['projectId'])) {
                $query['projectId'] = $params['projectId'];
            }
            $page = $this->rateLimited(fn () => $this->follow($query, $options), $options->cancellation);
            if ($page === null) {
                return;
            }
            foreach ($page->items as $log) {
                if ($options->cancellation?->isCancelled()) {
                    return;
                } yield $log;
            }
            $after = $page->followCursor;
            if (!$page->hasMore && !self::pause($interval, $options->cancellation)) {
                return;
            }
        }
    }
    public static function retryAfterMilliseconds(?string $header, ?float $now = null): int
    {
        $value = trim($header ?? '');
        if ($value !== '' && ctype_digit($value)) {
            return (int) min((float)$value * 1000, 300000);
        }
        $date = $value === '' ? false : strtotime($value);
        return $date === false ? 60000 : (int) min(max(($date - ($now ?? microtime(true))) * 1000, 0), 300000);
    }
    /** @param callable():RequestLogPage $read */
    private function rateLimited(callable $read, ?CancellationToken $cancellation): ?RequestLogPage
    {
        while (!$cancellation?->isCancelled()) {
            try {
                return $read();
            } catch (RateLimitException $error) {
                if (!self::pause(self::retryAfterMilliseconds($error->metadata?->headers['retry-after'] ?? null), $cancellation)) {
                    return null;
                }
            }
        }
        return null;
    }
    private static function pause(int $milliseconds, ?CancellationToken $cancellation): bool
    {
        $deadline = microtime(true) + $milliseconds / 1000;
        while (microtime(true) < $deadline) {
            if ($cancellation?->isCancelled()) {
                return false;
            } usleep((int)min(10000, max(1, ($deadline - microtime(true)) * 1000000)));
        }
        return !$cancellation?->isCancelled();
    }
    /** @param array<string,mixed> $params
 * @return array<string,int|string> */
    private function filters(array $params): array
    {
        $query = [];
        foreach (['status','method'] as $field) {
            if (isset($params[$field]) && is_array($params[$field]) && $params[$field] !== []) {
                $query[$field] = implode(',', $params[$field]);
            }
        }
        foreach (['route','source','credentialId','requestId','traceId','since','until'] as $field) {
            if (isset($params[$field])) {
                $value = $params[$field];
                $query[$field] = $value instanceof \DateTimeInterface ? \DateTimeImmutable::createFromInterface($value)->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z') : (string)$value;
            }
        }
        return $query;
    }
    /** @param array<string,int|string> $query */
    private function read(?string $requested, array $query, ?RequestOptions $options): RequestLogPage
    {
        if ($this->projectId !== null && $requested !== null && $requested !== $this->projectId) {
            throw new ValidationException('This client reads only its own project request log.');
        }
        $project = $this->projectId ?? $requested;
        if ($project === null || $project === '') {
            throw new ConfigurationException('projectId');
        }
        $path = '/platform/projects/'.self::segment($project).'/request-logs';
        return new RequestLogPage($this->transport->request('GET', $path, $query, options:$options));
    }
}
