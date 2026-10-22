<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Mode 'standard'|'zero_knowledge'
 * @phpstan-type DefaultSettings array{signalModeDefault:Mode|null,effectiveSignalMode:Mode,revision:int}
 * @phpstan-type ProjectUpdate array{expectedRevision:int,signalModeDefault:Mode}
 * @phpstan-type CustomerUpdate array{expectedRevision:int,signalModeDefault:Mode|null}
 */
final class SignalCustodyModels
{
}
