<?php

declare(strict_types=1);

namespace Polymorfa;

class ConfigurationException extends PolymorfaException
{
    public function __construct(public readonly string $field)
    {
        parent::__construct('Invalid configuration field: ' . $field . '.', 'configuration_error');
    }
}
