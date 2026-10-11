<?php

declare(strict_types=1);

namespace Polymorfa;

class PolymorfaException extends \RuntimeException
{
    public readonly ?string $errorCode;
    public function __construct(
        string $message,
        ?string $code = null,
        public readonly ?int $status = null,
        public readonly ?string $requestId = null,
        public readonly ?ResponseMetadata $metadata = null,
        public readonly ?string $requestLogUrl = null,
        public readonly ?string $docUrl = null,
        public readonly ?string $rateLimitReason = null,
        public readonly mixed $details = null,
    ) {
        parent::__construct($message);
        $this->errorCode = $code;
    }
}
