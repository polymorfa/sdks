<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CursorPage,RequestOptions,ConfigurationException,EventStream,DeveloperModels,IndexedEventPage};

/**
 * @phpstan-import-type EventRecord from DeveloperModels
 * @phpstan-import-type EventParams from DeveloperModels
 * @phpstan-import-type ReplayReceipt from DeveloperModels
 */
final class Events extends PlatformResource
{
    /** @param EventParams $params
 * @return CursorPage<EventRecord>|IndexedEventPage */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage|IndexedEventPage
    {
        if (array_key_exists('afterOffset', $params)) {
            return $this->listIndexed($params, $options);
        }
        /** @var CursorPage<EventRecord> $page */ $page = $this->page($this->prefix.'/events', $params, $options);
        return $page;
    }
    /** @param EventParams $params */
    public function listIndexed(array $params = [], ?RequestOptions $options = null): IndexedEventPage
    {
        if (!IndexedEventPage::offset($params['afterOffset'] ?? '0') || isset($params['cursor']) || isset($params['since']) || isset($params['until'])) {
            throw new ConfigurationException('afterOffset');
        }
        $query = array_replace($params, ['afterOffset' => $params['afterOffset'] ?? '0']);
        $path = $this->prefix.'/events';
        return new IndexedEventPage($this->transport, $path, $query, $options, $this->transport->request('GET', $path, $query, options:$options));
    }
    /** @param array{includePayload?:bool} $params
 * @return ApiResponse<EventRecord> */
    public function retrieve(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<EventRecord> $response */ $response = $this->unwrapped('GET', $this->prefix.'/events/'.self::segment($id), query:$params, options:$options);
        return $response;
    }
    /** @param array{webhookId:string} $body
 * @return ApiResponse<ReplayReceipt> */
    public function replay(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<ReplayReceipt> $response */ $response = $this->unwrapped('POST', $this->prefix.'/events/'.self::segment($id).'/replays', $body, options:$options);
        return $response;
    }
    /** @param list<string> $types */
    public function stream(?string $projectId = null, ?string $since = null, array $types = [], bool $manualAck = false, ?RequestOptions $options = null): EventStream
    {
        $prefix = $this->prefix;
        if ($prefix === '/platform') {
            if ($projectId === null || trim($projectId) === '') {
                throw new ConfigurationException('projectId');
            } $prefix = '/platform/projects/'.self::segment($projectId);
        } elseif ($projectId !== null && $prefix !== '/platform/projects/'.self::segment($projectId)) {
            throw new ConfigurationException('projectId');
        }
        return new EventStream($this->transport, $prefix.'/events/stream', $since, $types, $manualAck, $options);
    }
    /**
 * @return ApiResponse<array{streamId:string,acknowledgedCursor:string,sequence:int,replayed:bool}> */
    public function acknowledgeStream(string $id, string $cursor, int $sequence, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{streamId:string,acknowledgedCursor:string,sequence:int,replayed:bool}> $response */ $response = $this->unwrapped('POST', $this->stream($projectId)->path.'/'.self::segment($id).'/ack', ['cursor' => $cursor,'sequence' => $sequence], options:$options);
        return $response;
    }
}
