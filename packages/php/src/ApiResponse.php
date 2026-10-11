<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @template-covariant T */
final readonly class ApiResponse
{
    /**
 * @param T $data */
    public function __construct(public mixed $data, public ResponseMetadata $metadata)
    {
    }
    /** @return array{metadata:ResponseMetadata,data:string} */
    public function __debugInfo(): array
    {
        return ['metadata' => $this->metadata, 'data' => '[redacted; read data explicitly]'];
    }
}
