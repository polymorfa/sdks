<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,HttpTransport,RequestOptions,ValidationException};

abstract class FunctionResource extends PlatformResource
{
    public function __construct(HttpTransport $transport, protected readonly string $projectId)
    {
        parent::__construct($transport, '/platform');
    }
    protected static function invalid(string $message): never
    {
        throw new ValidationException($message, 'invalid_function_input');
    }
    protected static function identifier(string $id): string
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', $id)) {
            self::invalid('A canonical Functions UUID is required.');
        }return $id;
    }
    protected static function revision(int $v): void
    {
        if ($v < 1 || $v > 9007199254740991) {
            self::invalid('A positive Function revision is required.');
        }
    }
    /** @param array<string,mixed>|null $input
     * @return ApiResponse<array<string,mixed>> */
    protected function functionRequest(string $method, string $path, ?array $input = null, ?RequestOptions $options = null): ApiResponse
    {
        if ($input !== null && (array_key_exists('projectId', $input) || ($path !== '' && array_key_exists('functionId', $input)))) {
            self::invalid('Function input cannot override its project or path identity.');
        }
        $value = $input ?? [];
        $value['projectId'] = self::identifier($this->projectId);
        if ($method !== 'GET') {
            $options = ($options ?? new RequestOptions())->withoutRetries();
        }
        return $this->unwrapped($method, '/platform/functions'.$path, ($method === 'GET' || $method === 'DELETE') ? null : $value, ($method === 'GET' || $method === 'DELETE') ? $value : [], $options);
    }
}
