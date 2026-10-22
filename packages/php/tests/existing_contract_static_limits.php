<?php

declare(strict_types=1);

/** PHPStan uses structural array shapes. These excess keys are deliberately
 * accepted by the analyzer; public runtime guards must reject them before HTTP. */
function phpstanStructuralLimits(Polymorfa\Client $org, Polymorfa\MessagingClient $m, string $p, string $id): void
{
    $m->campaigns->create('slug', ['name' => 'x','variableMapping' => ['0' => ['future' => false]]]);
    $org->campaigns->launch($id, ['projectId' => $p,'extra' => false]);
    $org->project($p)->sessionConfiguration->update(['configuration' => [],'revision' => 0,'projectId' => 'foreign']);
    $m->quickLinks->create(['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','signalMode' => 'standard']);
}
