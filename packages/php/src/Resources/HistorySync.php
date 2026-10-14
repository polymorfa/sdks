<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,RequestOptions,ServerException};

final class HistorySync extends Resource
{
    /** @param array{syncType:'INITIAL_BOOTSTRAP'|'INITIAL_STATUS_V3'|'FULL'|'RECENT'|'PUSH_NAME'|'NON_BLOCKING_DATA'|'ON_DEMAND',chunkOrder:int,chunkMessageId?:string,regenerate?:bool} $body
     * @return ApiResponse<array{success:true,data:array{requestId:string,status:'requested'}}> */
    public function requestChunkRetry(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        self::validateRetry($body);
        $response = $this->request('POST', '/messaging/'.self::segment($session).'/history/chunks/retry', $body, options:WhatsAppMedia::options($options));
        $data = $response->data['data'] ?? null;
        if (!is_array($data) || !isset($data['requestId']) || !is_string($data['requestId']) || $data['requestId'] === '' || ($data['status'] ?? null) !== 'requested') {
            throw new ServerException('The API returned an invalid history retry result.', 'invalid_response');
        }
        /** @var ApiResponse<array{success:true,data:array{requestId:string,status:'requested'}}> */
        return $response;
    }
    /** @param array<string,mixed> $body */
    private static function validateRetry(array $body): void
    {
        if (!in_array($body['syncType'] ?? null, ['INITIAL_BOOTSTRAP','INITIAL_STATUS_V3','FULL','RECENT','PUSH_NAME','NON_BLOCKING_DATA','ON_DEMAND'], true) || !isset($body['chunkOrder']) || !is_int($body['chunkOrder']) || $body['chunkOrder'] < 0 || $body['chunkOrder'] > 4294967295 || (array_key_exists('chunkMessageId', $body) && (!is_string($body['chunkMessageId']) || !preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body['chunkMessageId']))) || (array_key_exists('regenerate', $body) && !is_bool($body['regenerate'])) || array_diff(array_keys($body), ['syncType','chunkOrder','chunkMessageId','regenerate']) !== []) {
            throw new ConfigurationException('history');
        }
    }
    /** Explicitly delete a chunk only after durable local processing.
     * fileEncSha256 contains 32 binary bytes and is sent as standard base64.
     * @return ApiResponse<array{success:true,data:array{status:'deleted'}}> */
    public function deleteChunk(string $session, #[\SensitiveParameter] string $directPath, #[\SensitiveParameter] string $fileEncSha256, #[\SensitiveParameter] ?string $encHandle = null, #[\SensitiveParameter] ?string $companionMetaNonce = null, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (strlen($directPath) > 1024 || !preg_match('/^\/[A-Za-z0-9._~%\/=&?+-]+$/D', $directPath) || strlen($fileEncSha256) !== 32) {
            throw new ConfigurationException('history');
        }
        foreach ([$encHandle,$companionMetaNonce] as $token) {
            if ($token !== null && !preg_match('/^[A-Za-z0-9._~%\/=+-]{1,512}$/D', $token)) {
                throw new ConfigurationException('history');
            }
        }
        $body = ['directPath' => $directPath,'fileEncSha256' => base64_encode($fileEncSha256)];
        if ($encHandle !== null) {
            $body['encHandle'] = $encHandle;
        }
        if ($companionMetaNonce !== null) {
            $body['companionMetaNonce'] = $companionMetaNonce;
        }
        $response = $this->request('POST', '/messaging/'.self::segment($session).'/history/media/delete', $body, options:WhatsAppMedia::options($options));
        $data = $response->data['data'] ?? null;
        if (!is_array($data) || ($data['status'] ?? null) !== 'deleted') {
            throw new ServerException('The API returned an invalid history deletion result.', 'invalid_response');
        }
        /** @var ApiResponse<array{success:true,data:array{status:'deleted'}}> */
        return $response;
    }
}
